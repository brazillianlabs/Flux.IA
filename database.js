// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const pino = require('pino');
const fs = require('fs');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const PERSISTENT_DATA_ROOT = process.env.RENDER_DISK_MOUNT_PATH || __dirname;
const DATA_DIR_NAME = 'poupazap_persistent_data';
const PERSISTENT_DATA_PATH = path.join(PERSISTENT_DATA_ROOT, DATA_DIR_NAME);
const DB_FILE_PATH = path.join(PERSISTENT_DATA_PATH, 'poupazap.sqlite');

if (!fs.existsSync(PERSISTENT_DATA_PATH)) {
    fs.mkdirSync(PERSISTENT_DATA_PATH, { recursive: true });
    logger.info(`[Setup] Diretório de dados persistentes criado em: ${PERSISTENT_DATA_PATH}`);
}

const db = new sqlite3.Database(DB_FILE_PATH, (err) => {
    if (err) {
        logger.error({ err }, `[SQLite] Erro ao conectar ao banco de dados: ${err.message}`);
        process.exit(1);
    }
    logger.info(`[SQLite] Conectado ao banco de dados SQLite em: ${DB_FILE_PATH}`);
    initDb();
});

function initDb() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS Users (
            jid TEXT PRIMARY KEY, currentState TEXT DEFAULT 'menu', tempData TEXT DEFAULT '{}',
            monthlyBudget REAL DEFAULT 0, accountStatus TEXT DEFAULT 'active', pushName TEXT 
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS CreditCards (
            id INTEGER PRIMARY KEY AUTOINCREMENT, userJid TEXT NOT NULL, name TEXT NOT NULL, 
            nickname TEXT, limitAmount REAL, closingDay INTEGER, dueDay INTEGER,
            UNIQUE(userJid, nickname),
            FOREIGN KEY(userJid) REFERENCES Users(jid) ON DELETE CASCADE
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS Transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, userJid TEXT, type TEXT, amount REAL, category TEXT,
            description TEXT, date TEXT, month INTEGER, year INTEGER, cardId INTEGER, isVoiceInput INTEGER DEFAULT 0,
            FOREIGN KEY(userJid) REFERENCES Users(jid) ON DELETE CASCADE,
            FOREIGN KEY(cardId) REFERENCES CreditCards(id) ON DELETE SET NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS Goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT, userJid TEXT, name TEXT, targetValue REAL,
            currentValue REAL DEFAULT 0, months INTEGER, monthlyTarget REAL, createdAt TEXT,
            FOREIGN KEY(userJid) REFERENCES Users(jid) ON DELETE CASCADE
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS ScheduledExpenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT, userJid TEXT, name TEXT, amount REAL, category TEXT,
            type TEXT, recurrenceType TEXT, recurrenceDay INTEGER, totalInstallments INTEGER, 
            installmentsPaid INTEGER DEFAULT 0, nextDueDate TEXT, reminderEnabled INTEGER DEFAULT 0, 
            reminderDaysBefore INTEGER DEFAULT 1, isActive INTEGER DEFAULT 1, originalDescription TEXT, cardId INTEGER,
            FOREIGN KEY(userJid) REFERENCES Users(jid) ON DELETE CASCADE,
            FOREIGN KEY(cardId) REFERENCES CreditCards(id) ON DELETE SET NULL
        )`);
    });
}

const userDataCache = new Map();

class UserData {
    constructor(jid, currentState = 'menu', tempData = {}, monthlyBudget = 0, accountStatus = 'active', pushName = '') {
        this.jid = jid;
        this.currentState = currentState;
        this.tempData = typeof tempData === 'string' ? JSON.parse(tempData) : (tempData || {});
        this.monthlyBudget = monthlyBudget || 0;
        this.accountStatus = accountStatus || 'active';
        this.pushName = pushName || '';
        this.categories = [
            'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 
            'Educação', 'Vestuário', 'Cuidados Pessoais', 'Pets', 'Casa e Utilidades',
            'Impostos e Taxas', 'Investimentos', 'Trabalho e Escritório', 'Presentes', 'Outros'
        ];
        this.cards = [];
    }
}

async function getUserData(jid, pushName = '') {
    if (userDataCache.has(jid)) {
        const cachedUser = userDataCache.get(jid);
        if (pushName && cachedUser.pushName !== pushName) {
            cachedUser.pushName = pushName;
            db.run("UPDATE Users SET pushName = ? WHERE jid = ?", [pushName, jid]);
        }
        return cachedUser;
    }
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM Users WHERE jid = ?", [jid], async (err, row) => {
            if (err) { return reject(err); }
            if (row) {
                const user = new UserData(row.jid, row.currentState, row.tempData, row.monthlyBudget, row.accountStatus, row.pushName || pushName);
                if (pushName && row.pushName !== pushName) {
                     db.run("UPDATE Users SET pushName = ? WHERE jid = ?", [pushName, jid]);
                }
                userDataCache.set(jid, user);
                resolve(user);
            } else {
                const user = new UserData(jid, 'menu', {}, 0, 'active', pushName);
                db.run("INSERT INTO Users (jid, currentState, tempData, accountStatus, monthlyBudget, pushName) VALUES (?, ?, ?, ?, 0, ?)",
                    [jid, 'menu', '{}', 'active', pushName], (insertErr) => {
                    if (insertErr) { return reject(insertErr); }
                    userDataCache.set(jid, user);
                    resolve(user);
                });
            }
        });
    });
}

async function saveUserDataState(userData) {
    return new Promise((resolve, reject) => {
        db.run("UPDATE Users SET currentState = ?, tempData = ?, monthlyBudget = ?, accountStatus = ?, pushName = ? WHERE jid = ?",
            [userData.currentState, JSON.stringify(userData.tempData), userData.monthlyBudget, userData.accountStatus, userData.pushName, userData.jid],
            (err) => err ? reject(err) : resolve()
        );
    });
}

async function addTransaction(userJid, type, amount, category, description = '', cardId = null, isVoiceInput = false) {
    return new Promise((resolve, reject) => {
        const now = new Date();
        const transaction = {
            userJid, type, amount: parseFloat(amount), category, description,
            date: now.toISOString(), month: now.getMonth() + 1, year: now.getFullYear(),
            cardId: cardId, isVoiceInput: isVoiceInput ? 1 : 0
        };
        db.run("INSERT INTO Transactions (userJid, type, amount, category, description, date, month, year, cardId, isVoiceInput) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [transaction.userJid, transaction.type, transaction.amount, transaction.category, transaction.description, transaction.date, transaction.month, transaction.year, transaction.cardId, transaction.isVoiceInput],
            function(err) {
                if (err) return reject(err);
                resolve({ id: this.lastID, ...transaction });
            }
        );
    });
}

async function getMonthlyBalance(userJid) {
    return new Promise((resolve, reject) => {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        db.all("SELECT type, amount FROM Transactions WHERE userJid = ? AND month = ? AND year = ?",
            [userJid, currentMonth, currentYear], (err, rows) => {
            if (err) return reject(err);
            const income = rows.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0);
            const expenses = rows.filter(r => r.type === 'expense').reduce((sum, r) => sum + r.amount, 0);
            resolve({ income, expenses, balance: income - expenses });
        });
    });
}

async function getCategoryExpenses(userJid, categoriesList) {
    return new Promise((resolve, reject) => {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        db.all("SELECT category, SUM(amount) as totalAmount FROM Transactions WHERE userJid = ? AND type = 'expense' AND month = ? AND year = ? GROUP BY category",
            [userJid, currentMonth, currentYear], (err, rows) => {
            if (err) return reject(err);
            const categoryTotals = {};
            categoriesList.forEach(cat => categoryTotals[cat] = 0);
            rows.forEach(row => {
                categoryTotals[row.category] = (categoryTotals[row.category] || 0) + row.totalAmount;
            });
            resolve(Object.fromEntries(
                Object.entries(categoryTotals).sort(([,a],[,b]) => b-a)
            ));
        });
    });
}

async function addScheduledExpenseToUser(userData, scheduledExpenseData) {
    return new Promise((resolve, reject) => {
        const { name, amount, category, type, recurrenceType, recurrenceDay, totalInstallments, nextDueDate, reminderEnabled, reminderDaysBefore, originalDescription, cardId } = scheduledExpenseData;
        db.run(`INSERT INTO ScheduledExpenses (userJid, name, amount, category, type, recurrenceType, recurrenceDay, totalInstallments, installmentsPaid, nextDueDate, reminderEnabled, reminderDaysBefore, isActive, originalDescription, cardId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [userData.jid, name, amount, category, type, recurrenceType, recurrenceDay, totalInstallments, 0, nextDueDate.toISOString(), reminderEnabled ? 1:0, reminderDaysBefore, originalDescription, cardId || null],
            function(err) {
                if (err) return reject(err);
                resolve({ id: this.lastID, ...scheduledExpenseData });
            }
        );
    });
}

