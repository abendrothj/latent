# Development Guide

## Prerequisites

- **Node.js**: v20+ (LTS recommended)
- **npm**: v10+ (comes with Node.js)
- **Git**: For version control
- **VS Code**: Recommended (with TypeScript extensions)

Optional:
- **Ollama**: For local LLM testing
- **Docker**: For containerized services (if needed)

## Initial Setup

### 1. Clone and Install

```bash
# Navigate to project directory
cd latent

# Install dependencies
npm install

# Verify installation
npm run check
```

### 2. Project Structure

```
latent/
├── docs/                     # Documentation (you are here)
├── src/
│   ├── main/                # Electron main process (Node.js backend)
│   │   ├── index.ts         # Entry point
│   │   ├── db/              # Database layer
│   │   │   ├── schema.ts    # SQLite schema
│   │   │   ├── queries.ts   # Prepared queries
│   │   │   └── migrations.ts
│   │   ├── ai/              # AI provider implementations
│   │   │   ├── provider.ts  # LLMProvider interface
│   │   │   ├── openai.ts    # OpenAI provider
│   │   │   ├── anthropic.ts # Anthropic provider
│   │   │   ├── ollama.ts    # Ollama provider
│   │   │   └── tools.ts     # Tool implementations
│   │   ├── indexer/         # Background file indexer
│   │   │   ├── worker.ts    # Worker thread main
│   │   │   ├── watcher.ts   # File watching (chokidar)
│   │   │   ├── parser.ts    # Markdown parsing
│   │   │   ├── chunker.ts   # Text chunking
│   │   │   └── embedder.ts  # Embedding generation
│   │   └── ipc/             # IPC handlers for renderer
│   │       ├── handlers.ts  # Route IPC calls
│   │       └── events.ts    # Event emitters
│   ├── renderer/            # React frontend
│   │   ├── App.tsx          # Root component
│   │   ├── components/      # UI components
│   │   │   ├── Editor/      # Markdown editor
│   │   │   ├── Assistant/   # AI chat panel
│   │   │   └── Graph/       # Knowledge graph (V1)
│   │   ├── hooks/           # React hooks
│   │   │   ├── useIPC.ts    # IPC communication
│   │   │   └── useSettings.ts
│   │   └── styles/          # CSS/styling
│   ├── shared/              # Shared types between main & renderer
│   │   ├── types.ts         # Core types
│   │   └── constants.ts
│   └── preload.ts           # Electron preload script (context bridge)
├── test/                    # Tests
│   ├── unit/
│   ├── integration/
│   └── fixtures/            # Test data
├── vault/                   # Test vault (gitignored)
├── latent.db                # SQLite database (gitignored)
├── package.json
├── tsconfig.json
├── tsconfig.main.json       # Main process config
├── tsconfig.renderer.json   # Renderer config
└── vite.config.ts           # Vite bundler config
```

### 3. Environment Setup

Create a `.env.local` file in the project root:

```bash
# AI Provider Configuration (for development)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_BASE_URL=http://localhost:11434

# Development Settings
VAULT_PATH=./vault
LOG_LEVEL=debug
```

**Security Note**: Never commit `.env.local` to version control. It's in `.gitignore`.

### 4. Create Test Vault

```bash
# Create test vault directory
mkdir -p vault

# Create sample notes
cat > vault/welcome.md << 'EOF'
---
tags: [meta, welcome]
created: 2024-01-15
---

# Welcome to Latent

This is your local-first AI research assistant.

## Features

- [[markdown-editing|Markdown Editing]]
- [[ai-assistant|AI Assistant]]
- [[semantic-search|Semantic Search]]

Start by asking the assistant a question!
EOF

cat > vault/quantum-computing.md << 'EOF'
---
tags: [physics, computing]
---

# Quantum Computing

Quantum computing leverages quantum mechanical phenomena like superposition and entanglement.

## Applications

- Cryptography (Shor's algorithm)
- Drug discovery
- Optimization problems
EOF
```

## Running the Application

### Development Mode

```bash
# Start development server (hot reload enabled)
npm run dev
```

This will:
1. Start Vite dev server for the renderer (React)
2. Compile TypeScript for main process
3. Launch Electron with hot reload
4. Open DevTools automatically

### Production Build

```bash
# Build for production
npm run build

# Run production build
npm run start
```

### Debug Mode

```bash
# Run with verbose logging
LOG_LEVEL=debug npm run dev

# Run with Chrome DevTools for main process
npm run dev:main
```

## Database Setup

### Initialize Database

```bash
# Create database and run migrations
npm run db:init
```

This runs [src/main/db/migrations.ts](../../src/main/db/migrations.ts) to create tables.

### Reset Database

```bash
# Drop all tables and re-initialize
npm run db:reset

# Warning: This deletes all indexed data!
```

### Inspect Database

