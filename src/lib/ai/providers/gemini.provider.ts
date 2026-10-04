import { GoogleGenAI } from '@google/genai';
import { BaseAIProvider } from './base';
import {
  type AIRequest,
  type AIResponse,
  type ProviderHealth,
  type AIToolCall,
  AIError,
} from '../types';

export class GeminiProvider extends BaseAIProvider {
  readonly providerName = 'gemini';
  readonly defaultModel = 'gemini-3-flash-preview';

  private client: GoogleGenAI | null = null;

  constructor() {
    super();
    this.initClient();
  }

  private initClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.startsWith('your_') || key.length < 15) {
      this.client = null;
      return null;
    }
    this.client = new GoogleGenAI({ apiKey: key });
    return this.client;
  }

  getModelName(): string {
    return process.env.GEMINI_MODEL || process.env.AI_MODEL || this.defaultModel;
  }

  isConfigured(): boolean {
    const key = process.env.GEMINI_API_KEY;
    return !!key && !key.startsWith('your_') && key.length >= 15;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    if (!this.client) {
      this.initClient();
    }
    if (!this.client) {
      throw new AIError('Gemini API key is not configured. Set GEMINI_API_KEY in .env.local', {
        code: 'AI_CONFIGURATION_ERROR',
        provider: this.providerName,
      });
    }

    const modelName = this.getModelName();
    const startTime = Date.now();

    // 1. Build function declarations from canonical tools
    const functionDeclarations = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    // 2. Build contents compatible with @google/genai
    const contents: any[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        // System instructions handled in config
        continue;
      }

      if (msg.role === 'tool') {
        // Tool execution result passed back
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'tool_response',
                response: { output: this.parseToolArguments(msg.content) },
              },
            },
          ],
        });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          contents.push({
            role: 'model',
            parts: msg.toolCalls.map((tc) => ({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            })),
          });
        } else {
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }],
          });
        }
      } else {
        // User message
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    try {
      const response = await this.client.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: request.systemPrompt,
          temperature: request.temperature ?? 0.1,
          maxOutputTokens: request.maxTokens,
          tools: functionDeclarations && functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
        },
      });

      const latencyMs = Date.now() - startTime;

      // Extract tool calls
      const toolCalls: AIToolCall[] = [];
      if (response.functionCalls && response.functionCalls.length > 0) {
        for (const call of response.functionCalls) {
          toolCalls.push({
            id: call.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: call.name || '',
            arguments: this.parseToolArguments(call.args),
          });
        }
      }

      // Extract token usage
      const usageMeta = (response as any).usageMetadata;
      const usage = usageMeta
        ? {
            promptTokens: usageMeta.promptTokenCount,
            completionTokens: usageMeta.candidatesTokenCount,
            totalTokens: usageMeta.totalTokenCount,
          }
        : undefined;

      const finishReason = response.candidates?.[0]?.finishReason;

      return {
        content: response.text?.trim() || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        provider: this.providerName,
        model: modelName,
        latencyMs,
        usage,
        finishReason,
        raw: response,
      };
    } catch (err: any) {
      const status = err.status || err.statusCode || (err.message?.includes('429') ? 429 : (err.message?.includes('404') ? 404 : 500));
      throw this.normalizeHttpError(err, status, err);
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
        error: 'GEMINI_API_KEY is missing or invalid',
      };
    }

    const start = Date.now();
    try {
      if (!this.client) this.initClient();
      if (!this.client) throw new Error('Client initialization failed');

      // Lightweight ping
      const res = await this.client.models.generateContent({
        model,
        contents: 'ping',
        config: { maxOutputTokens: 5 },
      });

      return {
        provider: this.providerName,
        model,
        configured: true,
        available: !!res.text,
        toolCalling: this.supportsToolCalling(),
        latencyMs: Date.now() - start,
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
