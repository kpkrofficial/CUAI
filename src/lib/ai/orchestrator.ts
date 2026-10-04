import { CHATBOT_TOOLS, ToolExecutionEngine, type ToolResult } from './tools';
import { StudentService } from '@/lib/services/student.service';
import type { AuthContext } from '@/lib/auth/types';
import {
  AIProviderFactory,
  type AIProvider,
  type AIMessage,
  type AIUsage,
} from './providers';

export interface ChatOrchestrationResult {
  reply: string;
  toolResults: ToolResult[];
  citations?: any[];
  sources?: string[];
  provider?: string;
  model?: string;
  latencyMs?: number;
  usage?: AIUsage;
}

export class AIOrchestrator {
  /**
   * Main conversational AI orchestration entrypoint.
   * Dispatches queries through strict authorization, multi-provider abstraction,
   * tool execution, grounding, and PII filters.
   */
  static async handleMessage(
    userMessage: string,
    history: { role: string; content: string }[],
    context: AuthContext,
    targetProviderName?: string
  ): Promise<ChatOrchestrationResult> {
    const rawInput = userMessage.trim();
    const lowerInput = rawInput.toLowerCase();

    // 1. HARD SECURITY GUARD: Prompt Injection & Malicious Command Defense (Section 32)
    const sqlKeywords = ['drop table', 'delete from', 'truncate table', 'alter table', 'insert into', 'update student_records'];
    if (sqlKeywords.some((kw) => lowerInput.includes(kw))) {
      return {
        reply: "Security Alert: Direct database manipulation and SQL statements are strictly prohibited. Your request has been logged.",
        toolResults: [{ tool: 'security_firewall', success: false, error: 'SQL_INJECTION_ATTEMPT_BLOCKED' }],
      };
    }

    if (
      (lowerInput.includes('ignore') && (lowerInput.includes('instruction') || lowerInput.includes('rule') || lowerInput.includes('prompt'))) ||
      lowerInput.includes('system prompt') ||
      lowerInput.includes('reveal secrets') ||
      (lowerInput.includes('access') && lowerInput.includes('database'))
    ) {
      return {
        reply: "I am CityApp Campus AI. I cannot override system security guidelines, disclose internal system configurations, or bypass institutional access policies.",
        toolResults: [{ tool: 'prompt_firewall', success: false, error: 'PROMPT_INJECTION_ATTEMPT_BLOCKED' }],
      };
    }

    // 2. HARD SECURITY GUARD: Strict PII Refusal (Section 22, 23)
    if (lowerInput.includes('aadhaar') || lowerInput.includes('aadhar')) {
      return {
        reply: "Privacy Protection Policy: Aadhaar numbers and national identity credentials are confidential and will never be disclosed through the campus assistant under any circumstances.",
        toolResults: [{ tool: 'pii_firewall', success: false, error: 'PII_AADHAAR_ACCESS_REFUSED' }],
      };
    }

    // Check for peer lookup attempt by student
    if (context.role === 'student') {
      const isPeerAttempt =
        lowerInput.includes('another student') ||
        lowerInput.includes('other student') ||
        lowerInput.includes('peer student') ||
        (lowerInput.includes('private information') && !lowerInput.includes('my'));

      const rollMatch = rawInput.match(/\b([0-9]{2}[A-Za-z0-9]{5,10})\b/);
      const studentOwnRoll = context.email?.toUpperCase() || '';

      if (isPeerAttempt || (rollMatch && !studentOwnRoll.includes(rollMatch[1].toUpperCase()))) {
        // Enforce strict student self-access
        return {
          reply: "Access Denied: Institutional policy strictly prohibits students from accessing private profiles or personal details of peer students. You may only view your own student records.",
          toolResults: [{ tool: 'getStudentProfile', success: false, error: 'STUDENT_PEER_LOOKUP_FORBIDDEN' }],
        };
      }
    }

    // 3. Multi-Provider AI Orchestration
    const isDevMockAllowed = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AI_MOCK === 'true';
    const provider = AIProviderFactory.getProvider(targetProviderName);

    if (provider.isConfigured()) {
      try {
        return await this.executeProviderWithTools(provider, rawInput, history, context);
      } catch (providerError: any) {
        console.error(`[AIOrchestrator] Provider ${provider.getProviderName()} failed:`, providerError.message);

        // Controlled fallback: Attempt next configured provider in fallback chain
        const isFallbackEnabled =
          process.env.AI_ENABLE_FALLBACK === 'true' ||
          !process.env.NODE_ENV ||
          process.env.NODE_ENV !== 'production';

        if (isFallbackEnabled && !targetProviderName) {
          const fallbackCandidates = AIProviderFactory.getFallbackChain().filter(
            (p) => p.getProviderName() !== provider.getProviderName() && p.isConfigured()
          );

          for (const fallback of fallbackCandidates) {
            try {
              console.log(`[AIOrchestrator] Attempting fallback to provider: ${fallback.getProviderName()}`);
              return await this.executeProviderWithTools(fallback, rawInput, history, context);
            } catch (fallbackError: any) {
              console.error(
                `[AIOrchestrator] Fallback provider ${fallback.getProviderName()} failed:`,
                fallbackError.message
              );
            }
          }
        }

        if (!isDevMockAllowed) {
          return {
            reply: "AI service is temporarily unavailable. Please try again later or contact campus administration.",
            toolResults: [
              {
                tool: `${provider.getProviderName()}_ai`,
                success: false,
                error: providerError.code || 'SERVICE_UNAVAILABLE',
              },
            ],
            provider: provider.getProviderName(),
            model: provider.getModelName(),
          };
        }
      }
    }

    // Guard: Production cannot silently fall back to deterministic regex engine
    if (!isDevMockAllowed) {
      return {
        reply: "AI service is temporarily unavailable. Please try again later or contact campus administration.",
        toolResults: [
          {
            tool: `${provider.getProviderName()}_ai`,
            success: false,
            error: 'AI_KEY_NOT_CONFIGURED',
          },
        ],
        provider: provider.getProviderName(),
        model: provider.getModelName(),
      };
    }

    // 4. Grounded Deterministic Tool Execution Engine (Development/Offline Testing Only)
    return await this.executeDeterministicOrchestration(rawInput, context);
  }

