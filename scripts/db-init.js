#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('Initializing database...');

const dbPath = path.join(__dirname, '..', 'latent.db');

// Create database
const db = new Database(dbPath);

// Enable WAL mode
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create schema
console.log('Creating schema...');

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

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

  CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
  CREATE INDEX IF NOT EXISTS idx_documents_modified ON documents(modified_at DESC);
  CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);

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

  CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_chunk_index ON chunks(document_id, chunk_index);

  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    link_type TEXT DEFAULT 'wikilink',
    link_text TEXT,
    UNIQUE(source_path, target_path, link_type)
  );

  CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path);
  CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  INSERT OR IGNORE INTO schema_version (version) VALUES (1);
`);

db.close();

console.log('✓ Database initialized successfully');
console.log(`  Location: ${dbPath}`);
