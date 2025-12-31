// Mock tiktoken for tests since it has issues with Vitest
export function getEncoding(_encoding: string) {
  return {
    encode: (text: string) => {
      // Simple word/whitespace-based tokenization for testing
      // More accurate: ~1 token per word, plus punctuation
      if (!text || text.trim().length === 0) {
        return new Uint32Array([]);
      }

      const words = text.split(/\s+/).filter(w => w.length > 0);
      const tokens = words.flatMap((word, i) => {
        // Each word gets 1-2 tokens depending on length
        const tokenCount = Math.max(1, Math.floor(word.length / 5));
        return new Array(tokenCount).fill(i);
      });
      return new Uint32Array(tokens.length > 0 ? tokens : []);
    },
    decode: (_tokens: number[] | Uint32Array) => {
      return 'decoded text';
    },
    free: () => {},
  };
}