  /**
   * Universal multi-turn tool calling loop across any configured AIProvider.
   * Ensures the exact same ToolExecutionEngine, authorization, tenant checks,
   * and PII filtering are executed regardless of which LLM is running.
   */
  private static async executeProviderWithTools(
    provider: AIProvider,
    userMessage: string,
    history: { role: string; content: string }[],
    context: AuthContext
  ): Promise<ChatOrchestrationResult> {
    const systemPrompt = `You are CityApp Campus AI, an institutional information assistant.
You strictly adhere to these rules:
1. Grounding: Answer ONLY based on authorized tool output. If no tool result is found, say: "I could not find a verified record matching your request."
2. Do NOT invent student names, roll numbers, marks, counts, or policies.
3. Strict PII Protection: Never disclose Aadhaar numbers, parents' phone numbers, or residential addresses.
4. Tenant Isolation: You are serving ${context.campus?.name || 'Main Campus'} (Campus ID: ${context.campusId || 'default'}).
5. Role: The caller is an authenticated ${context.role}. Students can ONLY query their own records.`;

    // Filter tools by caller role to prevent unauthorized tool dispatch
    const authorizedTools = CHATBOT_TOOLS.filter((t) => !t.requiresAdmin || context.role !== 'student');

    // Build message history
    const messages: AIMessage[] = [
      ...history.map((h) => ({
        role: (h.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: h.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const toolResults: ToolResult[] = [];
    const citations: any[] = [];
    const sources: string[] = [];
    let totalLatency = 0;
    const accumulatedUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let lastModel = provider.getModelName();

    // Multi-turn tool calling loop (max 4 turns)
    for (let turn = 0; turn < 4; turn++) {
      const aiResponse = await provider.generateResponse({
        messages,
        systemPrompt,
        tools: authorizedTools,
        temperature: 0.1,
        context,
      });

      totalLatency += aiResponse.latencyMs;
      lastModel = aiResponse.model;
      if (aiResponse.usage) {
        accumulatedUsage.promptTokens += aiResponse.usage.promptTokens || 0;
        accumulatedUsage.completionTokens += aiResponse.usage.completionTokens || 0;
        accumulatedUsage.totalTokens += aiResponse.usage.totalTokens || 0;
      }

      // Check if provider requested tool calls
      if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
        // Record assistant turn in context
        messages.push({
          role: 'assistant',
          content: aiResponse.content || '',
          toolCalls: aiResponse.toolCalls,
        });

        // Execute each requested tool through the verified ToolExecutionEngine
        for (const call of aiResponse.toolCalls) {
          const execResult = await ToolExecutionEngine.executeTool(call.name, call.arguments || {}, context);
          toolResults.push(execResult);

          if (execResult.citations) {
            citations.push(...execResult.citations);
            sources.push(...execResult.citations.map((c: any) => c.document || ''));
          }

          // Pass tool results back to provider for multi-turn synthesis
          messages.push({
            role: 'tool',
            name: call.name,
            toolCallId: call.id,
            content: JSON.stringify(execResult.success ? execResult.data : { error: execResult.error }),
          });
        }
      } else {
        // Final grounded textual answer produced
        return {
          reply: aiResponse.content?.trim() || "Verified campus information retrieved.",
          toolResults,
          citations,
          sources: Array.from(new Set(sources)),
          provider: provider.getProviderName(),
          model: lastModel,
          latencyMs: totalLatency,
          usage: accumulatedUsage.totalTokens > 0 ? accumulatedUsage : undefined,
        };
      }
    }

    return {
      reply: "Verified campus information retrieved.",
      toolResults,
      citations,
      sources: Array.from(new Set(sources)),
      provider: provider.getProviderName(),
      model: lastModel,
      latencyMs: totalLatency,
      usage: accumulatedUsage.totalTokens > 0 ? accumulatedUsage : undefined,
    };
  }

  /**
   * Deterministic orchestration executing verified database tools and returning grounded responses.
   * STRICTLY RESTRICTED to local development and offline mock tests.
   */
  private static async executeDeterministicOrchestration(
    input: string,
    context: AuthContext
  ): Promise<ChatOrchestrationResult> {
    const lower = input.toLowerCase();
    const toolResults: ToolResult[] = [];
    let citations: any[] = [];

    // Case A: Eligibility questions
    if (lower.includes('eligible') || lower.includes('scholarship') || lower.includes('merit')) {
      const rollMatch = input.match(/\b([0-9]{2}[A-Za-z0-9]{5,10})\b/);
      let targetRoll = rollMatch ? rollMatch[1] : undefined;
      if (!targetRoll && context.role === 'student') {
        const own = await StudentService.getOwnStudentProfile(context);
        targetRoll = own?.roll_number;
      }
      if (!targetRoll) targetRoll = '23CSE104'; // Default test fixture for synthetic dev inquiries

      const evalRes = await ToolExecutionEngine.executeTool(
        'getEligibilityData',
        { rollNumber: targetRoll, policyType: 'merit_scholarship' },
        context
      );
      toolResults.push(evalRes);

      if (!evalRes.success) {
        return {
          reply: `I could not verify eligibility: ${evalRes.error}`,
          toolResults,
        };
      }

      const data = evalRes.data;
      const criteriaList = (data.criteria || [])
        .map(
          (c: any) =>
            `- **${c.name}**: ${c.passed ? '✓ PASSED' : '✗ FAILED'} (Required: ${c.required}, Found: ${c.studentValue})`
        )
        .join('\n');

      return {
        reply: `### ${data.policyName} Evaluation\n\n**Verdict:** \`${data.verdict}\`\n\n${data.summary}\n\n#### Verified Criteria Breakdown:\n${criteriaList}\n\n*Note: Calculations are strictly verified by institutional business rules.*`,
        toolResults,
      };
    }

    // Case B: Document / Knowledge search questions
    if (
      lower.includes('document') ||
      lower.includes('admission') ||
      lower.includes('refund') ||
      lower.includes('guidelines') ||
      lower.includes('rules')
    ) {
      const kRes = await ToolExecutionEngine.executeTool('searchKnowledge', { query: input }, context);
      toolResults.push(kRes);

      if (!kRes.success || !kRes.data || kRes.data.length === 0) {
        return {
          reply: "I could not find a verified campus policy or document supporting that answer.",
          toolResults,
        };
      }

      citations = kRes.citations || [];
      const sourcesText = citations
        .map(
          (c) =>
            `> **Source:** ${c.document} (Section: ${c.section}, Version: ${c.version}, Effective: ${c.effective_date})`
        )
        .join('\n\n');

      return {
        reply: `### Verified Campus Policy Information\n\n${kRes.data.join('\n\n')}\n\n---\n${sourcesText}`,
        toolResults,
        citations,
        sources: citations.map((c) => c.document),
      };
    }

    // Case C: Aggregation questions
    if (lower.includes('how many') || lower.includes('count') || lower.includes('total students')) {
      if (context.role === 'student') {
        return {
          reply: "Access Denied: Institutional analytics and bulk student counts are restricted to administrators.",
          toolResults: [{ tool: 'countStudents', success: false, error: 'FORBIDDEN' }],
        };
      }

      let branch = lower.includes('cse') ? 'CSE' : lower.includes('ece') ? 'ECE' : undefined;
      let year = lower.includes('second') || lower.includes('2nd') ? '2nd_year' : undefined;

      const cRes = await ToolExecutionEngine.executeTool('countStudents', { branch, year }, context);
      toolResults.push(cRes);

      const count = cRes.data?.count ?? 0;
      return {
        reply: `### Verified Institutional Query\n\nAccording to official database records for **${context.campus?.name || 'Campus'}**:\n\n- **Target Filter:** ${year ? year.replace('_', ' ') : 'All Years'}, ${branch || 'All Branches'}\n- **Verified Student Count:** \`${count}\` enrolled students.`,
        toolResults,
      };
    }

    // Case D: Student Profile, Academic Scores, or Application Status
    if (
      lower.includes('application status') ||
      lower.includes('my branch') ||
      lower.includes('my profile') ||
      lower.includes('who is') ||
      lower.includes('ssc') ||
      lower.includes('intermediate') ||
      lower.includes('cgpa') ||
      lower.includes('score') ||
      lower.includes('percentage') ||
      lower.includes('marks')
    ) {
      const rollMatch = input.match(/\b([0-9]{2}[A-Za-z0-9]{5,10})\b/);
      let rollNumber = rollMatch ? rollMatch[1] : undefined;

      if (!rollNumber) {
        if (lower.includes('shaik') || lower.includes('nazeer') || lower.includes('basha')) {
          rollNumber = '24HT1A43G2';
        } else if (lower.includes('gayatri') || lower.includes('tadiboina')) {
          rollNumber = '24HT1A43H7';
        } else if (lower.includes('karthik') || lower.includes('thokala')) {
          rollNumber = '25ht1a43m2';
        } else if (lower.includes('moneesha') || lower.includes('mannem')) {
          rollNumber = '24ht1a43a0';
        } else if (lower.includes('jyothi') || lower.includes('manvitha')) {
          rollNumber = '24ht1a4322';
        } else if (lower.includes('ramakoteswari') || lower.includes('avula')) {
          rollNumber = '24ht1a4309';
        } else if (context.role === 'student') {
          const own = await StudentService.getOwnStudentProfile(context);
          rollNumber = own?.roll_number;
        }
      }

      const pRes = await ToolExecutionEngine.executeTool('searchAcademicRecords', { rollNumber }, context);
      toolResults.push(pRes);

      if (!pRes.success || !pRes.data) {
        const profRes = await ToolExecutionEngine.executeTool('getStudentProfile', { rollNumber }, context);
        if (!profRes.success || !profRes.data) {
          return {
            reply: profRes.error || "I could not find a verified record matching your request.",
            toolResults,
          };
        }
        const s = profRes.data;
        return {
          reply: `### Verified Student Information\n\n- **Name:** ${s.name}\n- **Roll Number:** \`${s.roll_number}\`\n- **Department/Branch:** ${s.branch}\n- **Academic Year:** ${s.year}\n- **College:** ${s.college}\n- **Admission Status:** ${s.admission_type || 'Regular / Verified'}\n\n*Note: Private identifiers (Aadhaar, contact details) are protected under institutional privacy policies.*`,
          toolResults,
        };
      }

      const s = pRes.data;
      const academic = s.canonical_academic;
      const sscSummary = academic?.ssc?.display_summary || (s.ssc_marks ? `${s.ssc_marks}/600` : 'Not recorded');
      const interSummary =
        academic?.intermediate?.display_summary || (s.inter_marks ? `${s.inter_marks}%` : 'Not recorded');
      const cgpaSummary =
        academic?.prior_degree?.display_summary ||
        (academic?.highest_academic_cgpa ? `${academic.highest_academic_cgpa} CGPA` : 'Not recorded');

      if (lower.includes('ssc')) {
        return {
          reply: `### Verified Academic Record — SSC\n\n- **Student:** ${s.name} (\`${s.roll_number}\`)\n- **SSC Score:** \`${sscSummary}\`${academic?.ssc?.grade ? ` (Grade: ${academic.ssc.grade})` : ''}\n\n*Verified against official institutional academic records.*`,
          toolResults,
        };
      }

      if (lower.includes('intermediate') || lower.includes('inter')) {
        return {
          reply: `### Verified Academic Record — Intermediate\n\n- **Student:** ${s.name} (\`${s.roll_number}\`)\n- **Intermediate Percentage:** \`${interSummary}\`\n\n*Verified against official institutional academic records.*`,
          toolResults,
        };
      }

      if (lower.includes('cgpa')) {
        return {
          reply: `### Verified Academic Record — CGPA\n\n- **Student:** ${s.name} (\`${s.roll_number}\`)\n- **CGPA:** \`${cgpaSummary}\`\n\n*Verified against official institutional academic records.*`,
          toolResults,
        };
      }

      return {
        reply: `### Verified Student Academic Profile\n\n- **Name:** ${s.name}\n- **Roll Number:** \`${s.roll_number}\`\n- **Department/Branch:** ${s.branch}\n- **Academic Year:** ${s.year}\n- **SSC:** \`${sscSummary}\`\n- **Intermediate:** \`${interSummary}\`\n- **Prior Degree/CGPA:** \`${cgpaSummary}\`\n\n*Note: Private identifiers (Aadhaar, contact details) are protected under institutional privacy policies.*`,
        toolResults,
      };
    }

    // Default: Grounded campus information search
    const defaultSearch = await ToolExecutionEngine.executeTool('searchKnowledge', { query: input }, context);
    toolResults.push(defaultSearch);

    if (defaultSearch.success && defaultSearch.data?.length > 0) {
      return {
        reply: `Based on verified campus documentation:\n\n${defaultSearch.data[0]}`,
        toolResults,
        citations: defaultSearch.citations,
      };
    }

    return {
      reply: "I could not find a verified record or campus policy matching your request. Please specify your query or contact the campus administration office.",
      toolResults,
    };
  }
}
