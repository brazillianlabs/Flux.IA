// utils.js
const { format } = require('date-fns');

const PAYMENT_LINK = process.env.PAYMENT_LINK || "https://seu_link_de_pagamento_aqui";

const categorySynonyms = {
    "alimentacao": "Alimentação", "comida": "Alimentação", "mercado": "Alimentação", "restaurante": "Alimentação", "almoco": "Alimentação", "jantar": "Alimentação", "lanche": "Alimentação", "ifood": "Alimentação", "rappi": "Alimentação", "padaria": "Alimentação", "hortifruti": "Alimentação", "acougue": "Alimentação", "delivery": "Alimentação",
    "transporte": "Transporte", "uber": "Transporte", "99": "Transporte", "gasolina": "Transporte", "onibus": "Transporte", "metro": "Transporte", "passagem": "Transporte", "combustivel": "Transporte", "pedagio": "Transporte", "estacionamento": "Transporte", "app de transporte": "Transporte",
    "moradia": "Moradia", "aluguel": "Moradia", "condominio": "Moradia", "iptu": "Moradia", "agua": "Moradia", "luz": "Moradia", "energia": "Moradia", "internet": "Moradia", "casa": "Moradia", "manutencao": "Moradia", "gas": "Moradia", "diarista": "Moradia", "faxina": "Moradia", "conserto": "Moradia", "reforma": "Moradia",
    "saude": "Saúde", "medico": "Saúde", "remedio": "Saúde", "farmacia": "Saúde", "dentista": "Saúde", "plano de saude": "Saúde", "exame": "Saúde", "consulta": "Saúde", "terapia": "Saúde", "psicologo": "Saúde",
    "lazer": "Lazer", "cinema": "Lazer", "show": "Lazer", "bar": "Lazer", "passeio": "Lazer", "viagem": "Lazer", "hobby": "Lazer", "streaming": "Lazer", "jogo": "Lazer", "game": "Lazer", "festa": "Lazer", "balada": "Lazer", "barzinho": "Lazer", "assinatura": "Lazer", "spotify": "Lazer", "netflix": "Lazer", "disney": "Lazer", "hbo": "Lazer",
    "educacao": "Educação", "curso": "Educação", "livro": "Educação", "faculdade": "Educação", "escola": "Educação", "material escolar": "Educação", "palestra": "Educação", "workshop": "Educação",
    "vestuario": "Vestuário", "roupa": "Vestuário", "sapato": "Vestuário", "tenis": "Vestuário", "acessorio": "Vestuário",
    "cuidados pessoais": "Cuidados Pessoais", "salao de beleza": "Cuidados Pessoais", "cabelereiro": "Cuidados Pessoais", "barbeiro": "Cuidados Pessoais", "manicure": "Cuidados Pessoais", "pedicure": "Cuidados Pessoais", "cosmetico": "Cuidados Pessoais", "perfume": "Cuidados Pessoais", "maquiagem": "Cuidados Pessoais",
    "pets": "Pets", "petshop": "Pets", "racao": "Pets", "veterinario": "Pets", "banho e tosa": "Pets",
    "casa e utilidades": "Casa e Utilidades", "moveis": "Casa e Utilidades", "decoracao": "Casa e Utilidades", "eletrodomestico": "Casa e Utilidades", "utensilio": "Casa e Utilidades", "produtos de limpeza": "Casa e Utilidades",
    "impostos e taxas": "Impostos e Taxas", "imposto de renda": "Impostos e Taxas", "irpf": "Impostos e Taxas", "ipva": "Impostos e Taxas", "taxa bancaria": "Impostos e Taxas", "juros": "Impostos e Taxas",
    "investimentos": "Investimentos", "poupanca": "Investimentos", "acoes": "Investimentos", "cdb": "Investimentos", "tesouro direto": "Investimentos", "criptomoeda": "Investimentos", "bitcoin": "Investimentos",
    "trabalho e escritorio": "Trabalho e Escritório", "material de escritorio": "Trabalho e Escritório", "almoco de negocios": "Trabalho e Escritório", "software": "Trabalho e Escritório", "coworking": "Trabalho e Escritório",
    "presentes": "Presentes", "presente": "Presentes", "doacao": "Presentes", "caridade": "Presentes", "dizimo": "Presentes",
    "outros": "Outros"
};

