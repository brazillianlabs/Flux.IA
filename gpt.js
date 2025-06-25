const openai = require("./openai");

async function gerarResposta(pergunta) {
  try {
    const resposta = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Você é o assistente inteligente do Flux.IA." },
        { role: "user", content: pergunta }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    return resposta.choices[0].message.content;
  } catch (error) {
    console.error("Erro ao gerar resposta com GPT:", error);
    return "Desculpe, tive um problema para gerar a resposta.";
  }
}

module.exports = gerarResposta;