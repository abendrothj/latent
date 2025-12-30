#!/bin/bash

echo "🚀 Setting up Latent..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Error: Node.js 20+ required (found: $(node -v))"
  exit 1
fi

echo "✓ Node.js version OK"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy vault sample
if [ ! -d "vault" ]; then
  echo "📁 Creating vault from sample..."
  cp -r vault-sample vault
  echo "✓ Vault created at ./vault"
fi

# Copy env file
if [ ! -f ".env.local" ]; then
  echo "📝 Creating .env.local from template..."
  cp .env.example .env.local
  echo "✓ .env.local created (edit this file to add your API keys)"
fi

# Initialize database
echo "🗄️  Initializing database..."
npm run db:init

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env.local to add your OpenAI API key (or configure Ollama)"
echo "2. Run 'npm run dev' to start the application"
echo "3. Open the app and start taking notes!"
echo ""
echo "For Ollama (local models):"
echo "  - Install: https://ollama.ai"
echo "  - Run: ollama serve"
echo "  - Pull a model: ollama pull llama3.2"
echo ""
