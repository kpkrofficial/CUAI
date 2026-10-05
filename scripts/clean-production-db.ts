import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { DEFAULT_FORM_FIELDS } from '../src/lib/db/init';
import type { DatabaseData } from '../src/lib/db/store';

const DB_PATH = path.resolve(process.cwd(), 'data', 'db.json');

export async function createCleanProductionDatabase(): Promise<DatabaseData> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: createCleanProductionDatabase is forbidden in production.');
  }
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Requested credentials
  // Super Admin: superadmin@com | zxcvbnm
  // Admin: admin@com | mnbvcxz
  // User: m@com | User@123
  const superAdminPass = await bcrypt.hash('zxcvbnm', 10);
  const campusAdminPass = await bcrypt.hash('mnbvcxz', 10);
  const userPass = await bcrypt.hash('User@123', 10);

  const now = new Date().toISOString();

  const defaultFolders = [
    { 
      id: '1st-year', 
      name: '1st Year (2026-2030)', 
      slug: '1st-year', 
      year_label: '1st Year', 
      description: 'First Year (Batch 2026-2030) Student Records & Intake', 
      is_form_active: 1, 
      form_token: 'token_1st-year_prod_active', 
      created_at: now 
    },
    { 
      id: '2nd-year', 
      name: '2nd Year (2025-2029)', 
      slug: '2nd-year', 
      year_label: '2nd Year', 
      description: 'Second Year (Batch 2025-2029) Student Records & Intake', 
      is_form_active: 1, 
      form_token: 'token_2nd-year_prod_active', 
      created_at: now 
    },
    { 
      id: '3rd-year', 
      name: '3rd Year (2024-2028)', 
      slug: '3rd-year', 
      year_label: '3rd Year', 
      description: 'Third Year (Batch 2024-2028) Student Records & Intake', 
      is_form_active: 1, 
      form_token: 'token_3rd-year_prod_active', 
      created_at: now 
    },
    { 
      id: '4th-year', 
      name: '4th Year (2023-2027)', 
      slug: '4th-year', 
      year_label: '4th Year', 
      description: 'Fourth Year (Batch 2023-2027) Student Records & Intake', 
      is_form_active: 1, 
      form_token: 'token_4th-year_prod_active', 
      created_at: now 
    },
  ];

  const formConfigs: any[] = [];
  for (const f of defaultFolders) {
    for (const field of DEFAULT_FORM_FIELDS) {
      formConfigs.push({
        id: `fc_${f.slug}_${field.name}`,
        folder_id: f.id,
        section_name: field.section,
        field_name: field.name,
        field_label: field.label,
        field_type: field.type,
        is_required: field.required,
        options_json: field.options ? JSON.stringify(field.options) : '[]',
        display_order: field.order
      });
    }
  }

  const cleanData: DatabaseData = {
    admins: [
      {
        id: 'admin_super_01',
        email: 'superadmin@com',
        password_hash: superAdminPass,
        name: 'Master Super Administrator',
        role: 'superadmin',
        created_at: now
      },
      {
        id: 'admin_campus_01',
        email: 'admin@com',
        password_hash: campusAdminPass,
        name: 'Campus Administrator',
        role: 'admin',
        created_at: now
      }
    ],
    users: [
      {
        id: 'usr_000',
        email: 'm@com',
        password_hash: userPass,
        name: 'Student User',
        role: 'user',
        status: 'active',
        created_at: now
      },
      {
        id: 'usr_001',
        email: 'm@1',
        password_hash: userPass,
        name: 'Student User (Quick)',
        role: 'user',
        status: 'active',
        created_at: now
      }
    ],
    year_folders: defaultFolders,
    form_configs: formConfigs,
    student_records: [], // 0 demo/mock records
    chat_sessions: [],
    chat_messages: [],
    search_logs: [],
    audit_logs: [
      {
        id: `audit_${Date.now()}_init`,
        actor: 'Master Super Administrator',
        action: 'CREDENTIALS_UPDATE',
        entity_type: 'system',
        entity_id: 'production_credentials',
        details: 'Production credentials updated for superadmin@com, admin@com, and m@com.',
        ip_address: '127.0.0.1',
        created_at: now
      }
    ],
    notifications: [],
    system_settings: [
      { key: 'maintenance_mode', value: 'false', updated_at: now },
      { key: 'maintenance_message', value: 'System is undergoing scheduled maintenance. Please check back shortly.', updated_at: now },
      { key: 'allow_student_registration', value: 'true', updated_at: now },
      { key: 'default_chat_limit', value: '100', updated_at: now },
      { key: 'auto_clear_days', value: '7', updated_at: now },
      { key: 'session_timeout_minutes', value: '30', updated_at: now }
    ],
    form_diagnostics: []
  };

  fs.writeFileSync(DB_PATH, JSON.stringify(cleanData, null, 2), 'utf8');
  console.log('✅ Clean production database generated with requested credentials:');
  console.log(' - Super Admin: superadmin@com | zxcvbnm');
  console.log(' - Campus Admin: admin@com | mnbvcxz');
  console.log(' - Student User: m@com | User@123');
  return cleanData;
}

if (require.main === module) {
  createCleanProductionDatabase().catch(console.error);
}
