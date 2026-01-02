// Mock tiktoken for tests since it has issues with Vitest
export function get_encoding(_encoding: string) {
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
    decode: (tokens: number[] | Uint32Array) => {
      // Return a Uint8Array (which is what the real tiktoken returns)
      // This will be decoded by TextDecoder in the actual code
      const text = 'decoded text';
      return new TextEncoder().encode(text);
    },
    free: () => {},
  };
}
