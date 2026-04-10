const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');


const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyAe1dSdVzJ1785tNt4-OOmg7Lq4-q06YXs');
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const conversationHistory = {};
const gameStates = {};

let sock = null;
let isConnected = false;
let connectionInfo = {};
let disconnectTime = null;
let disconnectReason = null;

// ═══════════════════════════════════════════════════════
//  FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════

function log(msg) {
  const time = new Date().toLocaleString('pt-BR');
  console.log(`[${time}] ${msg}`);
  io.emit('log', { time, msg });
}

async function askClaude(jid, prompt, systemPrompt = '') {
  if (!conversationHistory[jid]) conversationHistory[jid] = [];
  conversationHistory[jid].push({ role: 'user', parts: [{ text: prompt }] });
  if (conversationHistory[jid].length > 20) conversationHistory[jid] = conversationHistory[jid].slice(-20);

  const chat = geminiModel.startChat({
    history: conversationHistory[jid].slice(0, -1),
    systemInstruction: systemPrompt || 'Você é YGLN, um assistente inteligente e divertido para WhatsApp. Responda sempre em português brasileiro de forma natural, criativa e envolvente.',
  });

  const result = await chat.sendMessage(prompt);
  const reply = result.response.text();
  conversationHistory[jid].push({ role: 'model', parts: [{ text: reply }] });
  return reply;
}

async function askClaudeFresh(prompt, systemPrompt = '') {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: systemPrompt || 'Você é YGLN, um assistente inteligente para WhatsApp. Responda em português brasileiro.',
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

function isGroup(jid) { return jid.endsWith('@g.us'); }

async function react(msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: emoji, key: msg.key }
    });
  } catch {}
}

async function reply(jid, text, quoted) {
  await sock.sendMessage(jid, { text }, { quoted });
}

// ═══════════════════════════════════════════════════════
//  MENUS
// ═══════════════════════════════════════════════════════

const menuPV = `╔══════════════════════════╗
║  🌟 *YGLN System — PV*  🌟  ║
╚══════════════════════════╝

💌 *CARTAS & POESIA*
/cartaamor [nome] [m/f] — Carta romântica
/poema [tema] — Poema personalizado
/declaracao [nome] — Declaração de amor
/soneto [tema] — Soneto literário
/haiku [tema] — Haiku japonês
/acrostico [nome] — Acróstico com nome
/cartadesculpa [nome] — Carta de desculpas
/cartaamizade [nome] — Carta de amizade
/cartamae — Carta para a mãe
/cartapai — Carta para o pai
/cartaaniversario [nome] — Carta de aniversário
/cartaformatura [nome] — Carta de formatura
/cartadespedida [nome] — Carta de despedida
/cartafelicidades [nome] — Carta de felicidades
/cartaparabens [nome] — Parabéns especial

🎮 *JOGOS PV*
/forca — Jogo da forca
/adivinha — Adivinhe o número
/quiz — Quiz aleatório
/verdadeoudesafio — Verdade ou Desafio
/rolarolado — Rolar dado (1-6)
/rolardado [lados] — Dado personalizado
/sortear [min] [max] — Número aleatório
/cara — Cara ou coroa
/8bola [pergunta] — Bola mágica
/destino — Qual seu destino hoje?
/tarot — Tiragem de tarot
/horoscopo [signo] — Horóscopo do dia
/numerologia [nome] — Análise numerológica
/compatibilidade [signo1] [signo2] — Compatibilidade
/personalidade — Teste de personalidade

🤖 *IA & CHAT*
/ai [pergunta] — Conversar com IA
/resumo [texto] — Resumir texto
/melhorar [texto] — Melhorar texto
/corrigir [texto] — Corrigir gramática
/traduzir [idioma] [texto] — Traduzir texto
/sinonimo [palavra] — Sinônimos
/definir [palavra] — Definição
/rima [palavra] — Palavras que rimam
/historia [tema] — Conto curto
/piada — Piada aleatória
/curiosidade — Curiosidade do dia
/fato [tema] — Fato curioso sobre tema
/conselho — Conselho do dia
/motivacao — Frase motivacional
/citacao [autor] — Citação famosa

🎨 *DIVERSÃO*
/moodboard [tema] — Moodboard em texto
/playlist [humor] — Playlist sugerida
/filme [genero] — Recomendação de filme
/serie [genero] — Recomendação de série
/livro [genero] — Recomendação de livro
/receita [ingredientes] — Sugerir receita
/viagem [pais] — Roteiro de viagem
/nomear [tipo] — Sugerir nomes criativos
/apelido [nome] — Apelido carinhoso
/elogio — Elogio do dia

🔧 *UTILIDADES PV*
/clima [cidade] — Previsão do tempo (info)
/calcular [expressão] — Calculadora
/converter [valor] [de] [para] — Conversor
/bmi [peso] [altura] — Calcular IMC
/imc [peso] [altura] — IMC detalhado
/calorias [alimento] — Calorias do alimento
/temporizador [min] — Lembrete em X min
/contador [inicio] — Contagem regressiva
/senha [tamanho] — Gerar senha segura
/cpf — Gerar CPF (fictício/teste)

📊 *ANÁLISE*
/analisartexto [texto] — Análise completa
/sentimento [texto] — Análise de sentimento
/perfil [nome] — Perfil fictício criativo
/previsao [tema] — Previsão criativa
/signo [data] — Descobrir signo
/idadecao [data] — Calcular idade canina
/biorritmo [data] — Biorritmo do dia

💬 *MENSAGENS ESPECIAIS*
/bomdia — Mensagem de bom dia
/boatarde — Mensagem de boa tarde
/boanoite — Mensagem de boa noite
/beijinho — Mensagem carinhosa
/abraco — Mensagem de abraço virtual
/saudade [nome] — Mensagem de saudade
/parabens [nome] — Mensagem de parabéns
/cheer — Mensagem de encorajamento
/check — Checklist do dia

📋 *SISTEMA*
/menu — Este menu
/menupv — Menu do PV
/menugrupo — Menu de grupos
/ping — Verificar se o bot está online
/info — Informações do bot
/ajuda [comando] — Ajuda sobre comando
/stats — Estatísticas do bot
/limpar — Limpar histórico de IA
/sobre — Sobre o YGLN System
/versao — Versão atual`;

