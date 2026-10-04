import { createAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/types';

export interface AuditLogEntry {
  actorId?: string | null;
  actorRole?: string | null;
  campusId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, any>;
  ipAddress?: string | null;
}

export class AuditService {
  private static getClient() {
    return createAdminClient();
  }

  /**
   * Log an immutable server-generated audit event.
   * Never accepts client-spoofed actor metadata.
   */
  static async log(entry: AuditLogEntry, context?: AuthContext | null): Promise<void> {
    try {
      const client = this.getClient();
      const actorId = context?.userId || entry.actorId || null;
      const actorRole = context?.role || entry.actorRole || 'anonymous';
      const campusId = context?.campusId || entry.campusId || null;

      await client.from('audit_logs').insert({
        actor_id: actorId,
        actor_role: actorRole,
        campus_id: campusId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId || null,
        details: entry.details || {},
        ip_address: entry.ipAddress || null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      // Non-blocking for application availability, but logged
      console.error('[AuditService] Failed to write audit log:', err);
    }
  }

  /**
   * Retrieve audit logs with strict campus/superadmin filtering
   */
  static async listLogs(context: AuthContext, limit = 50): Promise<any[]> {
    if (context.role !== 'superadmin' && context.role !== 'campus_admin') {
      throw new Error('Access Denied: Only administrators can inspect security audit logs.');
    }

    const client = this.getClient();
    let query = client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (context.role !== 'superadmin' && context.campusId) {
      query = query.eq('campus_id', context.campusId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
}
