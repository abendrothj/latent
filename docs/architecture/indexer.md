# Indexer Architecture

## Overview

The **Indexer** is a background worker responsible for keeping the SQLite database synchronized with the filesystem. It watches the `vault/` directory for changes and processes Markdown files into searchable chunks with embeddings.

## Design Goals

1. **Never block the main thread**: UI must remain responsive during indexing
2. **Incremental updates**: Only re-index changed files
3. **Crash isolation**: Indexer crashes don't crash the app
4. **Resource efficiency**: Batch operations, rate-limit API calls
5. **Progress reporting**: User sees what's happening

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Main Process                                           │
│                                                         │
│  ┌──────────────┐         IPC          ┌─────────────┐ │
│  │              │◄──────────────────────┤  Indexer    │ │
│  │  IPC Handler │                       │  Worker     │ │
│  │              ├───────────────────────►  (Thread)   │ │
│  └──────┬───────┘   Commands/Events     └──────┬──────┘ │
│         │                                       │        │
│         │                                       │        │
│  ┌──────▼───────┐                       ┌──────▼──────┐ │
│  │   SQLite     │                       │  File       │ │
│  │   Database   │                       │  Watcher    │ │
│  └──────────────┘                       │  (chokidar) │ │
│                                         └──────┬──────┘ │
│                                                │        │
└────────────────────────────────────────────────┼────────┘
                                                 │
                                          ┌──────▼──────┐
                                          │  vault/     │
                                          │  *.md files │
                                          └─────────────┘
```

## Worker Thread vs Child Process

**Decision: Use Worker Threads** (Node.js `worker_threads`)

**Rationale**:
- Shared memory access (faster IPC)
- Lower overhead than child processes
- Still provides crash isolation
- Can share TypeScript types easily

```typescript
// main/indexer/worker.ts
import { parentPort } from 'worker_threads';

parentPort?.on('message', async (msg) => {
  switch (msg.type) {
    case 'INDEX_FILE':
      await indexFile(msg.payload.path);
      break;
    case 'STOP':
      cleanup();
      process.exit(0);
  }
});
```

## File Watching

### Technology: chokidar

```typescript
import chokidar from 'chokidar';

const watcher = chokidar.watch('vault/**/*.md', {
  ignored: /(^|[\/\\])\../, // Ignore dotfiles
  persistent: true,
  ignoreInitial: false,     // Process existing files on startup
  awaitWriteFinish: {       // Wait for file write to complete
    stabilityThreshold: 500,
    pollInterval: 100
  }
});

watcher
  .on('add', path => enqueueIndexing(path, 'add'))
  .on('change', path => enqueueIndexing(path, 'change'))
  .on('unlink', path => handleDelete(path));
```

### Event Types
- `add`: New file created → Full index
- `change`: File modified → Re-index (check checksum first)
- `unlink`: File deleted → Remove from database

### Debouncing
Batch rapid changes (e.g., git operations) using a queue:

```typescript
class IndexQueue {
  private queue: Map<string, IndexTask> = new Map();
  private timer: NodeJS.Timeout | null = null;

  enqueue(path: string, reason: 'add' | 'change') {
    this.queue.set(path, { path, reason, timestamp: Date.now() });

    // Debounce: wait 1 second after last change
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.processQueue(), 1000);
  }

  private async processQueue() {
    const tasks = Array.from(this.queue.values());
    this.queue.clear();

    // Process in parallel batches of 10
    const batchSize = 10;
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      await Promise.all(batch.map(task => this.processFile(task.path)));
      this.reportProgress(i + batch.length, tasks.length);
    }
  }
}
```

## Indexing Pipeline

### Stage 1: Read & Hash
```typescript
async function checkIfIndexingNeeded(path: string): Promise<boolean> {
  const content = await fs.readFile(path, 'utf-8');
  const checksum = createHash('sha256').update(content).digest('hex');

  const existing = db.prepare('SELECT checksum FROM documents WHERE path = ?').get(path);

  return !existing || existing.checksum !== checksum;
}
```

### Stage 2: Parse Markdown
```typescript
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