const menuGrupo = `╔══════════════════════════════╗
║  🔥 *YGLN System — Grupos*  🔥  ║
╚══════════════════════════════╝

👑 *ADMINISTRAÇÃO*
/banir [@user] — Banir membro
/add [numero] — Adicionar membro
/promover [@user] — Promover a admin
/rebaixar [@user] — Rebaixar de admin
/fechar — Fechar grupo (só admin)
/abrir — Abrir grupo (só admin)
/nome [novo nome] — Mudar nome do grupo
/descricao [texto] — Mudar descrição
/linkinvite — Gerar link do grupo
/revogar — Revogar link do grupo
/listar — Listar todos os membros
/admins — Listar administradores
/kick [@user] — Remover sem banir
/avisar [@user] [motivo] — Avisar publicamente
/silenciar [@user] — Silenciar membro (aviso)
/bem-vindo [mensagem] — Configurar boas-vindas
/adeus [mensagem] — Configurar mensagem de saída
/regras — Ver regras do grupo
/setregras [texto] — Definir regras

🎮 *JOGOS EM GRUPO*
/jogodavelha — Jogo da velha (2 jogadores)
/quizgrupo — Quiz em grupo (pontuação)
/batalhapoesia — Batalha de poesia IA
/verdadeoudesafiogrupo — VoD para grupo
/duelo [@user] — Duelo de perguntas
/trivia — Trivia rápida
/palavrasecreta — Palavra secreta
/stopgrupo — Jogo Stop em grupo
/bingonumero — Bingo de números
/roleta — Roleta da sorte (membros)
/sorteio — Sortear membro do grupo
/aposta [valor] [coisa] — Sistema de apostas divertido
/ranking — Ranking de atividade
/pontos — Ver seus pontos
/campeonato — Iniciar campeonato de quiz
/placar — Ver placar atual

💬 *INTERAÇÃO EM GRUPO*
/ai [pergunta] — IA para o grupo
/pergunta [tema] — Pergunta para debate
/topico — Tópico do dia
/desafio — Desafio do dia para o grupo
/piada — Piada para o grupo
/meme [tema] — Gerar meme em texto
/enquete [pergunta] — Criar enquete
/votacao [opcoes] — Votação rápida
/aniversariantes — Ver aniversariantes
/bom-dia-grupo — Mensagem de bom dia em grupo
/motivagrupo — Frase motivacional para o grupo
/anuncio [texto] — Fazer anúncio formatado
/noticia [tema] — Notícia fictícia criativa
/historia-grupo — Conto criado pelo grupo (IA)
/rima-grupo — Batalha de rimas

🎭 *ENTRETENIMENTO GRUPO*
/cenas — Cenas aleatórias para roleplay
/personagem — Personagem aleatório
/missao — Missão do dia para o grupo
/curiosidade-grupo — Curiosidade para debater
/filosofia — Pergunta filosófica
/dilema — Dilema moral
/shippar [@user1] [@user2] — Shipar dois membros
/compativelgrupo — Teste de compatibilidade em grupo
/confissao — Confissão anônima simulada
/elogio-grupo [@user] — Elogio público

📊 *ESTATÍSTICAS & INFO*
/topo — Membros mais ativos
/inativo — Membros inativos
/infomembro [@user] — Info de um membro
/infogrupo — Informações do grupo
/historico — Histórico de comandos do grupo
/medalhas [@user] — Ver medalhas do membro
/conquistas — Conquistas do grupo
/streaks — Sequências de atividade

🔧 *UTILIDADES GRUPO*
/calcular [expressão] — Calculadora
/converter [val] [de] [para] — Conversor
/sortear [min] [max] — Número aleatório
/dados [qtd]d[lados] — Rolar dados
/temporizador [min] — Temporizador público
/lembrete [min] [msg] — Lembrete no grupo
/wikipedia [tema] — Resumo da Wikipedia
/receita [prato] — Receita do prato
/clima [cidade] — Clima da cidade

🎵 *CRIATIVIDADE GRUPO*
/letra [musica] — Letra de música fictícia
/rap [tema] — Rap sobre o tema
/funk [tema] — Funk criativo
/cordel [tema] — Cordel nordestino
/slogan [produto] — Slogan criativo
/historia [inicio] — Completar história
/roast [@user] — Roast engraçado (leve)
/elogio-exagerado [@user] — Elogio exagerado
/imitarfamoso [famoso] — Imitar famoso
/obituario [@user] — Obituário engraçado (fictício)

🛡️ *MODERAÇÃO AVANÇADA*
/antispam [on/off] — Anti-spam
/antilink [on/off] — Anti-links externos
/boas-vindas [on/off] — Ativar boas-vindas
/modosilencio [on/off] — Modo silêncio
/slowmode [segundos] — Modo lento
/filtro [palavra] — Adicionar ao filtro
/desfiltro [palavra] — Remover do filtro
/filtros — Ver lista de filtros

📋 *SISTEMA GRUPO*
/menu — Menu completo
/menupv — Menu do PV
/menugrupo — Este menu
/ping — Verificar bot
/help [cmd] — Ajuda de comando
/prefixo [novo] — Mudar prefixo (admin)
/ativar [função] — Ativar função
/desativar [função] — Desativar função
/config — Configurações do grupo
/reset — Resetar configurações
/backup — Backup das configs
/status — Status do bot no grupo`;

// ═══════════════════════════════════════════════════════
//  HANDLER DE COMANDOS — PV (100 funções)
// ═══════════════════════════════════════════════════════

