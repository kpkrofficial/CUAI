const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const path = require('path');
if (process.loadEnvFile) {
  try { process.loadEnvFile(path.join(__dirname, '..', '.env.local')); } catch (_) {}
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment or .env.local');
  process.exit(1);
}
const supabase = createClient(url, serviceKey);

async function generate() {
  const { data } = await supabase.storage.from('student-assets').download('database/master_db.json');
  const db = JSON.parse(await data.text());

  function esc(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    return "'" + String(val).replace(/'/g, "''") + "'";
  }

  let sql = `-- ==============================================================================
-- COMPLETE SUPABASE POSTGRESQL TABLES & DATA SEEDING SCRIPT
-- Paste and Run this in: Supabase Dashboard -> SQL Editor -> Run (Ctrl + Enter)
-- Project: https://supabase.com/dashboard/project/oqehuczoyeffyiofcomk/sql
-- ==============================================================================

-- 1. DROP EXISTING CONFLICTING TABLES IF ANY (Clean Slate)
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_sessions CASCADE;
DROP TABLE IF EXISTS public.form_diagnostics CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;
DROP TABLE IF EXISTS public.student_records CASCADE;
DROP TABLE IF EXISTS public.form_configs CASCADE;
DROP TABLE IF EXISTS public.year_folders CASCADE;
DROP TABLE IF EXISTS public.admins CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 2. CREATE TABLES
CREATE TABLE public.year_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    year_label TEXT NOT NULL,
    description TEXT,
    is_form_active INTEGER DEFAULT 1,
    form_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.form_configs (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES public.year_folders(id) ON DELETE CASCADE,
    section_name TEXT NOT NULL,
    field_name TEXT NOT NULL,
    field_label TEXT NOT NULL,
    field_type TEXT NOT NULL,
    is_required INTEGER DEFAULT 0,
    options_json TEXT DEFAULT '[]',
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.student_records (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES public.year_folders(id) ON DELETE CASCADE,
    year TEXT NOT NULL,
    name TEXT NOT NULL,
    roll_number TEXT NOT NULL UNIQUE,
    profile_image TEXT,
    gender TEXT,
    branch TEXT NOT NULL,
    section TEXT,
    college TEXT NOT NULL,
    admission_type TEXT,
    dob TEXT,
    blood_group TEXT,
    aadhaar_no TEXT,
    father_name TEXT,
    father_occupation TEXT,
    mother_name TEXT,
    mother_occupation TEXT,
    reservation_category TEXT,
    mode_of_transport TEXT,
    accommodation_type TEXT,
    permanent_address TEXT,
    present_address TEXT,
    permanent_pincode TEXT,
    present_pincode TEXT,
    permanent_phone TEXT,
    present_phone TEXT,
    phone TEXT,
    email TEXT NOT NULL,
    ssc_marks TEXT,
    ssc_hall_ticket_no TEXT,
    intermediate_marks TEXT,
    intermediate_hall_ticket_no TEXT,
    previous_course TEXT,
    previous_max_marks TEXT,
    previous_marks_obtained TEXT,
    previous_sno TEXT,
    achievements TEXT,
    extracurricular TEXT,
    hobbies TEXT,
    sports TEXT,
    skills TEXT,
    address TEXT,
    profile_info TEXT,
    custom_fields_json TEXT DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.admins (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    admin_id TEXT,
    admin_email TEXT,
    details TEXT,
    ip_address TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.form_diagnostics (
    id TEXT PRIMARY KEY,
    folder_id TEXT,
    student_name TEXT,
    roll_number TEXT,
    status TEXT,
    message TEXT,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and Grant Public PostgREST Access
ALTER TABLE public.year_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Full Access Folders" ON public.year_folders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access FormConfigs" ON public.form_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access Students" ON public.student_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access Admins" ON public.admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access Users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access Settings" ON public.system_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access Logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access Diagnostics" ON public.form_diagnostics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access ChatSessions" ON public.chat_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access ChatMessages" ON public.chat_messages FOR ALL USING (true) WITH CHECK (true);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_student_records_folder ON public.student_records(folder_id);
CREATE INDEX IF NOT EXISTS idx_student_records_roll ON public.student_records(roll_number);
CREATE INDEX IF NOT EXISTS idx_student_records_email ON public.student_records(email);
CREATE INDEX IF NOT EXISTS idx_form_configs_folder ON public.form_configs(folder_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);

-- 3. SEED ALL DATA

-- Seed Year Folders
`;

  for (const f of db.year_folders) {
    sql += `INSERT INTO public.year_folders (id, name, slug, year_label, description, is_form_active, form_token, created_at, updated_at) VALUES (${esc(f.id)}, ${esc(f.name)}, ${esc(f.slug)}, ${esc(f.year_label)}, ${esc(f.description)}, ${f.is_form_active || 1}, ${esc(f.form_token)}, ${esc(f.created_at || new Date().toISOString())}, ${esc(f.updated_at || new Date().toISOString())}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sql += '\n-- Seed Admins\n';
  for (const a of db.admins) {
    sql += `INSERT INTO public.admins (id, email, password_hash, name, role, created_at) VALUES (${esc(a.id)}, ${esc(a.email)}, ${esc(a.password_hash)}, ${esc(a.name)}, ${esc(a.role)}, ${esc(a.created_at || new Date().toISOString())}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sql += '\n-- Seed Users\n';
  for (const u of db.users) {
    sql += `INSERT INTO public.users (id, email, password_hash, name, role, status, created_at) VALUES (${esc(u.id)}, ${esc(u.email)}, ${esc(u.password_hash)}, ${esc(u.name)}, ${esc(u.role)}, ${esc(u.status || 'active')}, ${esc(u.created_at || new Date().toISOString())}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sql += '\n-- Seed Form Configs\n';
  for (const fc of db.form_configs) {
    sql += `INSERT INTO public.form_configs (id, folder_id, section_name, field_name, field_label, field_type, is_required, options_json, display_order, created_at) VALUES (${esc(fc.id)}, ${esc(fc.folder_id)}, ${esc(fc.section_name)}, ${esc(fc.field_name)}, ${esc(fc.field_label)}, ${esc(fc.field_type)}, ${fc.is_required || 0}, ${esc(fc.options_json || '[]')}, ${fc.display_order || 0}, NOW()) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sql += '\n-- Seed Student Records\n';
  for (const s of db.student_records) {
    sql += `INSERT INTO public.student_records (
  id, folder_id, year, name, roll_number, profile_image, gender, branch, section, college,
  admission_type, dob, blood_group, aadhaar_no, father_name, father_occupation, mother_name,
  mother_occupation, reservation_category, mode_of_transport, accommodation_type, permanent_address,
  present_address, permanent_pincode, present_pincode, permanent_phone, present_phone, phone,
  email, ssc_marks, ssc_hall_ticket_no, intermediate_marks, intermediate_hall_ticket_no,
  previous_course, previous_max_marks, previous_marks_obtained, previous_sno, achievements,
  extracurricular, hobbies, sports, skills, address, profile_info, custom_fields_json,
  created_at, updated_at
) VALUES (
  ${esc(s.id)}, ${esc(s.folder_id)}, ${esc(s.year)}, ${esc(s.name)}, ${esc(s.roll_number)}, ${esc(s.profile_image)}, ${esc(s.gender || '')}, ${esc(s.branch)}, ${esc(s.section || '')}, ${esc(s.college)},
  ${esc(s.admission_type || '')}, ${esc(s.dob || '')}, ${esc(s.blood_group || '')}, ${esc(s.aadhaar_no || '')}, ${esc(s.father_name || '')}, ${esc(s.father_occupation || '')}, ${esc(s.mother_name || '')},
  ${esc(s.mother_occupation || '')}, ${esc(s.reservation_category || '')}, ${esc(s.mode_of_transport || '')}, ${esc(s.accommodation_type || '')}, ${esc(s.permanent_address || '')},
  ${esc(s.present_address || '')}, ${esc(s.permanent_pincode || '')}, ${esc(s.present_pincode || '')}, ${esc(s.permanent_phone || '')}, ${esc(s.present_phone || '')}, ${esc(s.phone || '')},
  ${esc(s.email)}, ${esc(s.ssc_marks || '')}, ${esc(s.ssc_hall_ticket_no || '')}, ${esc(s.intermediate_marks || '')}, ${esc(s.intermediate_hall_ticket_no || '')},
  ${esc(s.previous_course || '')}, ${esc(s.previous_max_marks || '')}, ${esc(s.previous_marks_obtained || '')}, ${esc(s.previous_sno || '')}, ${esc(s.achievements || '')},
  ${esc(s.extracurricular || '')}, ${esc(s.hobbies || '')}, ${esc(s.sports || '')}, ${esc(s.skills || '')}, ${esc(s.address || '')}, ${esc(s.profile_info || '')}, ${esc(s.custom_fields_json || '{}')},
  ${esc(s.created_at || new Date().toISOString())}, ${esc(s.updated_at || new Date().toISOString())}
) ON CONFLICT (id) DO NOTHING;\n`;
  }

  fs.writeFileSync('supabase/schema.sql', sql, 'utf8');
  console.log('Successfully written complete schema & seed SQL to supabase/schema.sql (' + sql.length + ' bytes)');
}
generate();
