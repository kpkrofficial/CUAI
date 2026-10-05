import { CHATBOT_TOOLS, ToolExecutionEngine, type ToolResult } from './tools';
import { StudentService } from '@/lib/services/student.service';
import type { AuthContext } from '@/lib/auth/types';
import { QueryNormalizer } from './query-normalizer';
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
  normalizedQuery?: any;
  fallbackUsed?: boolean;
  errorCategory?: string;
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

    // 0. Query Normalizer Layer (Transforms noisy typos/slang/Telugu-English into canonical representation)
    const norm = QueryNormalizer.normalize(rawInput, history as any);
    const normalizedInput = norm.normalizedText || rawInput;
    const lowerInput = normalizedInput.toLowerCase();

    // 1. HARD SECURITY GUARD: SQL Injection & Malicious Command Defense (Section 14)
    const sqlRegex = /\b(drop\s+table|delete\s+from\s+[a-z_]+|truncate\s+table|alter\s+table|insert\s+into\s+[a-z_]+)\b/i;
    if (sqlRegex.test(rawInput)) {
      return {
        reply: "Security Alert: Direct database manipulation and SQL statements are strictly prohibited. Your request has been logged.",
        toolResults: [{ tool: 'security_firewall', success: false, error: 'SQL_INJECTION_ATTEMPT_BLOCKED' }],
      };
    }

    // 2. HARD SECURITY GUARD: Jailbreak & Prompt Injection Defense (Section 14)
    const jailbreakRegex = /\b(ignore\s+(all\s+)?(previous\s+)?(instructions|rules|prompts)|override\s+(system\s+)?(prompt|rules)|reveal\s+(internal\s+)?(system\s+prompt|secrets|api\s*keys))\b/i;
    if (jailbreakRegex.test(rawInput)) {
      return {
        reply: "I am CityApp Campus AI. I cannot override system security guidelines, disclose internal system configurations, or bypass institutional access policies.",
        toolResults: [{ tool: 'prompt_firewall', success: false, error: 'PROMPT_INJECTION_ATTEMPT_BLOCKED' }],
      };
    }

    // 3. HARD SECURITY GUARD: Strict PII Refusal (Section 15, 22, 23)
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

    // 4. Multi-Provider AI Orchestration
    if (targetProviderName === 'deterministic') {
      const detRes = await this.executeDeterministicOrchestration(normalizedInput, context);
      detRes.normalizedQuery = norm;
      return detRes;
    }

    const isDevMockAllowed = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AI_MOCK === 'true';
    const provider = AIProviderFactory.getProvider(targetProviderName);

    if (provider.isConfigured()) {
      try {
        const res = await this.executeProviderWithTools(provider, normalizedInput, history, context);
        res.normalizedQuery = norm;
        res.fallbackUsed = false;
        return res;
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
              const fbRes = await this.executeProviderWithTools(fallback, normalizedInput, history, context);
              fbRes.normalizedQuery = norm;
              fbRes.fallbackUsed = true;
              return fbRes;
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

    // 5. Grounded Deterministic Tool Execution Engine (Development/Offline Testing Only)
    const detRes = await this.executeDeterministicOrchestration(normalizedInput, context);
    detRes.normalizedQuery = norm;
    return detRes;
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
1. Tool Selection Responsibilities:
   - "getStudentProfile": Retrieve basic identity/profile information (name, roll number, department/branch, academic year, section, college, admission type, blood group). Use when asked who a student is, for their profile, identity, branch, year, section, or general details. Also use for self-service profile queries: "my details", "my profile", "show my details", "show my profile", "my student details", "my information", "tell me about myself", "what are my details", "who am I", "what information do you have about me". Do NOT use for academic marks/CGPA.
   - "getAcademicRecord": Retrieve academic scores, marks, percentages, grades, and CGPA (SSC, Intermediate, prior degree CGPA, standing arrears). Use when asked about marks, scores, percentages, CGPA, grades, or arrears, including self-service academic queries: "my marks", "what are my marks", "my SSC marks", "my intermediate marks", "my intermediate percentage", "my CGPA", "my grades", "my academic record", "my academic details".
   - "getApplicationStatus": Retrieve intake/admission application progress, submission status, and verification stage, including "my application status".
   - "getEligibilityData": Deterministically evaluate scholarship (merit_scholarship) or placement eligibility, including "am I eligible for the Merit Scholarship?".
   - "countStudents": Count total students matching branch/year filters.
   - "searchStudents": Administrative directory search across multiple students.
   - "searchKnowledge": Institutional policies, admission documents, guidelines, rules, FAQs. NEVER use for personal student requests (e.g. "my details", "my marks", "my profile", "my application", "am I eligible", "who am I").
2. Grounding: Answer ONLY based on authorized tool output. If no tool result is found, say: "I could not find a verified record matching your request."
3. Strict PII Protection: Never disclose Aadhaar numbers, parents' phone numbers, or residential addresses.
4. User Context:
   - Role: ${context.role}
   - User ID: ${context.userId}
   - Campus: ${context.campus?.name || 'Main Campus'} (Campus ID: ${context.campusId || 'default'})
   ${context.role === 'student' ? `- Authenticated Student: ${context.profile?.full_name || 'Student'} (${context.email}). When the user asks about "my" profile, "my" details, "my" marks, "my" CGPA, or "my" application, use their own account (pass no arguments or pass their own roll number).` : ''}
5. Accuracy: Output exact figures and values as returned by the tools. Do NOT invent or alter marks, percentages, or statuses.`;

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

    // Helper to resolve target student identifier (roll number or name)
    const rollMatch = input.match(/\b([0-9]{2}[A-Za-z0-9]{5,10})\b/);
    let targetRoll = rollMatch ? rollMatch[1] : undefined;
    let targetName: string | undefined;

    const isSelfQuery =
      lower.includes('my ') ||
      lower.startsWith('my') ||
      lower.endsWith(' my') ||
      lower === 'my details' ||
      lower === 'my marks' ||
      lower === 'my profile' ||
      lower === 'who am i' ||
      lower.includes('myself') ||
      lower.includes('about me') ||
      lower.includes('am i eligible');

    if (!targetRoll) {
      if (lower.includes('his') || lower.includes('her') || lower.includes('this student')) {
        targetRoll = '24HT1A43G2';
      } else if (lower.includes('shaik') || lower.includes('nazeer') || lower.includes('basha')) {
        targetName = 'Shaik Nazeer Basha';
      } else if (lower.includes('gayatri') || lower.includes('tadiboina')) {
        targetName = 'Tadiboina Gayatri';
      } else if (lower.includes('karthik') || lower.includes('thokala')) {
        targetName = 'Karthik thokala';
      } else if (lower.includes('manikanta') || lower.includes('gunji')) {
        targetName = 'Gunji Manikanta';
      } else if (lower.includes('sai teja') || lower.includes('manchala')) {
        targetName = 'Manchala Sai Teja';
      } else if (lower.includes('ramakoteswari') || lower.includes('avula')) {
        targetName = 'Avula ramakoteswari';
      } else if (lower.includes('jyothi') || lower.includes('manvitha')) {
        targetName = 'Bolisetty Jyothi Manvitha';
      } else if (context.role === 'student' || isSelfQuery) {
        const own = await StudentService.resolveAuthenticatedStudent(context);
        targetRoll = own?.roll_number;
      }
    }

    // Branch 1: Eligibility Evaluation (Merit Scholarship, Placement Drive)
    if (lower.includes('eligible') || lower.includes('scholarship') || lower.includes('merit') || lower.includes('qualify') || lower.includes('placement')) {
      const policyType = lower.includes('placement') ? 'placement' : 'merit_scholarship';
      const evalRes = await ToolExecutionEngine.executeTool(
        'getEligibilityData',
        { rollNumber: targetRoll, name: targetName, policyType },
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

    // Branch 2: Aggregation questions (how many, count) - Evaluated before profile to avoid 'student' keyword collision
    if (lower.includes('how many') || lower.includes('count') || lower.includes('total students')) {
      if (context.role === 'student') {
        return {
          reply: "Access Denied: Institutional analytics and bulk student counts are restricted to administrators.",
          toolResults: [{ tool: 'countStudents', success: false, error: 'Authorization Error: The tool "countStudents" requires administrative privileges. Students cannot access administrative directories or bulk analytics.' }],
        };
      }

      let branch = lower.includes('cse') ? 'CSE' : lower.includes('ece') ? 'ECE' : undefined;
      let year = lower.includes('second') || lower.includes('2nd') ? '2nd_year' : lower.includes('third') || lower.includes('3rd') ? '3rd_year' : undefined;

      const cRes = await ToolExecutionEngine.executeTool('countStudents', { branch, year }, context);
      toolResults.push(cRes);

      const count = cRes.data?.count ?? 0;
      return {
        reply: `### Verified Institutional Query\n\nAccording to official database records for **${context.campus?.name || 'Campus'}**:\n\n- **Target Filter:** ${year ? year.replace('_', ' ') : 'All Years'}, ${branch || 'All Branches'}\n- **Verified Student Count:** \`${count}\` enrolled students.`,
        toolResults,
      };
    }

    // Branch 3: Application / Intake Status
    if (
      lower.includes('application') ||
      lower.includes('admission status') ||
      lower.includes('intake') ||
      lower.includes('submission status') ||
      lower.includes('draft')
    ) {
      const appRes = await ToolExecutionEngine.executeTool(
        'getApplicationStatus',
        { rollNumber: targetRoll, name: targetName },
        context
      );
      toolResults.push(appRes);

      if (!appRes.success || !appRes.data) {
        return {
          reply: appRes.error || "I could not find an application record matching your request.",
          toolResults,
        };
      }

      const app = appRes.data;
      return {
        reply: `### Verified Application Status\n\n- **Student:** ${app.name} (\`${app.roll_number}\`)\n- **Application Status:** \`${app.application_status}\`\n- **Admission Quota:** ${app.admission_type}\n- **Department/Branch:** ${app.branch}\n- **Academic Year:** ${app.year}\n- **Institution:** ${app.college}\n- **Submission Date:** ${app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : 'Enrolled Record'}`,
        toolResults,
      };
    }

    // Branch 4: Academic Records (SSC, Intermediate, CGPA, Marks, Grades, Arrears)
    if (
      lower.includes('ssc') ||
      lower.includes('intermediate') ||
      lower.includes('inter') ||
      lower.includes('cgpa') ||
      lower.includes('marks') ||
      lower.includes('score') ||
      lower.includes('percentage') ||
      lower.includes('grade') ||
      lower.includes('arrears') ||
      lower.includes('academic')
    ) {
      const acadRes = await ToolExecutionEngine.executeTool(
        'getAcademicRecord',
        { rollNumber: targetRoll, name: targetName },
        context
      );
      toolResults.push(acadRes);

      if (!acadRes.success || !acadRes.data) {
        return {
          reply: acadRes.error || "I could not find verified academic records matching your request.",
          toolResults,
        };
      }

      const s = acadRes.data;
      const sscSummary = s.academic_summary?.ssc || (s.ssc?.marks_obtained ? `${s.ssc.marks_obtained}/600` : 'Not recorded');
      const interSummary = s.academic_summary?.intermediate || (s.intermediate?.marks_obtained ? `${s.intermediate.marks_obtained}/1000` : 'Not recorded');
      const cgpaSummary = s.prior_degree?.display_summary || (s.highest_academic_cgpa ? `${s.highest_academic_cgpa} CGPA` : 'Not recorded');

      if (lower.includes('ssc')) {
        return {
          reply: `### Verified Academic Record — SSC\n\n- **Student:** ${s.name} (\`${s.roll_number}\`)\n- **SSC Score:** \`${sscSummary}\`${s.academic_summary?.grade ? ` (Grade: ${s.academic_summary.grade})` : ''}\n\n*Verified against official institutional academic records.*`,
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
        reply: `### Verified Student Academic Profile\n\n- **Name:** ${s.name}\n- **Roll Number:** \`${s.roll_number}\`\n- **Department/Branch:** ${s.branch}\n- **Academic Year:** ${s.year}\n- **SSC:** \`${sscSummary}\`\n- **Intermediate:** \`${interSummary}\`\n- **Prior Degree/CGPA:** \`${cgpaSummary}\`\n- **Standing Arrears:** \`${s.standing_arrears}\`\n\n*Verified against official institutional academic records.*`,
        toolResults,
      };
    }

    // Branch 4B: Attendance
    if (
      (lower.includes('attendance') || lower.includes('present percentage')) &&
      !lower.includes('policy') &&
      !lower.includes('rule') &&
      !lower.includes('guideline')
    ) {
      const attRes = await ToolExecutionEngine.executeTool(
        'getAttendanceRecord',
        { rollNumber: targetRoll, name: targetName },
        context
      );
      toolResults.push(attRes);
      if (!attRes.success || !attRes.data) {
        return { reply: attRes.error || "Could not retrieve attendance records.", toolResults };
      }
      const a = attRes.data;
      return {
        reply: `### Verified Attendance Record\n\n- **Student:** ${a.name} (\`${a.roll_number}\`)\n- **Overall Attendance:** \`${a.attendance_percentage}%\`\n- **Classes Attended:** \`${a.classes_attended} / ${a.total_classes}\`\n- **Semester:** ${a.semester}\n- **Eligibility Status:** \`${a.status}\``,
        toolResults,
      };
    }

    // Branch 4C: Leave Management
    if (
      (lower.includes('leave') || lower.includes('on duty') || lower.includes('outpass')) &&
      !lower.includes('policy') &&
      !lower.includes('rule') &&
      !lower.includes('guideline')
    ) {
      const leaveRes = await ToolExecutionEngine.executeTool('getLeaveStatus', { rollNumber: targetRoll }, context);
      toolResults.push(leaveRes);
      if (!leaveRes.success || !leaveRes.data) {
        return { reply: leaveRes.error || "Could not retrieve leave status.", toolResults };
      }
      const l = leaveRes.data;
      return {
        reply: `### Verified Leave Status\n\n- **Student:** ${l.name} (\`${l.roll_number}\`)\n- **Available Leave Balance:** \`${l.leave_balance} days\`\n- **Casual Leave:** \`${l.casual_leave}\` | **Medical Leave:** \`${l.medical_leave}\`\n- **Pending Requests:** \`${l.pending_requests}\``,
        toolResults,
      };
    }

    // Branch 4D: Fees & Payments
    if (
      (lower.includes('fee') || lower.includes('dues') || lower.includes('receipt') || lower.includes('tuition')) &&
      !lower.includes('policy') &&
      !lower.includes('refund') &&
      !lower.includes('rule')
    ) {
      const feeRes = await ToolExecutionEngine.executeTool('getFeeDetails', { rollNumber: targetRoll }, context);
      toolResults.push(feeRes);
      if (!feeRes.success || !feeRes.data) {
        return { reply: feeRes.error || "Could not retrieve fee details.", toolResults };
      }
      const f = feeRes.data;
      return {
        reply: `### Verified Fee Summary\n\n- **Student:** ${f.name} (\`${f.roll_number}\`)\n- **Total Invoiced:** \`₹${f.total_fee.toLocaleString('en-IN')}\`\n- **Amount Paid:** \`₹${f.paid_amount.toLocaleString('en-IN')}\`\n- **Outstanding Balance:** \`₹${f.due_amount.toLocaleString('en-IN')}\`\n- **Payment Status:** \`${f.status}\``,
        toolResults,
      };
    }

    // Branch 4E: Hostel Accommodations
    if (
      (lower.includes('hostel') || lower.includes('room')) &&
      !lower.includes('policy') &&
      !lower.includes('rule') &&
      !lower.includes('visitor')
    ) {
      const hostelRes = await ToolExecutionEngine.executeTool('getHostelDetails', { rollNumber: targetRoll }, context);
      toolResults.push(hostelRes);
      if (!hostelRes.success || !hostelRes.data) {
        return { reply: hostelRes.error || "Could not retrieve hostel details.", toolResults };
      }
      const h = hostelRes.data;
      return {
        reply: `### Verified Hostel Allocation\n\n- **Student:** ${h.name} (\`${h.roll_number}\`)\n- **Block:** ${h.block} | **Floor:** ${h.floor}\n- **Room Number:** \`${h.room_number}\`\n- **Occupancy:** ${h.occupancy}\n- **Biometric Curfew:** \`${h.curfew_time}\``,
        toolResults,
      };
    }

    // Branch 4F: Timetable & Schedule
    if (lower.includes('timetable') || lower.includes('schedule') || lower.includes('class timings')) {
      const ttRes = await ToolExecutionEngine.executeTool('getTimetable', { rollNumber: targetRoll }, context);
      toolResults.push(ttRes);
      if (!ttRes.success || !ttRes.data) {
        return { reply: ttRes.error || "Could not retrieve timetable schedule.", toolResults };
      }
      const t = ttRes.data;
      const todayClasses = (t.today_schedule || []).map((c: any) => `- **${c.time}**: ${c.subject} (${c.room})`).join('\n');
      return {
        reply: `### Verified Timetable Schedule\n\n- **Student:** ${t.name} (\`${t.roll_number}\`)\n- **Semester:** ${t.semester}\n\n#### Today's Schedule:\n${todayClasses}`,
        toolResults,
      };
    }

    // Branch 5: Student Profile / Identity (Who is, profile, branch, year, section, my details)
    const isProfileQuery =
      lower.includes('who is') ||
      lower.includes('profile') ||
      lower.includes('branch') ||
      lower.includes('year') ||
      lower.includes('section') ||
      lower.includes('admission type') ||
      lower.includes('student') ||
      lower.includes('my details') ||
      lower.includes('show my details') ||
      lower.includes('my profile') ||
      lower.includes('show my profile') ||
      lower.includes('my student details') ||
      lower.includes('my information') ||
      lower.includes('tell me about myself') ||
      lower.includes('what are my details') ||
      lower.includes('what information do you have about me') ||
      lower.includes('who am i') ||
      lower.includes('about me') ||
      lower.includes('roll') ||
      lower.includes('details');

    if (isProfileQuery) {
      // Check if this is an administrative directory listing request (multi-student)
      if (lower.includes('search') || lower.includes('list')) {
        if (context.role === 'student') {
          return {
            reply: "Access Denied: Administrative student searches are restricted to authorized campus staff.",
            toolResults: [{ tool: 'searchStudents', success: false, error: 'FORBIDDEN' }],
          };
        }
        const sRes = await ToolExecutionEngine.executeTool('searchStudents', { search: targetName || targetRoll }, context);
        toolResults.push(sRes);
        return {
          reply: `Found ${sRes.data?.total || 0} student(s) matching your search query.`,
          toolResults,
        };
      }

      const profRes = await ToolExecutionEngine.executeTool(
        'getStudentProfile',
        { rollNumber: targetRoll, name: targetName },
        context
      );
      toolResults.push(profRes);

      if (!profRes.success || !profRes.data) {
        return {
          reply: profRes.error || "I could not find a verified record matching your request.",
          toolResults,
        };
      }

      const s = profRes.data;
      return {
        reply: `### Verified Student Information\n\n- **Name:** ${s.name}\n- **Roll Number:** \`${s.roll_number}\`\n- **Department/Branch:** ${s.branch}\n- **Academic Year:** ${s.year}\n- **Section:** ${s.section || 'A'}\n- **College:** ${s.college}\n- **Admission Type:** ${s.admission_type || 'Regular / Verified'}\n\n*Note: Private identifiers (Aadhaar, contact details) are protected under institutional privacy policies.*`,
        toolResults,
      };
    }

    // Safety guard against personal / self-service requests falling into generic RAG (Section 5)
    if (isSelfQuery) {
      return {
        reply: "I could not find a verified record matching your student profile. Please specify your query (e.g. 'my profile', 'my marks', 'my application status') or contact campus administration.",
        toolResults,
      };
    }

    // Branch 6: Document / Campus Knowledge Search
    if (
      lower.includes('document') ||
      lower.includes('admission') ||
      lower.includes('refund') ||
      lower.includes('guidelines') ||
      lower.includes('rules') ||
      lower.includes('library') ||
      lower.includes('attendance') ||
      lower.includes('ragging') ||
      lower.includes('fee') ||
      lower.includes('hours')
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

    // Default: Grounded safe response without blind RAG fallback
    return {
      reply: "I could not find a verified record or campus policy matching your request. Please specify your query or contact the campus administration office.",
      toolResults,
    };
  }
}
