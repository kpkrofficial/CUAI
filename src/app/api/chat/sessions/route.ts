import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { ChatService } from '@/lib/services/chat.service';

export async function GET() {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    const sessions = await ChatService.listSessions(context);
    return NextResponse.json({ sessions });
  } catch (error: any) {
    console.error('[API chat/sessions GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch chat sessions' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const title = body.title || 'New Conversation';

    const session = await ChatService.createSession(title, context);
    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('[API chat/sessions POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create chat session' }, { status: 500 });
  }
}
