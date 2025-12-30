# Latent — Local-First AI Research OS

> A privacy-focused desktop application that combines the speed of local Markdown notes with the intelligence of AI agents.

## Vision

**Latent** is your personal research assistant that lives entirely on your machine. It doesn't just chat — it reads your notes, searches your knowledge base, makes connections, and helps you write. All while keeping your data local and under your control.

## Core Principles

### 1. Local Data, Agnostic Intelligence
- **Data Sovereignty**: Your notes are `.md` files on disk. Always accessible, always yours.
- **AI Flexibility**: Use OpenAI, Anthropic, Ollama, or any local model. Your choice.

### 2. Performance Through Native Bindings
- TypeScript for velocity and type safety
- Native bindings for heavy lifting (SQLite, embeddings, image processing)
- Background workers to never block the UI

### 3. Privacy First
- No telemetry, no tracking, no cloud lock-in
- Data never leaves your machine unless you configure a cloud AI provider
- Open source and auditable

## Features (V0)

- 📝 **Markdown Editor**: Write in plain text, see it rendered beautifully
- 🤖 **AI Assistant**: Context-aware AI that knows what note you're looking at
- 🔍 **Semantic Search**: Vector-based search across all your notes
- 🔗 **Backlinks**: Automatic bidirectional linking between notes
- 🛠️ **AI Tools**: Agent can read, search, and create notes for you
- ⚙️ **Model Agnostic**: OpenAI, Anthropic, Ollama, or custom endpoints

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron App                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Editor     │  │  Assistant   │  │   Graph (V1)     │  │
│  │   (React)    │  │   (React)    │  │   (React)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                  │                   │             │
│         └──────────────────┴───────────────────┘             │
│                            │ IPC                             │
│  ──────────────────────────┼─────────────────────────────── │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────────┐ │
│  │              Main Process (Node.js)                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐    │ │
│  │  │  AI      │  │  SQLite  │  │  Indexer Worker   │    │ │
│  │  │  Layer   │  │  (Meta)  │  │  (File Watcher)   │    │ │
│  │  └──────────┘  └──────────┘  └───────────────────┘    │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  vault/       │
                    │  *.md files   │
                    └───────────────┘
```

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Backend**: Electron + Node.js
- **Database**: SQLite (better-sqlite3)
- **AI**: Model-agnostic provider interface
- **Embeddings**: ONNX Runtime (local) or API-based
- **File Watching**: chokidar
- **Markdown Parsing**: unified/remark ecosystem

## Project Structure

```
latent/
├── docs/                      # Documentation (you are here)
│   ├── architecture/          # System design docs
│   ├── api/                   # API specifications
│   └── guides/                # Development guides
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # Entry point
│   │   ├── db/                # Database layer
│   │   ├── ai/                # LLM provider interface
│   │   ├── indexer/           # File watcher + embedding
│   │   └── ipc/               # IPC handlers
│   ├── renderer/              # React frontend
│   │   ├── components/        # UI components
│   │   ├── hooks/             # React hooks
│   │   └── App.tsx
│   └── shared/                # Shared types
├── vault/                     # User's notes (gitignored)
├── latent.db                  # SQLite database
└── package.json
```

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Documentation

- [Architecture Overview](docs/architecture/README.md)
- [Database Schema](docs/architecture/database.md)
- [AI Provider Interface](docs/api/llm-provider.md)
- [Indexer System](docs/architecture/indexer.md)
- [Tool Specifications](docs/api/tools.md)
- [Development Guide](docs/guides/development.md)

## License

MIT

## Status

🚧 **V0 Development** — Building the MVP
