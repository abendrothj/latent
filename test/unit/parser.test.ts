import { describe, it, expect } from 'vitest';
import { parseMarkdown, countWords } from '../../src/main/indexer/parser';
import { mockNotes } from '../fixtures/mockData';

describe('Markdown Parser', () => {
  describe('parseMarkdown', () => {
    it('should parse simple markdown', async () => {
      const result = await parseMarkdown(mockNotes.simple);

      expect(result.title).toBe('Simple Note');
      expect(result.content).toContain('This is a simple note');
      expect(result.links).toHaveLength(0);
      expect(result.frontmatter).toEqual({});
    });

    it('should parse frontmatter', async () => {
      const result = await parseMarkdown(mockNotes.withFrontmatter);

      expect(result.frontmatter).toEqual({
        tags: ['test', 'example'],
        created: '2024-01-15',
        author: 'Test User',
      });
      expect(result.title).toBe('Note with Frontmatter');
    });

    it('should extract wikilinks', async () => {
      const result = await parseMarkdown(mockNotes.withWikilinks);

      const wikilinks = result.links.filter((l) => l.type === 'wikilink');
      expect(wikilinks).toHaveLength(2);

      expect(wikilinks[0].target).toBe('other-note.md');
      expect(wikilinks[0].text).toBe('other-note');

      expect(wikilinks[1].target).toBe('another-note.md');
      expect(wikilinks[1].text).toBe('Another Note');
    });

    it('should extract embeds', async () => {
      const result = await parseMarkdown(mockNotes.withWikilinks);

      const embeds = result.links.filter((l) => l.type === 'embed');
      expect(embeds).toHaveLength(1);
      expect(embeds[0].target).toBe('image.png');
    });

    it('should extract markdown links', async () => {
      const result = await parseMarkdown(mockNotes.withMarkdownLinks);

      const markdownLinks = result.links.filter((l) => l.type === 'markdown');

      // Should only extract local markdown links, not external URLs
      const localLinks = markdownLinks.filter((l) => l.target.includes('.md'));
      expect(localLinks.length).toBeGreaterThan(0);
    });

    it('should extract title from first H1', async () => {
      const result = await parseMarkdown('# My Title\n\nContent here\n\n# Another H1');

      expect(result.title).toBe('My Title');
    });

    it('should handle notes without title', async () => {
      const result = await parseMarkdown('Just some content without a title.');

      expect(result.title).toBeNull();
    });
  });

  describe('countWords', () => {
    it('should count words correctly', () => {
      const count = countWords('Hello world this is a test');
      expect(count).toBe(6);
    });

    it('should ignore markdown formatting', () => {
      const count = countWords('**Bold** and *italic* and `code`');
      expect(count).toBe(5); // Bold, and, italic, and, code
    });

    it('should ignore code blocks', () => {
      const count = countWords('Text\n```\ncode block\n```\nMore text');
      expect(count).toBe(3); // Text, More, text
    });

    it('should keep link text', () => {
      const count = countWords('[Link Text](url)');
      expect(count).toBe(2); // Link, Text
    });

    it('should handle empty input', () => {
      const count = countWords('');
      expect(count).toBe(0);
    });

    it('should handle whitespace-only input', () => {
      const count = countWords('   \n\n\t  ');
      expect(count).toBe(0);
    });
  });
});
