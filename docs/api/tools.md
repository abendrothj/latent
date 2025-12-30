# Tool Specifications

## Overview

Latent's AI agent is equipped with **tools** (also called "functions" or "function calling"). These tools allow the AI to interact with your notes programmatically:

- Read specific notes
- Search across all notes semantically
- Create new notes
- Update frontmatter metadata
- Query the link graph

## Tool Execution Flow

```
User: "What are my notes about quantum computing?"
    │
    ▼
AI decides to use tool: search_notes
    │
    ▼
Execute: search_notes({ query: "quantum computing", top_k: 5 })
    │
    ▼
Return results to AI
    │
    ▼
AI synthesizes answer: "You have 3 notes about quantum computing: ..."
```

## Core Tools (V0)

### 1. `read_note`

Read the full content of a specific note.

**Use Cases**:
- "Show me my note on quantum decoherence"
- "What did I write about Rust macros?"
- User asks about a specific file

**Definition**:
```typescript
{
  type: 'function',
  function: {
    name: 'read_note',
    description: 'Read the full content of a specific note by its path. Use this when the user asks about a specific note or you need to see the complete contents of a file.',
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
}
```

**Implementation**:
```typescript
async function readNote(args: { path: string }): Promise<string> {
  const fullPath = path.join(vaultPath, args.path);

  // Validate path is within vault (security)
  if (!fullPath.startsWith(vaultPath)) {
    throw new Error('Path must be within vault directory');
  }

  // Check file exists
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Note not found: ${args.path}`);
  }

  // Read and return content
  const content = await fs.promises.readFile(fullPath, 'utf-8');
  return content;
}
```

**Example Tool Call**:
```json
{
  "id": "call_abc123",
  "type": "function",
  "function": {
    "name": "read_note",
    "arguments": "{\"path\": \"research/quantum-computing.md\"}"
  }
}
```

**Example Response**:
```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "name": "read_note",
  "content": "---\ntags: [physics, computing]\nauthor: Alice\n---\n\n# Quantum Computing Overview\n\nQuantum computing leverages quantum mechanical phenomena..."
}
```

---

### 2. `search_notes`

Perform semantic (vector) search across all notes.

**Use Cases**:
- "What do I know about machine learning?"
- "Find notes related to TypeScript performance"
- General knowledge retrieval

**Definition**:
```typescript
{
  type: 'function',
  function: {
    name: 'search_notes',
    description: 'Search across all notes using semantic similarity. Returns the most relevant note chunks based on the query. Use this when you need to find information across multiple notes or when the user asks a broad question.',
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
          description: 'Optional filters (e.g., by tag, date range)',
          properties: {
            tags: {
              type: 'array',
              description: 'Filter by tags (e.g., ["physics", "computing"])',
              items: { type: 'string' },
            },
            date_after: {
              type: 'string',
              description: 'Only notes modified after this date (ISO 8601)',
            },
            date_before: {
              type: 'string',
              description: 'Only notes modified before this date (ISO 8601)',
            },
          },
        },
      },
      required: ['query'],
    },
  },
}
```

**Implementation**:
```typescript
interface SearchResult {
  path: string;
  title: string;
  chunk: string;
  score: number;
}

