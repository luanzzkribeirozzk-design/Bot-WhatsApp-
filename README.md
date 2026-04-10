# 🤖 YGLN System — WhatsApp Bot com IA

> Bot WhatsApp poderoso com **400 comandos** integrado ao Claude AI

---

## 🚀 Instalação Rápida

### Pré-requisitos
- Node.js 18+
- Conta Anthropic (API Key)

### Passo a Passo

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variável de ambiente
# Linux/Mac:
export ANTHROPIC_API_KEY=sua_chave_aqui

# Windows:
set ANTHROPIC_API_KEY=sua_chave_aqui

# 3. Iniciar o bot
npm start
```

### Acessar o painel
Abra no navegador: `http://localhost:3000`

---

## 📋 Comandos Disponíveis (400 total)

### 💌 PV — Cartas & Poesia (15)
| Comando | Descrição |
|---------|-----------|
| `/cartaamor [nome] [m/f]` | Carta de amor personalizada |
| `/poema [tema]` | Poema criativo |
| `/declaracao [nome]` | Declaração de amor |
| `/soneto [tema]` | Soneto literário |
| `/haiku [tema]` | Haikus japoneses |
| `/acrostico [nome]` | Acróstico com nome |
| `/cartadesculpa [nome]` | Carta de desculpas |
| `/cartamae` | Carta para a mãe |
| `/cartapai` | Carta para o pai |
| `/cartaaniversario [nome]` | Carta de aniversário |
| `/cartaformatura [nome]` | Carta de formatura |
| `/cartadespedida [nome]` | Carta de despedida |
| `/cartafelicidades [nome]` | Carta de felicidades |
| `/cartaparabens [nome]` | Parabéns especial |
| `/cartaamizade [nome]` | Carta de amizade |

### 🎮 PV — Jogos (15)
`/forca` `/adivinha` `/quiz` `/verdadeoudesafio` `/dado` `/sortear` `/cara` `/8bola` `/destino` `/tarot` `/horoscopo` `/numerologia` `/compatibilidade` `/personalidade` `/rolardado`

### 🤖 PV — IA & Chat (15)
`/ai` `/resumo` `/melhorar` `/corrigir` `/traduzir` `/sinonimo` `/definir` `/rima` `/historia` `/piada` `/curiosidade` `/fato` `/conselho` `/motivacao` `/citacao`

### 🎨 PV — Diversão (10)
`/filme` `/serie` `/livro` `/receita` `/viagem` `/nomear` `/apelido` `/elogio` `/playlist` `/moodboard`

### 🔧 PV — Utilidades (10)
`/calcular` `/senha` `/imc` `/converter` `/calorias` `/signo` `/cpf` `/biorritmo` `/sentimento` `/analisartexto`

### 💬 PV — Mensagens Especiais (10)
`/bomdia` `/boatarde` `/boanoite` `/beijinho` `/abraco` `/saudade` `/parabens` `/cheer` `/previsao` `/personalidade`

### 👑 Grupos — Admin (20)
`/fechar` `/abrir` `/linkinvite` `/listar` `/admins` `/infogrupo` `/sorteio` `/roleta` `/topo` `/regras` ...e mais 10

### 🎮 Grupos — Jogos (20)
`/quizgrupo` `/trivia` `/duelo` `/batalhapoesia` `/dilema` `/filosofia` `/shippar` `/enquete` `/votacao` `/missao` ...e mais 10

### 🎭 Grupos — Entretenimento (20)
`/meme` `/rap` `/funk` `/cordel` `/roast` `/elogio-exagerado` `/imitarfamoso` `/historia-grupo` `/noticia` `/slogan` ...e mais 10

---

## ⚙️ Variáveis de Ambiente

```env
ANTHROPIC_API_KEY=sua_chave_aqui
PORT=3000
```

## 📁 Estrutura do Projeto

```
ygln-system/
├── bot/
│   └── index.js          # Bot principal (400 comandos)
├── frontend/
│   └── index.html        # Painel web
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Actions
├── auth_info/            # Criado automaticamente (sessão WhatsApp)
├── package.json
└── README.md
```

## 🔑 Obter API Key Anthropic
1. Acesse: https://console.anthropic.com
2. Crie uma conta ou faça login
3. Vá em "API Keys"
4. Clique em "Create Key"
5. Copie e use como `ANTHROPIC_API_KEY`

## 🌐 Deploy no Railway (gratuito)
1. Crie conta em https://railway.app
2. Conecte seu GitHub
3. Importe este repositório
4. Adicione a variável `ANTHROPIC_API_KEY`
5. Deploy automático!

---

**YGLN System v2.0.0** · Powered by Claude AI 🤖
