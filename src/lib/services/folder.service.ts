import { createAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/types';

export interface YearFolder {
  id: string;
  campus_id?: string | null;
  name: string;
  slug: string;
  year_label: string;
  description?: string | null;
  is_form_active: number;
  form_token?: string | null;
  created_at?: string;
  updated_at?: string;
  studentCount?: number;
}

export class FolderService {
  private static getClient() {
    return createAdminClient();
  }

  static async listFolders(context?: AuthContext | null): Promise<YearFolder[]> {
    const client = this.getClient();
    let query = client.from('year_folders').select('*').order('created_at', { ascending: true });

    if (context && context.role !== 'superadmin' && context.campusId) {
      query = query.or(`campus_id.eq.${context.campusId},campus_id.is.null`);
    }

    const { data: folders, error } = await query;
    if (error) {
      console.error('[FolderService] listFolders error:', error);
      throw error;
    }

    // Attach student counts per folder with tenant filtering
    let countQuery = client.from('student_records').select('folder_id');
    if (context && context.role !== 'superadmin' && context.campusId) {
      countQuery = countQuery.eq('campus_id', context.campusId);
    }
    const { data: students } = await countQuery;
    const counts: Record<string, number> = {};
    (students || []).forEach((s) => {
      counts[s.folder_id] = (counts[s.folder_id] || 0) + 1;
    });

    return (folders || []).map((f) => ({
      ...f,
      studentCount: counts[f.id] || 0,
    }));
  }

  static async getFolderById(id: string, context?: AuthContext | null): Promise<YearFolder | null> {
    const client = this.getClient();
    let query = client.from('year_folders').select('*').eq('id', id);

    if (context && context.role !== 'superadmin' && context.campusId) {
      query = query.or(`campus_id.eq.${context.campusId},campus_id.is.null`);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return data;
  }

  static async toggleFormActive(
    id: string,
    isActive: number,
    context: AuthContext
  ): Promise<YearFolder> {
    if (context.role === 'student') {
      throw new Error('Access Denied: Only administrators can toggle form intake status.');
    }

    const client = this.getClient();
    let query = client
      .from('year_folders')
      .update({ is_form_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (context.role !== 'superadmin' && context.campusId) {
      query = query.or(`campus_id.eq.${context.campusId},campus_id.is.null`);
    }

    const { data, error } = await query.select().single();
    if (error) throw error;
    return data;
  }
}