async function addCreditCard(userJid, name, nickname, limitAmount, closingDay, dueDay) {
    return new Promise((resolve, reject) => {
        db.run("INSERT INTO CreditCards (userJid, name, nickname, limitAmount, closingDay, dueDay) VALUES (?, ?, ?, ?, ?, ?)",
            [userJid, name, nickname, limitAmount, closingDay, dueDay], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return reject(new Error(`Já existe um cartão com o apelido "${nickname}". Escolha outro.`));
                }
                return reject(err);
            }
            resolve({ id: this.lastID, userJid, name, nickname, limitAmount, closingDay, dueDay });
        });
    });
}

async function getCreditCardsForUser(userJid) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM CreditCards WHERE userJid = ?", [userJid], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

async function getCreditCardByNickname(userJid, nickname) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM CreditCards WHERE userJid = ? AND nickname = ?", [userJid, nickname], (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

async function removeCreditCard(userJid, cardIdOrNickname) {
    return new Promise(async (resolve, reject) => {
        let cardId = parseInt(cardIdOrNickname);
        if (isNaN(cardId)) { 
            const card = await getCreditCardByNickname(userJid, cardIdOrNickname);
            if (!card) return reject(new Error(`Cartão com apelido "${cardIdOrNickname}" não encontrado.`));
            cardId = card.id;
        }
        db.run("UPDATE Transactions SET cardId = NULL WHERE cardId = ? AND userJid = ?", [cardId, userJid], function(err) {
            if (err) return reject(err);
            db.run("DELETE FROM CreditCards WHERE id = ? AND userJid = ?", [cardId, userJid], function(err) {
                if (err) return reject(err);
                if (this.changes === 0) return reject(new Error("Cartão não encontrado ou não pertence a você."));
                resolve(this.changes > 0);
            });
        });
    });
}

module.exports = {
    db,
    initDb,
    UserData,
    userDataCache,
    getUserData,
    saveUserDataState,
    addTransaction,
    getMonthlyBalance,
    getCategoryExpenses,
    addScheduledExpenseToUser,
    addCreditCard,
    getCreditCardsForUser,
    getCreditCardByNickname,
    removeCreditCard
};