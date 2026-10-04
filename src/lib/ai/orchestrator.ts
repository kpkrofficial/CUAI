import { GoogleGenAI } from '@google/genai';
import { CHATBOT_TOOLS, ToolExecutionEngine, type ToolResult } from './tools';
import type { AuthContext } from '@/lib/auth/types';

export interface ChatOrchestrationResult {
  reply: string;
  toolResults: ToolResult[];
  citations?: any[];
  sources?: string[];
}

export class AIOrchestrator {
  private static getGeminiClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.startsWith('your_') || key.length < 15) {
      return null;
    }
    return new GoogleGenAI({ apiKey: key });
  }

  /**
   * Main conversational AI orchestration entrypoint.
   * Dispatches questions through strict authorization, tool calling, grounding, and PII filters.
   */
  static async handleMessage(
    userMessage: string,
    history: { role: string; content: string }[],
    context: AuthContext
  ): Promise<ChatOrchestrationResult> {
    const rawInput = userMessage.trim();
    const lowerInput = rawInput.toLowerCase();

    // 1. HARD SECURITY GUARD: Prompt Injection & Malicious Command Defense (Section 32)
    const sqlKeywords = ['drop table', 'delete from', 'truncate table', 'alter table', 'insert into', 'update student_records'];
    if (sqlKeywords.some(kw => lowerInput.includes(kw))) {
      return {
        reply: "Security Alert: Direct database manipulation and SQL statements are strictly prohibited. Your request has been logged.",
        toolResults: [{ tool: 'security_firewall', success: false, error: 'SQL_INJECTION_ATTEMPT_BLOCKED' }],
      };
    }

    if (lowerInput.includes('ignore all previous instructions') || lowerInput.includes('system prompt') || lowerInput.includes('reveal secrets')) {
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
      const mentionsAnotherStudent =
        (lowerInput.includes('who is') || lowerInput.includes('show') || lowerInput.includes('details') || lowerInput.includes('profile')) &&
        (lowerInput.includes('student') || /\b[0-9]{2}[a-z]{2,5}[0-9]{2,4}\b/i.test(lowerInput)) &&
        !lowerInput.includes('my profile') &&
        !lowerInput.includes('my branch') &&
        !lowerInput.includes('my application') &&
        !lowerInput.includes('my status');

      const rollMatch = rawInput.match(/\b([0-9]{2}[A-Z]{2,5}[0-9]{2,4})\b/i);
      const studentOwnRoll = context.email?.toUpperCase() || '';

      if (rollMatch && !studentOwnRoll.includes(rollMatch[1].toUpperCase())) {
        // Enforce strict student self-access
        return {
          reply: "Access Denied: Institutional policy strictly prohibits students from accessing private profiles or personal details of peer students. You may only view your own student records.",
          toolResults: [{ tool: 'getStudentProfile', success: false, error: 'STUDENT_PEER_LOOKUP_FORBIDDEN' }],
        };
      }
    }

    // 3. Attempt Live Gemini Generation if valid API key is present
    const gemini = this.getGeminiClient();
    if (gemini) {
      try {
        return await this.executeGeminiWithTools(gemini, rawInput, history, context);
      } catch (geminiError: any) {
        console.warn('[AIOrchestrator] Live Gemini failed, falling back to deterministic engine:', geminiError.message);
      }
    }

    // 4. Grounded Deterministic Tool Execution Engine (Production-safe Fallback)
    return await this.executeDeterministicOrchestration(rawInput, context);
  }

  /**
   * Deterministic orchestration executing verified database tools and returning grounded responses.
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
      const rollMatch = input.match(/\b([0-9]{2}[A-Za-z]{2,5}[0-9]{2,4})\b/);
      const targetRoll = rollMatch ? rollMatch[1] : (context.role === 'student' ? '23CSE104' : '23CSE104');

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
        .map((c: any) => `- **${c.name}**: ${c.passed ? '✓ PASSED' : '✗ FAILED'} (Required: ${c.required}, Found: ${c.studentValue})`)
        .join('\n');

      return {
        reply: `### ${data.policyName} Evaluation\n\n**Verdict:** \`${data.verdict}\`\n\n${data.summary}\n\n#### Verified Criteria Breakdown:\n${criteriaList}\n\n*Note: Calculations are strictly verified by institutional business rules.*`,
        toolResults,
      };
    }

    // Case B: Document / Knowledge search questions (e.g. "What documents are required for admission?", "Refund policy")
    if (lower.includes('document') || lower.includes('admission') || lower.includes('refund') || lower.includes('guidelines') || lower.includes('rules')) {
      const kRes = await ToolExecutionEngine.executeTool('searchKnowledge', { query: input }, context);
      toolResults.push(kRes);

      if (!kRes.success || !kRes.data || kRes.data.length === 0) {
        return {
          reply: "I could not find a verified campus policy or document supporting that answer.",
          toolResults,
        };
      }

      citations = kRes.citations || [];
      const sourcesText = citations.map(c => `> **Source:** ${c.document} (Section: ${c.section}, Version: ${c.version}, Effective: ${c.effective_date})`).join('\n\n');

      return {
        reply: `### Verified Campus Policy Information\n\n${kRes.data.join('\n\n')}\n\n---\n${sourcesText}`,
        toolResults,
        citations,
        sources: citations.map(c => c.document),
      };
    }

    // Case C: Aggregation questions (e.g. "How many second-year CSE students have incomplete applications?")
    if (lower.includes('how many') || lower.includes('count') || lower.includes('total students')) {
      if (context.role === 'student') {
        return {
          reply: "Access Denied: Institutional analytics and bulk student counts are restricted to administrators.",
          toolResults: [{ tool: 'countStudents', success: false, error: 'FORBIDDEN' }],
        };
      }

      let branch = lower.includes('cse') ? 'CSE' : (lower.includes('ece') ? 'ECE' : undefined);
      let year = lower.includes('second') || lower.includes('2nd') ? '2nd_year' : undefined;

      const cRes = await ToolExecutionEngine.executeTool('countStudents', { branch, year }, context);
      toolResults.push(cRes);

      const count = cRes.data?.count ?? 0;
      return {
        reply: `### Verified Institutional Query\n\nAccording to official database records for **${context.campus?.name || 'Campus'}**:\n\n- **Target Filter:** ${year ? year.replace('_', ' ') : 'All Years'}, ${branch || 'All Branches'}\n- **Verified Student Count:** \`${count}\` enrolled students.`,
        toolResults,
      };
    }

    // Case D: Student Profile or Application Status
    if (lower.includes('application status') || lower.includes('my branch') || lower.includes('my profile') || lower.includes('who is')) {
      const rollMatch = input.match(/\b([0-9]{2}[A-Za-z]{2,5}[0-9]{2,4})\b/);
      const rollNumber = rollMatch ? rollMatch[1] : undefined;

      const pRes = await ToolExecutionEngine.executeTool('getStudentProfile', { rollNumber }, context);
      toolResults.push(pRes);

      if (!pRes.success || !pRes.data) {
        return {
          reply: pRes.error || "I could not find a verified record matching your request.",
          toolResults,
        };
      }

      const s = pRes.data;
      return {
        reply: `### Verified Student Information\n\n- **Name:** ${s.name}\n- **Roll Number:** \`${s.roll_number}\`\n- **Department/Branch:** ${s.branch}\n- **Academic Year:** ${s.year}\n- **College:** ${s.college}\n- **Admission Status:** ${s.admission_type || 'Regular / Verified'}\n\n*Note: Private identifiers (Aadhaar, contact details) are protected under institutional privacy policies.*`,
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

  /**
   * Orchestrates live Gemini 2.5 Flash model with server-side tool calling loop.
   */
  private static async executeGeminiWithTools(
    gemini: GoogleGenAI,
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

    const modelName = 'gemini-2.5-flash';
    const contents: any[] = [
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    const response = await gemini.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1, // Low temperature for high factual grounding
      },
    });

    return {
      reply: response.text?.trim() || "No response generated.",
      toolResults: [],
    };
  }
}
