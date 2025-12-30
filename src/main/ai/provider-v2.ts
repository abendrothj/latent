/**
 * AI Provider using Vercel AI SDK
 * Provides unified interface for OpenAI, Anthropic, Ollama, and custom models
 */

import { generateText, streamText, generateObject, embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { ollama } from 'ollama-ai-provider';
import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  EmbedRequest,
  EmbedResponse,
  ProviderConfig,
  Message,
  ToolCall,
} from '../../shared/types';
import { LLMProvider } from './provider';

export class VercelAIProvider implements LLMProvider {
  readonly name: string;
  private model: any;
  private embedModel: any;

  constructor(private config: ProviderConfig) {
    this.name = config.type;
    this.model = this.createChatModel();
    this.embedModel = this.createEmbedModel();
  }

  private createChatModel() {
    switch (this.config.type) {
      case 'openai':
        return openai(this.config.model || 'gpt-4o', {
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
        });

      case 'anthropic':
        return anthropic(this.config.model || 'claude-3-5-sonnet-20241022', {
          apiKey: this.config.apiKey,
        });

      case 'ollama':
        return ollama(this.config.model || 'llama3.2', {
          baseURL: this.config.baseURL || 'http://localhost:11434',
        });

      default:
        throw new Error(`Unsupported provider type: ${this.config.type}`);
    }
  }

  private createEmbedModel() {
    switch (this.config.type) {
      case 'openai':
        return openai.embedding('text-embedding-3-small', {
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
        });

      case 'ollama':
        return ollama.embedding(this.config.model || 'nomic-embed-text', {
          baseURL: this.config.baseURL || 'http://localhost:11434',
        });

      default:
        // Anthropic doesn't have embeddings, use OpenAI as fallback
        if (process.env.OPENAI_API_KEY) {
          return openai.embedding('text-embedding-3-small');
        }
        throw new Error(`Provider ${this.config.type} does not support embeddings`);
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      // Convert tools to Vercel AI SDK format
      const tools = request.tools
        ? Object.fromEntries(
            request.tools.map((tool) => [
              tool.function.name,
              {
                description: tool.function.description,
                parameters: tool.function.parameters,
              },
            ])
          )
        : undefined;

      const result = await generateText({
        model: this.model,
        messages: this.convertMessages(request.messages),
        tools,
        toolChoice: request.tool_choice as any,
        temperature: request.temperature,
        maxTokens: request.max_tokens,
      });

      // Convert tool calls back to our format
      const tool_calls: ToolCall[] | undefined = result.toolCalls?.map((tc) => ({
        id: tc.toolCallId,
        type: 'function' as const,
        function: {
          name: tc.toolName,
          arguments: JSON.stringify(tc.args),
        },
      }));

      return {
        message: {
          role: 'assistant',
          content: result.text,
        },
        tool_calls,
        finish_reason: result.finishReason === 'tool-calls' ? 'tool_calls' : 'stop',
        usage: {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
        },
      };
    } catch (error: any) {
      throw new Error(`${this.name} chat error: ${error.message}`);
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    try {
      const inputs = Array.isArray(request.input) ? request.input : [request.input];
      const embeddings: number[][] = [];

      // Embed in batches to avoid rate limits
      for (const input of inputs) {
        const result = await embed({
          model: this.embedModel,
          value: input,
        });
        embeddings.push(result.embedding);
      }

      return {
        embeddings,
        model: this.embedModel.modelId || 'unknown',
        usage: {
          prompt_tokens: inputs.reduce((sum, input) => sum + Math.ceil(input.length / 4), 0),
        },
      };
    } catch (error: any) {
      throw new Error(`${this.name} embedding error: ${error.message}`);
    }
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    try {
      const tools = request.tools
        ? Object.fromEntries(
            request.tools.map((tool) => [
              tool.function.name,
              {
                description: tool.function.description,
                parameters: tool.function.parameters,
              },
            ])
          )
        : undefined;

      const result = await streamText({
        model: this.model,
        messages: this.convertMessages(request.messages),
        tools,
        toolChoice: request.tool_choice as any,
        temperature: request.temperature,
        maxTokens: request.max_tokens,
      });

      for await (const chunk of result.textStream) {
        yield {
          delta: {
            role: 'assistant',
            content: chunk,
          },
        };
      }

      // Yield final chunk with finish reason
      const finalResult = await result.response;
      yield {
        delta: {},
        finish_reason: finalResult.finishReason === 'tool-calls' ? 'tool_calls' : 'stop',
      };
    } catch (error: any) {
      throw new Error(`${this.name} streaming error: ${error.message}`);
    }
  }

  private convertMessages(messages: Message[]): any[] {
    return messages.map((msg) => {
      // Handle tool messages
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: msg.tool_call_id,
              toolName: msg.name,
              result: msg.content,
            },
          ],
        };
      }

      return {
        role: msg.role,
        content: msg.content,
      };
    });
  }
}

/**
 * Create provider using Vercel AI SDK
 */
export function createVercelAIProvider(config: ProviderConfig): LLMProvider {
  return new VercelAIProvider(config);
}
