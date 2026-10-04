import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { ConversationLearningService, type UserFeedback } from '@/lib/ai/conversation-learning';
import { AuditService } from '@/lib/services/audit.service';

export async function POST(req: Request) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { messageId, type, reason, userCorrection } = body;

    if (!messageId || !type || !['positive', 'negative'].includes(type)) {
      return NextResponse.json(
        { error: 'Valid messageId and feedback type (positive/negative) required' },
        { status: 400 }
      );
    }

    const feedbackPayload: UserFeedback = {
      type,
      reason: reason || undefined,
      userCorrection: userCorrection || undefined,
      timestamp: new Date().toISOString(),
    };

    // Store feedback safely with PII redaction and trigger failure review queuing if negative
    await ConversationLearningService.recordFeedback(messageId, feedbackPayload);

    // Audit log
    await AuditService.log(
      {
        action: 'CHAT_FEEDBACK_RECORDED',
        entityType: 'chat_message',
        entityId: messageId,
        details: {
          feedback_type: type,
          reason,
          has_correction: !!userCorrection,
        },
      },
      context
    );

    return NextResponse.json({
      success: true,
      message: 'Feedback recorded successfully. Thank you for helping improve CityApp AI.',
    });
  } catch (error: any) {
    console.error('[FeedbackRoute] Error recording feedback:', error);
    return NextResponse.json({ error: 'Internal server error recording feedback' }, { status: 500 });
  }
}
