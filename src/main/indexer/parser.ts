import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import matter from 'gray-matter';
import type { ParsedDocument, ParsedLink } from '../../shared/types';

export async function parseMarkdown(content: string): Promise<ParsedDocument> {
  const frontmatter: Record<string, any> = {};
  let title: string | null = null;
  const links: ParsedLink[] = [];

  // Parse frontmatter using gray-matter
  const { data, content: contentWithoutFrontmatter } = matter(content);
  Object.assign(frontmatter, data);

  // Parse markdown AST
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .parse(content);

  // Extract title from first H1
  visit(tree, 'heading', (node: any) => {
    if (node.depth === 1 && !title) {
      title = extractText(node);
    }
  });

  // Extract markdown links
  visit(tree, 'link', (node: any) => {
    const url = node.url;
    const text = extractText(node);

    // Only process local markdown links
    if (url.endsWith('.md') || !url.includes('://')) {
      links.push({
        type: 'markdown',
        target: normalizePath(url),
        text: text || url,
      });
    }
  });

  // Extract wikilinks using regex (remark doesn't support wikilinks by default)
  // Use negative lookbehind to exclude embeds (![[...]])
  const wikilinkRegex = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;

  while ((match = wikilinkRegex.exec(contentWithoutFrontmatter)) !== null) {
    const target = match[1].trim();
    const displayText = match[2]?.trim() || target;

    links.push({
      type: 'wikilink',
      target: normalizePath(target),
      text: displayText,
    });
  }

  // Extract embeds (images, other notes)
  const embedRegex = /!\[\[([^\]]+)\]\]/g;
  while ((match = embedRegex.exec(contentWithoutFrontmatter)) !== null) {
    const target = match[1].trim();

    links.push({
      type: 'embed',
      target: normalizePath(target),
      text: target,
    });
  }

  return {
    frontmatter,
    title,
    content: contentWithoutFrontmatter,
    links,
  };
}

function extractText(node: any): string {
  if (node.type === 'text') {
    return node.value;
  }

  if (node.children) {
    return node.children.map(extractText).join('');
  }

  return '';
}

function normalizePath(rawPath: string): string {
  let normalized = rawPath;

  // Check if it's a file with an extension (image, pdf, etc.)
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(normalized);

  // Only add .md extension if it's not already there and doesn't have another extension
  if (!hasExtension && !normalized.endsWith('.md')) {
    normalized += '.md';
  }

  // Remove leading slashes
  normalized = normalized.replace(/^\/+/, '');

  return normalized;
}

export function countWords(text: string): number {
  // Remove markdown syntax for more accurate word count
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '') // Code blocks
    .replace(/`([^`]+)`/g, '$1') // Inline code (keep content)
    .replace(/!\[.*?\]\(.*?\)/g, '') // Images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links (keep text)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2') // Wikilinks (keep display text)
    .replace(/[#*_~`]/g, '') // Markdown formatting
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  const words = cleaned.split(/\s+/).filter((word) => word.length > 0);
  return words.length;
}
