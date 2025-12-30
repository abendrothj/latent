import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { DB_FILE_NAME, SCHEMA_VERSION } from '../../shared/constants';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), DB_FILE_NAME);
  console.log(`Initializing database at: ${dbPath}`);

  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create schema
  createSchema(db);

  // Run migrations if needed
  runMigrations(db);

  console.log('Database initialized successfully');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function createSchema(db: Database.Database): void {
  // Check if schema exists
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[];

  if (tables.length > 0) {
    console.log('Schema already exists, skipping creation');
    return;
  }

  console.log('Creating database schema...');

  // Schema version table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Documents table
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
    )
  `);

  // Indexes for documents
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
    CREATE INDEX IF NOT EXISTS idx_documents_modified ON documents(modified_at DESC);
    CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);
  `);

  // Chunks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      embedding_model TEXT,
      chunk_index INTEGER NOT NULL,
      token_count INTEGER,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);

  // Indexes for chunks
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_chunk_index ON chunks(document_id, chunk_index);
  `);

  // Links table
  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL,
      target_path TEXT NOT NULL,
      link_type TEXT DEFAULT 'wikilink',
      link_text TEXT,
      UNIQUE(source_path, target_path, link_type)
    )
  `);

  // Indexes for links
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Insert initial schema version
  db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);

  console.log('Schema created successfully');
}

function runMigrations(db: Database.Database): void {
  const currentVersion =
    (db.prepare('SELECT MAX(version) as version FROM schema_version').get() as any)?.version || 0;

  console.log(`Current schema version: ${currentVersion}`);

  if (currentVersion >= SCHEMA_VERSION) {
    console.log('Schema is up to date');
    return;
  }

  console.log(`Running migrations from version ${currentVersion} to ${SCHEMA_VERSION}...`);

  // Add migrations here as needed
  const migrations: Array<{
    version: number;
    up: (db: Database.Database) => void;
  }> = [
    // Example migration:
    // {
    //   version: 2,
    //   up: (db) => {
    //     db.exec('ALTER TABLE documents ADD COLUMN summary TEXT');
    //   },
    // },
  ];

  db.transaction(() => {
    for (const migration of migrations) {
      if (migration.version > currentVersion && migration.version <= SCHEMA_VERSION) {
        console.log(`Applying migration ${migration.version}...`);
        migration.up(db);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version);
      }
    }
  })();

  console.log('Migrations completed');
}

// Helper functions for common operations

export function serializeEmbedding(vector: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  vector.forEach((val, i) => buffer.writeFloatLE(val, i * 4));
  return buffer;
}

export function deserializeEmbedding(buffer: Buffer): number[] {
  const vector: number[] = [];
  for (let i = 0; i < buffer.length; i += 4) {
    vector.push(buffer.readFloatLE(i));
  }
  return vector;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
