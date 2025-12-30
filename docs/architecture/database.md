# Database Schema

## Overview

Latent uses SQLite as a **metadata index** and **vector store**. The filesystem (`vault/*.md`) remains the source of truth. The database enables fast queries for:

- Full-text search
- Vector similarity search (semantic search)
- Graph queries (backlinks, forward links)
- Metadata filtering (tags, dates, etc.)

## Schema Design Principles

1. **Denormalization for Read Performance**: Optimize for queries, not storage
2. **Filesystem Path as Key**: Use relative file paths as stable identifiers
3. **Idempotent Indexing**: Re-indexing the same file produces the same result
4. **Cascade Deletes**: Removing a document removes all associated chunks/links

## Core Tables

### `documents`

Represents a single Markdown file in the vault.

```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,              -- Relative path from vault root (e.g., "research/quantum.md")
  checksum TEXT NOT NULL,                 -- SHA-256 hash of file content
  title TEXT,                             -- Extracted from frontmatter or first H1
  word_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,            -- Unix timestamp (from file system)
  modified_at INTEGER NOT NULL,           -- Unix timestamp (from file system)
  last_indexed_at INTEGER,                -- Unix timestamp (when indexed)
  frontmatter TEXT                        -- JSON-serialized YAML frontmatter
);

CREATE INDEX idx_documents_path ON documents(path);
CREATE INDEX idx_documents_modified ON documents(modified_at DESC);
CREATE INDEX idx_documents_title ON documents(title);
```

**Columns**:
- `path`: Canonical identifier (relative to vault, normalized)
- `checksum`: Used to detect content changes without re-reading file
- `title`: For display in UI (fallback to filename if not found)
- `word_count`: For analytics/stats
- `frontmatter`: Stored as JSON for flexible querying (tags, custom fields)

**Example Row**:
```json
{
  "id": 1,
  "path": "research/quantum-computing.md",
  "checksum": "a3f5...",
  "title": "Quantum Computing Overview",
  "word_count": 1247,
  "created_at": 1704067200,
  "modified_at": 1704153600,
  "last_indexed_at": 1704153650,
  "frontmatter": "{\"tags\": [\"physics\", \"computing\"], \"author\": \"...\"}""
}
```

---

### `chunks`

Text chunks for vector embedding and retrieval.

```sql
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  content TEXT NOT NULL,                  -- Raw chunk text (~500 tokens)
  embedding BLOB,                         -- Float32 vector (serialized)
  embedding_model TEXT,                   -- Model used (e.g., "text-embedding-3-small")
  chunk_index INTEGER NOT NULL,           -- Position in document (0-indexed)
  token_count INTEGER,                    -- Approximate token count
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_chunk_index ON chunks(document_id, chunk_index);
```

**Columns**:
- `content`: The actual text (used for display in search results)
- `embedding`: Binary blob of `float32[]` (e.g., 1536 dimensions for OpenAI)
- `embedding_model`: Track which model generated the embedding (allows migration)
- `chunk_index`: Preserve order for reconstructing full document

**Chunking Strategy**:
- Target: ~500 tokens per chunk (configurable)
- Overlap: 50 tokens between consecutive chunks (prevents splitting semantic units)
- Respect boundaries: Don't split mid-sentence

**Example Row**:
```json
{
  "id": 42,
  "document_id": 1,
  "content": "Quantum computing leverages quantum mechanical phenomena...",
  "embedding": "<binary blob>",
  "embedding_model": "text-embedding-3-small",
  "chunk_index": 0,
  "token_count": 487
}
```

---

### `links`

Bidirectional links between documents (wikilinks `[[target]]` or Markdown links).

```sql
CREATE TABLE links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL,              -- Document containing the link
  target_path TEXT NOT NULL,              -- Linked document
  link_type TEXT DEFAULT 'wikilink',      -- 'wikilink' | 'markdown' | 'embed'
  link_text TEXT,                         -- Display text (may differ from target)
  UNIQUE(source_path, target_path, link_type)
);

CREATE INDEX idx_links_source ON links(source_path);
CREATE INDEX idx_links_target ON links(target_path);
```

