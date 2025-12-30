import { getDatabase, serializeEmbedding, deserializeEmbedding, cosineSimilarity } from './schema';
import type {
  Document,
  Chunk,
  Link,
  Settings,
  SearchResult,
  Backlink,
  TextChunk,
  ParsedLink,
} from '../../shared/types';
import { DEFAULT_TOP_K, MIN_SIMILARITY_SCORE } from '../../shared/constants';

// Document Queries

export function getDocumentByPath(path: string): Document | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM documents WHERE path = ?').get(path) as Document | null;
}

export function getAllDocuments(): Document[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM documents ORDER BY modified_at DESC').all() as Document[];
}

export function insertDocument(data: {
  path: string;
  checksum: string;
  title: string | null;
  wordCount: number;
  createdAt: number;
  modifiedAt: number;
  frontmatter: Record<string, any> | null;
}): number {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    INSERT INTO documents (path, checksum, title, word_count, created_at, modified_at, last_indexed_at, frontmatter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      data.path,
      data.checksum,
      data.title,
      data.wordCount,
      data.createdAt,
      data.modifiedAt,
      Math.floor(Date.now() / 1000),
      data.frontmatter ? JSON.stringify(data.frontmatter) : null
    );

  return result.lastInsertRowid as number;
}

export function deleteDocument(path: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM documents WHERE path = ?').run(path);
}

// Chunk Queries

export function getChunksByDocumentId(documentId: number): Chunk[] {
  const db = getDatabase();
  return db
    .prepare('SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index')
    .all(documentId) as Chunk[];
}

export function insertChunks(
  documentId: number,
  chunks: TextChunk[],
  embeddings: (number[] | null)[],
  embeddingModel: string
): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO chunks (document_id, content, embedding, embedding_model, chunk_index, token_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];

    stmt.run(
      documentId,
      chunk.content,
      embedding ? serializeEmbedding(embedding) : null,
      embedding ? embeddingModel : null,
      chunk.index,
      chunk.tokenCount
    );
  }
}

// Link Queries

export function getLinksBySourcePath(sourcePath: string): Link[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM links WHERE source_path = ?').all(sourcePath) as Link[];
}

export function getBacklinks(targetPath: string): Backlink[] {
  const db = getDatabase();
  return db
    .prepare(
      `
    SELECT l.source_path, l.link_text, l.link_type, d.title AS source_title
    FROM links l
    LEFT JOIN documents d ON l.source_path = d.path
    WHERE l.target_path = ?
    ORDER BY d.title
  `
    )
    .all(targetPath) as Backlink[];
}

export function insertLinks(sourcePath: string, links: ParsedLink[]): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO links (source_path, target_path, link_type, link_text)
    VALUES (?, ?, ?, ?)
  `);

  for (const link of links) {
    stmt.run(sourcePath, link.target, link.type, link.text);
  }
}

export function deleteLinks(sourcePath: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM links WHERE source_path = ?').run(sourcePath);
}

// Settings Queries

export function getSetting(key: string): string | null {
  const db = getDatabase();
  const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | Settings
    | undefined;
  return result?.value || null;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.prepare(
    `
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, strftime('%s', 'now'))
  `
  ).run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM settings').all() as Settings[];

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Search Queries

export function searchNotesByVector(
  queryEmbedding: number[],
  topK: number = DEFAULT_TOP_K,
  filter?: {
    tags?: string[];
    dateAfter?: string;
    dateBefore?: string;
  }
): SearchResult[] {
  const db = getDatabase();

  // Build query with optional filters
  let sql = `
    SELECT c.*, d.path, d.title
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE c.embedding IS NOT NULL
  `;

  const params: any[] = [];

  if (filter?.tags && filter.tags.length > 0) {
    // Simple LIKE search in JSON frontmatter (can be improved with JSON1 extension)
    sql += ' AND d.frontmatter LIKE ?';
    params.push(`%${filter.tags[0]}%`);
  }

  if (filter?.dateAfter) {
    sql += ' AND d.modified_at >= ?';
    params.push(new Date(filter.dateAfter).getTime() / 1000);
  }

  if (filter?.dateBefore) {
    sql += ' AND d.modified_at <= ?';
    params.push(new Date(filter.dateBefore).getTime() / 1000);
  }

  const chunks = db.prepare(sql).all(...params) as (Chunk & { path: string; title: string })[];

  // Compute cosine similarity for each chunk
  const results: SearchResult[] = chunks
    .map((chunk) => {
      const chunkEmbedding = deserializeEmbedding(chunk.embedding!);
      const score = cosineSimilarity(queryEmbedding, chunkEmbedding);

      return {
        path: chunk.path,
        title: chunk.title || chunk.path,
        chunk: chunk.content,
        score,
      };
    })
    .filter((result) => result.score >= MIN_SIMILARITY_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

// Full-text search (simple version without FTS5)
export function searchNotesByText(query: string, topK: number = DEFAULT_TOP_K): SearchResult[] {
  const db = getDatabase();

  const results = db
    .prepare(
      `
    SELECT d.path, d.title, c.content, 1.0 as score
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE c.content LIKE ? OR d.title LIKE ?
    LIMIT ?
  `
    )
    .all(`%${query}%`, `%${query}%`, topK) as SearchResult[];

  return results;
}

// Transaction helper
export function runInTransaction<T>(fn: () => T): T {
  const db = getDatabase();
  return db.transaction(fn)();
}

// Full document indexing (combines document, chunks, links)
export function indexDocument(data: {
  path: string;
  checksum: string;
  title: string | null;
  wordCount: number;
  createdAt: number;
  modifiedAt: number;
  frontmatter: Record<string, any> | null;
  chunks: TextChunk[];
  embeddings: (number[] | null)[];
  embeddingModel: string;
  links: ParsedLink[];
}): void {
  runInTransaction(() => {
    // Delete existing document (cascades to chunks)
    deleteDocument(data.path);
    deleteLinks(data.path);

    // Insert new document
    const documentId = insertDocument({
      path: data.path,
      checksum: data.checksum,
      title: data.title,
      wordCount: data.wordCount,
      createdAt: data.createdAt,
      modifiedAt: data.modifiedAt,
      frontmatter: data.frontmatter,
    });

    // Insert chunks
    insertChunks(documentId, data.chunks, data.embeddings, data.embeddingModel);

    // Insert links
    insertLinks(data.path, data.links);
  });
}
