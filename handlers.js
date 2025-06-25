// handlers.js
const {
    normalizeText,
    extractAmountFromString,
    formatCurrency,
    getCategoryFromString,
    parseCurrencyValue,
} = require("./utils");
const {
    addTransaction,
    getMonthlyBalance,
    getCategoryExpenses,
    addScheduledExpenseToUser,
    addCreditCard,
    getCreditCardsForUser,
    getCreditCardByNickname,
    removeCreditCard,
    getScheduledExpensesForUser,
    db,
} = require("./database");
const pino = require("pino");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

async function tryParseQuickExpense(text, userData) {
    const normalizedText = normalizeText(text);
    const expenseKeywords = [
        "gastei",
        "paguei",
        "comprei",
        "despesa de",
        "uma compra de",
    ];
    if (!expenseKeywords.some((kw) => normalizedText.includes(kw)))
        return { success: false };

    const amountResult = extractAmountFromString(normalizedText);
    if (!amountResult) return { success: false };
    const { amount, matchedString } = amountResult;
    let remainingText = normalizedText.replace(matchedString, " ");

    let cardId = null;
    const cards = await getCreditCardsForUser(userData.jid);
    if (cards?.length) {
        for (const card of cards) {
            const regex = new RegExp(
                `(?:no|no cartao|pelo|com o|no credito)\\s+${card.nickname}`,
                "i",
            );
            if (regex.test(remainingText)) {
                cardId = card.id;
                remainingText = remainingText.replace(regex, " ");
                break;
            }
        }
    }

    let description = remainingText;
    const fillerWords = [
        ...expenseKeywords,
        "em",
        "no",
        "na",
        "para",
        "com",
        "de",
    ];
    fillerWords.forEach((word) => {
        description = description.replace(
            new RegExp(`\\b${word}\\b`, "gi"),
            " ",
        );
    });
    description = description
        .trim()
        .replace(/\s+/g, " ")
        .replace(/^[.,!?]+|[.,!?]+$/g, "");

    let category = "Outros";
    for (const word of description.split(" ")) {
        const found = getCategoryFromString(word, userData.categories);
        if (found) {
            category = found;
            break;
        }
    }
    if (!description) description = category;

    return {
        success: true,
        type: "quick_expense",
        amount,
        category,
        description,
        cardId,
    };
}

async function tryParseQuickIncome(text) {
    const normalizedText = normalizeText(text);
    const incomeKeywords = [
        "recebi",
        "ganhei",
        "pix de",
        "pagamento de",
        "entrou",
    ];
    if (!incomeKeywords.some((kw) => normalizedText.includes(kw)))
        return { success: false };

    const amountResult = extractAmountFromString(normalizedText);
    if (!amountResult) return { success: false };
    const { amount, matchedString } = amountResult;
    let description = normalizedText.replace(matchedString, " ");
    incomeKeywords.forEach((word) => {
        description = description.replace(new RegExp(word, "gi"), "");
    });
    description = description
        .trim()
        .replace(/\s+/g, " ")
        .replace(/^[.,!?]+|[.,!?]+$/g, "");

    return {
        success: true,
        type: "quick_income",
        amount,
        description: description || "Receita por voz",
    };
}

async function tryParseCreateGoalVoice(text) {
    const normalizedText = normalizeText(text);
    if (!normalizedText.startsWith("criar meta")) return { success: false };

    const valueMatch = normalizedText.match(
        /(?:de|com|valor de)\\s*(\\d+(?:[.,]\\d{1,2})?)/,
    );
    const monthsMatch = normalizedText.match(/em\\s*(\\d+)\\s*meses?/);
    if (!monthsMatch) return { success: false };

    const months = parseInt(monthsMatch[1]);
    const value = valueMatch ? parseCurrencyValue(valueMatch[1]) : 0;

    let name = normalizedText
        .replace("criar meta", "")
        .replace(valueMatch ? valueMatch[0] : "", "")
        .replace(monthsMatch[0], "")
        .trim();

    if (!name) name = "Nova Meta";

    if (months > 0)
        return {
            success: true,
            type: "create_goal_intent",
            data: { name, value, months },
        };
    return { success: false };
}

