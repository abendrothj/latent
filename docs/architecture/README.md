# Architecture Overview

## System Design Principles

### 1. Local-First Architecture

Latent is built on the principle that **data lives on disk, always**. The application is structured in layers:

```
┌────────────────────────────────────────────────────┐
│  Layer 4: Presentation (React UI)                  │
├────────────────────────────────────────────────────┤
│  Layer 3: Application Logic (IPC Handlers)         │
├────────────────────────────────────────────────────┤
│  Layer 2: Domain Logic (AI, Indexer, DB)           │
├────────────────────────────────────────────────────┤
│  Layer 1: Data (Filesystem + SQLite)               │
└────────────────────────────────────────────────────┘
```

**Layer 1** is the source of truth. All other layers are derived state or computed views.

### 2. Process Architecture

Latent runs across multiple processes to maintain responsiveness:

```
┌─────────────────────┐
│  Main Process       │
│  (Electron Main)    │
│                     │
│  - Window Mgmt      │
│  - IPC Routing      │
│  - SQLite Access    │
│  - AI Orchestration │
└──────┬──────────────┘
       │
       ├───────────────────┐
       │                   │
┌──────▼──────────┐  ┌─────▼──────────────┐
│  Renderer       │  │  Indexer Worker    │
│  (React UI)     │  │  (Background)      │
│                 │  │                    │
│  - Editor       │  │  - File Watcher    │
│  - Assistant    │  │  - Markdown Parser │
│  - Graph        │  │  - Chunking        │
└─────────────────┘  │  - Embedding Gen   │
                     └────────────────────┘
```

**Why separate processes?**
- **Main Process**: Handles privileged operations (file I/O, database, AI calls)
- **Renderer**: Isolated UI process, can be reloaded without losing state
- **Indexer Worker**: CPU-intensive operations never block the UI

### 3. Data Flow

#### Indexing Pipeline
```
File Change
    │
    ▼
File Watcher (chokidar)
    │
    ▼
Read File Content
    │
    ▼
Parse Markdown (extract frontmatter, links, content)
    │
    ▼
Chunk Content (~500 tokens per chunk)
    │
    ▼
Generate Embeddings (ONNX or API)
    │
    ▼
Store in SQLite (documents, chunks, links)
    │
    ▼
Notify Main Process → Update UI
```

#### AI Query Flow
```
User Message
    │
    ▼
Send to AI Provider (with tools)
    │
    ▼
┌───────────────────┐
│ AI Decides Action │
└────────┬──────────┘
         │
    ┌────┴─────┐
    │          │
    ▼          ▼
Use Tool    Answer Directly
    │
    ▼
Execute Tool (read_note, search_notes, write_note, etc.)
    │
    ▼
Return Result to AI
    │
    ▼
AI Synthesizes Response
    │
    ▼
Display to User (with citations)
```

### 4. Concurrency Model

**Main Thread**: Never blocked
- All heavy operations delegated to workers or async operations
- UI remains responsive even during large indexing operations

**Worker Thread**: Background indexing
- Processes files in batches
- Communicates progress via message passing
- Can be paused/resumed by main process

**Database Access**: Synchronous but fast
- `better-sqlite3` allows synchronous SQLite calls (no async overhead)
- All queries optimized with indexes
- Read-heavy workload (99% reads, 1% writes)

### 5. Error Handling Strategy

**Fail-Safe Principle**: Errors should never corrupt user data

1. **Filesystem**: Always the source of truth
   - Database corruption? Re-index from filesystem
   - Bad parse? Skip file, log error, continue

2. **Indexer Crashes**: Isolated from main app
   - Worker crash → Restart worker
   - Main app continues functioning (search may be stale)

3. **AI Provider Failures**: Graceful degradation
   - API timeout → Show error, allow retry
   - Invalid response → Log, show user-friendly message
   - Rate limit → Queue and retry with exponential backoff

### 6. State Management

**Source of Truth Hierarchy**:
1. **Filesystem** (`vault/*.md`) — Authoritative
2. **SQLite** — Indexed view (can be regenerated)
3. **React State** — UI state (ephemeral)

**Synchronization Rules**:
- Filesystem changes propagate to SQLite via indexer
- SQLite changes propagate to React via IPC events
- React never writes to SQLite directly (only via IPC → Main Process)

### 7. Performance Targets

**V0 Benchmarks**:
- Initial indexing: 1,000 notes in <60 seconds
- Search latency: <100ms for typical queries
- UI responsiveness: 60fps during scrolling/typing
- Cold start: <3 seconds from launch to usable

**Scalability**:
- Target: 10,000 notes without degradation
- SQLite can handle millions of rows
- Chunking keeps individual operations small

### 8. Security Model

**Threat Model**:
- User data is sensitive (research notes, personal writing)
- AI providers may be untrusted (cloud APIs)
- No network access except explicit AI API calls

**Mitigations**:
1. **No telemetry**: Zero network calls except user-configured AI APIs
2. **Sandboxing**: Renderer process is sandboxed (Electron security best practices)
3. **API Key Storage**: Encrypted at rest (using OS keychain)
4. **Content Security Policy**: Strict CSP in renderer
5. **Context Isolation**: Enabled (no direct Node.js access from renderer)

### 9. Extensibility Points

**Plugin System** (Post-V0):
- Custom AI providers (implement `LLMProvider` interface)
- Custom tools/functions for the agent
- Custom parsers (PDF, DOCX → Markdown)
- Custom embedding models

**Configuration**:
- All settings stored in SQLite `settings` table
- JSON schema validation for settings
- Settings UI auto-generated from schema

## Technology Choices

### Why Electron?
- **Pro**: Cross-platform, native file system access, mature ecosystem
- **Con**: Large bundle size (~100MB)
- **Decision**: Acceptable trade-off for V0, revisit with Tauri if bundle size becomes critical

### Why better-sqlite3?
- **Pro**: Synchronous API (simpler code), 3-4x faster than async libraries, native performance
- **Con**: Not suitable for network databases (not a concern for local-first)
- **Decision**: Perfect fit for local SQLite

### Why NOT Rust for V0?
- **Pro**: Maximum performance, small binaries
- **Con**: Slower development velocity, harder to share types with frontend
- **Decision**: Use TypeScript for MVP, add Rust modules only where benchmarks show clear need

### Why Separate Indexer Worker?
- **Pro**: Never blocks main thread, can be killed/restarted safely, scales to large vaults
- **Con**: Added complexity (IPC, state synchronization)
- **Decision**: Complexity is worth it — responsiveness is non-negotiable

## Next Steps

See detailed documentation:
- [Database Schema](database.md)
- [Indexer Architecture](indexer.md)
- [AI Provider Interface](../api/llm-provider.md)
- [Tool Specifications](../api/tools.md)
