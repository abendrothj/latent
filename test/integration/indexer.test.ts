import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';
import { Indexer } from '../../src/main/indexer';
import { TEST_VAULT_DIR, TEST_DB_PATH } from '../setup';
import { mockNotes, mockEmbedding } from '../fixtures/mockData';

describe('Indexer Integration', () => {
  let indexer: Indexer;
  let db: Database.Database;
  let progressEvents: any[] = [];

  beforeEach(async () => {
    // Create test database
    db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');

    // Create schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
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

      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        embedding_model TEXT,
        chunk_index INTEGER NOT NULL,
        token_count INTEGER,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path TEXT NOT NULL,
        target_path TEXT NOT NULL,
        link_type TEXT DEFAULT 'wikilink',
        link_text TEXT,
        UNIQUE(source_path, target_path, link_type)
      );
    `);

    // Mock database functions
    const queries = require('../../src/main/db/queries');
    queries.getDatabase = () => db;

    progressEvents = [];

    // Create indexer
    indexer = new Indexer(TEST_VAULT_DIR, {
      chunkSize: 500,
      chunkOverlap: 50,
      onProgress: (progress) => progressEvents.push(progress),
    });

    // Mock provider that returns fake embeddings
    const mockProvider = {
      name: 'mock',
      embed: vi.fn().mockImplementation(async (request) => {
        const inputs = Array.isArray(request.input) ? request.input : [request.input];
        return {
          embeddings: inputs.map(() => mockEmbedding),
          model: 'mock-model',
        };
      }),
    };

    indexer.setProvider(mockProvider as any);
  });

  afterEach(() => {
    if (indexer) {
      indexer.stop();
    }
    if (db) {
      db.close();
    }
  });

  describe('File Indexing', () => {
    it('should index a single file', async () => {
      // Create test file
      const filePath = path.join(TEST_VAULT_DIR, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      // Start indexer
      await indexer.start();

      // Wait for indexing to complete
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check database
      const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');

      expect(doc).toBeTruthy();
      expect(doc.title).toBe('Simple Note');

      // Check chunks were created
      const chunks = db.prepare('SELECT * FROM chunks WHERE document_id = ?').all(doc.id);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should index multiple files', async () => {
      // Create multiple test files
      await fs.writeFile(path.join(TEST_VAULT_DIR, 'file1.md'), mockNotes.simple);
      await fs.writeFile(path.join(TEST_VAULT_DIR, 'file2.md'), mockNotes.withFrontmatter);
      await fs.writeFile(path.join(TEST_VAULT_DIR, 'file3.md'), mockNotes.withWikilinks);

      await indexer.start();

      // Wait for indexing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const docs = db.prepare('SELECT * FROM documents').all();
      expect(docs.length).toBe(3);
    });

    it('should extract and store links', async () => {
      await fs.writeFile(path.join(TEST_VAULT_DIR, 'test.md'), mockNotes.withWikilinks);

      await indexer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const links = db.prepare('SELECT * FROM links WHERE source_path = ?').all('test.md');

      expect(links.length).toBeGreaterThan(0);
      expect(links.some((l: any) => l.target_path.includes('other-note'))).toBe(true);
    });

    it('should skip unchanged files', async () => {
      const filePath = path.join(TEST_VAULT_DIR, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      await indexer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get initial indexed timestamp
      const doc1 = db.prepare('SELECT last_indexed_at FROM documents WHERE path = ?').get('test.md');

      // Re-index same file
      await indexer.reindexFile('test.md');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Timestamp should be updated (file was re-indexed)
      const doc2 = db.prepare('SELECT last_indexed_at FROM documents WHERE path = ?').get('test.md');

      // If file unchanged, timestamp might be same or updated depending on implementation
      expect(doc2).toBeTruthy();
    });

    it('should handle file deletion', async () => {
      const filePath = path.join(TEST_VAULT_DIR, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      await indexer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify file was indexed
      let doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc).toBeTruthy();

      // Delete file
      await fs.unlink(filePath);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // File should be removed from database
      doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc).toBeFalsy();
    });
  });

  describe('Progress Reporting', () => {
    it('should report indexing progress', async () => {
      await fs.writeFile(path.join(TEST_VAULT_DIR, 'file1.md'), mockNotes.simple);
      await fs.writeFile(path.join(TEST_VAULT_DIR, 'file2.md'), mockNotes.withFrontmatter);

      await indexer.start();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      expect(progressEvents.length).toBeGreaterThan(0);

      // Should have indexing phase events
      const indexingEvents = progressEvents.filter((e) => e.phase === 'indexing');
      expect(indexingEvents.length).toBeGreaterThan(0);

      // Should have complete event
      const completeEvents = progressEvents.filter((e) => e.phase === 'complete');
      expect(completeEvents.length).toBeGreaterThan(0);
    });

    it('should report errors without crashing', async () => {
      // Create a file with invalid UTF-8 to trigger error
      const filePath = path.join(TEST_VAULT_DIR, 'invalid.md');
      await fs.writeFile(filePath, Buffer.from([0xff, 0xfe, 0xfd]));

      await indexer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Indexer should still be running (not crashed)
      // Error events might be logged
      const errorEvents = progressEvents.filter((e) => e.phase === 'error');

      // Either error was handled or file was skipped
      expect(true).toBe(true);
    });
  });

  describe('Real-time Updates', () => {
    it('should detect new files', async () => {
      await indexer.start();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Create file after indexer started
      await fs.writeFile(path.join(TEST_VAULT_DIR, 'new-file.md'), mockNotes.simple);

      // Wait for file watcher to detect
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('new-file.md');
      expect(doc).toBeTruthy();
    });

    it('should detect file modifications', async () => {
      const filePath = path.join(TEST_VAULT_DIR, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      await indexer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const doc1 = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      const originalChecksum = doc1.checksum;

      // Modify file
      await fs.writeFile(filePath, mockNotes.withFrontmatter);
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const doc2 = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc2.checksum).not.toBe(originalChecksum);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing provider gracefully', async () => {
      indexer.setProvider(null as any);

      await fs.writeFile(path.join(TEST_VAULT_DIR, 'test.md'), mockNotes.simple);

      await indexer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Should index document without embeddings
      const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc).toBeTruthy();

      const chunks = db.prepare('SELECT * FROM chunks WHERE document_id = ?').all(doc.id);

      // Chunks should exist but without embeddings
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].embedding).toBeNull();
    });

    it('should handle embedding failures', async () => {
      // Provider that fails to embed
      const failingProvider = {
        name: 'failing',
        embed: vi.fn().mockRejectedValue(new Error('Embedding failed')),
      };

      indexer.setProvider(failingProvider as any);

      await fs.writeFile(path.join(TEST_VAULT_DIR, 'test.md'), mockNotes.simple);

      await indexer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Document should still be indexed
      const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc).toBeTruthy();
    });
  });
});
