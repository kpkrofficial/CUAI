import { BaseAIProvider } from './base';
import {
  type AIRequest,
  type AIResponse,
  type ProviderHealth,
  type AIToolCall,
  AIError,
} from '../types';

export class OllamaProvider extends BaseAIProvider {
  readonly providerName = 'ollama';
  readonly defaultModel = 'llama3.2';

  getBaseUrl(): string {
    const raw = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const trimmed = raw.replace(/\/+$/, '');
    return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  }

  getModelName(): string {
    return process.env.OLLAMA_MODEL || process.env.AI_MODEL || this.defaultModel;
  }

  isConfigured(): boolean {
    // Configured if explicitly selected or explicitly enabled
    return (
      process.env.AI_PROVIDER === 'ollama' ||
      process.env.ENABLE_OLLAMA === 'true' ||
      !!process.env.OLLAMA_BASE_URL
    );
  }

  supportsToolCalling(): boolean {
    // Ollama supports OpenAI-compatible function calling on models like llama3.1, llama3.2, qwen2.5, mistral
    return true;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    const baseUrl = this.getBaseUrl();
    const modelName = this.getModelName();
    const startTime = Date.now();

    // 1. Format messages into OpenAI-compatible format
    const messages: any[] = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        messages.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId || `call_${Date.now()}`,
          name: msg.name,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant', content: msg.content || '' };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          }));
        }
        messages.push(assistantMsg);
      } else {
        messages.push({ role: 'user', content: msg.content });
      }
    }

    // 2. Format canonical tools
    const tools = this.formatOpenAITools(request.tools);

    const payload: Record<string, any> = {
      model: modelName,
      messages,
      temperature: request.temperature ?? 0.1,
      stream: false,
    };

    if (request.maxTokens) {
      payload.max_tokens = request.maxTokens;
    }

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    try {
      const response = await this.fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }, 45000); // 45s for local model inference

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch (_) {}
        throw this.normalizeHttpError(
          new Error(errorData?.error?.message || `Ollama returned HTTP ${response.status}`),
          response.status,
          errorData
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const message = choice?.message;

      // Extract tool calls
      const toolCalls: AIToolCall[] = [];
      if (message?.tool_calls && message.tool_calls.length > 0) {
        for (const tc of message.tool_calls) {
          if (tc.type === 'function' && tc.function) {
            toolCalls.push({
              id: tc.id || `call_${Date.now()}`,
              name: tc.function.name,
              arguments: this.parseToolArguments(tc.function.arguments),
            });
          }
        }
      }

      // Extract usage
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined;

      return {
        content: message?.content?.trim() || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        provider: this.providerName,
        model: data.model || modelName,
        latencyMs,
        usage,
        finishReason: choice?.finish_reason,
        raw: data,
      };
    } catch (err: any) {
      if (err instanceof AIError) throw err;
      throw this.normalizeHttpError(err);
    }
  }

  async getHealth(): Promise<ProviderHealth> {
    const configured = this.isConfigured();
    const model = this.getModelName();
    const baseUrl = this.getBaseUrl();

    if (!configured) {
      return {
        provider: this.providerName,
        model,
        configured: false,
        available: false,
        toolCalling: this.supportsToolCalling(),
        error: 'OLLAMA is not configured (set AI_PROVIDER=ollama or OLLAMA_BASE_URL)',
      };
    }

    const start = Date.now();
    try {
      const response = await this.fetchWithTimeout(`${baseUrl}/models`, { method: 'GET' }, 5000);
      const latencyMs = Date.now() - start;

      return {
        provider: this.providerName,
        model,
        configured: true,
        available: response.ok,
        toolCalling: this.supportsToolCalling(),
        latencyMs,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (err: any) {
      return {
        provider: this.providerName,
        model,
        configured: true,
        available: false,
        toolCalling: this.supportsToolCalling(),
        latencyMs: Date.now() - start,
        error: err.message || 'Cannot reach local Ollama daemon at ' + baseUrl,
      };
    }
  }
}
