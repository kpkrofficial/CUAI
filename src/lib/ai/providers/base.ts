import {
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type ProviderHealth,
  type AIToolCall,
  AIError,
  type AIErrorCode,
} from '../types';
import type { ToolDefinition } from '../tools';

export abstract class BaseAIProvider implements AIProvider {
  abstract readonly providerName: string;
  abstract readonly defaultModel: string;

  abstract getModelName(): string;
  abstract isConfigured(): boolean;
  abstract supportsToolCalling(): boolean;
  abstract generateResponse(request: AIRequest): Promise<AIResponse>;
  abstract getHealth(): Promise<ProviderHealth>;

  getProviderName(): string {
    return this.providerName;
  }

  /**
   * Converts canonical tools to standard OpenAI-compatible tool schemas
   * (used by OpenRouter, Groq, and Ollama)
   */
  protected formatOpenAITools(tools?: ToolDefinition[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * Safely parses JSON arguments from LLM function call responses
   */
  protected parseToolArguments(rawArgs: any): Record<string, any> {
    if (typeof rawArgs === 'object' && rawArgs !== null) {
      return rawArgs;
    }
    if (typeof rawArgs === 'string') {
      try {
        return JSON.parse(rawArgs);
      } catch {
        // Fallback: try stripping markdown code blocks
        const stripped = rawArgs.replace(/```json/g, '').replace(/```/g, '').trim();
        try {
          return JSON.parse(stripped);
        } catch {
          return { _raw: rawArgs };
        }
      }
    }
    return {};
  }

  /**
   * Normalizes arbitrary HTTP and provider errors into typed AIErrors
   */
  protected normalizeHttpError(err: any, status?: number, body?: any): AIError {
    let code: AIErrorCode = 'AI_PROVIDER_ERROR';
    let retryable = false;
    let retryDelayMs: number | undefined;

    const errMsg = body?.error?.message || err?.message || 'Unknown provider error';
    const lower = errMsg.toLowerCase();

    if (status === 401 || status === 403 || lower.includes('api key') || lower.includes('unauthorized')) {
      code = 'AI_AUTH_ERROR';
    } else if (
      status === 429 ||
      lower.includes('rate limit') ||
      lower.includes('quota') ||
      lower.includes('resource_exhausted')
    ) {
      code = 'AI_RATE_LIMIT';
      retryable = true;
      // Extract retry delay if available in error headers/body
      const delaySecMatch = errMsg.match(/retry in ([0-9]+(?:\.[0-9]+)?)\s*s/i) || errMsg.match(/retryDelay["']?:\s*["']?([0-9]+)/i);
      if (delaySecMatch) {
        retryDelayMs = Math.ceil(parseFloat(delaySecMatch[1])) * 1000;
      }
    } else if (status === 404 || lower.includes('not found') || lower.includes('model')) {
      code = 'AI_MODEL_UNAVAILABLE';
    } else if (status === 408 || status === 504 || lower.includes('timeout')) {
      code = 'AI_TIMEOUT';
      retryable = true;
    } else if (status === 500 || status === 502 || status === 503 || lower.includes('temporarily unavailable')) {
      code = 'AI_PROVIDER_ERROR';
      retryable = true;
    }

    return new AIError(errMsg, {
      code,
      provider: this.providerName,
      statusCode: status,
      retryable,
      retryDelayMs,
      cause: err,
    });
  }

  /**
   * Executes fetch with timeout
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new AIError(`Request to ${this.providerName} timed out after ${timeoutMs}ms`, {
          code: 'AI_TIMEOUT',
          provider: this.providerName,
          retryable: true,
        });
      }
      throw err;
    } finally {
      clearTimeout(id);
    }
  }
}
