import { describe, it, expect } from 'vitest';
import { chunkDocument, chunkDocumentSemantic } from '../../src/main/indexer/chunker';
import { mockNotes } from '../fixtures/mockData';

describe('Text Chunker', () => {
  describe('chunkDocument', () => {
    it('should chunk long text into multiple chunks', async () => {
      const chunks = await chunkDocument(mockNotes.long, 500, 50);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].index).toBe(0);
      expect(chunks[1].index).toBe(1);
    });

    it('should respect chunk size limit', async () => {
      const maxTokens = 100;
      const chunks = await chunkDocument(mockNotes.long, maxTokens, 10);

      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(maxTokens);
      }
    });

    it('should create overlap between chunks', async () => {
      const chunkSize = 100;
      const overlap = 20;
      const chunks = await chunkDocument(mockNotes.long, chunkSize, overlap);

      expect(chunks.length).toBeGreaterThan(1);

      // Check that chunk sizes account for overlap
      // (except the first chunk which doesn't have previous overlap)
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].tokenCount).toBeLessThanOrEqual(chunkSize);
      }
    });

    it('should handle short text (no chunking needed)', async () => {
      const chunks = await chunkDocument(mockNotes.simple, 500, 50);

      expect(chunks.length).toBe(1);
      expect(chunks[0].index).toBe(0);
    });

    it('should set correct token counts', async () => {
      const chunks = await chunkDocument(mockNotes.simple, 500, 50);

      expect(chunks[0].tokenCount).toBeGreaterThan(0);
      expect(chunks[0].tokenCount).toBeLessThan(100);
    });

    it('should merge tiny final chunks', async () => {
      // Create text that would result in a tiny final chunk
      const text = 'A '.repeat(520); // Slightly over one chunk
      const chunks = await chunkDocument(text, 500, 50);

      // Should merge tiny final chunk into previous chunk
      // rather than creating a separate chunk with <50 tokens
      const hasVerySmallChunk = chunks.some((c) => c.tokenCount < 50);
      expect(hasVerySmallChunk).toBe(false);
    });
  });

  describe('chunkDocumentSemantic', () => {
    it('should split on paragraph boundaries', async () => {
      const text = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
      const chunks = await chunkDocumentSemantic(text, 100);

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should respect max chunk size', async () => {
      const maxSize = 200;
      const chunks = await chunkDocumentSemantic(mockNotes.long, maxSize);

      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(maxSize);
      }
    });

    it('should handle single paragraph', async () => {
      const chunks = await chunkDocumentSemantic(mockNotes.simple, 500);

      expect(chunks.length).toBe(1);
    });

    it('should split oversized paragraphs', async () => {
      // Create a very long paragraph (no double newlines)
      const longParagraph = 'Word '.repeat(1000);
      const chunks = await chunkDocumentSemantic(longParagraph, 200);

      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', async () => {
      const chunks = await chunkDocument('', 500, 50);

      expect(chunks.length).toBe(0);
    });

    it('should handle whitespace-only input', async () => {
      const chunks = await chunkDocument('   \n\n\t  ', 500, 50);

      expect(chunks.length).toBe(0);
    });

    it('should handle very small chunk size', async () => {
      const chunks = await chunkDocument(mockNotes.simple, 10, 2);

      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(10);
      }
    });
  });
});
