import { createAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/types';

export interface ChatSessionRecord {
  id: string;
  campus_id: string;
  account_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatMessageRecord {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  rag_sources?: any;
  tool_invocations?: any;
  created_at: string;
}

export class ChatService {
  private static getClient() {
    return createAdminClient();
  }

  /**
   * List all chat sessions strictly owned by the authenticated user
   */
  static async listSessions(context: AuthContext): Promise<ChatSessionRecord[]> {
    const client = this.getClient();
    const { data: sessions, error } = await client
      .from('chat_sessions')
      .select('*, chat_messages(count)')
      .eq('account_id', context.userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[ChatService] listSessions error:', error);
      throw error;
    }

    return (sessions || []).map((s) => ({
      id: s.id,
      campus_id: s.campus_id,
      account_id: s.account_id,
      title: s.title,
      created_at: s.created_at,
      updated_at: s.updated_at,
      message_count: s.chat_messages?.[0]?.count || 0,
    }));
  }

  /**
   * Create a new chat session bound to authenticated user and campus
   */
  static async createSession(title: string, context: AuthContext): Promise<ChatSessionRecord> {
    const client = this.getClient();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const campusId = context.campusId || 'de1a8da7-a875-4648-94c8-3e642ed6c45c'; // fallback to Campus A

    const { data, error } = await client
      .from('chat_sessions')
      .insert({
        id: sessionId,
        campus_id: campusId,
        account_id: context.userId,
        title: title || 'New Conversation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[ChatService] createSession error:', error);
      throw error;
    }

    return data;
  }

  /**
   * Get session with strict IDOR verification
   */
  static async getSession(sessionId: string, context: AuthContext): Promise<ChatSessionRecord | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (error || !data) return null;

    // Strict IDOR Prevention: Only session owner or superadmin can view
    if (data.account_id !== context.userId && context.role !== 'superadmin') {
      throw new Error('Access Denied: You do not have permission to access this chat session.');
    }

    return data;
  }

  /**
   * Get all messages in a session after verifying ownership
   */
  static async getSessionMessages(sessionId: string, context: AuthContext): Promise<ChatMessageRecord[]> {
    // 1. Verify ownership first
    await this.getSession(sessionId, context);

    const client = this.getClient();
    const { data, error } = await client
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Append a message to the session and update session's updated_at timestamp
   */
  static async appendMessage(
    sessionId: string,
    message: {
      role: 'user' | 'assistant' | 'system';
      content: string;
      rag_sources?: any;
      tool_invocations?: any;
    },
    context: AuthContext
  ): Promise<ChatMessageRecord> {
    // Verify ownership
    await this.getSession(sessionId, context);

    const client = this.getClient();
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { data, error } = await client
      .from('chat_messages')
      .insert({
        id: messageId,
        session_id: sessionId,
        role: message.role,
        content: message.content,
        rag_sources: message.rag_sources || null,
        tool_invocations: message.tool_invocations || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update parent session updated_at
    await client
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return data;
  }

  /**
   * Delete session and all its messages (cascade) after verifying ownership
   */
  static async deleteSession(sessionId: string, context: AuthContext): Promise<boolean> {
    await this.getSession(sessionId, context);

    const client = this.getClient();
    const { error } = await client.from('chat_sessions').delete().eq('id', sessionId);
    if (error) throw error;
    return true;
  }

  /**
   * Rename session title
   */
  static async renameSession(sessionId: string, title: string, context: AuthContext): Promise<ChatSessionRecord> {
    await this.getSession(sessionId, context);

    const client = this.getClient();
    const { data, error } = await client
      .from('chat_sessions')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
