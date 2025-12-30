# LLM Provider Interface

## Overview

Latent is **model-agnostic**. The AI layer is abstracted behind a unified `LLMProvider` interface that supports:
- Cloud APIs (OpenAI, Anthropic, Google)
- Local models (Ollama, LM Studio, llama.cpp)
- Custom endpoints (self-hosted, enterprise proxies)

## Core Interface

```typescript
interface LLMProvider {
  /**
   * Unique identifier for this provider
   */
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
```

## Type Definitions

### Messages

```typescript
type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;        // For tool messages, the tool name
  tool_call_id?: string; // For tool responses
};

type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
};
```

### Chat Request/Response

```typescript
interface ChatRequest {
  messages: Message[];
  tools?: Tool[];          // Available tools for function calling
  tool_choice?: 'auto' | 'required' | { type: 'function', function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  model?: string;          // Optional model override
}

interface ChatResponse {
  message: Message;
  tool_calls?: ToolCall[];
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ChatStreamChunk {
  delta: {
    role?: 'assistant';
    content?: string;
    tool_calls?: Partial<ToolCall>[];
  };
  finish_reason?: ChatResponse['finish_reason'];
}
```

### Embedding Request/Response

```typescript
interface EmbedRequest {
  input: string | string[];  // Single text or batch
  model?: string;            // Optional model override
}

interface EmbedResponse {
  embeddings: number[][];    // Array of vectors (even for single input)
  model: string;             // Model used
  usage?: {
    prompt_tokens: number;
  };
}
```

### Tool Definition

```typescript
interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        description: string;
        enum?: any[];
      }>;
      required: string[];
    };
  };
}
```

## Built-In Providers

### 1. OpenAI Provider

```typescript
class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(private config: {
    apiKey: string;
    baseURL?: string;  // For Azure OpenAI or proxies
    defaultModel?: string;
  }) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.config.baseURL || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
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
      throw new Error(`OpenAI API error: ${response.statusText}`);
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
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const response = await fetch(`${this.config.baseURL || 'https://api.openai.com/v1'}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'text-embedding-3-small',
        input: inputs,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      embeddings: data.data.map((item: any) => item.embedding),
      model: data.model,
      usage: data.usage,
    };
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const response = await fetch(`${this.config.baseURL || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.config.defaultModel || 'gpt-4o',
        messages: request.messages,
        tools: request.tools,
        stream: true,
      }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          const parsed = JSON.parse(data);
          yield {
            delta: parsed.choices[0].delta,
            finish_reason: parsed.choices[0].finish_reason,
          };
        }
      }
    }
  }
}
```

### 2. Anthropic Provider

```typescript
class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  constructor(private config: {
    apiKey: string;
    defaultModel?: string;
  }) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Transform messages to Anthropic format (system message separate)
    const systemMessage = request.messages.find(m => m.role === 'system');
    const messages = request.messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.config.defaultModel || 'claude-3-5-sonnet-20241022',
        system: systemMessage?.content,
        messages: messages,
        tools: request.tools,
        max_tokens: request.max_tokens || 4096,
        temperature: request.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Transform back to standard format
    const content = data.content.find((c: any) => c.type === 'text');
    const toolUse = data.content.filter((c: any) => c.type === 'tool_use');

    return {
      message: {
        role: 'assistant',
        content: content?.text || '',
      },
      tool_calls: toolUse.map((t: any) => ({
        id: t.id,
        type: 'function' as const,
        function: {
          name: t.name,
          arguments: JSON.stringify(t.input),
        },
      })),
      finish_reason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    };
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    // Anthropic doesn't have embeddings API yet
    // Fall back to Voyage AI or OpenAI
    throw new Error('Anthropic does not provide embeddings. Use Voyage AI or OpenAI for embeddings.');
  }
}
```

### 3. Ollama Provider

```typescript
class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';

  constructor(private config: {
    baseURL: string;       // e.g., http://localhost:11434
    defaultModel?: string; // e.g., llama3.2
  }) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.config.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.config.defaultModel || 'llama3.2',
        messages: request.messages,
        tools: request.tools,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      message: data.message,
      tool_calls: data.message.tool_calls,
      finish_reason: 'stop',
      usage: {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const embeddings: number[][] = [];

    for (const text of inputs) {
      const response = await fetch(`${this.config.baseURL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || 'nomic-embed-text',
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      embeddings.push(data.embedding);
    }

    return {
      embeddings,
      model: request.model || 'nomic-embed-text',
    };
  }
}
```

### 4. Custom Provider (Generic)

```typescript
class CustomProvider implements LLMProvider {
  readonly name = 'custom';