interface ParsedDocument {
  frontmatter: Record<string, any>;
  title: string | null;
  content: string;  // Markdown without frontmatter
  links: Link[];
}

async function parseMarkdown(content: string): Promise<ParsedDocument> {
  let frontmatter = {};
  let title = null;
  const links: Link[] = [];

  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .parse(content);

  visit(tree, 'yaml', (node) => {
    frontmatter = yaml.parse(node.value);
  });

  visit(tree, 'heading', (node) => {
    if (node.depth === 1 && !title) {
      title = extractText(node);
    }
  });

  visit(tree, 'link', (node) => {
    links.push({
      type: 'markdown',
      target: node.url,
      text: extractText(node)
    });
  });

  visit(tree, 'wikiLink', (node) => {
    links.push({
      type: 'wikilink',
      target: node.value,
      text: node.data?.alias || node.value
    });
  });

  const contentWithoutFrontmatter = content.replace(/^---\n.*?\n---\n/s, '');

  return { frontmatter, title, content: contentWithoutFrontmatter, links };
}
```

### Stage 3: Chunking
```typescript
interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
}

async function chunkDocument(content: string, chunkSize = 500, overlap = 50): Promise<Chunk[]> {
  const encoding = getEncoding('cl100k_base'); // tiktoken
  const tokens = encoding.encode(content);

  const chunks: Chunk[] = [];
  let index = 0;

  for (let i = 0; i < tokens.length; i += chunkSize - overlap) {
    const chunkTokens = tokens.slice(i, i + chunkSize);
    const chunkText = encoding.decode(chunkTokens);

    // Don't create tiny chunks at the end
    if (chunkTokens.length < 50 && chunks.length > 0) {
      chunks[chunks.length - 1].content += '\n' + chunkText;
      continue;
    }

    chunks.push({
      content: chunkText,
      index: index++,
      tokenCount: chunkTokens.length
    });
  }

  encoding.free();
  return chunks;
}
```

**Chunking Strategy**:
- **Fixed-size overlapping windows**: Simple, predictable
- **Semantic chunking** (future): Split on paragraph/section boundaries
- **Token-based**: Ensures compatibility with LLM context limits

### Stage 4: Embedding Generation

#### Option 1: API-based (OpenAI, Voyage, etc.)
```typescript
async function generateEmbedding(text: string, model = 'text-embedding-3-small'): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: text,
      model: model
    })
  });

  const data = await response.json();
  return data.data[0].embedding;
}
```

**Rate Limiting**:
```typescript
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = 0;

  async add<T>(fn: () => Promise<T>, maxConcurrent = 5): Promise<T> {
    while (this.processing >= maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.processing++;
    try {
      return await fn();
    } finally {
      this.processing--;
    }
  }
}

const embedQueue = new RateLimiter();

async function embedChunks(chunks: Chunk[]): Promise<number[][]> {
  return Promise.all(
    chunks.map(chunk =>
      embedQueue.add(() => generateEmbedding(chunk.content))
    )
  );
}
```

#### Option 2: Local Embeddings (ONNX)
```typescript
import * as ort from 'onnxruntime-node';

class LocalEmbedder {
  private session: ort.InferenceSession;
  private tokenizer: any; // Use transformers.js tokenizer

  async initialize(modelPath: string) {
    this.session = await ort.InferenceSession.create(modelPath);
    this.tokenizer = await AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2');
  }

  async embed(text: string): Promise<number[]> {
    const { input_ids, attention_mask } = await this.tokenizer(text, {
      padding: true,
      truncation: true,
      max_length: 512
    });

    const feeds = {
      input_ids: new ort.Tensor('int64', input_ids, [1, input_ids.length]),
      attention_mask: new ort.Tensor('int64', attention_mask, [1, attention_mask.length])
    };

    const results = await this.session.run(feeds);
    const embedding = results.last_hidden_state.data;

    // Mean pooling
    return this.meanPooling(embedding, attention_mask);
  }

