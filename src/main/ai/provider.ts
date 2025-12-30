import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  EmbedRequest,
  EmbedResponse,
  ProviderConfig,
} from '../../shared/types';

/**
 * LLM Provider Interface
 * All AI providers must implement this interface
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Chat completion with optional tool/function calling
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Generate text embeddings for semantic search
   */
  embed(request: EmbedRequest): Promise<EmbedResponse>;

  /**
   * Stream chat responses (optional, for better UX)
   */
  streamChat?(request: ChatRequest): AsyncIterable<ChatStreamChunk>;
}

/**
 * Provider Factory
 * Creates the appropriate provider based on configuration
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case 'openai':
      // Lazy load to avoid bundling all providers
      const { OpenAIProvider } = require('./openai');
      return new OpenAIProvider({
        apiKey: config.apiKey!,
        baseURL: config.baseURL,
        defaultModel: config.model,
      });

    case 'anthropic':
      const { AnthropicProvider } = require('./anthropic');
      return new AnthropicProvider({
        apiKey: config.apiKey!,
        defaultModel: config.model,
      });

    case 'ollama':
      const { OllamaProvider } = require('./ollama');
      return new OllamaProvider({
        baseURL: config.baseURL || 'http://localhost:11434',
        defaultModel: config.model,
      });

    case 'custom':
      const { CustomProvider } = require('./custom');
      return new CustomProvider({
        chatEndpoint: config.chatEndpoint!,
        embedEndpoint: config.embedEndpoint,
        headers: config.headers,
      });

    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

/**
 * Provider Error
 * Standardized error for provider failures
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Retry helper for transient failures
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  providerName: string = 'unknown'
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Retry on rate limits or temporary errors (5xx)
      const isRetryable =
        error.statusCode === 429 ||
        (error.statusCode >= 500 && error.statusCode < 600) ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT';

      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`[${providerName}] Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry on client errors (4xx except 429)
      break;
    }
  }

  throw new ProviderError(
    lastError.message || 'Provider request failed',
    providerName,
    lastError.code,
    lastError.statusCode
  );
}
