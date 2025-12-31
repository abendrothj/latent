import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as queries from '../../src/main/db/queries';
import { setVaultPath, setLLMProvider, executeToolCall } from '../../src/main/ai/tools';
import { mockNotes, mockEmbedding, mockSearchResults } from '../fixtures/mockData';

describe('AI Tools', () => {
  let vaultPath: string = '';

  beforeEach(async () => {
    // Use a unique temp vault per test to avoid cross-test interference
    vaultPath = path.join(os.tmpdir(), `latent-tools-vault-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(vaultPath, { recursive: true });
    setVaultPath(vaultPath);

    // Mock LLM provider
    const mockProvider = {
      name: 'mock',
      chat: vi.fn(),
      embed: vi.fn().mockResolvedValue({
        embeddings: [mockEmbedding],
        model: 'mock-model',
      }),
    };

    setLLMProvider(mockProvider as any);
  });

  afterEach(async () => {
    // Clean up test vault
    try {
      if (vaultPath) {
        await fs.rm(vaultPath, { recursive: true, force: true });
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  });

  describe('read_note', () => {
    it('should read existing note', async () => {
      const filePath = path.join(vaultPath, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      // Small delay to ensure filesystem settles (helps on CI/slow systems)
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'read_note',
          arguments: JSON.stringify({ path: 'test.md' }),
        },
      });

      expect(result).toBe(mockNotes.simple);
    });

    it('should throw error for non-existent note', async () => {
      await expect(
        executeToolCall({
          id: 'test',
          type: 'function',
          function: {
            name: 'read_note',
            arguments: JSON.stringify({ path: 'nonexistent.md' }),
          },
        })
      ).rejects.toThrow('Note not found');
    });

    it('should prevent directory traversal', async () => {
      await expect(
        executeToolCall({
          id: 'test',
          type: 'function',
          function: {
            name: 'read_note',
            arguments: JSON.stringify({ path: '../../../etc/passwd' }),
          },
        })
      ).rejects.toThrow('Invalid path');
    });
  });

  describe('write_note', () => {
    it('should create new note', async () => {
      await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'write_note',
          arguments: JSON.stringify({
            path: 'new-note.md',
            content: mockNotes.simple,
          }),
        },
      });

      const filePath = path.join(vaultPath, 'new-note.md');
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toBe(mockNotes.simple);
    });

    it('should overwrite existing note', async () => {
      const filePath = path.join(vaultPath, 'existing.md');
      await fs.writeFile(filePath, 'Old content');

      await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'write_note',
          arguments: JSON.stringify({
            path: 'existing.md',
            content: 'New content',
          }),
        },
      });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('New content');
    });

    it('should create parent directories', async () => {
      await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'write_note',
          arguments: JSON.stringify({
            path: 'subfolder/nested/note.md',
            content: mockNotes.simple,
          }),
        },
      });

      const filePath = path.join(vaultPath, 'subfolder', 'nested', 'note.md');
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toBe(mockNotes.simple);
    });

    it('should prevent directory traversal', async () => {
      await expect(
        executeToolCall({
          id: 'test',
          type: 'function',
          function: {
            name: 'write_note',
            arguments: JSON.stringify({
              path: '../../../tmp/evil.md',
              content: 'Evil content',
            }),
          },
        })
      ).rejects.toThrow('Invalid path');
    });
  });

  describe('update_frontmatter', () => {
    it('should update frontmatter fields', async () => {
      const filePath = path.join(vaultPath, 'test.md');
      await fs.writeFile(filePath, mockNotes.withFrontmatter);

      await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'update_frontmatter',
          arguments: JSON.stringify({
            path: 'test.md',
            updates: {
              tags: ['updated', 'test'],
              status: 'reviewed',
            },
          }),
        },
      });

      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('tags:');
      expect(content).toContain('updated');
      expect(content).toContain('status: reviewed');
    });

    it('should add frontmatter to note without it', async () => {
      const filePath = path.join(vaultPath, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'update_frontmatter',
          arguments: JSON.stringify({
            path: 'test.md',
            updates: {
              tags: ['new'],
            },
          }),
        },
      });

      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('---');
      expect(content).toContain('tags:');
      expect(content).toContain('new');
    });

    it('should preserve existing frontmatter fields', async () => {
      const filePath = path.join(vaultPath, 'test.md');
      await fs.writeFile(filePath, mockNotes.withFrontmatter);

      await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'update_frontmatter',
          arguments: JSON.stringify({
            path: 'test.md',
            updates: {
              status: 'reviewed',
            },
          }),
        },
      });

      const content = await fs.readFile(filePath, 'utf-8');

      // Original fields should still exist
      expect(content).toContain('author: Test User');
      expect(content).toContain('created: 2024-01-15');

      // New field should be added
      expect(content).toContain('status: reviewed');
    });
  });

  describe('search_notes', () => {
    it('should call LLM provider for embeddings', async () => {
      // Mock database query to return empty results
      vi.spyOn(queries, 'searchNotesByVector').mockReturnValue([]);

      const mockProvider = {
        name: 'mock',
        embed: vi.fn().mockResolvedValue({
          embeddings: [mockEmbedding],
          model: 'mock-model',
        }),
      };

      setLLMProvider(mockProvider as any);

      await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'search_notes',
          arguments: JSON.stringify({
            query: 'quantum computing',
            top_k: 5,
          }),
        },
      });

      expect(mockProvider.embed).toHaveBeenCalledWith({
        input: 'quantum computing',
      });
    });

    it('should return search results', async () => {
      // Mock database query
      vi.spyOn(queries, 'searchNotesByVector').mockReturnValue(mockSearchResults);

      const results = await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'search_notes',
          arguments: JSON.stringify({
            query: 'quantum computing',
            top_k: 5,
          }),
        },
      });

      expect(results).toEqual(mockSearchResults);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should throw error without LLM provider', async () => {
      setLLMProvider(null as any);

      await expect(
        executeToolCall({
          id: 'test',
          type: 'function',
          function: {
            name: 'search_notes',
            arguments: JSON.stringify({ query: 'test' }),
          },
        })
      ).rejects.toThrow('LLM provider not initialized');
    });
  });

  describe('list_backlinks', () => {
    it('should return backlinks from database', async () => {
      // Mock database query
      const mockBacklinks = [
        {
          source_path: 'source1.md',
          source_title: 'Source 1',
          link_text: 'target',
          link_type: 'wikilink',
        },
      ];

      vi.spyOn(queries, 'getBacklinks').mockReturnValue(mockBacklinks);

      const results = await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'list_backlinks',
          arguments: JSON.stringify({ path: 'target.md' }),
        },
      });

      expect(results).toEqual(mockBacklinks);
      expect(queries.getBacklinks).toHaveBeenCalledWith('target.md');
    });
  });

  describe('Tool Executor', () => {
    it('should throw error for unknown tool', async () => {
      await expect(
        executeToolCall({
          id: 'test',
          type: 'function',
          function: {
            name: 'unknown_tool',
            arguments: JSON.stringify({}),
          },
        })
      ).rejects.toThrow('Unknown tool');
    });

    it('should parse JSON arguments', async () => {
      const filePath = path.join(vaultPath, 'test.md');
      await fs.writeFile(filePath, mockNotes.simple);

      const result = await executeToolCall({
        id: 'test',
        type: 'function',
        function: {
          name: 'read_note',
          arguments: '{"path": "test.md"}',
        },
      });

      expect(result).toBe(mockNotes.simple);
    });
  });
});
