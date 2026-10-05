import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { ConversationLearningService } from '@/lib/ai/conversation-learning';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  try {
    const context = await getAuthContext(['superadmin', 'campus_admin']);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const failureType = searchParams.get('failure_type');
    const tool = searchParams.get('tool');
    const provider = searchParams.get('provider');
    const search = searchParams.get('search');

    // 1. Fetch live metrics from durable Supabase store
    const metrics = await ConversationLearningService.getMetrics();

    // 2. Query events from Supabase
    const supabase = getSupabaseAdmin();
    let events: any[] = [];

    if (supabase) {
      let query = supabase
        .from('ai_learning_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (status && status !== 'all') {
        query = query.eq('review_status', status);
      }
      if (failureType && failureType !== 'all') {
        query = query.eq('failure_type', failureType);
      }
      if (tool && tool !== 'all') {
        query = query.eq('tool', tool);
      }
      if (provider && provider !== 'all') {
        query = query.eq('provider', provider);
      }

      const { data, error } = await query;
      if (!error && data) {
        events = data;
      }
    }

    // Client-side text filter on redacted message if search provided
    if (search && search.trim()) {
      const q = search.toLowerCase();
      events = events.filter(
        (ev) =>
          ev.redacted_message?.toLowerCase().includes(q) ||
          ev.normalized_message?.toLowerCase().includes(q) ||
          ev.intent?.toLowerCase().includes(q) ||
          ev.user_correction?.toLowerCase().includes(q)
      );
    }

    // Safe response: zero private credentials or unmasked tokens
    return NextResponse.json({
      metrics,
      events,
    });
  } catch (error: any) {
    console.error('[API admin/ai-learning GET] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getAuthContext(['superadmin', 'campus_admin']);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { messageId, decision, updates } = body;

    if (!messageId || !decision || !['VERIFIED', 'REJECTED', 'DUPLICATE', 'PROMOTED'].includes(decision)) {
      return NextResponse.json(
        { error: 'Valid messageId and decision (VERIFIED, REJECTED, DUPLICATE, PROMOTED) required' },
        { status: 400 }
      );
    }

    const reviewed = await ConversationLearningService.reviewRecord(
      messageId,
      decision,
      context.userId,
      updates
    );

    let regressionCandidate = null;
    if (reviewed && (decision === 'VERIFIED' || decision === 'PROMOTED')) {
      regressionCandidate = ConversationLearningService.generateRegressionCandidate(reviewed);
    }

    return NextResponse.json({
      success: true,
      decision,
      reviewed,
      regressionCandidate,
    });
  } catch (error: any) {
    console.error('[API admin/ai-learning POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
