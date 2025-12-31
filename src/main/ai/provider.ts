/**
 * AI Provider using Vercel AI SDK
 * Provides unified interface for OpenAI, Anthropic, Ollama, and custom models
 */

import { generateText, streamText, embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';
import { z } from 'zod';
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

export interface LLMProvider {
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  streamChat(request: ChatRequest): AsyncIterable<ChatStreamChunk>;
  embed(request: EmbedRequest): Promise<EmbedResponse>;
}

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
        // Use createOpenAI to configure API key and baseURL
        const openaiProvider = createOpenAI({
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
        });
        return openaiProvider(this.config.model || 'gpt-4o');

      case 'anthropic':
        const anthropicProvider = createAnthropic({
          apiKey: this.config.apiKey,
        });
        return anthropicProvider(this.config.model || 'claude-3-5-sonnet-20241022');

      case 'ollama':
        const ollamaProvider = createOllama({
          baseURL: this.config.baseURL || 'http://localhost:11434',
        });
        return ollamaProvider(this.config.model || 'llama3.2');

      default:
        throw new Error(`Unsupported provider type: ${this.config.type}`);
    }
  }

  private createEmbedModel() {
    switch (this.config.type) {
      case 'openai':
        const openaiProvider = createOpenAI({
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
        });
        return openaiProvider.embedding('text-embedding-3-small');

      case 'ollama':
        const ollamaProvider = createOllama({
          baseURL: this.config.baseURL || 'http://localhost:11434',
        });
        return ollamaProvider.embedding(this.config.model || 'nomic-embed-text');

      default:
        // Anthropic doesn't have embeddings, use OpenAI as fallback
        if (process.env.OPENAI_API_KEY) {
          return createOpenAI().embedding('text-embedding-3-small');
        }
        throw new Error(`Provider ${this.config.type} does not support embeddings`);
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      // Convert tools to Vercel AI SDK v6 format with CoreTool
      const tools = request.tools
        ? Object.fromEntries(
            request.tools.map((t) => [
              t.function.name,
              {
                description: t.function.description,
                parameters: this.convertParametersToZod(t.function.parameters),
              },
            ])
          )
        : undefined;

      const result = await generateText({
        model: this.model,
        messages: this.convertMessages(request.messages),
        tools: tools as any,
        toolChoice: request.tool_choice as any,
        temperature: request.temperature,
      });

      // Convert tool calls back to our format
      const tool_calls: ToolCall[] | undefined = result.toolCalls?.map((tc: any) => ({
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
        usage: result.usage ? {
          prompt_tokens: (result.usage as any).promptTokens || 0,
          completion_tokens: (result.usage as any).completionTokens || 0,
          total_tokens: result.usage.totalTokens || 0,
        } : undefined,
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
            request.tools.map((t) => [
              t.function.name,
              {
                description: t.function.description,
                parameters: this.convertParametersToZod(t.function.parameters),
              },
            ])
          )
        : undefined;

      const result = await streamText({
        model: this.model,
        messages: this.convertMessages(request.messages),
        tools: tools as any,
        toolChoice: request.tool_choice as any,
        temperature: request.temperature,
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
        finish_reason: (finalResult as any).finishReason === 'tool-calls' ? 'tool_calls' : 'stop',
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

  private convertParametersToZod(parameters: any): z.ZodObject<any> {
    // Convert JSON Schema to Zod schema
    const shape: any = {};

    if (parameters.properties) {
      for (const [key, value] of Object.entries(parameters.properties as any)) {
        const prop = value as any;
        let zodType: any;

        switch (prop.type) {
          case 'string':
            zodType = prop.enum ? z.enum(prop.enum) : z.string();
            break;
          case 'number':
            zodType = z.number();
            break;
          case 'boolean':
            zodType = z.boolean();
            break;
          case 'array':
            zodType = z.array(z.any());
            break;
          case 'object':
            zodType = z.object({});
            break;
          default:
            zodType = z.any();
        }

        // Add description if available
        if (prop.description) {
          zodType = zodType.describe(prop.description);
        }

        // Make optional if not required
        if (!parameters.required?.includes(key)) {
          zodType = zodType.optional();
        }

        shape[key] = zodType;
      }
    }

    return z.object(shape);
  }
}

/**
 * Create provider using Vercel AI SDK
 */
export function createVercelAIProvider(config: ProviderConfig): LLMProvider {
  return new VercelAIProvider(config);
}
