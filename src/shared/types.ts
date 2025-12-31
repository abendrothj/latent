// Core domain types shared between main and renderer processes

export interface Document {
  id: number;
  path: string;
  checksum: string;
  title: string | null;
  word_count: number;
  created_at: number;
  modified_at: number;
  last_indexed_at: number | null;
  frontmatter: string | null;
}

export interface Chunk {
  id: number;
  document_id: number;
  content: string;
  embedding: Buffer | null;
  embedding_model: string | null;
  chunk_index: number;
  token_count: number | null;
}

export interface Link {
  id: number;
  source_path: string;
  target_path: string;
  link_type: 'wikilink' | 'markdown' | 'embed';
  link_text: string | null;
}

export interface Settings {
  key: string;
  value: string;
  updated_at: number;
}

// AI Provider Types

export type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export interface ChatRequest {
  messages: Message[];
  tools?: Tool[];
  tool_choice?: 'auto' | 'required' | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

export interface ChatResponse {
  message: Message;
  tool_calls?: ToolCall[];
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatStreamChunk {
  delta: {
    role?: 'assistant';
    content?: string;
    tool_calls?: Partial<ToolCall>[];
  };
  finish_reason?: ChatResponse['finish_reason'];
}

export interface EmbedRequest {
  input: string | string[];
  model?: string;
}

export interface EmbedResponse {
  embeddings: number[][];
  model: string;
  usage?: {
    prompt_tokens: number;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        description: string;
        enum?: any[];
        items?: any;
      }>;
      required: string[];
    };
  };
}

// Provider Configuration

export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'custom';

export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  chatEndpoint?: string;
  embedEndpoint?: string;
  headers?: Record<string, string>;
}

export interface AISettings {
  provider: ProviderConfig;
  embedding: {
    provider: 'api' | 'local';
    model?: string;
  };
}

export interface VaultSettings {
  path: string;
}

export interface IndexerSettings {
  chunkSize: number;
  chunkOverlap: number;
  autoIndex: boolean;
}

// Tool Arguments and Results

export interface ReadNoteArgs {
  path: string;
}

export interface SearchNotesArgs {
  query: string;
  top_k?: number;
  filter?: {
    tags?: string[];
    date_after?: string;
    date_before?: string;
  };
}

export interface SearchResult {
  path: string;
  title: string;
  chunk: string;
  score: number;
}

export interface WriteNoteArgs {
  path: string;
  content: string;
}

export interface RenameNoteArgs {
  oldPath: string;
  newPath: string;
}

export interface DeleteNoteArgs {
  path: string;
}

export interface UpdateFrontmatterArgs {
  path: string;
  updates: Record<string, any>;
}

export interface ListBacklinksArgs {
  path: string;
}

export interface Backlink {
  source_path: string;
  source_title: string;
  link_text: string;
  link_type: string;
}

// Indexer Types

export interface IndexProgress {
  phase: 'scanning' | 'indexing' | 'complete' | 'error';
  current: number;
  total: number;
  currentFile?: string;
  error?: string;
}

export interface ParsedDocument {
  frontmatter: Record<string, any>;
  title: string | null;
  content: string;
  links: ParsedLink[];
}

export interface ParsedLink {
  type: 'wikilink' | 'markdown' | 'embed';
  target: string;
  text: string;
}

export interface TextChunk {
  content: string;
  index: number;
  tokenCount: number;
}

// IPC Types

export interface IPCRequest {
  channel: string;
  args: any[];
}

export interface IPCResponse {
  success: boolean;
  data?: any;
  error?: string;
}
