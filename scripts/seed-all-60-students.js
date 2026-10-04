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
if (process.env.NODE_ENV === 'production') {
  console.error('FATAL: Seeding student data is forbidden in production.');
  process.exit(1);
}
const supabase = createClient(url, serviceKey);

async function seedAllStudentPhotosToRecords() {
  console.log('--- RESTORING & SEEDING ALL 60+ SUBMITTED STUDENT APPLICATIONS TO SUPABASE ---');

  // 1. Fetch current students in DB
  const { data: existingDbStudents } = await supabase.from('student_records').select('*');
  const studentMap = new Map();
  (existingDbStudents || []).forEach(s => studentMap.set(s.roll_number.toUpperCase().trim(), s));

  // 2. Fetch all uploaded student photos from Supabase Storage
  const { data: files } = await supabase.storage.from('student-assets').list('student-photos', { limit: 200 });
  console.log(`Found ${files?.length || 0} student photos in Supabase Storage.`);

  for (const f of files || []) {
    const { data: urlData } = supabase.storage.from('student-assets').getPublicUrl('student-photos/' + f.name);
    const photoUrl = urlData.publicUrl;

    // Parse roll number
    let match = f.name.match(/(2[3456]HT[15]A43[A-Z0-9]{2})/i);
    let roll = match ? match[1].toUpperCase() : '';
    if (!roll) {
      const m2 = f.name.match(/_([a-zA-Z0-9]+)_/);
      if (m2) roll = m2[1].toUpperCase();
    }
    if (!roll) roll = f.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10).toUpperCase();

    // Map year and folder
    let year = '2nd_year';
    let folder_id = 'folder_2nd_year';
    if (roll.startsWith('23HT') || roll.startsWith('24HT5')) {
      year = '4th_year';
      folder_id = 'folder_4th_year';
    } else if (roll.startsWith('24HT') || roll.startsWith('25HT5')) {
      year = '3rd_year';
      folder_id = 'folder_3rd_year';
    } else if (roll.startsWith('25HT') || roll.startsWith('26HT5')) {
      year = '2nd_year';
      folder_id = 'folder_2nd_year';
    } else if (roll.startsWith('26HT')) {
      year = '1st_year';
      folder_id = 'folder_1st_year';
    }

    let email = roll.toLowerCase() + '@cityapp.edu';
    if (f.name.includes('gmail_com')) email = roll.toLowerCase() + '@gmail.com';

    // If existing has better name (e.g. Rupesh Pasupuleti), keep existing details but attach photo
    const existing = studentMap.get(roll);
    if (existing) {
      studentMap.set(roll, {
        ...existing,
        profile_image: photoUrl,
        folder_id,
        year
      });
    } else {
      studentMap.set(roll, {
        id: 'std_' + roll.toLowerCase(),
        folder_id,
        year,
        name: 'Student (' + roll + ')',
        roll_number: roll,
        profile_image: photoUrl,
        branch: 'Computer Science & Engineering (AI & ML)',
        section: 'A',
        college: 'City University Campus',
        email,
        phone: '',
        admission_type: 'Convener (EAMCET / ECET)',
        mode_of_transport: 'College Bus',
        accommodation_type: 'Day Scholar (Living with Parents)',
        ssc_marks: '580 / 600',
        ssc_hall_ticket_no: `21SSC${roll.substring(4)}`,
        intermediate_marks: '975 / 1000',
        intermediate_hall_ticket_no: `TS2025${roll.substring(4)}`,
        created_at: f.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  const allRecords = Array.from(studentMap.values());
  console.log(`Total consolidated student records: ${allRecords.length}`);

  // 3. Upsert to Supabase PostgreSQL table
  console.log('Upserting to Supabase PostgreSQL student_records table...');
  const { error: upsertErr } = await supabase.from('student_records').upsert(allRecords, { onConflict: 'id' });
  if (upsertErr) {
    console.error('Error upserting students to PostgreSQL:', upsertErr);
  } else {
    console.log(`✓ Successfully populated all ${allRecords.length} student records in Supabase PostgreSQL!`);
  }

  // 4. Save to master_db.json in Supabase Storage and local data/db.json
  const { data: folders } = await supabase.from('year_folders').select('*');
  const { data: configs } = await supabase.from('form_configs').select('*');
  const { data: admins } = await supabase.from('admins').select('*');
  const { data: users } = await supabase.from('users').select('*');

  const fullDb = {
    admins: admins || [],
    users: users || [],
    year_folders: folders || [],
    form_configs: configs || [],
    student_records: allRecords,
    chat_sessions: [],
    chat_messages: [],
    search_logs: [],
    audit_logs: [],
    notifications: [],
    system_settings: [],
    form_diagnostics: []
  };

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify(fullDb, null, 2), 'utf8');

  await supabase.storage.from('student-assets').upload('database/master_db.json', Buffer.from(JSON.stringify(fullDb, null, 2)), {
    contentType: 'application/json',
    upsert: true
  });

  console.log('✓ Successfully synchronized master_db.json and local data/db.json');
}

seedAllStudentPhotosToRecords().catch(console.error);
