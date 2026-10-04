import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { ChatService } from '@/lib/services/chat.service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const session = await ChatService.getSession(id, context);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const messages = await ChatService.getSessionMessages(id, context);
    return NextResponse.json({ session, messages });
  } catch (error: any) {
    if (error.message?.includes('Access Denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[API chat/sessions/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve session' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const { title } = await req.json();
    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const updated = await ChatService.renameSession(id, title.trim(), context);
    return NextResponse.json({ success: true, title: updated.title });
  } catch (error: any) {
    if (error.message?.includes('Access Denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[API chat/sessions/[id] PATCH] Error:', error);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    await ChatService.deleteSession(id, context);
    return NextResponse.json({ success: true, message: 'Session deleted successfully' });
  } catch (error: any) {
    if (error.message?.includes('Access Denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[API chat/sessions/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