async function processCommand(userData, command) {
    let response = "";
    switch (command) {
        case "menu":
            response =
                "Bem-vindo ao PoupaZap! Escolha uma opção:\n\n" +
                "1. Adicionar despesa\n" +
                "2. Adicionar receita\n" +
                "3. Ver balanço do mês\n" +
                "4. Despesas por categoria\n" +
                "5. Metas de poupança\n" +
                "6. Cartões de crédito\n" +
                "7. Despesas agendadas\n" +
                "8. Ajuda\n" +
                "9. Sair";
            userData.currentState = "menu";
            break;
        case "add_expense":
            userData.currentState = "adding_expense_ask_amount";
            response = "Qual o valor da despesa?";
            break;
        case "add_income":
            userData.currentState = "adding_income_ask_amount";
            response = "Qual o valor da receita?";
            break;
        case "view_balance":
            const balance = await getMonthlyBalance(userData.jid);
            response = `Seu balanço do mês:\nReceitas: ${formatCurrency(balance.income)}\nDespesas: ${formatCurrency(balance.expenses)}\nSaldo: ${formatCurrency(balance.balance)}`;
            userData.currentState = "menu";
            break;
        case "expenses_by_category":
            const categoryExpenses = await getCategoryExpenses(
                userData.jid,
                userData.categories,
            );
            let categoryResponse = "Suas despesas por categoria este mês:\n\n";
            for (const category in categoryExpenses) {
                if (categoryExpenses[category] > 0) {
                    categoryResponse += `${category}: ${formatCurrency(categoryExpenses[category])}\n`;
                }
            }
            response =
                categoryResponse || "Nenhuma despesa registrada este mês.";
            userData.currentState = "menu";
            break;
        case "goals":
            response =
                "Funcionalidade de Metas de Poupança em desenvolvimento.";
            userData.currentState = "menu";
            break;
        case "credit_cards":
            response =
                "Funcionalidade de Cartões de Crédito em desenvolvimento.";
            userData.currentState = "menu";
            break;
        case "scheduled_expenses":
            const scheduledExpenses = await getScheduledExpensesForUser(
                userData.jid,
            );
            if (scheduledExpenses.length === 0) {
                return "Você não tem despesas agendadas. Para adicionar uma, digite 'agendar despesa'.";
            }
            let scheduledResponse = "Suas despesas agendadas:\n\n";
            scheduledExpenses.forEach((exp, index) => {
                const nextDueDate = exp.nextDueDate
                    ? new Date(exp.nextDueDate)
                    : null;
                const formattedDate = nextDueDate
                    ? `${nextDueDate.getDate().toString().padStart(2, "0")}/${(nextDueDate.getMonth() + 1).toString().padStart(2, "0")}/${nextDueDate.getFullYear()}`
                    : "N/A";
                scheduledResponse += `${index + 1}. ${exp.name} - ${formatCurrency(exp.amount)} (${exp.recurrenceType}, Vencimento: ${formattedDate})\n`;
            });
            scheduledResponse +=
                "\nPara editar ou remover uma despesa, digite 'editar despesa [número]' ou 'remover despesa [número]'.";
            response = scheduledResponse;
            userData.currentState = "menu";
            break;
        case "help":
            response =
                "Comandos disponíveis:\n" +
                "- 'menu': Exibe o menu principal\n" +
                "- 'adicionar despesa': Inicia o processo de adição de despesa\n" +
                "- 'adicionar receita': Inicia o processo de adição de receita\n" +
                "- 'balanço': Vê o balanço do mês\n" +
                "- 'despesas por categoria': Vê as despesas agrupadas por categoria\n" +
                "- 'metas': Acessa as metas de poupança\n" +
                "- 'cartões': Gerencia cartões de crédito\n" +
                "- 'despesas agendadas': Vê suas despesas agendadas\n" +
                "- 'ajuda': Exibe este menu de ajuda\n" +
                "- 'sair': Encerra a conversa";
            userData.currentState = "menu";
            break;
        case "exit":
            response = "Até mais! Se precisar de algo, é só chamar.";
            userData.currentState = "menu";
            break;
        default:
            // Handle different states for multi-step commands
            switch (userData.currentState) {
                case "adding_expense_ask_amount":
                    const amount = parseCurrencyValue(command);
                    if (isNaN(amount) || amount <= 0) {
                        response =
                            "Valor inválido. Por favor, digite um número válido para a despesa.";
                    } else {
                        userData.tempData.amount = amount;
                        userData.currentState = "adding_expense_ask_category";
                        response =
                            "Em qual categoria? (Ex: Alimentação, Transporte, Moradia)";
                    }
                    break;
                case "adding_expense_ask_category":
                    const category = getCategoryFromString(
                        command,
                        userData.categories,
                    );
                    if (!category) {
                        response = `Categoria inválida. Por favor, escolha uma das seguintes: ${userData.categories.join(", ")}.`;
                    } else {
                        userData.tempData.category = category;
                        userData.currentState =
                            "adding_expense_ask_description";
                        response =
                            "Qual a descrição da despesa? (Ex: Almoço no restaurante)";
                    }
                    break;
                case "adding_expense_ask_description":
                    userData.tempData.description = command;
                    await addTransaction(
                        userData.jid,
                        "expense",
                        userData.tempData.amount,
                        userData.tempData.category,
                        userData.tempData.description,
                    );
                    response = `Despesa de ${formatCurrency(userData.tempData.amount)} em ${userData.tempData.category} (${userData.tempData.description}) adicionada com sucesso!`;
                    userData.tempData = {};
                    userData.currentState = "menu";
                    break;
                case "adding_income_ask_amount":
                    const incomeAmount = parseCurrencyValue(command);
                    if (isNaN(incomeAmount) || incomeAmount <= 0) {
                        response =
                            "Valor inválido. Por favor, digite um número válido para a receita.";
                    } else {
                        userData.tempData.amount = incomeAmount;
                        userData.currentState = "adding_income_ask_description";
                        response =
                            "Qual a descrição da receita? (Ex: Salário, Freelance)";
                    }
                    break;
                case "adding_income_ask_description":
                    userData.tempData.description = command;
                    await addTransaction(
                        userData.jid,
                        "income",
                        userData.tempData.amount,
                        "Receita",
                        userData.tempData.description,
                    );
                    response = `Receita de ${formatCurrency(userData.tempData.amount)} (${userData.tempData.description}) adicionada com sucesso!`;
                    userData.tempData = {};
                    userData.currentState = "menu";
                    break;
                case "confirm_quick_expense":
                    if (normalizeText(command) === "sim") {
                        await addTransaction(
                            userData.jid,
                            "expense",
                            userData.tempData.amount,
                            userData.tempData.category,
                            userData.tempData.description,
                            userData.tempData.cardId,
                            userData.tempData.isVoiceInput,
                        );
                        response = `Despesa de ${formatCurrency(userData.tempData.amount)} em ${userData.tempData.category} (${userData.tempData.description}) adicionada com sucesso!`;
                    } else {
                        response =
                            "Despesa não adicionada. Posso ajudar com mais alguma coisa?";
                    }
                    userData.tempData = {};
                    userData.currentState = "menu";
                    break;
                case "confirm_quick_income":
                    if (normalizeText(command) === "sim") {
                        await addTransaction(
                            userData.jid,
                            "income",
                            userData.tempData.amount,
                            "Receita",
                            userData.tempData.description,
                            null,
                            userData.tempData.isVoiceInput,
                        );
                        response = `Receita de ${formatCurrency(userData.tempData.amount)} (${userData.tempData.description}) adicionada com sucesso!`;
                    } else {
                        response =
                            "Receita não adicionada. Posso ajudar com mais alguma coisa?";
                    }
                    userData.tempData = {};
                    userData.currentState = "menu";
                    break;
                case "adding_goal_ask_name":
                    userData.tempData.goalName = command;
                    userData.currentState = "adding_goal_ask_value";
                    response = `Qual o valor total da meta "${command}"?`;
                    break;
                case "adding_goal_ask_value":
                    const goalValue = parseCurrencyValue(command);
                    if (isNaN(goalValue) || goalValue <= 0) {
                        response =
                            "Valor inválido. Por favor, digite um número válido para a meta.";
                    } else {
                        userData.tempData.goalTargetValue = goalValue;
                        userData.currentState = "adding_goal_ask_months";
                        response = `Em quantos meses você quer atingir a meta de ${formatCurrency(goalValue)}?`;
                    }
                    break;
                case "adding_goal_ask_months":
                    const goalMonths = parseInt(command);
                    if (isNaN(goalMonths) || goalMonths <= 0) {
                        response =
                            "Número de meses inválido. Por favor, digite um número inteiro positivo.";
                    } else {
                        // Logic to add goal to database
                        response = `Meta "${userData.tempData.goalName}" de ${formatCurrency(userData.tempData.goalTargetValue)} em ${goalMonths} meses adicionada com sucesso!`;
                        userData.tempData = {};
                        userData.currentState = "menu";
                    }
                    break;
                case "adding_goal_ask_value_from_voice":
                    const voiceGoalValue = parseCurrencyValue(command);
                    if (isNaN(voiceGoalValue) || voiceGoalValue <= 0) {
                        response =
                            "Valor inválido. Por favor, digite um número válido para a meta.";
                    } else {
                        userData.tempData.goalTargetValue = voiceGoalValue;
                        // Logic to add goal to database
                        response = `Meta "${userData.tempData.goalName}" de ${formatCurrency(userData.tempData.goalTargetValue)} em ${userData.tempData.goalMonths} meses adicionada com sucesso!`;
                        userData.tempData = {};
                        userData.currentState = "menu";
                    }
                    break;
                case "confirm_voice_goal":
                    if (normalizeText(command) === "sim") {
                        // Logic to add goal to database
                        response = `Meta "${userData.tempData.goalName}" de ${formatCurrency(userData.tempData.goalTargetValue)} em ${userData.tempData.goalMonths} meses adicionada com sucesso!`;
                    } else {
                        response =
                            "Meta não adicionada. Posso ajudar com mais alguma coisa?";
                    }
                    userData.tempData = {};
                    userData.currentState = "menu";
                    break;
                case "awaiting_next_entry":
                    response =
                        "Comando não reconhecido. Por favor, digite 'menu' para ver as opções.";
                    userData.currentState = "menu";
                    break;
                default:
                    response =
                        "Desculpe, não entendi. Digite 'menu' para ver as opções.";
                    userData.currentState = "menu";
                    break;
            }
            break;
    }
    return response;
}

module.exports = {
    tryParseQuickExpense,
    tryParseQuickIncome,
    tryParseCreateGoalVoice,
    processCommand,
};

const gerarResposta = require("./gpt");

async function respostaIA(texto) {
    const resposta = await gerarResposta(texto);
    return { success: true, resposta };
}

module.exports.respostaIA = respostaIA;