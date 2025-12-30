import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import * as schema from '../../src/main/db/schema';
import {
  serializeEmbedding,
  deserializeEmbedding,
  cosineSimilarity,
} from '../../src/main/db/schema';
import {
  insertDocument,
  getDocumentByPath,
  deleteDocument,
  insertChunks,
  insertLinks,
  getBacklinks,
  searchNotesByVector,
} from '../../src/main/db/queries';
import { mockEmbedding } from '../fixtures/mockData';
import { TEST_DIR } from '../setup';

describe('Database Operations', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    // Use a unique on-disk database per test in the system tempdir to avoid interference from test cleanup
    dbPath = path.join(os.tmpdir(), `latent-unit-db-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (e) {
        // ignore transient errors
      }
    }

    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    // Create schema
    db.exec(`
      CREATE TABLE documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        checksum TEXT NOT NULL,
        title TEXT,
        word_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        last_indexed_at INTEGER,
        frontmatter TEXT
      );

      CREATE TABLE chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        embedding_model TEXT,
        chunk_index INTEGER NOT NULL,
        token_count INTEGER,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path TEXT NOT NULL,
        target_path TEXT NOT NULL,
        link_type TEXT DEFAULT 'wikilink',
        link_text TEXT,
        UNIQUE(source_path, target_path, link_type)
      );
    `);

    // Mock database functions to use this test database
    vi.spyOn(schema, 'getDatabase').mockReturnValue(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('Embedding Serialization', () => {
    it('should serialize embedding to buffer', () => {
      const vector = [0.1, 0.2, 0.3, 0.4];
      const buffer = serializeEmbedding(vector);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(vector.length * 4); // 4 bytes per float
    });

    it('should deserialize buffer to embedding', () => {
      const original = [0.1, 0.2, 0.3, 0.4];
      const buffer = serializeEmbedding(original);
      const deserialized = deserializeEmbedding(buffer);

      expect(deserialized).toHaveLength(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(deserialized[i]).toBeCloseTo(original[i], 5);
      }
    });

    it('should handle large embeddings', () => {
      const buffer = serializeEmbedding(mockEmbedding);
      const deserialized = deserializeEmbedding(buffer);

      expect(deserialized).toHaveLength(mockEmbedding.length);
    });
  });

  describe('Cosine Similarity', () => {
    it('should calculate similarity between identical vectors', () => {
      const vec = [1, 2, 3];
      const similarity = cosineSimilarity(vec, vec);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should calculate similarity between orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      const similarity = cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('should calculate similarity between opposite vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [-1, 0, 0];
      const similarity = cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should throw on mismatched vector lengths', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
    });

    it('should handle zero vectors', () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 2, 3];
      const similarity = cosineSimilarity(vec1, vec2);

      expect(similarity).toBe(0);
    });
  });

  describe('Document Operations', () => {
    it('should insert document', () => {
      const id = insertDocument({
        path: 'test.md',
        checksum: 'abc123',
        title: 'Test',
        wordCount: 100,
        createdAt: Date.now() / 1000,
        modifiedAt: Date.now() / 1000,
        frontmatter: { tags: ['test'] },
      });

      expect(id).toBeGreaterThan(0);
    });

    it('should retrieve document by path', () => {
      insertDocument({
        path: 'test.md',
        checksum: 'abc123',
        title: 'Test',
        wordCount: 100,
        createdAt: Date.now() / 1000,
        modifiedAt: Date.now() / 1000,
        frontmatter: null,
      });

      const doc = getDocumentByPath('test.md');

      expect(doc).not.toBeNull();
      expect(doc?.path).toBe('test.md');
      expect(doc?.title).toBe('Test');
    });

    it('should return null for non-existent document', () => {
      const doc = getDocumentByPath('nonexistent.md');
      expect(doc).toBeNull();
    });

    it('should delete document', () => {
      insertDocument({
        path: 'test.md',
        checksum: 'abc123',
        title: 'Test',
        wordCount: 100,
        createdAt: Date.now() / 1000,
        modifiedAt: Date.now() / 1000,
        frontmatter: null,
      });

      deleteDocument('test.md');

      const doc = getDocumentByPath('test.md');
      expect(doc).toBeNull();
    });
  });

  describe('Chunk Operations', () => {
    it('should insert chunks', () => {
      const docId = insertDocument({
        path: 'test.md',
        checksum: 'abc123',
        title: 'Test',
        wordCount: 100,
        createdAt: Date.now() / 1000,
        modifiedAt: Date.now() / 1000,
        frontmatter: null,
      });

      const chunks = [
        { content: 'Chunk 1', index: 0, tokenCount: 10 },
        { content: 'Chunk 2', index: 1, tokenCount: 12 },
      ];

      const embeddings = [mockEmbedding, mockEmbedding];

      insertChunks(docId, chunks, embeddings, 'test-model');

      const storedChunks = db.prepare('SELECT * FROM chunks WHERE document_id = ?').all(docId);

      expect(storedChunks).toHaveLength(2);
    });

    it('should cascade delete chunks when document deleted', () => {
      const docId = insertDocument({
        path: 'test.md',
        checksum: 'abc123',
        title: 'Test',
        wordCount: 100,
        createdAt: Date.now() / 1000,
        modifiedAt: Date.now() / 1000,
        frontmatter: null,
      });

      insertChunks(docId, [{ content: 'Chunk', index: 0, tokenCount: 10 }], [mockEmbedding], 'test-model');

      deleteDocument('test.md');

      const chunks = db.prepare('SELECT * FROM chunks WHERE document_id = ?').all(docId);
      expect(chunks).toHaveLength(0);
    });
  });

  describe('Link Operations', () => {
    it('should insert links', () => {
      insertLinks('source.md', [
        { type: 'wikilink', target: 'target1.md', text: 'Target 1' },
        { type: 'wikilink', target: 'target2.md', text: 'Target 2' },
      ]);

      const links = db.prepare('SELECT * FROM links WHERE source_path = ?').all('source.md');

      expect(links).toHaveLength(2);
    });

    it('should get backlinks', () => {
      insertLinks('source1.md', [{ type: 'wikilink', target: 'target.md', text: 'Target' }]);
      insertLinks('source2.md', [{ type: 'wikilink', target: 'target.md', text: 'Target' }]);

      // Need to insert documents for backlinks query to work
      insertDocument({
        path: 'source1.md',
        checksum: 'abc',
        title: 'Source 1',
        wordCount: 10,
        createdAt: Date.now() / 1000,
        modifiedAt: Date.now() / 1000,
        frontmatter: null,
      });

      insertDocument({
        path: 'source2.md',
        checksum: 'def',
        title: 'Source 2',
        wordCount: 10,
        createdAt: Date.now() / 1000,
        modifiedAt: Date.now() / 1000,
        frontmatter: null,
      });

      const backlinks = getBacklinks('target.md');

      expect(backlinks).toHaveLength(2);
      expect(backlinks.some((b) => b.source_path === 'source1.md')).toBe(true);
      expect(backlinks.some((b) => b.source_path === 'source2.md')).toBe(true);
    });

    it('should deduplicate links', () => {
      insertLinks('source.md', [
        { type: 'wikilink', target: 'target.md', text: 'Target' },
        { type: 'wikilink', target: 'target.md', text: 'Target' },
      ]);

      const links = db.prepare('SELECT * FROM links WHERE source_path = ?').all('source.md');

      // Should only insert once due to UNIQUE constraint
      expect(links).toHaveLength(1);
    });
  });

  describe('Vector Search', () => {
    it('should search by vector similarity', () => {
      // Insert test documents with embeddings
      const docId1 = insertDocument({
        path: 'doc1.md',
        checksum: 'abc',
        title: 'Document 1',
        wordCount: 10,
        createdAt: Date.now() / 1000,
        modifiedAt: Date.now() / 1000,
        frontmatter: null,
      });

      const docId2 = insertDocument({
        path: 'doc2.md',
        checksum: 'def',
        title: 'Document 2',
        wordCount: 10,
        createdAt: Date.now() / 1000,
        modifiedAt: Date.now() / 1000,
        frontmatter: null,
      });

      const embedding1 = new Array(100).fill(0).map(() => Math.random());
      const embedding2 = new Array(100).fill(0).map(() => Math.random());

      insertChunks(docId1, [{ content: 'Content 1', index: 0, tokenCount: 10 }], [embedding1], 'test');
      insertChunks(docId2, [{ content: 'Content 2', index: 0, tokenCount: 10 }], [embedding2], 'test');

      // Search with query embedding (similar to embedding1)
      const queryEmbedding = embedding1.map((v) => v + Math.random() * 0.01);
      const results = searchNotesByVector(queryEmbedding, 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should respect top_k parameter', () => {
      // Insert 5 documents
      for (let i = 0; i < 5; i++) {
        const docId = insertDocument({
          path: `doc${i}.md`,
          checksum: `checksum${i}`,
          title: `Document ${i}`,
          wordCount: 10,
          createdAt: Date.now() / 1000,
          modifiedAt: Date.now() / 1000,
          frontmatter: null,
        });

        const embedding = new Array(100).fill(0).map(() => Math.random());
        insertChunks(docId, [{ content: `Content ${i}`, index: 0, tokenCount: 10 }], [embedding], 'test');
      }

      const queryEmbedding = new Array(100).fill(0).map(() => Math.random());
      const results = searchNotesByVector(queryEmbedding, 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });
});