**Link Types**:
- `wikilink`: `[[Target Document]]` or `[[target-document|Display Text]]`
- `markdown`: `[Display Text](path/to/file.md)`
- `embed`: `![[image.png]]` or `![[other-note]]`

**Example Rows**:
```json
[
  {
    "source_path": "research/quantum-computing.md",
    "target_path": "concepts/superposition.md",
    "link_type": "wikilink",
    "link_text": "superposition"
  },
  {
    "source_path": "research/quantum-computing.md",
    "target_path": "papers/shor-algorithm.md",
    "link_type": "markdown",
    "link_text": "Shor's Algorithm Paper"
  }
]
```

**Backlinks Query**:
```sql
-- Find all documents linking TO a given document
SELECT source_path, link_text
FROM links
WHERE target_path = 'research/quantum-computing.md';
```

---

### `settings`

Application configuration (AI provider, vault path, indexer settings).

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                    -- JSON-serialized value
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**Example Rows**:
```json
[
  {
    "key": "ai.provider",
    "value": "\"openai\"",
    "updated_at": 1704153600
  },
  {
    "key": "ai.apiKey",
    "value": "\"sk-...\"",  // In production, encrypt this
    "updated_at": 1704153600
  },
  {
    "key": "vault.path",
    "value": "\"/Users/alice/Documents/vault\"",
    "updated_at": 1704067200
  },
  {
    "key": "indexer.chunkSize",
    "value": "500",
    "updated_at": 1704067200
  }
]
```

---

## Vector Search Implementation

### Approach 1: In-Memory Search (V0)
For MVP, load all embeddings into memory and use brute-force cosine similarity:

```typescript
function searchVectors(queryEmbedding: number[], topK: number = 10): Chunk[] {
  const chunks = db.prepare('SELECT * FROM chunks WHERE embedding IS NOT NULL').all();

  const results = chunks.map(chunk => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, deserializeEmbedding(chunk.embedding))
  }));

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(r => r.chunk);
}
```

**Pros**: Simple, no dependencies, fast for <10K chunks
**Cons**: O(n) complexity, memory usage scales with vault size

