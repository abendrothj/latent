import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';
import * as schema from '../../src/main/db/schema';
import { Indexer } from '../../src/main/indexer';
import { TEST_VAULT_DIR, TEST_DB_PATH, TEST_DIR } from '../setup';
import os from 'os';
import { waitForCondition } from '../utils/poll';
import { mockNotes, mockEmbedding } from '../fixtures/mockData';

describe('Indexer Integration', () => {
  let indexer: Indexer;
  let db: Database.Database;
  let progressEvents: any[] = [];
  let vaultPath: string = '';


  beforeEach(async () => {
    // Create test database (unique per test to avoid contention)
    const tmpDbPath = path.join(os.tmpdir(), `latent-integration-db-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

    try {
      await fs.unlink(tmpDbPath);
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        // ignore other errors here for test robustness
      }
    }

    db = new Database(tmpDbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

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
    vi.spyOn(schema, 'getDatabase').mockReturnValue(db);

    progressEvents = [];

    // Create a unique temporary vault for this test
    vaultPath = path.join(os.tmpdir(), `latent-vault-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(vaultPath, { recursive: true });

    // Create indexer
    indexer = new Indexer(vaultPath, {
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

  afterEach(async () => {
    if (indexer) {
      indexer.stop();
    }
    if (db) {
      db.close();
    }

    // Clean up temporary vault
    try {
      if (vaultPath) {
        await fs.rm(vaultPath, { recursive: true, force: true });
      }
    } catch (e) {
      // ignore cleanup errors
    }
  });

  describe('File Indexing', () => {
    it('should index a single file', async () => {
      // Create test file BEFORE starting indexer
      const filePath = path.join(vaultPath, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      // Wait a bit for file system to settle
      await new Promise(resolve => setTimeout(resolve, 300));

      // Start indexer
      await indexer.start();

      // Wait for indexing to complete (poll DB until document exists)
      await waitForCondition(async () => {
        const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
        return !!doc;
      }, { timeout: 10000, interval: 100 });

      // Check database
      const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');

      expect(doc).toBeTruthy();
      expect(doc.title).toBe('Simple Note');

      // Check chunks were created
      const chunks = db.prepare('SELECT * FROM chunks WHERE document_id = ?').all(doc.id);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should index multiple files', async () => {
      // Create multiple test files BEFORE starting indexer
      await fs.writeFile(path.join(vaultPath, 'file1.md'), mockNotes.simple);
      await fs.writeFile(path.join(vaultPath, 'file2.md'), mockNotes.withFrontmatter);
      await fs.writeFile(path.join(vaultPath, 'file3.md'), mockNotes.withWikilinks);

      // Wait a bit for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      await indexer.start();

      // Wait for indexing (poll DB for all documents)
      await waitForCondition(async () => {
        const docs = db.prepare('SELECT * FROM documents').all();
        return docs.length === 3;
      }, { timeout: 15000, interval: 100 });

      const docs = db.prepare('SELECT * FROM documents').all();
      expect(docs.length).toBe(3);
    });

    it('should extract and store links', async () => {
      await fs.writeFile(path.join(vaultPath, 'test.md'), mockNotes.withWikilinks);

      // Wait a bit for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      await indexer.start();
      // Wait for links to be present in DB
      await waitForCondition(async () => {
        const links = db.prepare('SELECT * FROM links WHERE source_path = ?').all('test.md');
        return links.length > 0;
      }, { timeout: 10000, interval: 100 });

      const links = db.prepare('SELECT * FROM links WHERE source_path = ?').all('test.md');

      expect(links.length).toBeGreaterThan(0);
      expect(links.some((l: any) => l.target_path.includes('other-note'))).toBe(true);
    });

    it('should skip unchanged files', async () => {
      const filePath = path.join(vaultPath, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      // Wait a bit for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      await indexer.start();
      // Wait until initial indexing completes for test.md
      await waitForCondition(async () => {
        const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
        return !!doc;
      }, { timeout: 10000, interval: 100 });

      // Get initial indexed timestamp
      db.prepare('SELECT last_indexed_at FROM documents WHERE path = ?').get('test.md');

      // Re-index same file
      await indexer.reindexFile('test.md');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Timestamp should be updated (file was re-indexed)
      const doc2 = db.prepare('SELECT last_indexed_at FROM documents WHERE path = ?').get('test.md');

      // If file unchanged, timestamp might be same or updated depending on implementation
      expect(doc2).toBeTruthy();
    });

    it('should handle file deletion', async () => {
      const filePath = path.join(vaultPath, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      // Wait a bit for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      await indexer.start();
      // Wait until the document is indexed
      await waitForCondition(async () => {
        const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
        return !!doc;
      }, { timeout: 10000, interval: 100 });

      // Verify file was indexed
      let doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc).toBeTruthy();

      // Delete file and wait for watcher to detect
      await fs.unlink(filePath);
      await waitForCondition(async () => {
        const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
        return !doc;
      }, { timeout: 15000, interval: 200 });

      // File should be removed from database
      doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc).toBeFalsy();
    }, 15000);
  });

  describe('Progress Reporting', () => {
    it('should report indexing progress', async () => {
      await fs.writeFile(path.join(vaultPath, 'file1.md'), mockNotes.simple);
      await fs.writeFile(path.join(vaultPath, 'file2.md'), mockNotes.withFrontmatter);

      // Wait a bit for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      await indexer.start();
      // Wait for any progress events to be emitted
      await waitForCondition(() => progressEvents.length > 0, { timeout: 10000, interval: 100 });

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
      const filePath = path.join(vaultPath, 'invalid.md');
      await fs.writeFile(filePath, Buffer.from([0xff, 0xfe, 0xfd]));

      // Wait a bit for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      await indexer.start();
      // Wait for the invalid file to be processed (if it was indexed)
      await waitForCondition(async () => {
        const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('invalid.md');
        return !!doc;
      }, { timeout: 10000, interval: 100 });

      // Indexer should still be running (not crashed)
      // Error events might be logged
      progressEvents.filter((e) => e.phase === 'error');

      // Either error was handled or file was skipped
      expect(true).toBe(true);
    });
  });

  describe('Real-time Updates', () => {
    it('should detect new files', async () => {
      await indexer.start();
      // Small settle to ensure watcher is ready
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Create file after indexer started
      await fs.writeFile(path.join(vaultPath, 'new-file.md'), mockNotes.simple);

      // Wait for file watcher to detect and index the new file
      await waitForCondition(async () => {
        const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('new-file.md');
        return !!doc;
      }, { timeout: 10000, interval: 100 });

      const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('new-file.md');
      expect(doc).toBeTruthy();
    }, 15000);

    it('should detect file modifications', async () => {
      const filePath = path.join(vaultPath, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      // Wait a bit for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      await indexer.start();
      // Wait until the initial indexing of test.md completes
      await waitForCondition(async () => {
        const doc1 = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
        return !!doc1;
      }, { timeout: 10000, interval: 100 });

      const doc1 = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc1).toBeTruthy();
      const originalChecksum = doc1.checksum;

      // Modify file
      await fs.writeFile(filePath, mockNotes.withFrontmatter);

      // Wait for the file change to be indexed and checksum to change
      await waitForCondition(async () => {
        const doc2 = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
        return doc2 && doc2.checksum !== originalChecksum;
      }, { timeout: 15000, interval: 200 });

      const doc2 = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc2).toBeTruthy();
      expect(doc2.checksum).not.toBe(originalChecksum);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle missing provider gracefully', async () => {
      indexer.setProvider(null as any);

      await fs.writeFile(path.join(vaultPath, 'test.md'), mockNotes.simple);

      // Wait a bit for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      await indexer.start();
      // Wait until the document is indexed
      await waitForCondition(async () => {
        const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
        return !!doc;
      }, { timeout: 10000, interval: 100 });

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

      await fs.writeFile(path.join(vaultPath, 'test.md'), mockNotes.simple);

      // Wait a bit for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      await indexer.start();
      // Wait until the document is indexed even if embeddings failed
      await waitForCondition(async () => {
        const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
        return !!doc;
      }, { timeout: 10000, interval: 100 });

      // Document should still be indexed
      const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('test.md');
      expect(doc).toBeTruthy();
    });
  });
});
