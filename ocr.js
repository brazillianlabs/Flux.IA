// ocr.js
const Tesseract = require('tesseract.js');

async function extractTextFromImage(imageBuffer) {
    try {
        const { data: { text } } = await Tesseract.recognize(imageBuffer, 'por');
        return text.trim();
    } catch (err) {
        console.error('[OCR] Erro ao extrair texto da imagem:', err);
        return null;
    }
}
const pdf = require('pdf-parse');

async function extractTextFromPdf(pdfBuffer) {
    try {
        const data = await pdf(pdfBuffer);
        return data.text.trim();
    } catch (err) {
        console.error('[OCR] Erro ao extrair texto do PDF:', err);
        return null;
    }
}

module.exports = {
    extractTextFromImage,
    extractAmount,
    extractDescription,
    extractTextFromPdf,
};


function extractAmount(text) {
    const match = text.match(/R?\$?\s?(\d+[.,]?\d{0,2})/g);
    if (!match || match.length === 0) return null;

    // Retorna o maior valor encontrado (supondo que é o total da nota)
    const numeric = match.map(str => parseFloat(str.replace(/[^\d,.-]/g, '').replace(',', '.')));
    return Math.max(...numeric);
}
function extractDueDate(text) {
    const dateRegex = /(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/g;
    const matches = text.match(dateRegex);
    if (!matches || matches.length === 0) return null;

    // Ordena as datas e pega a mais próxima do futuro
    const dates = matches.map(d => new Date(d.replace(/[-.]/g, '/'))).filter(d => !isNaN(d));
    const today = new Date();
    const futureDates = dates.filter(d => d >= today);
    return (futureDates[0] || dates[0])?.toISOString().split('T')[0];
}

function extractBeneficiary(text) {
    const lines = text.split('\n').map(l => l.trim());
    const keywords = ['beneficiário', 'cedente', 'empresa', 'pagador'];
    for (const line of lines) {
        for (const kw of keywords) {
            if (line.toLowerCase().includes(kw)) {
                return line;
            }
        }
    }
    // fallback: primeira linha longa
    return lines.find(l => l.length > 15) || 'Boleto';
}

function isPaid(text) {
    const lower = text.toLowerCase();
    return lower.includes('pago') || lower.includes('comprovante') || lower.includes('efetuado');
}

module.exports = {
    extractTextFromImage,
    extractTextFromPdf,
    extractAmount,
    extractDescription,
    extractDueDate,
    extractBeneficiary,
    isPaid,
};


function extractDescription(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.slice(0, 3).join(' - ').substring(0, 60); // pega primeiras linhas curtas
}

module.exports = {
    extractTextFromImage,
    extractAmount,
    extractDescription,
};
