import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import type {
  Tool,
  ToolCall,
  ReadNoteArgs,
  SearchNotesArgs,
  SearchResult,
  WriteNoteArgs,
  UpdateFrontmatterArgs,
  ListBacklinksArgs,
  Backlink,
} from '../../shared/types';
import { getBacklinks, searchNotesByVector } from '../db/queries';
import { LLMProvider } from './provider';

let vaultPath: string = '';
let llmProvider: LLMProvider | null = null;

export function setVaultPath(path: string): void {
  vaultPath = path;
}

export function setLLMProvider(provider: LLMProvider): void {
  llmProvider = provider;
}

// Tool Definitions

export const READ_NOTE: Tool = {
  type: 'function',
  function: {
    name: 'read_note',
    description:
      'Read the full content of a specific note by its path. Use this when the user asks about a specific note or you need to see the complete contents of a file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the note from the vault root (e.g., "research/quantum.md")',
        },
      },
      required: ['path'],
    },
  },
};

export const SEARCH_NOTES: Tool = {
  type: 'function',
  function: {
    name: 'search_notes',
    description:
      'Search across all notes using semantic similarity. Returns the most relevant note chunks based on the query. Use this when you need to find information across multiple notes or when the user asks a broad question.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (natural language)',
        },
        top_k: {
          type: 'number',
          description: 'Number of results to return (default: 10)',
        },
        filter: {
          type: 'object',
          description: 'Optional filters (tags, date_after, date_before)',
        },
      },
      required: ['query'],
    },
  },
};

export const WRITE_NOTE: Tool = {
  type: 'function',
  function: {
    name: 'write_note',
    description:
      'Create a new note or overwrite an existing note. The content should be in Markdown format. Use this when the user asks you to create or update a note.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path for the note (e.g., "summaries/conversation-2024-01-15.md")',
        },
        content: {
          type: 'string',
          description: 'Full Markdown content of the note, including frontmatter if needed',
        },
      },
      required: ['path', 'content'],
    },
  },
};

export const UPDATE_FRONTMATTER: Tool = {
  type: 'function',
  function: {
    name: 'update_frontmatter',
    description:
      "Update or add fields to a note's YAML frontmatter. Use this to update metadata without modifying the note content.",
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the note',
        },
        updates: {
          type: 'object',
          description: 'Key-value pairs to update in frontmatter',
        },
      },
      required: ['path', 'updates'],
    },
  },
};

export const LIST_BACKLINKS: Tool = {
  type: 'function',
  function: {
    name: 'list_backlinks',
    description:
      'Find all notes that link to a specific note. Useful for understanding connections in the knowledge graph.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the note',
        },
      },
      required: ['path'],
    },
  },
};

export const ALL_TOOLS: Tool[] = [
  READ_NOTE,
  SEARCH_NOTES,
  WRITE_NOTE,
  UPDATE_FRONTMATTER,
  LIST_BACKLINKS,
];

// Tool Implementations

function validatePath(requestedPath: string): string {
  const fullPath = path.resolve(vaultPath, requestedPath);

  // Debug: log paths for test diagnostics
  console.log(`[Tools] validatePath -> vaultPath=${vaultPath}, requestedPath=${requestedPath}, fullPath=${fullPath}`);

  // Prevent directory traversal attacks
  if (!fullPath.startsWith(path.resolve(vaultPath))) {
    throw new Error('Invalid path: must be within vault directory');
  }

  return fullPath;
}

async function readNote(args: ReadNoteArgs): Promise<string> {
  const fullPath = validatePath(args.path);

  // Be tolerant of transient FS races in tests/environments by retrying briefly on ENOENT
  const attempts = 10;
  const backoffMs = 200;
  for (let i = 0; i < attempts; i++) {
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        if (i < attempts - 1) {
          // slightly larger backoff to tolerate slower test environments
          await new Promise((res) => setTimeout(res, backoffMs));
          continue;
        }
        throw new Error(`Note not found: ${args.path}`);
      }
      throw error;
    }
  }

  // Should not reach here
  throw new Error(`Note not found: ${args.path}`);
}

async function searchNotes(args: SearchNotesArgs): Promise<SearchResult[]> {
  if (!llmProvider) {
    throw new Error('LLM provider not initialized');
  }

  // Generate query embedding
  const embedResponse = await llmProvider.embed({ input: args.query });
  const queryEmbedding = embedResponse.embeddings[0];

  // Search database
  const results = searchNotesByVector(queryEmbedding, args.top_k, {
    tags: args.filter?.tags,
    dateAfter: args.filter?.date_after,
    dateBefore: args.filter?.date_before,
  });

  return results;
}

async function writeNote(args: WriteNoteArgs): Promise<string> {
  const fullPath = validatePath(args.path);

  // Create parent directories if needed
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  // Write file
  await fs.writeFile(fullPath, args.content, 'utf-8');

  // TODO: Trigger re-indexing via indexer worker

  return `Note created successfully: ${args.path}`;
}

async function updateFrontmatter(args: UpdateFrontmatterArgs): Promise<string> {
  const fullPath = validatePath(args.path);

  // Read existing file
  const content = await fs.readFile(fullPath, 'utf-8');

  // Parse frontmatter
  const parsed = matter(content);

  // Merge updates
  const updatedData = { ...parsed.data, ...args.updates };

  // Stringify back
  const updated = matter.stringify(parsed.content, updatedData);

  // Write file
  await fs.writeFile(fullPath, updated, 'utf-8');

  // TODO: Trigger re-indexing

  return `Frontmatter updated for ${args.path}: ${JSON.stringify(args.updates)}`;
}

async function listBacklinks(args: ListBacklinksArgs): Promise<Backlink[]> {
  return getBacklinks(args.path);
}

// Tool Executor

export async function executeToolCall(toolCall: ToolCall): Promise<any> {
  const args = JSON.parse(toolCall.function.arguments);

  console.log(`[Tools] Executing ${toolCall.function.name} with args:`, args);

  switch (toolCall.function.name) {
    case 'read_note':
      return await readNote(args);

    case 'search_notes':
      return await searchNotes(args);

    case 'write_note':
      return await writeNote(args);

    case 'update_frontmatter':
      return await updateFrontmatter(args);

    case 'list_backlinks':
      return await listBacklinks(args);

    default:
      throw new Error(`Unknown tool: ${toolCall.function.name}`);
  }
}
