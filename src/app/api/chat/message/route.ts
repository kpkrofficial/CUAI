import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { ChatService } from '@/lib/services/chat.service';
import { AIOrchestrator } from '@/lib/ai/orchestrator';
import { AuditService } from '@/lib/services/audit.service';
import { ConversationLearningService } from '@/lib/ai/conversation-learning';
import { enforceRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function POST(req: Request) {
  // 1. Rate Limiting for Chat Inference
  const rateLimitResponse = enforceRateLimit(req, 'chat_message', RATE_LIMIT_PRESETS.CHAT_QUERY);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // 2. Authentication & Tenant Resolution
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required to use the campus assistant.' },
        { status: 401 }
      );
    }

    const { sessionId, content } = await req.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    // 3. Resolve or Create Chat Session with Strict Ownership Verification (Section 16)
    let activeSession;
    if (sessionId) {
      try {
        activeSession = await ChatService.getSession(sessionId, context);
      } catch (err: any) {
        // IDOR violation or not found
        return NextResponse.json({ error: err.message || 'Unauthorized session access' }, { status: 403 });
      }
    }

    if (!activeSession) {
      const autoTitle = content.trim().length > 30 ? `${content.trim().substring(0, 27)}...` : content.trim();
      activeSession = await ChatService.createSession(autoTitle, context);
    }

    // 4. Persist User Message directly to PostgreSQL
    const userMessage = await ChatService.appendMessage(
      activeSession.id,
      {
        role: 'user',
        content: content.trim(),
      },
      context
    );

    // 5. Fetch recent conversation history
    const pastMessages = await ChatService.getSessionMessages(activeSession.id, context);
    const history = pastMessages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 6. Invoke AI Orchestrator (Gemini / Verified Tool Execution / Deterministic Engine)
    const orchestration = await AIOrchestrator.handleMessage(content.trim(), history, context);

    // 7. Persist Assistant Message directly to PostgreSQL
    const assistantMessage = await ChatService.appendMessage(
      activeSession.id,
      {
        role: 'assistant',
        content: orchestration.reply,
        rag_sources: orchestration.citations || null,
        tool_invocations: orchestration.toolResults || null,
      },
      context
    );

    // 8. Record Immutable Audit Event
    await AuditService.log(
      {
        action: 'CHAT_MESSAGE_PROCESSED',
        entityType: 'chat',
        entityId: activeSession.id,
        details: {
          tools_executed: (orchestration.toolResults || []).map((t) => t.tool),
          sources_count: (orchestration.citations || []).length,
          provider: orchestration.provider,
          model: orchestration.model,
          latency_ms: orchestration.latencyMs,
          usage: orchestration.usage,
        },
      },
      context
    );

    // 9. Ingest into durable Supabase conversation learning store (PII Redacted)
    const primaryTool = (orchestration.toolResults || [])[0]?.tool || ((orchestration.citations || []).length > 0 ? 'searchKnowledge' : 'campus_ai');
    try {
      await ConversationLearningService.ingestEvent({
        conversation_id: activeSession.id,
        message_id: assistantMessage.id,
        user_role: context.role,
        raw_user_message: message,
        assistant_reply: orchestration.reply,
        intent: orchestration.normalizedQuery?.intent || 'GENERAL_CONVERSATION',
        tool: primaryTool,
        provider: orchestration.provider,
        model: orchestration.model,
        success: true,
        metadata: {
          latencyMs: orchestration.latencyMs,
          sources: orchestration.sources || [],
          fallbackUsed: orchestration.fallbackUsed || false,
        },
      });
    } catch (ingestErr) {
      console.warn('[ChatRoute] Learning event ingest warning:', ingestErr);
    }

    // 10. Return standardized response preserving existing frontend contracts
    const enrichedAssistantMessage = {
      ...assistantMessage,
      tool_invocations: orchestration.toolResults || null,
      metadata_json: JSON.stringify({
        messageId: assistantMessage.id,
        primaryTool,
        toolResults: orchestration.toolResults || [],
        sources: orchestration.sources || [],
        provider: orchestration.provider,
        model: orchestration.model,
      }),
    };

    return NextResponse.json({
      sessionId: activeSession.id,
      userMessage,
      assistantMessage: enrichedAssistantMessage,
      provider: orchestration.provider,
      model: orchestration.model,
      latencyMs: orchestration.latencyMs,
      usage: orchestration.usage,
      ragResult: {
        answer: orchestration.reply,
        found: true,
        sources: orchestration.sources || [],
        citations: orchestration.citations || [],
        toolResults: orchestration.toolResults || [],
      },
    });
  } catch (error: any) {
    console.error('[API chat/message POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process message' }, { status: 500 });
  }
}
