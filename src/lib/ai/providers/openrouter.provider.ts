import { BaseAIProvider } from './base';
import {
  type AIRequest,
  type AIResponse,
  type ProviderHealth,
  type AIToolCall,
  AIError,
} from '../types';

export class OpenRouterProvider extends BaseAIProvider {
  readonly providerName = 'openrouter';
  readonly defaultModel = 'meta-llama/llama-3.3-70b-instruct';
  readonly baseUrl = 'https://openrouter.ai/api/v1';

  getModelName(): string {
    return process.env.OPENROUTER_MODEL || process.env.AI_MODEL || this.defaultModel;
  }

  isConfigured(): boolean {
    const key = process.env.OPENROUTER_API_KEY;
    return !!key && !key.startsWith('your_') && key.length >= 15;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key || key.startsWith('your_')) {
      throw new AIError('OpenRouter API key is not configured. Set OPENROUTER_API_KEY in .env.local', {
        code: 'AI_CONFIGURATION_ERROR',
        provider: this.providerName,
      });
    }

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
      max_tokens: request.maxTokens,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://cityapp.ai',
          'X-Title': 'CityApp Campus AI',
        },
        body: JSON.stringify(payload),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch (_) {}
        throw this.normalizeHttpError(
          new Error(errorData?.error?.message || `OpenRouter returned HTTP ${response.status}`),
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

      // Extract usage metadata
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined;

      // Note: OpenRouter returns data.model which indicates the actual provider/model used
      const actualModel = data.model || modelName;

      return {
        content: message?.content?.trim() || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        provider: this.providerName,
        model: actualModel,
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

    if (!configured) {
      return {
        provider: this.providerName,
        model,
        configured: false,
        available: false,
        toolCalling: this.supportsToolCalling(),
        error: 'OPENROUTER_API_KEY is not configured',
      };
    }

    const start = Date.now();
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
      }, 8000);

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
        error: err.message || 'Health check failed',
      };
    }
  }
}
