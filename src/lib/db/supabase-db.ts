import { getSupabaseAdmin, getBucketName } from '../supabase';
import type { DatabaseData } from './store';
import type { StudentRecord, YearFolder, FormConfig, Admin, User, AuditLogEntry, FormDiagnostic, SystemSetting } from './schema';

const DB_STORAGE_PATH = 'database/master_db.json';
const DB_BACKUP_FOLDER = 'database/backups';

/**
 * Fetch the master database directly from Supabase PostgreSQL tables (with Storage fallback).
 */
export async function fetchMasterDbFromSupabase(): Promise<DatabaseData | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn('[Supabase DB] Admin client not available.');
    return null;
  }

  try {
    // 1. Try reading directly from Supabase PostgreSQL tables
    const [
      { data: folders, error: foldersErr },
      { data: students, error: studentsErr },
      { data: configs, error: configsErr },
      { data: admins, error: adminsErr },
      { data: users, error: usersErr },
      { data: settings, error: settingsErr },
      { data: auditLogs, error: auditErr },
      { data: diagnostics, error: diagErr }
    ] = await Promise.all([
      admin.from('year_folders').select('*').order('created_at', { ascending: true }),
      admin.from('student_records').select('*').order('created_at', { ascending: false }),
      admin.from('form_configs').select('*').order('display_order', { ascending: true }),
      admin.from('admins').select('*'),
      admin.from('users').select('*'),
      admin.from('system_settings').select('*'),
      admin.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(100),
      admin.from('form_diagnostics').select('*').order('created_at', { ascending: false }).limit(100)
    ]);

    // If PostgreSQL tables returned valid records
    if (!foldersErr && Array.isArray(folders) && folders.length > 0) {
      console.log(`[Supabase PostgreSQL] Loaded ${students?.length || 0} students, ${folders.length} folders, ${configs?.length || 0} form configs directly from PostgreSQL DB.`);
      return {
        year_folders: (folders as YearFolder[]) || [],
        student_records: (students as StudentRecord[]) || [],
        form_configs: (configs as FormConfig[]) || [],
        admins: (admins as Admin[]) || [],
        users: (users as User[]) || [],
        system_settings: (settings as SystemSetting[]) || [],
        audit_logs: (auditLogs as AuditLogEntry[]) || [],
        form_diagnostics: (diagnostics as FormDiagnostic[]) || [],
        notifications: [],
        chat_sessions: [],
        chat_messages: [],
        search_logs: []
      };
    }

    // 2. Fallback to Supabase Cloud Storage master_db.json
    const bucket = getBucketName();
    const { data: storageData, error: storageErr } = await admin.storage
      .from(bucket)
      .download(DB_STORAGE_PATH);

    if (!storageErr && storageData) {
      const text = await storageData.text();
      if (text && text.trim()) {
        const parsed: DatabaseData = JSON.parse(text);
        if (parsed && Array.isArray(parsed.year_folders)) {
          console.log(`[Supabase Storage DB] Loaded ${parsed.student_records?.length || 0} students from Supabase Storage DB.`);
          return parsed;
        }
      }
    }

    return null;
  } catch (err: any) {
    console.error('[Supabase DB] Failed to fetch database from Supabase:', err?.message || err);
    return null;
  }
}

/**
 * Persist database mutations directly to Supabase PostgreSQL tables AND Supabase Storage.
 */
export async function persistMasterDbToSupabase(data: DatabaseData): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn('[Supabase DB] Supabase admin client not available for persistence.');
    return false;
  }

  try {
    // 1. Persist directly to Supabase PostgreSQL tables
    const tasks: PromiseLike<any>[] = [];

    if (data.year_folders && data.year_folders.length > 0) {
      tasks.push(admin.from('year_folders').upsert(data.year_folders, { onConflict: 'id' }));
    }
    // HARDENING RULE: Student records MUST NEVER be bulk upserted from JSON into Supabase PostgreSQL.
    // PostgreSQL student_records table is the single authoritative source of truth.
    if (data.form_configs && data.form_configs.length > 0) {
      tasks.push(admin.from('form_configs').upsert(data.form_configs, { onConflict: 'id' }));
    }
    if (data.admins && data.admins.length > 0) {
      tasks.push(admin.from('admins').upsert(data.admins, { onConflict: 'id' }));
    }
    if (data.users && data.users.length > 0) {
      tasks.push(admin.from('users').upsert(data.users, { onConflict: 'id' }));
    }
    if (data.system_settings && data.system_settings.length > 0) {
      tasks.push(admin.from('system_settings').upsert(data.system_settings, { onConflict: 'key' }));
    }

    await Promise.allSettled(tasks);
    console.log(`[Supabase PostgreSQL] Synced metadata & ${data.year_folders?.length || 0} folders to PostgreSQL DB.`);

    // 2. Also keep Supabase Cloud Storage snapshot synchronized
    const bucket = getBucketName();
    const jsonString = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');

    admin.storage
      .from(bucket)
      .upload(DB_STORAGE_PATH, buffer, {
        contentType: 'application/json',
        upsert: true
      })
      .catch(e => console.warn('[Supabase Storage] Backup sync warning:', e.message));

    // 3. Periodic snapshot backup in Supabase
    const backupKey = `${DB_BACKUP_FOLDER}/backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    admin.storage
      .from(bucket)
      .upload(backupKey, buffer, { contentType: 'application/json', upsert: true })
      .catch(() => {});

    return true;
  } catch (err: any) {
    console.error('[Supabase DB] Persistence error:', err?.message || err);
    return false;
  }
}

/**
 * Insert or update a single student record directly in Supabase PostgreSQL.
 */
export async function syncStudentToSupabase(record: StudentRecord): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  try {
    const { error } = await admin.from('student_records').upsert(record, { onConflict: 'id' });
    if (error) {
      console.error('[Supabase DB] Student upsert error:', error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[Supabase DB] Student sync exception:', e?.message || e);
    return false;
  }
}

/**
 * Delete a student record directly from Supabase PostgreSQL.
 */
export async function deleteStudentFromSupabase(id: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  try {
    const { error } = await admin.from('student_records').delete().eq('id', id);
    if (error) {
      console.error('[Supabase DB] Student delete error:', error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[Supabase DB] Student delete exception:', e?.message || e);
    return false;
  }
}
