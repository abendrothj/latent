import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  EmbedRequest,
  EmbedResponse,
} from '../../shared/types';
import { LLMProvider, ProviderError } from './provider';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(
    private config: {
      apiKey: string;
      baseURL?: string;
      defaultModel?: string;
    }
  ) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const baseURL = this.config.baseURL || 'https://api.openai.com/v1';

    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model || this.config.defaultModel || 'gpt-4o',
          messages: request.messages,
          tools: request.tools,
          tool_choice: request.tool_choice,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.max_tokens,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new ProviderError(
          error.error?.message || response.statusText,
          this.name,
          error.error?.code,
          response.status
        );
      }

      const data = await response.json();

      return {
        message: {
          role: 'assistant',
          content: data.choices[0].message.content || '',
        },
        tool_calls: data.choices[0].message.tool_calls,
        finish_reason: data.choices[0].finish_reason,
        usage: data.usage,
      };
    } catch (error: any) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(
        error.message || 'OpenAI API request failed',
        this.name,
        error.code
      );
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const baseURL = this.config.baseURL || 'https://api.openai.com/v1';
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    try {
      const response = await fetch(`${baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model || 'text-embedding-3-small',
          input: inputs,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new ProviderError(
          error.error?.message || response.statusText,
          this.name,
          error.error?.code,
          response.status
        );
      }

      const data = await response.json();

      return {
        embeddings: data.data.map((item: any) => item.embedding),
        model: data.model,
        usage: data.usage,
      };
    } catch (error: any) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(
        error.message || 'OpenAI embeddings request failed',
        this.name,
        error.code
      );
    }
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const baseURL = this.config.baseURL || 'https://api.openai.com/v1';

    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model || this.config.defaultModel || 'gpt-4o',
          messages: request.messages,
          tools: request.tools,
          tool_choice: request.tool_choice,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.max_tokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new ProviderError(
          error.error?.message || response.statusText,
          this.name,
          error.error?.code,
          response.status
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            yield {
              delta: parsed.choices[0].delta,
              finish_reason: parsed.choices[0].finish_reason,
            };
          } catch (e) {
            console.error('Failed to parse SSE chunk:', e);
          }
        }
      }
    } catch (error: any) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(
        error.message || 'OpenAI streaming request failed',
        this.name,
        error.code
      );
    }
  }
}