```bash
# Open SQLite CLI
sqlite3 latent.db

# Common queries
sqlite> .tables
sqlite> SELECT COUNT(*) FROM documents;
sqlite> SELECT path, title FROM documents ORDER BY modified_at DESC LIMIT 10;
```

Or use a GUI tool:
- [DB Browser for SQLite](https://sqlitebrowser.org/)
- [TablePlus](https://tableplus.com/)
- [DBeaver](https://dbeaver.io/)

## Development Workflows

### Adding a New Tool

1. Define the tool schema in [src/main/ai/tools.ts](../../src/main/ai/tools.ts):

```typescript
export const NEW_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'new_tool',
    description: 'Description of what this tool does',
    parameters: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'Parameter description',
        },
      },
      required: ['param1'],
    },
  },
};
```

2. Implement the tool function:

```typescript
async function newTool(args: { param1: string }): Promise<any> {
  // Implementation
}
```

3. Add to tool executor in [src/main/ai/tools.ts](../../src/main/ai/tools.ts):

```typescript
export async function executeToolCall(toolCall: ToolCall): Promise<any> {
  const args = JSON.parse(toolCall.function.arguments);

  switch (toolCall.function.name) {
    case 'new_tool':
      return await newTool(args);
    // ... other tools
  }
}
```

4. Add to `ALL_TOOLS` array:

```typescript
export const ALL_TOOLS = [
  READ_NOTE,
  SEARCH_NOTES,
  WRITE_NOTE,
  UPDATE_FRONTMATTER,
  LIST_BACKLINKS,
  NEW_TOOL, // Add here
];
```

5. Test the tool:

```bash
npm run test -- tools.test.ts
```

### Adding a New AI Provider

1. Create provider class in [src/main/ai/](../../src/main/ai/):

```typescript
// src/main/ai/custom-provider.ts
import { LLMProvider, ChatRequest, ChatResponse, EmbedRequest, EmbedResponse } from './provider';

export class CustomProvider implements LLMProvider {
  readonly name = 'custom';

  constructor(private config: { apiKey: string; baseURL: string }) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Implementation
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    // Implementation
  }
}
```

2. Add to provider factory in [src/main/ai/provider.ts](../../src/main/ai/provider.ts):

```typescript
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case 'custom':
      return new CustomProvider({
        apiKey: config.apiKey!,
        baseURL: config.baseURL!,
      });
    // ... other providers
  }
}
```

3. Test the provider:

```typescript
// test/unit/providers/custom.test.ts
import { CustomProvider } from '../../../src/main/ai/custom-provider';

describe('CustomProvider', () => {
  it('should generate chat completions', async () => {
    const provider = new CustomProvider({ apiKey: 'test', baseURL: 'http://localhost' });
    const response = await provider.chat({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(response.message.content).toBeTruthy();
  });
});
```

### Modifying the Database Schema

1. Create a new migration in [src/main/db/migrations.ts](../../src/main/db/migrations.ts):

```typescript
const migrations = [
  // ... existing migrations

  // Migration 2: Add new column
  {
    version: 2,
    up: (db: Database) => {
      db.exec('ALTER TABLE documents ADD COLUMN summary TEXT');
    },
    down: (db: Database) => {
      // SQLite doesn't support DROP COLUMN, so recreate table
      db.exec(`
        CREATE TABLE documents_new AS SELECT id, path, checksum, title, word_count, created_at, modified_at, last_indexed_at, frontmatter FROM documents;
        DROP TABLE documents;
        ALTER TABLE documents_new RENAME TO documents;
      `);
    },
  },
];
```

2. Run migrations:

```bash
npm run db:migrate
```

3. Update TypeScript types in [src/shared/types.ts](../../src/shared/types.ts):

```typescript
export interface Document {
  id: number;
  path: string;
  checksum: string;
  title: string | null;
  word_count: number;
  created_at: number;
  modified_at: number;
  last_indexed_at: number | null;
  frontmatter: string | null;
  summary: string | null; // New field
}
```

## Testing

### Run All Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Run Specific Tests

```bash
# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run specific test file
npm test -- parser.test.ts
```

### Writing Tests

Example unit test:

```typescript
// test/unit/chunker.test.ts
import { chunkDocument } from '../../src/main/indexer/chunker';

describe('Chunker', () => {
  it('should split document into chunks', async () => {
    const content = 'Lorem ipsum '.repeat(1000); // ~2000 tokens
    const chunks = await chunkDocument(content, 500, 50);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].tokenCount).toBeLessThanOrEqual(500);
  });

  it('should overlap chunks', async () => {
    const content = 'A '.repeat(600);
    const chunks = await chunkDocument(content, 500, 50);

    // Check that chunks overlap
    const lastTokensChunk0 = chunks[0].content.slice(-100);
    const firstTokensChunk1 = chunks[1].content.slice(0, 100);

    expect(lastTokensChunk0).toContain(firstTokensChunk1.slice(0, 20));
  });
});
```

Example integration test:

```typescript
// test/integration/indexer.test.ts
import { setupTestVault, teardownTestVault } from '../fixtures/vault';
import { indexFile } from '../../src/main/indexer/worker';
import { db } from '../../src/main/db';

describe('Indexer Integration', () => {
  beforeEach(async () => {
    await setupTestVault();
  });

  afterEach(async () => {
    await teardownTestVault();
  });

  it('should index a file end-to-end', async () => {
    await indexFile('test-note.md');

    const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test-note.md');
    expect(doc).toBeTruthy();

    const chunks = db.prepare('SELECT * FROM chunks WHERE document_id = ?').all(doc.id);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].embedding).toBeTruthy();
  });
});
```

## Debugging

### Main Process

1. Add breakpoints in VS Code
2. Run debug configuration:

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "args": [".", "--remote-debugging-port=9223"],
      "outputCapture": "std"
    }
  ]
}
```

### Renderer Process

Open DevTools in Electron:
- `Cmd+Option+I` (Mac)
- `Ctrl+Shift+I` (Windows/Linux)

Or programmatically:

```typescript
// src/main/index.ts
mainWindow.webContents.openDevTools({ mode: 'detach' });
```

### IPC Communication

Log all IPC messages:

```typescript
// src/main/ipc/handlers.ts
ipcMain.handle('*', (event, ...args) => {
  console.log('[IPC]', event.frameId, args);
  // ... handler logic
});
```

## Linting and Formatting

### Run Linter

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Format Code

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

### Pre-commit Hooks

Install Git hooks:

```bash
npm run prepare
```

This sets up Husky to:
- Run linter before commit
- Run tests before push

## Building for Distribution

### macOS

```bash
# Build .dmg installer
npm run build:mac

