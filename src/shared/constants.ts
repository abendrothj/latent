// Application constants

export const APP_NAME = 'Latent';
export const APP_VERSION = '0.1.0';

// Database
export const DB_FILE_NAME = 'latent.db';
export const SCHEMA_VERSION = 1;

// Indexer
export const DEFAULT_CHUNK_SIZE = 500;
export const DEFAULT_CHUNK_OVERLAP = 50;
export const DEFAULT_BATCH_SIZE = 10;
export const DEBOUNCE_DELAY_MS = 1000;

// Search
export const DEFAULT_TOP_K = 10;
export const MIN_SIMILARITY_SCORE = 0.5;

// File watching
export const WATCH_PATTERNS = ['**/*.md'];
export const IGNORED_PATTERNS = [/(^|[/\\])\../]; // Ignore dotfiles

// Settings keys
export const SETTINGS_KEYS = {
  AI_PROVIDER: 'ai.provider',
  AI_EMBEDDING: 'ai.embedding',
  VAULT_PATH: 'vault.path',
  INDEXER_CHUNK_SIZE: 'indexer.chunkSize',
  INDEXER_CHUNK_OVERLAP: 'indexer.chunkOverlap',
  INDEXER_AUTO_INDEX: 'indexer.autoIndex',
} as const;

// IPC Channels
export const IPC_CHANNELS = {
  // Settings
  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',

  // Documents
  GET_DOCUMENT: 'document:get',
  LIST_DOCUMENTS: 'document:list',
  SEARCH_DOCUMENTS: 'document:search',

  // Tools
  READ_NOTE: 'tool:read-note',
  SEARCH_NOTES: 'tool:search-notes',
  WRITE_NOTE: 'tool:write-note',
  UPDATE_FRONTMATTER: 'tool:update-frontmatter',
  LIST_BACKLINKS: 'tool:list-backlinks',

  // AI
  CHAT: 'ai:chat',
  CHAT_STREAM: 'ai:chat-stream',

  // Indexer
  START_INDEXER: 'indexer:start',
  STOP_INDEXER: 'indexer:stop',
  INDEXER_PROGRESS: 'indexer:progress',
  REINDEX_ALL: 'indexer:reindex-all',

  // Vault
  GET_VAULT_PATH: 'vault:get-path',
  SET_VAULT_PATH: 'vault:set-path',
} as const;

// Default settings
export const DEFAULT_SETTINGS: {
  ai: {
    provider: {
      type: 'openai';
      model: string;
    };
    embedding: {
      provider: 'api';
      model: string;
    };
  };
  vault: {
    path: string;
  };
  indexer: {
    chunkSize: number;
    chunkOverlap: number;
    autoIndex: boolean;
  };
} = {
  ai: {
    provider: {
      type: 'openai',
      model: 'gpt-4o',
    },
    embedding: {
      provider: 'api',
      model: 'text-embedding-3-small',
    },
  },
  vault: {
    path: './vault',
  },
  indexer: {
    chunkSize: DEFAULT_CHUNK_SIZE,
    chunkOverlap: DEFAULT_CHUNK_OVERLAP,
    autoIndex: true,
  },
};