function normalizeText(text) { if (typeof text !== 'string') return ""; return text.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function parseCurrencyValue(textValue) { if (typeof textValue !== 'string') return NaN; const cleanedValue = normalizeText(textValue).replace("r$", "").replace("reais", "").replace("real", "").replace(/\./g, (match, offset, original) => { const afterDot = original.substring(offset + 1); if (afterDot.match(/^\d{1,2}($|\s|\D)/)) return "."; if (afterDot.includes(",")) return ""; if (afterDot.length > 2 && !afterDot.match(/[.,]/) && afterDot.match(/^\d+$/) ) return ""; return "."; }).replace(",", ".").trim(); let parts = cleanedValue.split('.'); let finalCleanedValue = cleanedValue; if (parts.length > 1) { let lastPart = parts.pop(); if (lastPart.length === 1 || lastPart.length === 2) { finalCleanedValue = parts.join('') + '.' + lastPart; } else { finalCleanedValue = parts.join('') + lastPart; } } const num = parseFloat(finalCleanedValue); return isNaN(num) ? NaN : num; }
function extractAmountFromString(text) {
    const normalizedText = normalizeText(text);
    const pattern1 = /(?<reais1>\d+)\s*(?:r\$|reais|real|brl)?\s*(?<centavos1>\d{1,2})\s*centavos/i;
    const match1 = normalizedText.match(pattern1);
    if (match1 && match1.groups) {
        const reais = match1.groups.reais1;
        const centavos = match1.groups.centavos1.padStart(2, '0');
        const amount = parseFloat(`${reais}.${centavos}`);
        return { amount, matchedString: match1[0] };
    }
    const pattern2 = /(?<reais2>\d+)\s*(?:reais)?\s*e\s*(?<centavos2>\d{1,2})\s*centavos/i;
    const match2 = normalizedText.match(pattern2);
    if (match2 && match2.groups) {
        const reais = match2.groups.reais2;
        const centavos = match2.groups.centavos2.padStart(2, '0');
        const amount = parseFloat(`${reais}.${centavos}`);
        return { amount, matchedString: match2[0] };
    }
    const pattern3 = /(\d+(?:[.,]\d{1,2})?)\s*(?:r\$|reais|real|brl)/i;
    const match3 = normalizedText.match(pattern3);
    if (match3) {
        const amount = parseCurrencyValue(match3[0]);
        return { amount, matchedString: match3[0] };
    }
    return null;
}
function mapInputToMenuOption(userInput) {
    if (typeof userInput !== 'string') return userInput;
    const cleanedInput = userInput.trim().replace(/[.,!?]$/, "");
    const normalizedUserText = normalizeText(cleanedInput);
    const commandMappings = { "1": "1", "01": "1", "um": "1", "adicionar receita": "3", "nova receita": "3", "receita": "3", "2": "2", "02": "2", "dois": "2", "adicionar despesa": "3", "nova despesa": "3", "despesa": "3", "gastei": "3", "3": "3", "03": "3", "tres": "3", "lancar": "3", "lancamento": "3", "4": "4", "04": "4", "quatro": "4", "ajuda": "4", "configuracoes": "4", "config": "4", "ver extrato": "1", "extrato": "1", "resumo mensal": "1", "resumo": "1", "saldo": "1", "gastos": "1", "relatorio": "1", "gerenciar": "2", "orcamento": "2", "metas": "2", "cartoes": "2", "menu": "nav_menu_principal", "inicio": "nav_menu_principal", "voltar": "nav_menu_principal", "cancelar": "nav_menu_principal" };
    if (commandMappings[normalizedUserText]) return commandMappings[normalizedUserText];
    return userInput;
}
function formatCurrency(value) { if (typeof value !== 'number' || isNaN(value)) return 'R$ --,--'; return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
function getCategoryFromString(text, categories) {
    const textForLookup = normalizeText(text.replace(/[.,!?]$/g, ''));
    for (const category of categories) {
        const categoryNormalized = normalizeText(category);
        if (categoryNormalized === textForLookup) return category;
    }
    const mappedCategory = categorySynonyms[textForLookup];
    if (mappedCategory && categories.includes(mappedCategory)) return mappedCategory;
    return null;
}
function getMainMenu() {
    return `🐷 *PoupaZap - Menu Principal*\n\nOlá! Para lançamentos rápidos, basta me dizer o que você fez, por exemplo:\n"Gastei 50 reais no mercado"\n"Ganhei 120 de um freela"\n\nOu, se preferir, escolha uma opção abaixo:\n\n1️⃣ Meus Relatórios 📊\n2️⃣ Gerenciar Finanças 🛠️\n3️⃣ Lançar Manualmente ✍️\n4️⃣ Ajuda & Configurações ⚙️`;
}
function getCategoryMenu(transactionType, categories) { let menuText = `📂 *Selecionar Categoria - ${transactionType}*\n\n`; categories.forEach((cat, index) => { menuText += `${index + 1}️⃣ ${cat}\n`; }); menuText += `\nDigite o número ou o nome da categoria:`; return menuText; }
function getHelp() { return `❓ *Ajuda - PoupaZap*\n\n*Como usar:*\n• A forma mais fácil é por *linguagem natural*. Diga "gastei 25,50 na farmácia" e eu registro!\n• Você também pode navegar pelos menus numéricos.\n• Digite *menu* a qualquer momento para voltar à tela principal.\n\n*Principais funcionalidades:*\n• Lançamento rápido de receitas e despesas por voz ou texto.\n• Relatórios de gastos, extrato e resumo mensal.\n• Gerenciamento de orçamento, metas e cartões de crédito.`; }
function getOnboardingMessage() { return `👋 Bem-vindo(a) ao PoupaZap!\n\nSou seu assistente financeiro pessoal para te ajudar a controlar gastos, receitas e alcançar suas metas, tudo pelo WhatsApp! 💸🎯\n\n**Recursos:**\n* Lançamentos ilimitados de receitas e despesas!\n* Definição de Orçamento Mensal 🎯\n* Criação de Metas Financeiras 🏆\n* Relatórios detalhados por categoria 📊\n* Agendamento de despesas recorrentes/parceladas com lembretes automáticos! ⏰\n\nPara ter acesso completo e transformar sua vida financeira, adquira seu acesso por um valor simbólico!\n➡️ ${process.env.PAYMENT_LINK || 'https://link.depagamento.com'}\n\nApós o pagamento, se a ativação não for imediata, me avise!\nEstou ansioso para te ajudar a poupar! 🐷`; }
async function getCardsMenu(getCreditCardsForUser, userJid) {
    const cards = await getCreditCardsForUser(userJid);
    let menuText = "💳 *Gerenciar Cartões de Crédito*\n\n";
    if (cards.length === 0) {
        menuText += "Você ainda não cadastrou nenhum cartão.\n";
    } else {
        menuText += "Seus cartões cadastrados:\n";
        cards.forEach((card, index) => {
            menuText += `${index + 1}️⃣ ${card.name} (Apelido: ${card.nickname}${card.limitAmount > 0 ? `, Limite: ${formatCurrency(card.limitAmount)}` : ''})\n`;
        });
        menuText += "\n";
    }
    menuText += "Opções:\n";
    menuText += "➕ *Adicionar* novo cartão\n";
    if (cards.length > 0) {
        menuText += "➖ *Remover* um cartão (digite 'remover <apelido>')\n";
    }
    menuText += "⬅️ Voltar ao *menu* principal\n\nDigite sua opção:";
    return menuText;
}

module.exports = {
    normalizeText,
    parseCurrencyValue,
    extractAmountFromString,
    mapInputToMenuOption,
    formatCurrency,
    getCategoryFromString,
    getMainMenu,
    getCategoryMenu,
    getHelp,
    getOnboardingMessage,
    getCardsMenu,
    categorySynonyms,
};