// server.js
require('dotenv').config();
const express = require("express");
const cron = require('node-cron');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { addMonths, set, getMonth, getYear } = require('date-fns');

const { connectToWhatsApp, getSocket } = require('./whatsapp');
const { db, addTransaction } = require('./database');
const { formatCurrency } = require('./utils');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
const port = process.env.PORT || 3000;

// Apenas a inicialização dos diretórios de áudio e sessão. O DB agora cuida do seu próprio diretório.
const PERSISTENT_DATA_ROOT = process.env.RENDER_DISK_MOUNT_PATH || __dirname;
const DATA_DIR_NAME = 'poupazap_persistent_data';
const AUTH_STATE_FOLDER = path.join(PERSISTENT_DATA_ROOT, DATA_DIR_NAME, 'baileys_auth_info');
const TEMP_AUDIO_DIR = path.join(PERSISTENT_DATA_ROOT, DATA_DIR_NAME, 'temp_audio');

if (!fs.existsSync(AUTH_STATE_FOLDER)) fs.mkdirSync(AUTH_STATE_FOLDER, { recursive: true });
if (!fs.existsSync(TEMP_AUDIO_DIR)) fs.mkdirSync(TEMP_AUDIO_DIR, { recursive: true });

// Inicia a conexão com o WhatsApp. O 'require' do database.js já terá iniciado a conexão ao DB.
connectToWhatsApp();

app.get("/", (req, res) => {
    res.send("PoupaZap está vivo! 🐷");
});

app.listen(port, () => {
  logger.info(`[Server] PoupaZap rodando na porta ${port}`);
});

cron.schedule('0 9 * * *', async () => {
    logger.info(`[Cron] Executando verificação de despesas agendadas...`);
    const sock = getSocket();
    if (!sock || !sock.ws || sock.ws.readyState !== require('ws').OPEN) {
        logger.warn('[Cron] Socket não está conectado.');
        return;
    }

    db.all("SELECT * FROM ScheduledExpenses WHERE isActive = 1", async (err, scheduledExpenses) => {
        if (err) { 
            logger.error({ err }, '[Cron] Erro ao buscar despesas agendadas'); 
            return; 
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const expense of scheduledExpenses) {
            const nextDueDate = new Date(expense.nextDueDate);
            nextDueDate.setHours(0, 0, 0, 0);

            if (expense.reminderEnabled === 1) {
                const reminderDate = new Date(nextDueDate);
                reminderDate.setDate(nextDueDate.getDate() - expense.reminderDaysBefore);
                if (reminderDate.getTime() === today.getTime()) {
                    const message = `🔔 *Lembrete:* Sua despesa "${expense.name || expense.originalDescription}" de ${formatCurrency(expense.amount)} vence em ${expense.reminderDaysBefore} dia(s)!`;
                    try {
                        await sock.sendMessage(expense.userJid, { text: message });
                    } catch (e) {
                        logger.error({ err: e, jid: expense.userJid }, `[Cron] Erro ao enviar lembrete.`);
                    }
                }
            }
            
            if (nextDueDate <= today) {
                try {
                    await addTransaction(expense.userJid, 'expense', expense.amount, expense.category, `Pagamento (Agendado): ${expense.name || expense.originalDescription}`, expense.cardId);
                    
                    if (expense.type === 'installment') {
                        const newPaid = expense.installmentsPaid + 1;
                        if (newPaid >= expense.totalInstallments) {
                            db.run("UPDATE ScheduledExpenses SET isActive = 0, installmentsPaid = ? WHERE id = ?", [newPaid, expense.id]);
                        } else {
                            const nextDate = addMonths(nextDueDate, 1);
                            db.run("UPDATE ScheduledExpenses SET installmentsPaid = ?, nextDueDate = ? WHERE id = ?", [newPaid, nextDate.toISOString(), expense.id]);
                        }
                    } else if (expense.type === 'recurring') {
                        let nextDate = set(addMonths(nextDueDate, 1), { date: expense.recurrenceDay });
                        if (getMonth(nextDate) !== getMonth(addMonths(nextDueDate, 1))) {
                            nextDate = new Date(getYear(addMonths(nextDueDate, 1)), getMonth(addMonths(nextDueDate, 1)) + 1, 0);
                        }
                        db.run("UPDATE ScheduledExpenses SET nextDueDate = ? WHERE id = ?", [nextDate.toISOString(), expense.id]);
                    }
                } catch (procErr) {
                    logger.error({ err: procErr, jid: expense.userJid }, `[Cron] Erro ao processar vencimento.`);
                }
            }
        }
    });
}, { scheduled: true, timezone: "America/Sao_Paulo" });

logger.info('[PoupaZap] Aplicação iniciada.');