  private meanPooling(embeddings: any, mask: any): number[] {
    // Implementation details...
    return [];
  }
}
```

**Trade-offs**:
- **API**: Fast, high-quality, requires internet, costs money
- **Local**: Private, free, slower, lower quality (depends on model)

**Decision for V0**: Support both, default to API

### Stage 5: Database Storage
```typescript
async function storeDocument(parsed: ParsedDocument, chunks: Chunk[], embeddings: number[][], path: string) {
  const stats = await fs.stat(path);

  db.transaction(() => {
    // Delete existing document (cascade deletes chunks/links)
    db.prepare('DELETE FROM documents WHERE path = ?').run(path);

    // Insert document
    const result = db.prepare(`
      INSERT INTO documents (path, checksum, title, word_count, created_at, modified_at, last_indexed_at, frontmatter)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      path,
      checksum,
      parsed.title || extractFilename(path),
      countWords(parsed.content),
      Math.floor(stats.birthtimeMs / 1000),
      Math.floor(stats.mtimeMs / 1000),
      Math.floor(Date.now() / 1000),
      JSON.stringify(parsed.frontmatter)
    );

    const documentId = result.lastInsertRowid;

    // Insert chunks
    const insertChunk = db.prepare(`
      INSERT INTO chunks (document_id, content, embedding, embedding_model, chunk_index, token_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    chunks.forEach((chunk, i) => {
      insertChunk.run(
        documentId,
        chunk.content,
        serializeEmbedding(embeddings[i]),
        'text-embedding-3-small',
        chunk.index,
        chunk.tokenCount
      );
    });

    // Insert links
    const insertLink = db.prepare(`
      INSERT OR IGNORE INTO links (source_path, target_path, link_type, link_text)
      VALUES (?, ?, ?, ?)
    `);

    parsed.links.forEach(link => {
      insertLink.run(path, link.target, link.type, link.text);
    });
  })();
}

function serializeEmbedding(vector: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  vector.forEach((val, i) => buffer.writeFloatLE(val, i * 4));
  return buffer;
}

function deserializeEmbedding(buffer: Buffer): number[] {
  const vector = [];
  for (let i = 0; i < buffer.length; i += 4) {
    vector.push(buffer.readFloatLE(i));
  }
  return vector;
}
```

## Progress Reporting

```typescript
interface IndexProgress {
  phase: 'scanning' | 'indexing' | 'complete' | 'error';
  current: number;
  total: number;
  currentFile?: string;
  error?: string;
}

function reportProgress(progress: IndexProgress) {
  parentPort?.postMessage({
    type: 'PROGRESS',
    payload: progress
  });
}

// In main process
indexWorker.on('message', (msg) => {
  if (msg.type === 'PROGRESS') {
    // Send to renderer via IPC
    mainWindow.webContents.send('indexer:progress', msg.payload);
  }
});
```

## Error Handling

### Retry Strategy
```typescript
async function indexFileWithRetry(path: string, maxRetries = 3): Promise<void> {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await indexFile(path);
      return;
    } catch (error) {
      lastError = error;

      if (isRetryable(error)) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Non-retryable error (e.g., file not found, parse error)
      break;
    }
  }

  // Log error but don't crash
  console.error(`Failed to index ${path} after ${maxRetries} attempts:`, lastError);
  reportProgress({
    phase: 'error',
    current: 0,
    total: 0,
    currentFile: path,
    error: lastError.message
  });
}

