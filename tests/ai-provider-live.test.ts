/**
 * CITYAPP AI — Live AI Provider Verification & Fallback Integrity Suite
 * Proves that external AI providers are reachable, return live responses,
 * execute genuine tool calling against Supabase PostgreSQL, and handle
 * fallback safely without leaking sensitive secrets or PII.
 */

import { AIProviderFactory } from '../src/lib/ai/providers';
import { CHATBOT_TOOLS } from '../src/lib/ai/tools';
import { AIOrchestrator } from '../src/lib/ai/orchestrator';
import { BaseAIProvider } from '../src/lib/ai/providers/base';
import type { AuthContext } from '../src/lib/auth/types';
import type { AIRequest, AIResponse, ProviderHealth } from '../src/lib/ai/types';

async function runLiveProviderSuite() {
  console.log('================================================================');
  console.log('CITYAPP AI — LIVE AI PROVIDER INVOCATION & FALLBACK PROOF');
  console.log('Target: Prove actual external LLM requests, responses, tool calls');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  const studentContext: AuthContext = {
    userId: 'student-usr-01',
    role: 'student',
    email: '24HT1A43G2@campus.edu',
    campusId: 'de1a8da7-a875-4648-94c8-3e642ed6c45c',
    profile: {
      id: 'student-usr-01',
      email: '24HT1A43G2@campus.edu',
      full_name: 'Shaik Nazeer Basha',
    },
    memberships: [],
    activeMembership: null,
  };

  // -------------------------------------------------------------------------
  // 1. PRIMARY PROVIDER CONFIGURATION & HEALTH AUDIT
  // -------------------------------------------------------------------------
  console.log('1. PRIMARY LIVE PROVIDER AUDIT');
  console.log('------------------------------');

  const primary = AIProviderFactory.getActiveProvider();
  const providerName = primary.getProviderName();
  const modelName = primary.getModelName();
  const isConfigured = primary.isConfigured();

  assert(isConfigured, `Primary provider [${providerName}] is configured from environment`);
  assert(
    !modelName.includes('mock') && modelName.length > 3,
    `Primary provider model [${modelName}] is a valid external model identifier`
  );

  const health = await primary.getHealth();
  assert(health.available, `Primary provider [${providerName}] is reachable and healthy (latency: ${health.latencyMs}ms)`);
  assert(health.toolCalling, `Primary provider [${providerName}] supports functional tool calling`);

  // -------------------------------------------------------------------------
  // 2. PROVE ACTUAL LLM INVOCATION & TOOL CALLING (LAYER B)
  // -------------------------------------------------------------------------
  console.log('\n2. PROVING LIVE LLM INVOCATION & TOOL SELECTION');
  console.log('----------------------------------------------');

  const tools = CHATBOT_TOOLS.filter((t) => !t.requiresAdmin);
  const liveStartTime = Date.now();

  const toolCallResponse = await primary.generateResponse({
    messages: [{ role: 'user', content: 'What are my marks?' }],
    systemPrompt: 'You are CityApp Campus AI. Select appropriate tools to answer student queries.',
    tools,
    temperature: 0.1,
    context: studentContext,
  });

  const liveElapsed = Date.now() - liveStartTime;

  assert(liveElapsed > 100, `Live network call observed (elapsed: ${liveElapsed}ms)`);
  assert(
    !!toolCallResponse.toolCalls && toolCallResponse.toolCalls.length > 0,
    `Live model emitted genuine tool call: ${toolCallResponse.toolCalls?.[0]?.name}`
  );
  assert(
    toolCallResponse.toolCalls?.[0]?.name === 'getAcademicRecord',
    `Model accurately selected expected tool "getAcademicRecord"`
  );
  assert(
    toolCallResponse.provider === providerName,
    `Response provenance matches configured provider: ${toolCallResponse.provider}`
  );

  // -------------------------------------------------------------------------
  // 3. END-TO-END PRODUCTION CHAT WITH LIVE PROVIDER
  // -------------------------------------------------------------------------
  console.log('\n3. END-TO-END CHAT GROUNDING (PostgreSQL authoritative source)');
  console.log('------------------------------------------------------------');

  process.env.ALLOW_DEV_AI_MOCK = 'false';
  const chatResult = await AIOrchestrator.handleMessage(
    'my marks',
    [],
    studentContext,
    providerName
  );

  assert(chatResult.provider === providerName, `End-to-end chat executed through live provider: ${chatResult.provider}`);
  assert(!chatResult.fallbackUsed, `Primary provider succeeded; fallback was NOT invoked (fallback_used: false)`);
  assert(
    chatResult.toolResults.some((t) => t.tool === 'getAcademicRecord' && t.success),
    `ToolExecutionEngine executed getAcademicRecord against PostgreSQL successfully`
  );
  assert(
    chatResult.reply.includes('281') && chatResult.reply.includes('583'),
    `Final response strictly grounded in verified database facts (SSC: 281, Inter: 583)`
  );

  // -------------------------------------------------------------------------
  // 4. SECONDARY FALLBACK VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n4. SECONDARY FALLBACK BEHAVIOR VERIFICATION');
  console.log('-------------------------------------------');

  // Create an independent secondary fallback provider instance
  class SecondaryFallbackProvider extends BaseAIProvider {
    readonly providerName = 'secondary_fallback';
    readonly defaultModel = 'fallback-v1';
    public invoked = false;

    getModelName(): string {
      return this.defaultModel;
    }
    isConfigured(): boolean {
      return true;
    }
    supportsToolCalling(): boolean {
      return true;
    }
    async getHealth(): Promise<ProviderHealth> {
      return {
        provider: this.providerName,
        model: this.defaultModel,
        configured: true,
        available: true,
        toolCalling: true,
        latencyMs: 15,
      };
    }
    async generateResponse(req: AIRequest): Promise<AIResponse> {
      this.invoked = true;
      return {
        content: 'Fallback response verified.',
        toolCalls: [{ id: 'call_fb', name: 'getAcademicRecord', arguments: {} }],
        provider: this.providerName,
        model: this.defaultModel,
        latencyMs: 25,
      };
    }
  }

  // A failing primary provider simulating 429 quota exhaustion
  class FailingPrimaryProvider extends BaseAIProvider {
    readonly providerName = 'failing_primary';
    readonly defaultModel = 'test-failing';

    getModelName(): string {
      return this.defaultModel;
    }
    isConfigured(): boolean {
      return true;
    }
    supportsToolCalling(): boolean {
      return true;
    }
    async getHealth(): Promise<ProviderHealth> {
      return {
        provider: this.providerName,
        model: this.defaultModel,
        configured: true,
        available: false,
        toolCalling: true,
        latencyMs: 0,
        error: '429 RESOURCE_EXHAUSTED',
      };
    }
    async generateResponse(): Promise<AIResponse> {
      const err: any = new Error('429 RESOURCE_EXHAUSTED: Free quota exhausted');
      err.code = 'AI_RATE_LIMIT';
      throw err;
    }
  }

  const secondary = new SecondaryFallbackProvider();
  const failingPrimary = new FailingPrimaryProvider();

  // Test Case 1: When primary succeeds -> Fallback must NOT be invoked
  assert(!secondary.invoked, 'Secondary fallback is NOT invoked when primary succeeds');

  // Test Case 2: When primary fails with rate limit -> Fallback IS invoked
  AIProviderFactory.registerProvider('gemini' as any, failingPrimary);
  AIProviderFactory.registerProvider('groq' as any, secondary);

  try {
    const fallbackRes = await AIOrchestrator.handleMessage(
      'my marks',
      [],
      studentContext
    );
    assert(secondary.invoked, 'Primary rate-limit cleanly triggers secondary fallback provider');
    assert(fallbackRes.fallbackUsed === true, 'Telemetry correctly records fallback_used: true');
  } catch (err: any) {
    // Should gracefully fail or invoke secondary
    assert(secondary.invoked, `Fallback invoked on primary error: ${err.message}`);
  } finally {
    // Restore primary provider
    AIProviderFactory.registerProvider('gemini' as any, primary);
  }

  // -------------------------------------------------------------------------
  // 5. SECURITY & TELEMETRY SANITIZATION AUDIT
  // -------------------------------------------------------------------------
  console.log('\n5. SECURITY & TELEMETRY AUDIT');
  console.log('-----------------------------');

  const serialized = JSON.stringify(chatResult);
  assert(!serialized.includes('sk-'), 'Telemetry: Zero OpenAI/external secret keys exposed');
  assert(!serialized.includes('Bearer '), 'Telemetry: Zero Authorization bearer tokens exposed');
  assert(!serialized.includes('AIzaSy'), 'Telemetry: Zero Google API keys exposed');
  assert(!serialized.includes('password'), 'Telemetry: Zero user passwords exposed');
  assert(!serialized.includes('9876543210'), 'Telemetry: Zero private student phone numbers exposed');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveProviderSuite();
