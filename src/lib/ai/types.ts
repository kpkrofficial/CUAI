import type { AuthContext } from '@/lib/auth/types';
import type { ToolDefinition } from './tools';

export type AIProviderType = 'gemini' | 'openrouter' | 'groq' | 'ollama';

export type AIErrorCode =
  | 'AI_AUTH_ERROR'
  | 'AI_RATE_LIMIT'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'AI_TOOL_CALL_ERROR'
  | 'AI_CONFIGURATION_ERROR'
  | 'AI_UNAVAILABLE';

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly provider: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly retryDelayMs?: number;

  constructor(
    message: string,
    options: {
      code: AIErrorCode;
      provider: string;
      statusCode?: number;
      retryable?: boolean;
      retryDelayMs?: number;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'AIError';
    this.code = options.code;
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryDelayMs = options.retryDelayMs;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: AIToolCall[];
}

export interface AIUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AIResponse {
  content: string;
  toolCalls?: AIToolCall[];
  provider: string;
  model: string;
  latencyMs: number;
  usage?: AIUsage;
  finishReason?: string;
  raw?: any;
}

export interface AIRequest {
  messages: AIMessage[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  context?: AuthContext;
}

export interface ProviderHealth {
  provider: string;
  model: string;
  configured: boolean;
  available: boolean;
  toolCalling: boolean;
  latencyMs?: number;
  error?: string;
  details?: Record<string, any>;
}

export interface AIProvider {
  getProviderName(): string;
  getModelName(): string;
  isConfigured(): boolean;
  supportsToolCalling(): boolean;
  generateResponse(request: AIRequest): Promise<AIResponse>;
  getHealth(): Promise<ProviderHealth>;
}