function isRetryable(error: Error): boolean {
  // Retry on network errors, rate limits, timeouts
  return error.message.includes('rate limit') ||
         error.message.includes('timeout') ||
         error.message.includes('ECONNREFUSED');
}
```

### Partial Failure Recovery
If embedding generation fails for one chunk, store the document without embeddings:

```typescript
try {
  embeddings = await embedChunks(chunks);
} catch (error) {
  console.warn(`Embedding failed for ${path}, storing without embeddings`);
  embeddings = chunks.map(() => null); // Store null embeddings
}
```

## Performance Optimizations

### 1. Parallel Processing
```typescript
async function indexBatch(paths: string[]) {
  const concurrency = 10; // Tune based on system
  const batches = chunk(paths, concurrency);

  for (const batch of batches) {
    await Promise.all(batch.map(path => indexFile(path)));
  }
}
```

### 2. Caching
```typescript
const embeddingCache = new Map<string, number[]>();

async function getCachedEmbedding(text: string): Promise<number[]> {
  const hash = createHash('sha256').update(text).digest('hex');

  if (embeddingCache.has(hash)) {
    return embeddingCache.get(hash)!;
  }

  const embedding = await generateEmbedding(text);
  embeddingCache.set(hash, embedding);
  return embedding;
}
```

### 3. Skip Unchanged Files
```typescript
async function shouldSkipFile(path: string): Promise<boolean> {
  const content = await fs.readFile(path, 'utf-8');
  const checksum = createHash('sha256').update(content).digest('hex');

  const existing = db.prepare('SELECT checksum FROM documents WHERE path = ?').get(path);

  return existing && existing.checksum === checksum;
}
```

## Initial Indexing Flow

```typescript
async function performInitialIndex(vaultPath: string) {
  reportProgress({ phase: 'scanning', current: 0, total: 0 });

  // Find all markdown files
  const files = await glob('**/*.md', { cwd: vaultPath });

  reportProgress({ phase: 'indexing', current: 0, total: files.length });

  // Index in batches
  for (let i = 0; i < files.length; i += 10) {
    const batch = files.slice(i, i + 10);
    await Promise.all(batch.map(file => indexFile(path.join(vaultPath, file))));

    reportProgress({
      phase: 'indexing',
      current: i + batch.length,
      total: files.length
    });
  }

  reportProgress({ phase: 'complete', current: files.length, total: files.length });
}
```

## Worker Lifecycle

```typescript
class IndexerWorker {
  private worker: Worker | null = null;

  start() {
    this.worker = new Worker('./indexer/worker.js');

    this.worker.on('message', this.handleMessage);
    this.worker.on('error', this.handleError);
    this.worker.on('exit', this.handleExit);
  }

  stop() {
    this.worker?.postMessage({ type: 'STOP' });
    this.worker = null;
  }

  restart() {
    this.stop();
    setTimeout(() => this.start(), 1000);
  }

  private handleError(error: Error) {
    console.error('Indexer worker error:', error);
    this.restart(); // Auto-restart on crash
  }

  private handleExit(code: number) {
    if (code !== 0) {
      console.error(`Indexer worker exited with code ${code}`);
      this.restart();
    }
  }
}
```

## Testing Strategy

### Unit Tests
- Markdown parsing (various frontmatter formats, link types)
- Chunking algorithm (boundary conditions, overlap)
- Embedding serialization/deserialization

### Integration Tests
- Full indexing pipeline (mock file system)
- Database transactions (rollback on error)
- Worker communication (IPC)

### Performance Tests
```typescript
describe('Indexing Performance', () => {
  it('should index 1000 small files in <60 seconds', async () => {
    const start = Date.now();
    await indexBatch(generateMockFiles(1000));
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(60000);
  });
});
```

## Future Enhancements

1. **Smart re-indexing**: Only re-embed changed chunks
2. **Incremental embeddings**: Stream embeddings as they're generated
3. **Priority queue**: Index recently modified files first
4. **Diff-based updates**: For small edits, update only affected chunks
5. **OCR integration**: Extract text from images in notes

## Next Steps

- [AI Provider Interface](../api/llm-provider.md)
- [Tool Specifications](../api/tools.md)
- [Development Guide](../guides/development.md)
