import { GeminiProvider } from './gemini.provider';
import { OpenRouterProvider } from './openrouter.provider';
import { GroqProvider } from './groq.provider';
import { OllamaProvider } from './ollama.provider';
import {
  type AIProvider,
  type AIProviderType,
  type ProviderHealth,
  type AIRequest,
  type AIResponse,
  AIError,
} from '../types';

export class AIProviderFactory {
  private static providers: Map<AIProviderType, AIProvider> = new Map();

  static initialize(): void {
    if (this.providers.size > 0) return;

    this.providers.set('gemini', new GeminiProvider());
    this.providers.set('openrouter', new OpenRouterProvider());
    this.providers.set('groq', new GroqProvider());
    this.providers.set('ollama', new OllamaProvider());
  }

  static registerProvider(name: AIProviderType, provider: AIProvider): void {
    this.initialize();
    this.providers.set(name, provider);
  }

  static getProvider(name?: string): AIProvider {
    this.initialize();

    const providerKey = (name || process.env.AI_PROVIDER || 'gemini').toLowerCase() as AIProviderType;
    const provider = this.providers.get(providerKey);

    if (!provider) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new AIError(`Unknown AI provider "${providerKey}". Available providers: ${available}`, {
        code: 'AI_CONFIGURATION_ERROR',
        provider: providerKey,
      });
    }

    return provider;
  }

  static getActiveProvider(): AIProvider {
    return this.getProvider();
  }

  static getAllProviders(): AIProvider[] {
    this.initialize();
    return Array.from(this.providers.values());
  }

  /**
   * Determine the fallback sequence of providers.
   * If primary fails, sequentially attempt configured providers.
   */
  static getFallbackChain(): AIProvider[] {
    this.initialize();
    const primary = this.getActiveProvider();
    const chain: AIProvider[] = [primary];

    // Allowed secondary fallbacks (in priority order)
    const candidates: AIProviderType[] = ['groq', 'openrouter', 'gemini'];

    for (const key of candidates) {
      const p = this.providers.get(key);
      if (p && p.getProviderName() !== primary.getProviderName() && p.isConfigured()) {
        chain.push(p);
      }
    }

    return chain;
  }

  /**
   * Executes request with controlled, policy-compliant fallback.
   * NEVER falls back to deterministic regex in production.
   */
  static async executeWithFallback(
    request: AIRequest,
    options?: { enableFallback?: boolean }
  ): Promise<{ response: AIResponse; attempts: Array<{ provider: string; error?: string }> }> {
    const isFallbackEnabled =
      options?.enableFallback ?? (process.env.AI_ENABLE_FALLBACK === 'true' || process.env.NODE_ENV !== 'production');

    const chain = isFallbackEnabled ? this.getFallbackChain() : [this.getActiveProvider()];
    const attempts: Array<{ provider: string; error?: string }> = [];

    let lastError: any = null;

    for (const provider of chain) {
      try {
        if (!provider.isConfigured()) {
          attempts.push({ provider: provider.getProviderName(), error: 'Not configured' });
          continue;
        }

        const response = await provider.generateResponse(request);
        attempts.push({ provider: provider.getProviderName() });

        return { response, attempts };
      } catch (err: any) {
        lastError = err;
        const msg = err.message || 'Unknown error';
        attempts.push({ provider: provider.getProviderName(), error: msg });

        // If error is non-retryable configuration error on primary without fallback enabled, halt immediately
        if (!isFallbackEnabled || (err instanceof AIError && err.code === 'AI_AUTH_ERROR' && chain.length === 1)) {
          throw err;
        }
      }
    }

    // All providers exhausted
    throw (
      lastError ||
      new AIError('All AI providers are currently unavailable', {
        code: 'AI_UNAVAILABLE',
        provider: 'orchestrator',
      })
    );
  }

  /**
   * Check health of all registered providers
   */
  static async checkAllHealth(): Promise<Record<string, ProviderHealth>> {
    this.initialize();
    const results: Record<string, ProviderHealth> = {};

    const checks = Array.from(this.providers.entries()).map(async ([key, provider]) => {
      try {
        results[key] = await provider.getHealth();
      } catch (err: any) {
        results[key] = {
          provider: key,
          model: provider.getModelName(),
          configured: provider.isConfigured(),
          available: false,
          toolCalling: provider.supportsToolCalling(),
          error: err.message || 'Health check error',
        };
      }
    });

    await Promise.all(checks);
    return results;
  }
}
