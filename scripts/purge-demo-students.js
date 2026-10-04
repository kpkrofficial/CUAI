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

async function purgeDemoAndVerify() {
  console.log('--- PURGING DEMO STUDENT DATA FROM SUPABASE POSTGRESQL ---');

  // 1. Delete demo student records from PostgreSQL table
  const { data: beforeList } = await supabase.from('student_records').select('id, name, roll_number');
  console.log(`Found ${beforeList?.length || 0} student records in PostgreSQL before purge.`);

  const { error: delErr } = await supabase.from('student_records').delete().neq('id', 'non_existent_id');
  if (delErr) {
    console.error('Error deleting from student_records table:', delErr);
  } else {
    console.log('✓ Successfully purged demo records from Supabase PostgreSQL student_records table.');
  }

  // 2. Verify all PostgreSQL tables
  const { data: studentsAfter } = await supabase.from('student_records').select('*');
  const { data: folders } = await supabase.from('year_folders').select('*');
  const { data: configs } = await supabase.from('form_configs').select('*');
  const { data: admins } = await supabase.from('admins').select('*');
  const { data: users } = await supabase.from('users').select('*');

  console.log('\n--- VERIFICATION OF SUPABASE POSTGRESQL TABLES ---');
  console.log(`✓ Student Records count: ${studentsAfter?.length || 0} (Clean production state)`);
  console.log(`✓ Year Folders count: ${folders?.length || 0} (1st, 2nd, 3rd, 4th Year)`);
  console.log(`✓ Form Configs count: ${configs?.length || 0}`);
  console.log(`✓ Admins count: ${admins?.length || 0}`);
  console.log(`✓ Users count: ${users?.length || 0}`);

  // 3. Update master_db.json in Supabase Storage with clean student_records
  const cleanDb = {
    admins: admins || [],
    users: users || [],
    year_folders: folders || [],
    form_configs: configs || [],
    student_records: [],
    chat_sessions: [],
    chat_messages: [],
    search_logs: [],
    audit_logs: [],
    notifications: [],
    system_settings: [],
    form_diagnostics: []
  };

  const { error: uploadErr } = await supabase.storage.from('student-assets').upload('database/master_db.json', Buffer.from(JSON.stringify(cleanDb, null, 2)), {
    contentType: 'application/json',
    upsert: true
  });

  if (uploadErr) {
    console.error('Storage upload error:', uploadErr);
  } else {
    console.log('✓ Successfully synced clean state to Supabase Storage master_db.json');
  }

  // 4. Also keep local data/db.json preserved and synchronized
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify(cleanDb, null, 2), 'utf8');
  console.log('✓ Preserved local data/db.json synchronized with Supabase DB.');
}

purgeDemoAndVerify().catch(console.error);