async function searchNotes(args: {
  query: string;
  top_k?: number;
  filter?: {
    tags?: string[];
    date_after?: string;
    date_before?: string;
  };
}): Promise<SearchResult[]> {
  const topK = args.top_k || 10;

  // Generate query embedding
  const queryEmbedding = await provider.embed({ input: args.query });

  // Get all chunks (with optional filtering)
  let sql = 'SELECT c.*, d.path, d.title FROM chunks c JOIN documents d ON c.document_id = d.id WHERE c.embedding IS NOT NULL';
  const params: any[] = [];

  if (args.filter?.tags) {
    sql += ' AND json_extract(d.frontmatter, "$.tags") LIKE ?';
    params.push(`%${args.filter.tags[0]}%`); // Simple implementation, can be improved
  }

  if (args.filter?.date_after) {
    sql += ' AND d.modified_at >= ?';
    params.push(new Date(args.filter.date_after).getTime() / 1000);
  }

  if (args.filter?.date_before) {
    sql += ' AND d.modified_at <= ?';
    params.push(new Date(args.filter.date_before).getTime() / 1000);
  }

  const chunks = db.prepare(sql).all(...params);

  // Compute cosine similarity for each chunk
  const results = chunks.map((chunk: any) => {
    const chunkEmbedding = deserializeEmbedding(chunk.embedding);
    const score = cosineSimilarity(queryEmbedding.embeddings[0], chunkEmbedding);

    return {
      path: chunk.path,
      title: chunk.title,
      chunk: chunk.content,
      score,
    };
  });

  // Sort by score and return top K
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Example Tool Call**:
```json
{
  "id": "call_def456",
  "type": "function",
  "function": {
    "name": "search_notes",
    "arguments": "{\"query\": \"quantum computing applications\", \"top_k\": 5}"
  }
}
```

**Example Response**:
```json
{
  "role": "tool",
  "tool_call_id": "call_def456",
  "name": "search_notes",
  "content": "[{\"path\":\"research/quantum-computing.md\",\"title\":\"Quantum Computing Overview\",\"chunk\":\"Quantum computing has applications in cryptography, drug discovery, and optimization problems...\",\"score\":0.89},{\"path\":\"papers/shor-algorithm.md\",\"title\":\"Shor's Algorithm\",\"chunk\":\"Shor's algorithm is a quantum algorithm for integer factorization...\",\"score\":0.84}]"
}
```

---

### 3. `write_note`

Create a new note or overwrite an existing one.

**Use Cases**:
- "Create a note summarizing what we discussed"
- "Write a new note about X"
- AI generates content on user's behalf

**Definition**:
```typescript
{
  type: 'function',
  function: {
    name: 'write_note',
    description: 'Create a new note or overwrite an existing note. The content should be in Markdown format. Use this when the user asks you to create or update a note.',
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
}
```

**Implementation**:
```typescript
async function writeNote(args: { path: string; content: string }): Promise<string> {
  const fullPath = path.join(vaultPath, args.path);

  // Validate path is within vault
  if (!fullPath.startsWith(vaultPath)) {
    throw new Error('Path must be within vault directory');
  }

  // Create parent directories if needed
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

  // Write file
  await fs.promises.writeFile(fullPath, args.content, 'utf-8');

  // Trigger re-indexing
  indexQueue.enqueue(args.path, 'change');

  return `Note created successfully: ${args.path}`;
}
```

**Example Tool Call**:
```json
{
  "id": "call_ghi789",
  "type": "function",
  "function": {
    "name": "write_note",
    "arguments": "{\"path\": \"summaries/quantum-decoherence-summary.md\", \"content\": \"---\\ntags: [summary, quantum]\\ncreated: 2024-01-15\\n---\\n\\n# Quantum Decoherence Summary\\n\\nQuantum decoherence explains...\"}"
  }
}
```

**Example Response**:
```json
{
  "role": "tool",
  "tool_call_id": "call_ghi789",
  "name": "write_note",
  "content": "Note created successfully: summaries/quantum-decoherence-summary.md"
}
```

---

### 4. `update_frontmatter`

Update YAML frontmatter fields without rewriting the entire note.

**Use Cases**:
- "Tag this note with 'important'"
- "Set the status to 'reviewed'"
- Metadata management

**Definition**:
```typescript
{
  type: 'function',
  function: {
    name: 'update_frontmatter',
    description: 'Update or add fields to a note\'s YAML frontmatter. Use this to update metadata without modifying the note content.',
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
}
```

**Implementation**:
```typescript
import matter from 'gray-matter';

async function updateFrontmatter(args: {
  path: string;
  updates: Record<string, any>;
}): Promise<string> {
  const fullPath = path.join(vaultPath, args.path);

  // Read existing file
  const content = await fs.promises.readFile(fullPath, 'utf-8');

  // Parse frontmatter
  const parsed = matter(content);

  // Merge updates
  const updatedData = { ...parsed.data, ...args.updates };

  // Stringify back
  const updated = matter.stringify(parsed.content, updatedData);

  // Write file
  await fs.promises.writeFile(fullPath, updated, 'utf-8');

  // Trigger re-indexing
  indexQueue.enqueue(args.path, 'change');

  return `Frontmatter updated for ${args.path}: ${JSON.stringify(args.updates)}`;
}
```

**Example Tool Call**:
```json
{
  "id": "call_jkl012",
  "type": "function",
  "function": {
    "name": "update_frontmatter",
    "arguments": "{\"path\": \"research/quantum-computing.md\", \"updates\": {\"tags\": [\"physics\", \"computing\", \"important\"], \"reviewed\": true}}"
  }
}
```

---

### 5. `list_backlinks`

Find all notes that link to a given note.

**Use Cases**:
- "What notes reference quantum computing?"
- "Show me everything that links here"
- Graph traversal queries

**Definition**:
```typescript
{
  type: 'function',
  function: {
    name: 'list_backlinks',
    description: 'Find all notes that link to a specific note. Useful for understanding connections in the knowledge graph.',
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
}
```

**Implementation**:
```typescript
interface Backlink {
  source_path: string;
  source_title: string;
  link_text: string;
  link_type: string;
}

async function listBacklinks(args: { path: string }): Promise<Backlink[]> {
  const backlinks = db.prepare(`
    SELECT l.source_path, l.link_text, l.link_type, d.title AS source_title
    FROM links l
    JOIN documents d ON l.source_path = d.path
    WHERE l.target_path = ?
    ORDER BY d.title
  `).all(args.path);

  return backlinks as Backlink[];
}
```

**Example Tool Call**:
```json
{
  "id": "call_mno345",
  "type": "function",
  "function": {
    "name": "list_backlinks",
    "arguments": "{\"path\": \"concepts/superposition.md\"}"
  }
}
```

**Example Response**:
```json
{
  "role": "tool",
  "tool_call_id": "call_mno345",
  "name": "list_backlinks",
  "content": "[{\"source_path\":\"research/quantum-computing.md\",\"source_title\":\"Quantum Computing Overview\",\"link_text\":\"superposition\",\"link_type\":\"wikilink\"},{\"source_path\":\"papers/bell-theorem.md\",\"source_title\":\"Bell's Theorem\",\"link_text\":\"quantum superposition\",\"link_type\":\"markdown\"}]"
}
```

---

## Future Tools (Post-V0)

### 6. `list_forward_links`
Find all notes that a given note links to.

### 7. `create_daily_note`
Create or open today's daily note (common workflow).

### 8. `search_by_tag`
Find all notes with specific tags (faster than semantic search for exact matches).

### 9. `get_note_metadata`
Get frontmatter and stats without reading full content.

### 10. `rename_note`
Rename a note and update all links to it.

### 11. `delete_note`
Delete a note (with confirmation).

### 12. `get_random_note`
Discover a random note (for serendipity).

---

## Tool Orchestration

### ReAct Loop

```typescript
async function runAgent(userMessage: string, context?: { currentNotePath?: string }): Promise<string> {
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are an AI assistant helping the user manage their research notes. You have access to tools to read, search, and write notes.

Current context:
- User is viewing: ${context?.currentNotePath || 'No note open'}

Guidelines:
- Always cite sources (note paths) when answering questions
- When searching, use multiple queries if needed to be thorough
- When creating notes, use clear Markdown formatting
- Ask for clarification if the user's request is ambiguous`,
    },
    { role: 'user', content: userMessage },
  ];

  const maxIterations = 10;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // Call AI with tools
    const response = await provider.chat({
      messages,
      tools: ALL_TOOLS,
      tool_choice: 'auto',
    });

    // Add assistant message
    messages.push(response.message);

    // If no tool calls, we're done
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return response.message.content;
    }

    // Execute tool calls
    for (const toolCall of response.tool_calls) {
      const result = await executeToolCall(toolCall);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error('Agent exceeded maximum iterations');
}