# Output: dist/Latent-1.0.0.dmg
```

### Windows

```bash
# Build .exe installer
npm run build:win

# Output: dist/Latent Setup 1.0.0.exe
```

### Linux

```bash
# Build .AppImage
npm run build:linux

# Output: dist/Latent-1.0.0.AppImage
```

## Performance Profiling

### Profile Main Process

```bash
# Run with Node.js profiler
node --prof ./node_modules/.bin/electron .

# Process profile log
node --prof-process isolate-*.log > profile.txt
```

### Profile Renderer

Use Chrome DevTools Performance tab:
1. Open DevTools
2. Go to Performance tab
3. Click Record
4. Perform actions
5. Stop recording
6. Analyze flame graph

### Database Query Performance

```typescript
// Enable query logging
db.pragma('journal_mode = WAL');
db.exec('PRAGMA optimize');

// Profile a query
const start = Date.now();
const result = db.prepare('SELECT * FROM chunks WHERE ...').all();
console.log(`Query took ${Date.now() - start}ms`);

// Analyze query plan
db.prepare('EXPLAIN QUERY PLAN SELECT * FROM chunks WHERE ...').all();
```

## Common Issues

### Issue: "Cannot find module 'better-sqlite3'"

**Solution**: Rebuild native modules for Electron

```bash
npm run rebuild
```

### Issue: "EACCES: permission denied" on vault folder

**Solution**: Check vault path permissions

```bash
chmod -R u+rw vault/
```

### Issue: "Worker thread crashed"

**Solution**: Check worker logs

```typescript
// src/main/indexer/worker.ts
process.on('uncaughtException', (err) => {
  console.error('Worker exception:', err);
  process.exit(1);
});
```

### Issue: Embeddings taking too long

**Solution**: Use batch embeddings

```typescript
// Instead of:
for (const chunk of chunks) {
  await generateEmbedding(chunk.content);
}

// Do:
const embeddings = await generateEmbeddings(chunks.map(c => c.content));
```

### Issue: Hot reload not working

**Solution**: Clear cache and restart

```bash
rm -rf .vite node_modules/.cache
npm run dev
```

## Contributing

### Code Style

- Use TypeScript strict mode
- Prefer `async/await` over callbacks
- Use functional programming where appropriate
- Write self-documenting code (minimal comments)
- Follow existing patterns in the codebase

### Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Types are correct (`npm run typecheck`)
- [ ] Documentation updated (if needed)
- [ ] Changelog updated (if user-facing change)

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add semantic search to assistant
fix: prevent indexer crash on invalid markdown
docs: update API documentation for tools
test: add unit tests for chunker
chore: upgrade dependencies
```

## Helpful Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/wiki/API)
- [Vite Guide](https://vitejs.dev/guide/)

## Getting Help

- Check existing [GitHub Issues](https://github.com/your-org/latent/issues)
- Read the [documentation](../README.md)
- Ask in [Discussions](https://github.com/your-org/latent/discussions)

## Next Steps

Ready to start building? Check out:
- [Architecture Overview](../architecture/README.md) — Understand the system design
- [API Documentation](../api/) — Learn the interfaces
- [Tool Specifications](../api/tools.md) — Implement new tools
