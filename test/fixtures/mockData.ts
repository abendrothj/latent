/**
 * Mock data for testing
 */

export const mockNotes = {
  simple: `# Simple Note

This is a simple note for testing.`,

  withFrontmatter: `---
tags: [test, example]
created: 2024-01-15
author: Test User
---

# Note with Frontmatter

This note has YAML frontmatter.`,

  withWikilinks: `# Note with Links

This note links to [[other-note]] and [[another-note|Another Note]].

It also has an embed: ![[image.png]]`,

  withMarkdownLinks: `# Note with Markdown Links

Check out this [example](https://example.com) and this [local note](./local.md).`,

  long: `# Long Note

${'Lorem ipsum dolor sit amet. '.repeat(200)}

## Section 1

${'Content for section 1. '.repeat(100)}

## Section 2

${'Content for section 2. '.repeat(100)}`,

  quantumComputing: `---
tags: [physics, quantum]
---

# Quantum Computing

Quantum computing uses superposition and entanglement to solve problems.

## Key Concepts

- [[qubits|Qubits]]
- Superposition
- Entanglement

## Applications

Quantum computers excel at:
- Cryptography
- Drug discovery
- Optimization`,
};

export const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());

export const mockChatResponse = {
  message: {
    role: 'assistant' as const,
    content: 'This is a mock AI response.',
  },
  finish_reason: 'stop' as const,
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  },
};

export const mockToolCall = {
  id: 'test_call_1',
  type: 'function' as const,
  function: {
    name: 'search_notes',
    arguments: JSON.stringify({ query: 'quantum computing', top_k: 5 }),
  },
};

export const mockSearchResults = [
  {
    path: 'quantum-computing.md',
    title: 'Quantum Computing',
    chunk: 'Quantum computing uses superposition and entanglement...',
    score: 0.92,
  },
  {
    path: 'qubits.md',
    title: 'Qubits',
    chunk: 'A qubit is the basic unit of quantum information...',
    score: 0.85,
  },
];

export const mockDocument = {
  id: 1,
  path: 'test-note.md',
  checksum: 'abc123',
  title: 'Test Note',
  word_count: 50,
  created_at: Math.floor(Date.now() / 1000),
  modified_at: Math.floor(Date.now() / 1000),
  last_indexed_at: Math.floor(Date.now() / 1000),
  frontmatter: JSON.stringify({ tags: ['test'] }),
};

export const mockChunk = {
  id: 1,
  document_id: 1,
  content: 'This is a test chunk of content.',
  embedding: Buffer.from(new Float32Array(mockEmbedding).buffer),
  embedding_model: 'test-model',
  chunk_index: 0,
  token_count: 10,
};

export const mockLink = {
  id: 1,
  source_path: 'source.md',
  target_path: 'target.md',
  link_type: 'wikilink' as const,
  link_text: 'target',
};