async function executeToolCall(toolCall: ToolCall): Promise<any> {
  const args = JSON.parse(toolCall.function.arguments);

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
```

---

## Security Considerations

### Path Validation
Always validate paths are within the vault:

```typescript
function validatePath(requestedPath: string): string {
  const fullPath = path.resolve(vaultPath, requestedPath);

  // Prevent directory traversal attacks
  if (!fullPath.startsWith(path.resolve(vaultPath))) {
    throw new Error('Invalid path: must be within vault directory');
  }

  return fullPath;
}
```

### Dangerous Operations
Confirm before:
- Overwriting existing notes
- Deleting notes
- Renaming notes (updates many links)

```typescript
async function writeNote(args: { path: string; content: string }): Promise<string> {
  const fullPath = validatePath(args.path);

  // Check if file exists
  if (fs.existsSync(fullPath)) {
    // In UI, show confirmation dialog
    const confirmed = await confirmOverwrite(args.path);
    if (!confirmed) {
      throw new Error('User cancelled overwrite');
    }
  }

  // ... proceed with write
}
```

---

## Testing Tools

```typescript
describe('Tools', () => {
  beforeEach(async () => {
    // Set up test vault and database
    await setupTestVault();
  });

  it('read_note should return file content', async () => {
    const result = await readNote({ path: 'test-note.md' });
    expect(result).toContain('# Test Note');
  });

  it('search_notes should return relevant results', async () => {
    const results = await searchNotes({ query: 'quantum computing', top_k: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0.7);
  });

  it('write_note should create file and trigger indexing', async () => {
    await writeNote({ path: 'new-note.md', content: '# New Note' });
    expect(fs.existsSync(path.join(vaultPath, 'new-note.md'))).toBe(true);

    // Wait for indexing
    await waitForIndexing();

    const doc = db.prepare('SELECT * FROM documents WHERE path = ?').get('new-note.md');
    expect(doc).toBeTruthy();
  });
});
```

---

## Tool Call Logging

For debugging and user transparency:

```typescript
interface ToolCallLog {
  timestamp: number;
  tool_name: string;
  arguments: any;
  result: any;
  duration_ms: number;
  error?: string;
}

const toolCallLogs: ToolCallLog[] = [];

async function executeToolCallWithLogging(toolCall: ToolCall): Promise<any> {
  const start = Date.now();
  let result;
  let error;

  try {
    result = await executeToolCall(toolCall);
  } catch (e) {
    error = e.message;
    throw e;
  } finally {
    toolCallLogs.push({
      timestamp: start,
      tool_name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments),
      result,
      duration_ms: Date.now() - start,
      error,
    });
  }

  return result;
}
```

---

## Next Steps

- [LLM Provider Interface](llm-provider.md) — How the AI decides which tools to use
- [Database Schema](../architecture/database.md) — How tools query data
- [Indexer Architecture](../architecture/indexer.md) — How `write_note` triggers re-indexing
- [Development Guide](../guides/development.md) — Testing tools locally