  constructor(private config: {
    chatEndpoint: string;
    embedEndpoint?: string;
    headers?: Record<string, string>;
    requestTransform?: (req: ChatRequest) => any;
    responseTransform?: (res: any) => ChatResponse;
  }) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = this.config.requestTransform
      ? this.config.requestTransform(request)
      : request;

    const response = await fetch(this.config.chatEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Custom API error: ${response.statusText}`);
    }

    const data = await response.json();

    return this.config.responseTransform
      ? this.config.responseTransform(data)
      : data;
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    if (!this.config.embedEndpoint) {
      throw new Error('Embedding endpoint not configured');
    }

    // Similar to chat, with transform support
    throw new Error('Not implemented');
  }
}
```

## Provider Factory

```typescript
class ProviderFactory {
  static create(config: ProviderConfig): LLMProvider {
    switch (config.type) {
      case 'openai':
        return new OpenAIProvider({
          apiKey: config.apiKey!,
          baseURL: config.baseURL,
          defaultModel: config.model,
        });

      case 'anthropic':
        return new AnthropicProvider({
          apiKey: config.apiKey!,
          defaultModel: config.model,
        });

      case 'ollama':
        return new OllamaProvider({
          baseURL: config.baseURL || 'http://localhost:11434',
          defaultModel: config.model,
        });

      case 'custom':
        return new CustomProvider({
          chatEndpoint: config.chatEndpoint!,
          embedEndpoint: config.embedEndpoint,
          headers: config.headers,
        });

      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }
}

interface ProviderConfig {
  type: 'openai' | 'anthropic' | 'ollama' | 'custom';
  apiKey?: string;
  baseURL?: string;
  model?: string;
  chatEndpoint?: string;
  embedEndpoint?: string;
  headers?: Record<string, string>;
}
```

## Configuration Storage

```typescript
interface AISettings {
  provider: {
    type: 'openai' | 'anthropic' | 'ollama' | 'custom';
    apiKey?: string;
    baseURL?: string;
    model?: string;
  };
  embedding: {
    provider: 'api' | 'local';
    model?: string;
  };
}

// Store in SQLite
function saveAISettings(settings: AISettings) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'ai.provider',
    JSON.stringify(settings.provider)
  );
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'ai.embedding',
    JSON.stringify(settings.embedding)
  );
}

function loadAISettings(): AISettings {
  const provider = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai.provider');
  const embedding = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai.embedding');

  return {
    provider: provider ? JSON.parse(provider.value) : { type: 'openai' },
    embedding: embedding ? JSON.parse(embedding.value) : { provider: 'api' },
  };
}
```

## Error Handling

```typescript
class ProviderError extends Error {
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

async function chatWithRetry(
  provider: LLMProvider,
  request: ChatRequest,
  maxRetries = 3
): Promise<ChatResponse> {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await provider.chat(request);
    } catch (error) {
      lastError = error;

      // Retry on rate limits or temporary errors
      if (error.statusCode === 429 || error.statusCode >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry on client errors
      break;
    }
  }

  throw lastError;
}
```

## Testing

```typescript
// Mock provider for testing
class MockProvider implements LLMProvider {
  readonly name = 'mock';

  constructor(private responses: ChatResponse[]) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.responses.shift() || {
      message: { role: 'assistant', content: 'Mock response' },
      finish_reason: 'stop',
    };
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const count = Array.isArray(request.input) ? request.input.length : 1;
    return {
      embeddings: Array(count).fill([0.1, 0.2, 0.3]),
      model: 'mock-embedder',
    };
  }
}

// Usage in tests
const mockProvider = new MockProvider([
  {
    message: { role: 'assistant', content: 'Test response' },
    tool_calls: [
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'search_notes',
          arguments: JSON.stringify({ query: 'quantum' }),
        },
      },
    ],
    finish_reason: 'tool_calls',
  },
]);
```

## Provider Comparison

| Feature | OpenAI | Anthropic | Ollama | Custom |
|---------|--------|-----------|--------|--------|
| Function Calling | ✅ | ✅ | ✅ | Varies |
| Streaming | ✅ | ✅ | ✅ | Varies |
| Embeddings | ✅ | ❌ | ✅ | Varies |
| Cost | $$$ | $$$ | Free | Varies |
| Privacy | Cloud | Cloud | Local | Varies |
| Speed | Fast | Fast | Slower | Varies |

## Next Steps

- [Tool Specifications](tools.md) — Define available functions for the agent
- [Database Schema](../architecture/database.md) — How tools query data
- [Development Guide](../guides/development.md) — Setting up providers locally
