const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

if (process.loadEnvFile) {
  try { process.loadEnvFile(path.join(__dirname, '..', '.env.local')); } catch (_) {}
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment or .env.local');
  process.exit(1);
}
const BUCKET = 'student-assets';

async function seed() {
  console.log('--- SEEDING DATA TO SUPABASE CLOUD DATABASE ---');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Read local db.json
  const dbPath = path.join(__dirname, '..', 'data', 'db.json');
  if (!fs.existsSync(dbPath)) {
    console.error('Local db.json not found at:', dbPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(dbPath, 'utf8');
  const dbData = JSON.parse(raw);

  console.log(`Found ${dbData.student_records?.length || 0} student records, ${dbData.year_folders?.length || 0} folders, ${dbData.form_configs?.length || 0} form configs.`);

  // 2. Upload master_db.json to Supabase Cloud Storage
  console.log(`Uploading database/master_db.json to Supabase bucket "${BUCKET}"...`);
  const { data: uploadRes, error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload('database/master_db.json', Buffer.from(JSON.stringify(dbData, null, 2)), {
      contentType: 'application/json',
      upsert: true
    });

  if (uploadErr) {
    console.error('Failed to seed master_db.json to Supabase Storage:', uploadErr);
  } else {
    console.log('SUCCESS! master_db.json uploaded to Supabase:', uploadRes);
  }

  // 3. Also upload a permanent timestamped backup in Supabase
  const backupKey = `database/backups/db_backup_seed_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const { data: backupRes, error: backupErr } = await supabase.storage
    .from(BUCKET)
    .upload(backupKey, Buffer.from(JSON.stringify(dbData, null, 2)), {
      contentType: 'application/json',
      upsert: true
    });

  if (!backupErr) {
    console.log('SUCCESS! Seed backup created in Supabase at:', backupKey);
  }

  console.log('--- SUPABASE DATABASE SEED COMPLETE ---');
}

seed().catch(err => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
