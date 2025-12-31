import { get_encoding } from 'tiktoken';
import type { TextChunk } from '../../shared/types';
import { DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP } from '../../shared/constants';

export async function chunkDocument(
  content: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): Promise<TextChunk[]> {
  // Use tiktoken for accurate token counting (OpenAI compatible)
  const encoding = get_encoding('cl100k_base');

  try {
    const tokens = encoding.encode(content);
    const chunks: TextChunk[] = [];
    let index = 0;

    for (let i = 0; i < tokens.length; i += chunkSize - overlap) {
      const chunkTokens = tokens.slice(i, i + chunkSize);

      // Don't create tiny chunks at the end
      if (chunkTokens.length < 50 && chunks.length > 0) {
        // Append to last chunk
        const lastChunk = chunks[chunks.length - 1];
        const additionalText = new TextDecoder().decode(encoding.decode(chunkTokens));
        lastChunk.content += '\n' + additionalText;
        lastChunk.tokenCount += chunkTokens.length;
        continue;
      }

      const chunkText = new TextDecoder().decode(encoding.decode(chunkTokens));

      chunks.push({
        content: chunkText,
        index: index++,
        tokenCount: chunkTokens.length,
      });
    }

    return chunks;
  } finally {
    encoding.free();
  }
}

/**
 * Alternative chunking strategy: semantic chunking
 * Splits on paragraph/section boundaries for better semantic coherence
 */
export async function chunkDocumentSemantic(
  content: string,
  maxChunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<TextChunk[]> {
  const encoding = get_encoding('cl100k_base');

  try {
    // Split by paragraphs (double newline)
    const paragraphs = content.split(/\n\n+/);
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let currentTokens: number[] = [];
    let index = 0;

    for (const paragraph of paragraphs) {
      const paragraphTokens = encoding.encode(paragraph);

      // If adding this paragraph would exceed chunk size, finalize current chunk
      if (currentTokens.length + paragraphTokens.length > maxChunkSize && currentChunk) {
        chunks.push({
          content: currentChunk.trim(),
          index: index++,
          tokenCount: currentTokens.length,
        });

        currentChunk = '';
        currentTokens = [];
      }

      // If paragraph itself is larger than chunk size, split it
      if (paragraphTokens.length > maxChunkSize) {
        // Fallback to token-based splitting for this paragraph
        for (let i = 0; i < paragraphTokens.length; i += maxChunkSize) {
          const chunkTokens = paragraphTokens.slice(i, i + maxChunkSize);
          chunks.push({
            content: new TextDecoder().decode(encoding.decode(chunkTokens)),
            index: index++,
            tokenCount: chunkTokens.length,
          });
        }
      } else {
        // Add paragraph to current chunk
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        currentTokens = currentTokens.concat(Array.from(paragraphTokens));
      }
    }

    // Add final chunk if any content remains
    if (currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        index: index++,
        tokenCount: currentTokens.length,
      });
    }

    return chunks;
  } finally {
    encoding.free();
  }
}