### Approach 2: SQLite-vec Extension (Post-V0)
Use [sqlite-vec](https://github.com/asg017/sqlite-vec) for native vector search:

```sql
-- Create virtual table for vector search
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[1536]
);

-- Query similar vectors
SELECT chunk_id, distance
FROM vec_chunks
WHERE embedding MATCH ?
ORDER BY distance
LIMIT 10;
```

**Pros**: O(log n) with indexing, stays in SQLite, no external service
**Cons**: Requires compiling native extension

### Approach 3: External Vector DB (Future)
For large vaults (>100K chunks), delegate to specialized vector DB:
- **Qdrant**: Self-hosted, Rust-based, excellent performance
- **Chroma**: Embedded or client-server mode
- **Milvus**: Enterprise-grade, overkill for personal use

**Decision for V0**: Use Approach 1 (in-memory). Optimize later based on real usage.

---

## Indexing Strategy

### Initial Indexing
```sql
-- Check if file needs indexing
SELECT checksum FROM documents WHERE path = ?;

-- If checksum differs or document not found:
BEGIN TRANSACTION;

-- Delete existing data
DELETE FROM documents WHERE path = ?;
-- (CASCADE deletes chunks and links automatically)

-- Insert new document
INSERT INTO documents (path, checksum, title, word_count, created_at, modified_at, last_indexed_at, frontmatter)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);

-- Insert chunks
INSERT INTO chunks (document_id, content, embedding, embedding_model, chunk_index, token_count)
VALUES (?, ?, ?, ?, ?, ?);
-- (repeat for each chunk)

-- Insert links
INSERT OR IGNORE INTO links (source_path, target_path, link_type, link_text)
VALUES (?, ?, ?, ?);
-- (repeat for each link)

COMMIT;
```

### Incremental Updates
- File modified → Re-index entire file (simpler than diffing)
- File deleted → `DELETE FROM documents WHERE path = ?` (cascades)
- File renamed → Treat as delete + create (update links)

### Batch Processing
For initial vault scan:
```typescript
const files = getAllMarkdownFiles(vaultPath);
const batchSize = 10;

for (let i = 0; i < files.length; i += batchSize) {
  const batch = files.slice(i, i + batchSize);
  await Promise.all(batch.map(file => indexFile(file)));

  // Report progress
  emitProgress({ indexed: i + batch.length, total: files.length });
}
```

---

## Query Examples

### Full-Text Search
```sql
-- Create FTS5 virtual table
CREATE VIRTUAL TABLE documents_fts USING fts5(path, title, content);

-- Search query
SELECT path, rank
FROM documents_fts
WHERE documents_fts MATCH 'quantum AND computing'
ORDER BY rank
LIMIT 10;
```

### Backlinks
```sql
-- All documents linking to a target
SELECT d.path, d.title, l.link_text
FROM links l
JOIN documents d ON l.source_path = d.path
WHERE l.target_path = ?
ORDER BY d.title;
```

### Tag-Based Filtering
```sql
-- Documents with specific tag (stored in frontmatter JSON)
SELECT path, title
FROM documents
WHERE json_extract(frontmatter, '$.tags') LIKE '%quantum%'
ORDER BY modified_at DESC;
```

### Recent Documents
```sql
SELECT path, title, modified_at
FROM documents
ORDER BY modified_at DESC
LIMIT 20;
```

---

## Migration Strategy

**Schema Versioning**:
```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER DEFAULT (strftime('%s', 'now'))
);

INSERT INTO schema_version (version) VALUES (1);
```

**Migration Flow**:
1. Check current schema version
2. Apply migrations sequentially (v1 → v2 → v3)
3. Each migration is idempotent (can be re-run safely)

**Example Migration** (v1 → v2):
```sql
-- Add embedding_model column to chunks
ALTER TABLE chunks ADD COLUMN embedding_model TEXT;

-- Update schema version
INSERT INTO schema_version (version) VALUES (2);
```

---

## Performance Considerations

### Indexes
- All foreign keys indexed
- Commonly queried columns indexed (path, modified_at, title)
- FTS5 for full-text search

### Query Optimization
```sql
-- EXPLAIN QUERY PLAN to verify index usage
EXPLAIN QUERY PLAN
SELECT * FROM documents WHERE path = 'research/quantum.md';
```

### Write Performance
- Batch inserts in transactions (100x faster)
- Use prepared statements (prevent SQL injection, faster execution)

### Database Size Estimates
- **10,000 documents** × 5KB average = 50MB raw text
- **Embeddings** (1536 dims × 4 bytes × 20 chunks/doc avg) = 1.2GB
- **Total**: ~1.5GB for large vault

---

## Backup & Recovery

**Backup**: Copy `latent.db` file (SQLite is a single file)

**Recovery**:
```bash
# Corruption detected
mv latent.db latent.db.backup

# Re-index from scratch
npm run reindex
```

**Validation**:
```sql
-- Check for orphaned chunks
SELECT COUNT(*) FROM chunks WHERE document_id NOT IN (SELECT id FROM documents);

-- Check for broken links
SELECT COUNT(*) FROM links WHERE source_path NOT IN (SELECT path FROM documents);
```

---

## Next Steps

- [Indexer Architecture](indexer.md) — How files are watched and processed
- [AI Provider Interface](../api/llm-provider.md) — How embeddings are generated
- [Tool Specifications](../api/tools.md) — How the AI queries the database