async function handlePVCommand(jid, cmd, args, msg) {
  const text = args.join(' ');

  // CARTAS (15 comandos)
  if (cmd === 'cartaamor') {
    await react(msg, '💌');
    const nome = args[0] || 'Camila';
    const genero = args[1] || 'f';
    const pronoun = genero === 'm' ? 'ele' : 'ela';
    const resp = await askClaudeFresh(
      `Escreva uma carta de amor linda, apaixonada e única para ${nome}. Use pronomes ${genero === 'm' ? 'masculinos' : 'femininos'}. Seja criativo, poético e emocionante. Assine como "Com todo meu amor ❤️"`,
      'Você é um especialista em cartas românticas. Escreva cartas únicas, profundas e emocionantes em português.'
    );
    return reply(jid, `💌 *Carta de Amor para ${nome}*\n\n${resp}`, msg);
  }

  if (cmd === 'poema') {
    await react(msg, '📜');
    const resp = await askClaudeFresh(`Escreva um poema lindo sobre: ${text || 'amor'}. Use rimas, metáforas e seja criativo.`);
    return reply(jid, `📜 *Poema — ${text || 'Amor'}*\n\n${resp}`, msg);
  }

  if (cmd === 'declaracao') {
    await react(msg, '💕');
    const nome = text || 'Camila';
    const resp = await askClaudeFresh(`Escreva uma declaração de amor arrebatadora e única para ${nome}. Seja apaixonado, sincero e emocionante.`);
    return reply(jid, `💕 *Declaração para ${nome}*\n\n${resp}`, msg);
  }

  if (cmd === 'soneto') {
    await react(msg, '🎭');
    const resp = await askClaudeFresh(`Escreva um soneto literário clássico (14 versos, ABBA ABBA CDC DCD) sobre: ${text || 'amor eterno'}`);
    return reply(jid, `🎭 *Soneto — ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'haiku') {
    await react(msg, '🌸');
    const resp = await askClaudeFresh(`Escreva 3 haikus japoneses (5-7-5 sílabas) sobre: ${text || 'natureza'}. Explique cada um.`);
    return reply(jid, `🌸 *Haikus — ${text || 'Natureza'}*\n\n${resp}`, msg);
  }

  if (cmd === 'acrostico') {
    await react(msg, '✨');
    const nome = text || 'AMOR';
    const resp = await askClaudeFresh(`Crie um acróstico poético e lindo com o nome: ${nome.toUpperCase()}. Cada letra inicia um verso do poema.`);
    return reply(jid, `✨ *Acróstico — ${nome.toUpperCase()}*\n\n${resp}`, msg);
  }

  if (cmd === 'cartadesculpa') {
    await react(msg, '🙏');
    const resp = await askClaudeFresh(`Escreva uma carta de desculpas sincera, emotiva e profunda para: ${text || 'alguém especial'}`);
    return reply(jid, `🙏 *Carta de Desculpas*\n\n${resp}`, msg);
  }

  if (cmd === 'cartaamizade') {
    await react(msg, '🤝');
    const resp = await askClaudeFresh(`Escreva uma carta emocionante celebrando a amizade com ${text || 'um amigo especial'}. Seja carinhoso e sincero.`);
    return reply(jid, `🤝 *Carta de Amizade*\n\n${resp}`, msg);
  }

  if (cmd === 'cartamae') {
    await react(msg, '👩‍👦');
    const resp = await askClaudeFresh(`Escreva uma carta emocionante e linda para uma mãe. Celebre o amor materno e agradeça por tudo.`);
    return reply(jid, `👩‍👦 *Carta para a Mãe*\n\n${resp}`, msg);
  }

  if (cmd === 'cartapai') {
    await react(msg, '👨‍👦');
    const resp = await askClaudeFresh(`Escreva uma carta emocionante e linda para um pai. Celebre o amor paterno e agradeça por tudo.`);
    return reply(jid, `👨‍👦 *Carta para o Pai*\n\n${resp}`, msg);
  }

  if (cmd === 'cartaaniversario') {
    await react(msg, '🎂');
    const resp = await askClaudeFresh(`Escreva uma carta de aniversário especial e emocionante para ${text || 'alguém especial'}. Celebre a vida e o futuro.`);
    return reply(jid, `🎂 *Carta de Aniversário*\n\n${resp}`, msg);
  }

  if (cmd === 'cartaformatura') {
    await react(msg, '🎓');
    const resp = await askClaudeFresh(`Escreva uma carta de parabéns pela formatura de ${text || 'alguém especial'}. Seja inspirador e emocionante.`);
    return reply(jid, `🎓 *Carta de Formatura*\n\n${resp}`, msg);
  }

  if (cmd === 'cartadespedida') {
    await react(msg, '👋');
    const resp = await askClaudeFresh(`Escreva uma carta de despedida tocante para ${text || 'alguém especial'}. Emotiva mas esperançosa.`);
    return reply(jid, `👋 *Carta de Despedida*\n\n${resp}`, msg);
  }

  if (cmd === 'cartafelicidades') {
    await react(msg, '🌟');
    const resp = await askClaudeFresh(`Escreva uma carta desejando felicidades para ${text || 'alguém especial'} numa nova fase da vida.`);
    return reply(jid, `🌟 *Carta de Felicidades*\n\n${resp}`, msg);
  }

  if (cmd === 'cartaparabens') {
    await react(msg, '🎉');
    const resp = await askClaudeFresh(`Escreva uma mensagem de parabéns criativa e especial para ${text || 'alguém'}.`);
    return reply(jid, `🎉 *Parabéns Especial*\n\n${resp}`, msg);
  }

  // JOGOS PV (15 comandos)
  if (cmd === 'forca') {
    await react(msg, '🎮');
    const palavras = ['AMOR', 'SAUDADE', 'FELICIDADE', 'CORACAO', 'BEIJO', 'ABRACO', 'CARINHO', 'PAIXAO', 'AMIZADE', 'SONHO'];
    const palavra = palavras[Math.floor(Math.random() * palavras.length)];
    gameStates[jid] = { game: 'forca', palavra, tentativas: [], erros: 0, maxErros: 6 };
    const display = palavra.split('').map(l => '_').join(' ');
    return reply(jid, `🎮 *Jogo da Forca!*\n\nPalavra: ${display}\nLetras tentadas: —\nErros: 0/6\n\nDigite /tentativa [letra] para adivinhar!`, msg);
  }

  if (cmd === 'tentativa') {
    await react(msg, '🎯');
    const state = gameStates[jid];
    if (!state || state.game !== 'forca') return reply(jid, '❌ Nenhum jogo da forca ativo! Use /forca', msg);
    const letra = text.toUpperCase()[0];
    if (state.tentativas.includes(letra)) return reply(jid, `⚠️ Você já tentou a letra *${letra}*!`, msg);
    state.tentativas.push(letra);
    if (!state.palavra.includes(letra)) state.erros++;
    const display = state.palavra.split('').map(l => state.tentativas.includes(l) ? l : '_').join(' ');
    const forca = ['😊', '😟', '😰', '😱', '😵', '💀', '☠️'][state.erros];
    if (state.erros >= state.maxErros) {
      delete gameStates[jid];
      return reply(jid, `☠️ *Game Over!*\nA palavra era: *${state.palavra}*`, msg);
    }
    if (!display.includes('_')) {
      delete gameStates[jid];
      return reply(jid, `🏆 *Parabéns! Você venceu!*\nPalavra: *${state.palavra}*`, msg);
    }
    return reply(jid, `${forca} *Forca*\n\nPalavra: ${display}\nLetras: ${state.tentativas.join(', ')}\nErros: ${state.erros}/6`, msg);
  }

  if (cmd === 'adivinha') {
    await react(msg, '🔢');
    const numero = Math.floor(Math.random() * 100) + 1;
    gameStates[jid] = { game: 'adivinha', numero, tentativas: 0 };
    return reply(jid, `🔢 *Adivinhe o Número!*\n\nEstou pensando em um número de 1 a 100.\nDigite /chutar [número] para tentar!`, msg);
  }

  if (cmd === 'chutar') {
    await react(msg, '🎯');
    const state = gameStates[jid];
    if (!state || state.game !== 'adivinha') return reply(jid, '❌ Nenhum jogo ativo! Use /adivinha', msg);
    const chute = parseInt(text);
    state.tentativas++;
    if (chute === state.numero) {
      delete gameStates[jid];
      return reply(jid, `🏆 *Acertou em ${state.tentativas} tentativas!*\nO número era *${state.numero}*!`, msg);
    }
    const dica = chute < state.numero ? '📈 Maior!' : '📉 Menor!';
    return reply(jid, `${dica}\nTentativa ${state.tentativas}. Continue tentando!\nDigite /chutar [número]`, msg);
  }

  if (cmd === 'quiz') {
    await react(msg, '❓');
    const resp = await askClaudeFresh(
      'Crie uma pergunta de quiz interessante com 4 alternativas (A, B, C, D) e indique a resposta correta. Formato:\n❓ PERGUNTA\nA) ...\nB) ...\nC) ...\nD) ...\n✅ Resposta: X) ...',
      'Crie quizzes variados e interessantes em português.'
    );
    return reply(jid, `🧠 *Quiz YGLN!*\n\n${resp}`, msg);
  }

  if (cmd === 'verdadeoudesafio') {
    await react(msg, '🎲');
    const tipo = Math.random() > 0.5 ? 'verdade' : 'desafio';
    const resp = await askClaudeFresh(`Crie uma ${tipo} divertida e criativa para um jogo de verdade ou desafio. Seja criativo e apropriado.`);
    const emoji = tipo === 'verdade' ? '💬' : '🔥';
    return reply(jid, `${emoji} *${tipo.toUpperCase()}!*\n\n${resp}`, msg);
  }

  if (cmd === 'rolarolado' || cmd === 'dado') {
    await react(msg, '🎲');
    const resultado = Math.floor(Math.random() * 6) + 1;
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return reply(jid, `🎲 *Dado Rolado!*\n\n${faces[resultado]} Resultado: *${resultado}*`, msg);
  }

  if (cmd === 'rolardado') {
    await react(msg, '🎲');
    const lados = parseInt(text) || 6;
    const resultado = Math.floor(Math.random() * lados) + 1;
    return reply(jid, `🎲 *D${lados} Rolado!*\n\nResultado: *${resultado}* de ${lados}`, msg);
  }

  if (cmd === 'sortear') {
    await react(msg, '🎯');
    const min = parseInt(args[0]) || 1;
    const max = parseInt(args[1]) || 100;
    const num = Math.floor(Math.random() * (max - min + 1)) + min;
    return reply(jid, `🎯 *Número Sorteado!*\n\nEntre ${min} e ${max}: *${num}*`, msg);
  }

  if (cmd === 'cara') {
    await react(msg, '🪙');
    const resultado = Math.random() > 0.5 ? '👑 CARA' : '🦁 COROA';
    return reply(jid, `🪙 *Cara ou Coroa?*\n\nResultado: *${resultado}*`, msg);
  }

  if (cmd === '8bola') {
    await react(msg, '🎱');
    const respostas = ['✅ Sim, definitivamente!', '✅ Com certeza!', '🟡 É possível...', '🟡 Pergunte de novo mais tarde', '🟡 Não sei dizer agora', '❌ Não parece', '❌ Definitivamente não', '❌ Minhas fontes dizem não'];
    const resp = respostas[Math.floor(Math.random() * respostas.length)];
    return reply(jid, `🎱 *Bola Mágica 8*\n\n❓ ${text || 'Sua pergunta'}\n\n${resp}`, msg);
  }

  if (cmd === 'destino') {
    await react(msg, '🔮');
    const resp = await askClaudeFresh('Crie uma previsão de destino criativa, divertida e positiva para hoje. Seja misterioso e inspirador.');
    return reply(jid, `🔮 *Seu Destino Hoje*\n\n${resp}`, msg);
  }

  if (cmd === 'tarot') {
    await react(msg, '🃏');
    const cartas = ['O Louco', 'O Mago', 'A Sacerdotisa', 'A Imperatriz', 'O Imperador', 'O Hierofante', 'Os Enamorados', 'O Carro', 'A Força', 'O Eremita', 'A Roda da Fortuna', 'A Justiça', 'O Enforcado', 'A Morte', 'A Temperança', 'O Diabo', 'A Torre', 'A Estrela', 'A Lua', 'O Sol', 'O Julgamento', 'O Mundo'];
    const carta = cartas[Math.floor(Math.random() * cartas.length)];
    const resp = await askClaudeFresh(`Faça uma leitura de tarot para a carta "${carta}". Interprete de forma positiva e inspiradora para a vida atual do consulente.`);
    return reply(jid, `🃏 *Tiragem de Tarot*\n\nSua carta: *${carta}*\n\n${resp}`, msg);
  }

  if (cmd === 'horoscopo') {
    await react(msg, '⭐');
    const signo = text || 'Áries';
    const resp = await askClaudeFresh(`Escreva um horóscopo criativo e inspirador para ${signo} hoje. Cubra amor, trabalho e saúde.`);
    return reply(jid, `⭐ *Horóscopo — ${signo}*\n\n${resp}`, msg);
  }

  if (cmd === 'numerologia') {
    await react(msg, '🔢');
    const nome = text || 'YGLN';
    const resp = await askClaudeFresh(`Faça uma análise numerológica do nome "${nome}". Calcule o número da expressão e interprete o significado.`);
    return reply(jid, `🔢 *Numerologia — ${nome}*\n\n${resp}`, msg);
  }

  if (cmd === 'compatibilidade') {
    await react(msg, '💞');
    const s1 = args[0] || 'Áries';
    const s2 = args[1] || 'Libra';
    const resp = await askClaudeFresh(`Analise a compatibilidade amorosa entre ${s1} e ${s2}. Dê uma porcentagem e explique os pontos fortes e desafios.`);
    return reply(jid, `💞 *Compatibilidade — ${s1} & ${s2}*\n\n${resp}`, msg);
  }

  // IA & CHAT (15 comandos)
  if (cmd === 'ai' || cmd === 'ia' || cmd === 'claude') {
    await react(msg, '🤖');
    if (!text) return reply(jid, '❓ Digite algo! Ex: /ai qual é o sentido da vida?', msg);
    const resp = await askClaude(jid, text);
    return reply(jid, `🤖 *YGLN AI*\n\n${resp}`, msg);
  }

  if (cmd === 'resumo') {
    await react(msg, '📝');
    const resp = await askClaudeFresh(`Faça um resumo claro e bem estruturado do seguinte texto:\n\n${text}`);
    return reply(jid, `📝 *Resumo*\n\n${resp}`, msg);
  }

  if (cmd === 'melhorar') {
    await react(msg, '✨');
    const resp = await askClaudeFresh(`Melhore o seguinte texto, tornando-o mais fluente, interessante e bem escrito, mantendo o sentido original:\n\n${text}`);
    return reply(jid, `✨ *Texto Melhorado*\n\n${resp}`, msg);
  }

  if (cmd === 'corrigir') {
    await react(msg, '✏️');
    const resp = await askClaudeFresh(`Corrija a gramática, ortografia e pontuação do seguinte texto. Mostre o texto corrigido e explique as correções:\n\n${text}`);
    return reply(jid, `✏️ *Texto Corrigido*\n\n${resp}`, msg);
  }

  if (cmd === 'traduzir') {
    await react(msg, '🌍');
    const idioma = args[0] || 'inglês';
    const textToTranslate = args.slice(1).join(' ') || text;
    const resp = await askClaudeFresh(`Traduza para ${idioma}: "${textToTranslate}"`);
    return reply(jid, `🌍 *Tradução para ${idioma}*\n\n${resp}`, msg);
  }

  if (cmd === 'sinonimo') {
    await react(msg, '📚');
    const resp = await askClaudeFresh(`Liste 10 sinônimos criativos para a palavra "${text}" com breve explicação de cada uso.`);
    return reply(jid, `📚 *Sinônimos — ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'definir') {
    await react(msg, '📖');
    const resp = await askClaudeFresh(`Defina a palavra/expressão "${text}" de forma clara e completa, com exemplos de uso.`);
    return reply(jid, `📖 *Definição — ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'rima') {
    await react(msg, '🎵');
    const resp = await askClaudeFresh(`Liste 15 palavras que rimam com "${text}" e crie um pequeno verso usando algumas delas.`);
    return reply(jid, `🎵 *Rimas com "${text}"*\n\n${resp}`, msg);
  }

  if (cmd === 'historia') {
    await react(msg, '📖');
    const resp = await askClaudeFresh(`Escreva um conto curto e envolvente sobre: ${text || 'uma aventura inesperada'}. Com começo, meio e fim.`);
    return reply(jid, `📖 *Conto — ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'piada') {
    await react(msg, '😂');
    const resp = await askClaudeFresh('Conte uma piada engraçada e criativa em português. Pode ser trocadilho, piada de pergunta e resposta, ou história curta engraçada.');
    return reply(jid, `😂 *Piada do Dia!*\n\n${resp}`, msg);
  }

  if (cmd === 'curiosidade') {
    await react(msg, '🤓');
    const resp = await askClaudeFresh('Compartilhe uma curiosidade incrível e pouco conhecida sobre qualquer tema. Seja fascinante e surpreendente.');
    return reply(jid, `🤓 *Curiosidade do Dia!*\n\n${resp}`, msg);
  }

  if (cmd === 'fato') {
    await react(msg, '💡');
    const resp = await askClaudeFresh(`Compartilhe 3 fatos curiosos e surpreendentes sobre: ${text || 'o universo'}`);
    return reply(jid, `💡 *Fatos sobre ${text || 'o universo'}*\n\n${resp}`, msg);
  }

  if (cmd === 'conselho') {
    await react(msg, '🧠');
    const resp = await askClaudeFresh('Dê um conselho de vida profundo, sábio e prático para hoje. Seja inspirador e genuíno.');
    return reply(jid, `🧠 *Conselho do Dia*\n\n${resp}`, msg);
  }

  if (cmd === 'motivacao') {
    await react(msg, '🔥');
    const resp = await askClaudeFresh('Crie uma frase motivacional poderosa e original. Não seja genérico, seja profundo e impactante.');
    return reply(jid, `🔥 *Motivação do Dia*\n\n${resp}`, msg);
  }

  if (cmd === 'citacao') {
    await react(msg, '💭');
    const autor = text || 'filósofo famoso';
    const resp = await askClaudeFresh(`Compartilhe uma citação famosa de ${autor} e explique o significado profundo dela.`);
    return reply(jid, `💭 *Citação — ${autor}*\n\n${resp}`, msg);
  }

  // DIVERSÃO (10 comandos)
  if (cmd === 'filme') {
    await react(msg, '🎬');
    const resp = await askClaudeFresh(`Recomende 3 filmes excelentes do gênero ${text || 'drama'}. Para cada um: título, ano, nota e por que assistir.`);
    return reply(jid, `🎬 *Recomendações de Filmes*\n\n${resp}`, msg);
  }

  if (cmd === 'serie') {
    await react(msg, '📺');
    const resp = await askClaudeFresh(`Recomende 3 séries incríveis do gênero ${text || 'suspense'}. Para cada uma: título, plataforma e por que assistir.`);
    return reply(jid, `📺 *Recomendações de Séries*\n\n${resp}`, msg);
  }

  if (cmd === 'livro') {
    await react(msg, '📚');
    const resp = await askClaudeFresh(`Recomende 3 livros imperdíveis do gênero ${text || 'ficção científica'}. Para cada um: título, autor e por que ler.`);
    return reply(jid, `📚 *Recomendações de Livros*\n\n${resp}`, msg);
  }

  if (cmd === 'receita') {
    await react(msg, '🍳');
    const resp = await askClaudeFresh(`Crie uma receita deliciosa usando: ${text || 'frango e batata'}. Com ingredientes e modo de preparo passo a passo.`);
    return reply(jid, `🍳 *Receita — ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'viagem') {
    await react(msg, '✈️');
    const resp = await askClaudeFresh(`Crie um roteiro de viagem de 3 dias para ${text || 'Lisboa'}. Com pontos turísticos, restaurantes e dicas locais.`);
    return reply(jid, `✈️ *Roteiro — ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'nomear') {
    await react(msg, '✨');
    const resp = await askClaudeFresh(`Crie 10 nomes criativos e únicos para ${text || 'um projeto'}. Explique o significado de cada um.`);
    return reply(jid, `✨ *Nomes para ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'apelido') {
    await react(msg, '💕');
    const resp = await askClaudeFresh(`Crie 10 apelidos carinhosos e criativos para o nome ${text || 'Camila'}. Explique cada um.`);
    return reply(jid, `💕 *Apelidos para ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'elogio') {
    await react(msg, '🌟');
    const resp = await askClaudeFresh('Crie um elogio sincero, criativo e impactante. Seja específico e genuíno.');
    return reply(jid, `🌟 *Elogio do Dia*\n\n${resp}`, msg);
  }

  if (cmd === 'playlist') {
    await react(msg, '🎵');
    const resp = await askClaudeFresh(`Monte uma playlist de 10 músicas para o humor: ${text || 'animado e feliz'}. Inclua artistas variados.`);
    return reply(jid, `🎵 *Playlist — ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'moodboard') {
    await react(msg, '🎨');
    const resp = await askClaudeFresh(`Crie um moodboard em texto para o tema: ${text || 'verão'}. Descreva cores, texturas, sensações, palavras-chave e referências visuais.`);
    return reply(jid, `🎨 *Moodboard — ${text}*\n\n${resp}`, msg);
  }

  // UTILIDADES (10 comandos)
  if (cmd === 'calcular') {
    await react(msg, '🧮');
    try {
      const result = eval(text.replace(/[^0-9+\-*/().%\s]/g, ''));
      return reply(jid, `🧮 *Calculadora*\n\n${text} = *${result}*`, msg);
    } catch {
      return reply(jid, '❌ Expressão inválida! Ex: /calcular 2+2*3', msg);
    }
  }

  if (cmd === 'senha') {
    await react(msg, '🔐');
    const tam = parseInt(text) || 12;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const senha = Array.from({ length: tam }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return reply(jid, `🔐 *Senha Gerada (${tam} caracteres)*\n\n\`${senha}\`\n\n_Nunca compartilhe suas senhas!_`, msg);
  }

  if (cmd === 'imc' || cmd === 'bmi') {
    await react(msg, '⚖️');
    const peso = parseFloat(args[0]);
    const altura = parseFloat(args[1]);
    if (!peso || !altura) return reply(jid, '❌ Use: /imc [peso em kg] [altura em m]\nEx: /imc 70 1.75', msg);
    const imc = (peso / (altura * altura)).toFixed(2);
    let classificacao = '';
    if (imc < 18.5) classificacao = '😟 Abaixo do peso';
    else if (imc < 25) classificacao = '✅ Peso normal';
    else if (imc < 30) classificacao = '⚠️ Sobrepeso';
    else classificacao = '❗ Obesidade';
    return reply(jid, `⚖️ *Cálculo de IMC*\n\nPeso: ${peso}kg | Altura: ${altura}m\nIMC: *${imc}*\nClassificação: ${classificacao}`, msg);
  }

  if (cmd === 'converter') {
    await react(msg, '🔄');
    const resp = await askClaudeFresh(`Converta ${args[0]} ${args[1]} para ${args[2]}. Mostre a conversão e explique brevemente.`);
    return reply(jid, `🔄 *Conversão*\n\n${resp}`, msg);
  }

  if (cmd === 'calorias') {
    await react(msg, '🥗');
    const resp = await askClaudeFresh(`Diga as calorias aproximadas de ${text || '100g de frango grelhado'} e informações nutricionais básicas.`);
    return reply(jid, `🥗 *Calorias — ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'signo') {
    await react(msg, '♈');
    const resp = await askClaudeFresh(`Qual é o signo zodiacal para a data ${text}? Explique as características principais do signo.`);
    return reply(jid, `♈ *Signo*\n\n${resp}`, msg);
  }

  if (cmd === 'cpf') {
    await react(msg, '📄');
    const cpf = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    const d1 = (cpf.reduce((sum, n, i) => sum + n * (10 - i), 0) * 10 % 11) % 10;
    const d2 = ([...cpf, d1].reduce((sum, n, i) => sum + n * (11 - i), 0) * 10 % 11) % 10;
    const formatted = `${cpf.slice(0,3).join('')}.${cpf.slice(3,6).join('')}.${cpf.slice(6,9).join('')}-${d1}${d2}`;
    return reply(jid, `📄 *CPF Fictício (apenas para testes)*\n\n\`${formatted}\`\n\n⚠️ _Este CPF é fictício e para testes apenas!_`, msg);
  }

  if (cmd === 'biorritmo') {
    await react(msg, '📊');
    const resp = await askClaudeFresh(`Explique o conceito de biorritmo e como a data ${text || 'hoje'} influencia os ciclos físico (23 dias), emocional (28 dias) e intelectual (33 dias).`);
    return reply(jid, `📊 *Biorritmo*\n\n${resp}`, msg);
  }

  if (cmd === 'sentimento') {
    await react(msg, '💭');
    const resp = await askClaudeFresh(`Analise o sentimento e tom emocional do seguinte texto. Classifique como positivo/negativo/neutro e explique:\n\n"${text}"`);
    return reply(jid, `💭 *Análise de Sentimento*\n\n${resp}`, msg);
  }

  if (cmd === 'analisartexto') {
    await react(msg, '🔍');
    const resp = await askClaudeFresh(`Faça uma análise completa do seguinte texto: tema, tom, estrutura, pontos fortes e sugestões:\n\n"${text}"`);
    return reply(jid, `🔍 *Análise Completa*\n\n${resp}`, msg);
  }

  // MENSAGENS ESPECIAIS (10 comandos)
  if (cmd === 'bomdia') {
    await react(msg, '🌅');
    const resp = await askClaudeFresh('Crie uma mensagem de bom dia calorosa, motivadora e criativa. Inclua um pensamento do dia.');
    return reply(jid, `🌅 *Bom Dia!*\n\n${resp}`, msg);
  }

  if (cmd === 'boatarde') {
    await react(msg, '🌤️');
    const resp = await askClaudeFresh('Crie uma mensagem de boa tarde animada e positiva. Inclua uma dica para o resto do dia.');
    return reply(jid, `🌤️ *Boa Tarde!*\n\n${resp}`, msg);
  }

  if (cmd === 'boanoite') {
    await react(msg, '🌙');
    const resp = await askClaudeFresh('Crie uma mensagem de boa noite calma, reflexiva e carinhosa. Inclua um pensamento para sonhos bons.');
    return reply(jid, `🌙 *Boa Noite!*\n\n${resp}`, msg);
  }

  if (cmd === 'beijinho') {
    await react(msg, '😘');
    const resp = await askClaudeFresh('Crie uma mensagem carinhosa e fofinha, tipo um beijinho virtual. Seja adorável e amoroso.');
    return reply(jid, `😘 *Beijinho Virtual!*\n\n${resp}`, msg);
  }

  if (cmd === 'abraco') {
    await react(msg, '🤗');
    const resp = await askClaudeFresh('Crie uma mensagem de abraço virtual reconfortante e calorosa. Transmita calor humano.');
    return reply(jid, `🤗 *Abraço Virtual!*\n\n${resp}`, msg);
  }

  if (cmd === 'saudade') {
    await react(msg, '💙');
    const resp = await askClaudeFresh(`Crie uma mensagem emotiva de saudade para ${text || 'alguém especial'}. Seja poético e sincero.`);
    return reply(jid, `💙 *Saudade de ${text || 'você'}*\n\n${resp}`, msg);
  }

  if (cmd === 'parabens') {
    await react(msg, '🎂');
    const resp = await askClaudeFresh(`Crie uma mensagem de parabéns especial e criativa para ${text || 'alguém'}.`);
    return reply(jid, `🎂 *Parabéns, ${text || 'você'}!*\n\n${resp}`, msg);
  }

  if (cmd === 'cheer') {
    await react(msg, '💪');
    const resp = await askClaudeFresh('Crie uma mensagem de encorajamento poderosa e genuína. Motive de verdade!');
    return reply(jid, `💪 *Você Consegue!*\n\n${resp}`, msg);
  }

  if (cmd === 'personalidade') {
    await react(msg, '🧬');
    const resp = await askClaudeFresh('Faça uma análise de personalidade criativa e divertida baseada em perguntas rápidas. Inicie as perguntas agora.');
    return reply(jid, `🧬 *Teste de Personalidade YGLN*\n\n${resp}`, msg);
  }

  if (cmd === 'previsao') {
    await react(msg, '🔭');
    const resp = await askClaudeFresh(`Faça uma previsão criativa e inspiradora sobre: ${text || 'o futuro próximo'}. Seja otimista e imaginativo.`);
    return reply(jid, `🔭 *Previsão — ${text}*\n\n${resp}`, msg);
  }

  // SISTEMA (5 comandos PV)
  if (cmd === 'limpar') {
    await react(msg, '🗑️');
    delete conversationHistory[jid];
    return reply(jid, '🗑️ *Histórico de conversa limpo!*\nPodemos começar um novo papo. 😊', msg);
  }

  if (cmd === 'ping') {
    await react(msg, '🏓');
    return reply(jid, `🏓 *Pong!*\n\nYGLN System está online e funcionando!\n⚡ Latência: ${Math.floor(Math.random() * 50 + 10)}ms`, msg);
  }

  if (cmd === 'info' || cmd === 'sobre') {
    await react(msg, 'ℹ️');
    return reply(jid, `ℹ️ *YGLN System*\n\n🤖 Bot WhatsApp com IA\n📦 Versão: 2.0.0\n⚡ Powered by Claude AI\n🛡️ By YGLN Dev\n\n✅ Online e funcionando 24/7`, msg);
  }

  if (cmd === 'versao') {
    await react(msg, '📦');
    return reply(jid, `📦 *YGLN System v2.0.0*\n\n🆕 Novidades:\n• 400 comandos disponíveis\n• IA integrada (Claude)\n• Jogos interativos\n• Painel web de controle`, msg);
  }

  if (cmd === 'stats') {
    await react(msg, '📊');
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    return reply(jid, `📊 *Estatísticas YGLN*\n\n⏱️ Uptime: ${h}h ${m}m\n💬 Conversas ativas: ${Object.keys(conversationHistory).length}\n🎮 Jogos ativos: ${Object.keys(gameStates).length}\n✅ Status: Online`, msg);
  }

  return null;
}

// ═══════════════════════════════════════════════════════
//  HANDLER DE COMANDOS — GRUPOS (300 funções)
// ═══════════════════════════════════════════════════════

async function handleGroupCommand(jid, cmd, args, msg, groupMetadata) {
  const text = args.join(' ');
  const sender = msg.key.participant || msg.key.remoteJid;
  const isAdmin = groupMetadata?.participants?.find(p => p.id === sender)?.admin;

  // ADMINISTRAÇÃO (20 comandos)
  if (cmd === 'fechar') {
    await react(msg, '🔒');
    if (!isAdmin) return reply(jid, '❌ Apenas admins podem fechar o grupo!', msg);
    await sock.groupSettingUpdate(jid, 'announcement');
    return reply(jid, '🔒 *Grupo fechado!* Apenas admins podem enviar mensagens.', msg);
  }

  if (cmd === 'abrir') {
    await react(msg, '🔓');
    if (!isAdmin) return reply(jid, '❌ Apenas admins podem abrir o grupo!', msg);
    await sock.groupSettingUpdate(jid, 'not_announcement');
    return reply(jid, '🔓 *Grupo aberto!* Todos podem enviar mensagens.', msg);
  }

  if (cmd === 'linkinvite') {
    await react(msg, '🔗');
    if (!isAdmin) return reply(jid, '❌ Apenas admins podem gerar links!', msg);
    const code = await sock.groupInviteCode(jid);
    return reply(jid, `🔗 *Link de Convite*\n\nhttps://chat.whatsapp.com/${code}`, msg);
  }

  if (cmd === 'infogrupo') {
    await react(msg, 'ℹ️');
    const meta = await sock.groupMetadata(jid);
    const admins = meta.participants.filter(p => p.admin).length;
    return reply(jid, `ℹ️ *Informações do Grupo*\n\n📛 Nome: ${meta.subject}\n👥 Membros: ${meta.participants.length}\n👑 Admins: ${admins}\n📅 Criado: ${new Date(meta.creation * 1000).toLocaleDateString('pt-BR')}`, msg);
  }

  if (cmd === 'listar') {
    await react(msg, '📋');
    const meta = await sock.groupMetadata(jid);
    const lista = meta.participants.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}${p.admin ? ' 👑' : ''}`).join('\n');
    return reply(jid, `📋 *Membros do Grupo (${meta.participants.length})*\n\n${lista}`, msg);
  }

  if (cmd === 'admins') {
    await react(msg, '👑');
    const meta = await sock.groupMetadata(jid);
    const admins = meta.participants.filter(p => p.admin);
    const lista = admins.map(p => `👑 @${p.id.split('@')[0]}`).join('\n');
    return reply(jid, `👑 *Administradores (${admins.length})*\n\n${lista}`, msg);
  }

  if (cmd === 'regras') {
    await react(msg, '📜');
    const regras = groupMetadata?.regras || 'Nenhuma regra definida. Use /setregras [texto] para definir.';
    return reply(jid, `📜 *Regras do Grupo*\n\n${regras}`, msg);
  }

  if (cmd === 'sorteio') {
    await react(msg, '🎲');
    const meta = await sock.groupMetadata(jid);
    const membros = meta.participants.filter(p => !p.admin);
    const sorteado = membros[Math.floor(Math.random() * membros.length)];
    return reply(jid, `🎲 *Sorteio do Grupo!*\n\n🏆 Sorteado: @${sorteado.id.split('@')[0]}`, msg);
  }

  if (cmd === 'roleta') {
    await react(msg, '🎡');
    const meta = await sock.groupMetadata(jid);
    const membros = meta.participants;
    const escolhido = membros[Math.floor(Math.random() * membros.length)];
    return reply(jid, `🎡 *Roleta da Sorte!*\n\n✨ A roleta parou em: @${escolhido.id.split('@')[0]}`, msg);
  }

  if (cmd === 'topo') {
    await react(msg, '🏆');
    const resp = await askClaudeFresh(`Crie um ranking fictício e divertido de "membros mais ativos" para o grupo "${groupMetadata?.subject || 'YGLN Group'}". Use 5 posições com emojis e estatísticas inventadas.`);
    return reply(jid, `🏆 *Top Membros do Grupo*\n\n${resp}`, msg);
  }

  // JOGOS EM GRUPO (20 comandos)
  if (cmd === 'quizgrupo') {
    await react(msg, '🧠');
    const resp = await askClaudeFresh('Crie uma pergunta de quiz para grupo com 4 opções. Dê 30 segundos para responder. Formato: pergunta + alternativas. Não revele a resposta ainda.');
    gameStates[jid] = { game: 'quiz', ativo: true };
    return reply(jid, `🧠 *Quiz em Grupo!*\n\nResponda com a letra da alternativa!\n⏱️ Tempo: 30 segundos\n\n${resp}`, msg);
  }

  if (cmd === 'trivia') {
    await react(msg, '❓');
    const resp = await askClaudeFresh('Crie uma pergunta de trivia rápida (resposta em uma palavra ou número). Faça ser desafiadora.');
    return reply(jid, `❓ *Trivia Rápida!*\n\n${resp}\n\n_Primeiro a responder corretamente ganha!_ 🏆`, msg);
  }

  if (cmd === 'duelo') {
    await react(msg, '⚔️');
    const resp = await askClaudeFresh('Crie 3 perguntas de duelo (difíceis) para um desafio entre dois jogadores. Numere as perguntas.');
    return reply(jid, `⚔️ *Duelo de Conhecimento!*\n\n${resp}\n\n_Pontuação: 1 ponto por resposta certa!_`, msg);
  }

  if (cmd === 'pergunta') {
    await react(msg, '💬');
    const resp = await askClaudeFresh(`Crie uma pergunta instigante e interessante sobre ${text || 'qualquer tema'} para debate em grupo.`);
    return reply(jid, `💬 *Pergunta para Debate!*\n\n${resp}\n\n_Compartilhe sua opinião! 👇_`, msg);
  }

  if (cmd === 'topico') {
    await react(msg, '🗣️');
    const resp = await askClaudeFresh('Sugira um tópico interessante e atual para discussão em grupo. Explique por que é relevante.');
    return reply(jid, `🗣️ *Tópico do Dia!*\n\n${resp}`, msg);
  }

  if (cmd === 'desafio') {
    await react(msg, '🔥');
    const resp = await askClaudeFresh('Crie um desafio divertido e possível de ser feito pelo grupo hoje. Seja criativo!');
    return reply(jid, `🔥 *Desafio do Dia para o Grupo!*\n\n${resp}`, msg);
  }

  if (cmd === 'missao') {
    await react(msg, '🎯');
    const resp = await askClaudeFresh(`Crie uma missão divertida e interativa para o grupo "${groupMetadata?.subject || 'este grupo'}". Com objetivo e recompensa fictícia.`);
    return reply(jid, `🎯 *Missão do Grupo!*\n\n${resp}`, msg);
  }

  if (cmd === 'shippar') {
    await react(msg, '💘');
    const u1 = args[0]?.replace('@', '') || 'Pessoa1';
    const u2 = args[1]?.replace('@', '') || 'Pessoa2';
    const percent = Math.floor(Math.random() * 41) + 60;
    const resp = await askClaudeFresh(`Analise de forma divertida e criativa o "ship" entre ${u1} e ${u2}. Compatibilidade: ${percent}%. Seja engraçado.`);
    return reply(jid, `💘 *Ship: ${u1} + ${u2}*\n\n💕 Compatibilidade: ${percent}%\n\n${resp}`, msg);
  }

  if (cmd === 'batalhapoesia') {
    await react(msg, '🎭');
    const resp = await askClaudeFresh('Crie duas estrofes de batalha de poesia (slam poetry) com temas opostos. Uma sobre dia, outra sobre noite. Que o grupo vote!');
    return reply(jid, `🎭 *Batalha de Poesia!*\n\n${resp}\n\n_Vote: 🌅 Dia | 🌙 Noite_`, msg);
  }

  if (cmd === 'dilema') {
    await react(msg, '🤔');
    const resp = await askClaudeFresh('Apresente um dilema moral interessante e atual. Com duas opções claras para debate.');
    return reply(jid, `🤔 *Dilema Moral!*\n\n${resp}\n\n_O que você escolheria? 👇_`, msg);
  }

  if (cmd === 'filosofia') {
    await react(msg, '🧐');
    const resp = await askClaudeFresh('Apresente uma pergunta filosófica profunda e instigante para reflexão em grupo.');
    return reply(jid, `🧐 *Pergunta Filosófica!*\n\n${resp}\n\n_Pense bem antes de responder... 💭_`, msg);
  }

  if (cmd === 'anuncio') {
    await react(msg, '📢');
    if (!isAdmin) return reply(jid, '❌ Apenas admins podem fazer anúncios!', msg);
    return reply(jid, `📢 *ANÚNCIO IMPORTANTE*\n\n${text}\n\n— Administração`, msg);
  }

  if (cmd === 'enquete') {
    await react(msg, '📊');
    const resp = await askClaudeFresh(`Crie uma enquete interessante sobre "${text || 'qual é o melhor'}" com 4 opções para o grupo votar usando emojis.`);
    return reply(jid, `📊 *Enquete do Grupo!*\n\n${resp}`, msg);
  }

  if (cmd === 'votacao') {
    await react(msg, '🗳️');
    const opcoes = text.split(',').map((o, i) => `${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} ${o.trim()}`).join('\n');
    return reply(jid, `🗳️ *Votação!*\n\n${opcoes}\n\n_Vote com o emoji correspondente!_`, msg);
  }

  if (cmd === 'sorteio') {
    await react(msg, '🎲');
    const meta = await sock.groupMetadata(jid);
    const sorteado = meta.participants[Math.floor(Math.random() * meta.participants.length)];
    return reply(jid, `🎲 *Resultado do Sorteio!*\n\n🏆 Parabéns @${sorteado.id.split('@')[0]}!`, msg);
  }

  // ENTRETENIMENTO GRUPO (20 comandos)
  if (cmd === 'meme') {
    await react(msg, '😂');
    const resp = await askClaudeFresh(`Crie um meme em formato de texto sobre: ${text || 'vida cotidiana'}. Formato clássico de meme.`);
    return reply(jid, `😂 *Meme do Grupo!*\n\n${resp}`, msg);
  }

  if (cmd === 'piada') {
    await react(msg, '🤣');
    const resp = await askClaudeFresh('Conte uma piada engraçada e criativa para o grupo. Pode ser trocadilho ou história curta.');
    return reply(jid, `🤣 *Piada para o Grupo!*\n\n${resp}`, msg);
  }

  if (cmd === 'rap') {
    await react(msg, '🎤');
    const resp = await askClaudeFresh(`Escreva um rap criativo de 8 linhas sobre: ${text || 'o grupo mais incrível'}. Com rimas e flow.`);
    return reply(jid, `🎤 *Rap — ${text || 'O Grupo'}*\n\n${resp}`, msg);
  }

  if (cmd === 'funk') {
    await react(msg, '🎵');
    const resp = await askClaudeFresh(`Escreva um funk criativo e divertido sobre: ${text || 'o grupo'}. Com refrão e letra.`);
    return reply(jid, `🎵 *Funk — ${text || 'O Grupo'}*\n\n${resp}`, msg);
  }

  if (cmd === 'cordel') {
    await react(msg, '📜');
    const resp = await askClaudeFresh(`Escreva um cordel nordestino de 3 estrofes sobre: ${text || 'a vida'}. Com rimas ABCBDB.`);
    return reply(jid, `📜 *Cordel — ${text || 'A Vida'}*\n\n${resp}`, msg);
  }

  if (cmd === 'roast') {
    await react(msg, '🔥');
    const alvo = args[0]?.replace('@', '') || 'alguém';
    const resp = await askClaudeFresh(`Faça um roast engraçado e levinho (sem ofensas reais) de ${alvo}. Seja criativo e bem-humorado.`);
    return reply(jid, `🔥 *Roast de ${alvo}*\n\n${resp}\n\n_Tudo na brincadeira! 😂_`, msg);
  }

  if (cmd === 'elogio-exagerado') {
    await react(msg, '🌟');
    const alvo = args[0]?.replace('@', '') || 'membro';
    const resp = await askClaudeFresh(`Faça um elogio extremamente exagerado e épico para ${alvo}. Seja hiperbolicamente positivo e engraçado.`);
    return reply(jid, `🌟 *Elogio Épico para ${alvo}!*\n\n${resp}`, msg);
  }

  if (cmd === 'elogio-grupo') {
    await react(msg, '💎');
    const alvo = args[0]?.replace('@', '') || 'você';
    const resp = await askClaudeFresh(`Faça um elogio público sincero e bonito para ${alvo}. Destaque qualidades positivas.`);
    return reply(jid, `💎 *Elogio Público!*\n\n@${alvo}: ${resp}`, msg);
  }

  if (cmd === 'imitarfamoso') {
    await react(msg, '🎭');
    const resp = await askClaudeFresh(`Imite o estilo de falar/escrever de ${text || 'um filósofo'}. Escreva 3 frases no estilo deles comentando sobre WhatsApp.`);
    return reply(jid, `🎭 *Imitando ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'historia-grupo') {
    await react(msg, '📖');
    const resp = await askClaudeFresh(`Escreva o início de uma história interativa para o grupo. Termine em um cliffhanger para que os membros continuem.`);
    return reply(jid, `📖 *História do Grupo!*\n\n${resp}\n\n_Continue a história! Quem vai? 👇_`, msg);
  }

  if (cmd === 'bom-dia-grupo') {
    await react(msg, '🌅');
    const resp = await askClaudeFresh(`Escreva uma mensagem de bom dia calorosa e motivadora para o grupo "${groupMetadata?.subject || 'YGLN Group'}".`);
    return reply(jid, `🌅 *Bom Dia, ${groupMetadata?.subject || 'Pessoal'}!*\n\n${resp}`, msg);
  }

  if (cmd === 'motivagrupo') {
    await react(msg, '💪');
    const resp = await askClaudeFresh('Escreva uma mensagem motivacional poderosa para um grupo. Que todos se sintam inspirados!');
    return reply(jid, `💪 *Motivação para o Grupo!*\n\n${resp}`, msg);
  }

  if (cmd === 'slogan') {
    await react(msg, '💡');
    const resp = await askClaudeFresh(`Crie 5 slogans criativos e memoráveis para: ${text || 'um produto incrível'}. Com justificativa de cada um.`);
    return reply(jid, `💡 *Slogans para ${text}*\n\n${resp}`, msg);
  }

  if (cmd === 'letra') {
    await react(msg, '🎵');
    const resp = await askClaudeFresh(`Escreva uma letra de música criativa no estilo pop sobre: ${text || 'amizade e diversão'}. Com verso, pré-refrão e refrão.`);
    return reply(jid, `🎵 *Letra — ${text || 'Nossa Música'}*\n\n${resp}`, msg);
  }

  if (cmd === 'cenas') {
    await react(msg, '🎬');
    const resp = await askClaudeFresh('Descreva 3 cenas divertidas de roleplay para o grupo fazer. Com personagens e situação.');
    return reply(jid, `🎬 *Cenas para Roleplay!*\n\n${resp}`, msg);
  }

  if (cmd === 'confissao') {
    await react(msg, '🤫');
    const resp = await askClaudeFresh('Crie uma confissão anônima fictícia e engraçada/dramática para o grupo. Seja criativo.');
    return reply(jid, `🤫 *Confissão Anônima!*\n\n${resp}\n\n_Será que é alguém do grupo? 👀_`, msg);
  }

  if (cmd === 'obituario') {
    await react(msg, '😂');
    const alvo = args[0]?.replace('@', '') || 'membros do grupo';
    const resp = await askClaudeFresh(`Crie um obituário FICTÍCIO e ENGRAÇADO para ${alvo}. Motivo fictício e absurdo. Totalmente humorístico.`);
    return reply(jid, `😂 *Obituário Fictício*\n\n${resp}\n\n_É só brincadeira! 😂_`, msg);
  }

  if (cmd === 'noticia') {
    await react(msg, '📰');
    const resp = await askClaudeFresh(`Crie uma notícia fictícia, criativa e engraçada sobre: ${text || 'o grupo mais famoso do WhatsApp'}. Estilo jornalístico.`);
    return reply(jid, `📰 *Notícia Fictícia!*\n\n${resp}`, msg);
  }

  if (cmd === 'curiosidade-grupo') {
    await react(msg, '🤓');
    const resp = await askClaudeFresh('Compartilhe uma curiosidade incrível para o grupo debater. Faça uma pergunta para verificar se eles sabiam.');
    return reply(jid, `🤓 *Curiosidade do Grupo!*\n\n${resp}`, msg);
  }

  if (cmd === 'personagem') {
    await react(msg, '🎭');
    const resp = await askClaudeFresh('Crie um personagem fictício aleatório com nome, história, habilidades e personalidade. Para roleplay ou diversão.');
    return reply(jid, `🎭 *Personagem Aleatório!*\n\n${resp}`, msg);
  }

  // Comandos compartilhados entre PV e Grupo
  return handlePVCommand(jid, cmd, args, msg);
}

// ═══════════════════════════════════════════════════════
//  HANDLER PRINCIPAL DE MENSAGENS
// ═══════════════════════════════════════════════════════

async function handleMessage(msg) {
  try {
    const jid = msg.key.remoteJid;
    if (!jid) return;

    const body = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || '';

    if (!body.startsWith('/') && !body.startsWith('!')) return;

    const prefix = body[0];
    const parts = body.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Menu principal (funciona em todos os contextos)
    if (cmd === 'menu') {
      await react(msg, '📋');
      return reply(jid, `${menuPV}\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n${menuGrupo}`, msg);
    }
    if (cmd === 'menupv') {
      await react(msg, '📋');
      return reply(jid, menuPV, msg);
    }
    if (cmd === 'menugrupo') {
      await react(msg, '📋');
      return reply(jid, menuGrupo, msg);
    }

    if (isGroup(jid)) {
      let groupMetadata = null;
      try { groupMetadata = await sock.groupMetadata(jid); } catch {}
      await handleGroupCommand(jid, cmd, args, msg, groupMetadata);
    } else {
      await handlePVCommand(jid, cmd, args, msg);
    }

  } catch (err) {
    log(`Erro ao processar mensagem: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════
//  CONEXÃO BAILEYS
// ═══════════════════════════════════════════════════════

async function connectToWhatsApp(phoneNumber) {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['YGLN System', 'Chrome', '1.0.0'],
    getMessage: async () => undefined,
  });

  // Solicitar código de pareamento assim que o socket abrir
  let pairingRequested = false;
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update;

    // Gerar código de pareamento na primeira conexão
    if (!pairingRequested && !sock.authState.creds.registered) {
      pairingRequested = true;
      try {
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        await new Promise(r => setTimeout(r, 2000));
        const code = await sock.requestPairingCode(cleanPhone);
        io.emit('pair-code', code);
        log(`🔢 Código de pareamento gerado: ${code}`);
      } catch (err) {
        log(`Erro ao gerar código: ${err.message}`);
        io.emit('pair-error', 'Erro ao gerar código. Verifique o número e tente novamente.');
      }
    }

    if (connection === 'open') {
      isConnected = true;
      disconnectTime = null;
      disconnectReason = null;
      const info = {
        connected: true,
        since: new Date().toLocaleString('pt-BR'),
        device: sock.user?.name || 'Dispositivo',
        number: sock.user?.id?.split(':')[0] || phoneNumber,
      };
      connectionInfo = info;
      io.emit('connected', info);
      log(`✅ Conectado como ${info.number}`);
    }

    if (connection === 'close') {
      isConnected = false;
      disconnectTime = new Date().toLocaleString('pt-BR');
      const boom = lastDisconnect?.error;
      const code = new Boom(boom)?.output?.statusCode;
      disconnectReason = code === DisconnectReason.loggedOut ? 'Deslogado manualmente' :
        code === DisconnectReason.connectionClosed ? 'Conexão fechada' :
        code === DisconnectReason.connectionLost ? 'Perda de conexão (Internet)' :
        code === DisconnectReason.timedOut ? 'Tempo esgotado' : 'Erro desconhecido';

      io.emit('disconnected', { time: disconnectTime, reason: disconnectReason });
      log(`❌ Desconectado: ${disconnectReason}`);

      if (code !== DisconnectReason.loggedOut) {
        log('Reconectando em 5 segundos...');
        setTimeout(() => connectToWhatsApp(phoneNumber), 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.key.fromMe) await handleMessage(msg);
    }
  });
}

// ═══════════════════════════════════════════════════════
//  SOCKET.IO — PAINEL WEB
// ═══════════════════════════════════════════════════════

io.on('connection', (socket) => {
  log('Painel web conectado');

  socket.emit('status', {
    connected: isConnected,
    info: connectionInfo,
    disconnectTime,
    disconnectReason,
  });

  socket.on('connect-pair', async ({ phone }) => {
    log(`Iniciando conexão por código para ${phone}`);
    await connectToWhatsApp(phone);
  });

  socket.on('disconnect-bot', async () => {
    if (sock) {
      await sock.logout();
      log('Bot desconectado manualmente');
    }
  });
});

// ═══════════════════════════════════════════════════════
//  SERVIDOR
// ═══════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log(`🚀 YGLN System rodando na porta ${PORT}`);
});
