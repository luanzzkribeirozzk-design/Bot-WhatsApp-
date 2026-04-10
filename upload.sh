#!/bin/bash
# ═══════════════════════════════════════════
#  YGLN System — Script de Upload pro GitHub
# ═══════════════════════════════════════════

REPO_URL="https://github.com/luanzzkribeirozzk-design/Bot-WhatsApp-.git"
REPO_DIR="Bot-WhatsApp-"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     🤖  YGLN System — Upload         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Verificar se git está instalado
if ! command -v git &> /dev/null; then
  echo "❌ Git não encontrado. Instale o git primeiro."
  exit 1
fi

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Instale o Node.js 18+ primeiro."
  exit 1
fi

echo "📋 Configurando git..."
git config --global user.email "ygln@bot.com"
git config --global user.name "YGLN System"

echo "📥 Clonando repositório..."
git clone "$REPO_URL" "$REPO_DIR"
cd "$REPO_DIR"

echo "📁 Copiando arquivos do bot..."
cp -r ../bot ./
cp -r ../frontend ./
cp -r ../.github ./
cp ../package.json ./
cp ../README.md ./
cp ../.gitignore ./

echo "📦 Instalando dependências..."
npm install

echo "📤 Fazendo commit e push..."
git add -A
git commit -m "🤖 YGLN System v2.0 — Bot WhatsApp com Gemini AI (400 comandos)"
git push

echo ""
echo "✅ Upload concluído com sucesso!"
echo "🌐 Acesse: https://github.com/luanzzkribeirozzk-design/Bot-WhatsApp-"
echo ""
