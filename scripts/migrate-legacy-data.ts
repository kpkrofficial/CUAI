import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

if ((process as any).loadEnvFile) {
  try { (process as any).loadEnvFile(path.join(__dirname, '..', '.env.local')); } catch (_) {}
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('FATAL: Legacy data migration is disabled in production environment.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function runMigration() {
  console.log('================================================================');
  console.log('CITYAPP AI — PRODUCTION DATA MIGRATION & RECONCILIATION PIPELINE');
  console.log('Source: data/db.json -> Target: Supabase PostgreSQL');
  console.log('================================================================\n');

  const dbPath = path.join(__dirname, '..', 'data', 'db.json');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Source data file not found at: ${dbPath}`);
  }

  const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  // 1. Resolve Organization and Campuses
  const { data: org } = await supabase.from('organizations').select('id, name').eq('slug', 'city-university').single();
  const { data: campusA } = await supabase.from('campuses').select('id, name').eq('code', 'CAMPUS_A').single();
  const { data: campusB } = await supabase.from('campuses').select('id, name').eq('code', 'CAMPUS_B').single();

  if (!org || !campusA) {
    throw new Error('Foundational tenant entities missing. Run seed-tenant-foundations.js first.');
  }

  console.log(`Tenant Context: Org "${org.name}" (${org.id})`);
  console.log(`Default Campus: "${campusA.name}" (${campusA.id})\n`);

  // 2. Migrate Year Folders
  console.log('1. Migrating Year Folders...');
  const sourceFolders = rawDb.year_folders || [];
  let foldersMigrated = 0;
  for (const f of sourceFolders) {
    const { error } = await supabase.from('year_folders').upsert({
      id: f.id,
      campus_id: campusA.id,
      name: f.name,
      slug: f.slug,
      year_label: f.year_label,
      description: f.description,
      is_form_active: f.is_form_active ?? 1,
      form_token: f.form_token,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) console.error(`Error migrating folder ${f.id}:`, error.message);
    else foldersMigrated++;
  }
  console.log(`✓ Folders migrated: ${foldersMigrated} / ${sourceFolders.length}\n`);

  // 3. Migrate Form Configs
  console.log('2. Migrating Form Configurations...');
  const sourceConfigs = rawDb.form_configs || [];
  let configsMigrated = 0;
  for (const fc of sourceConfigs) {
    const { error } = await supabase.from('form_configs').upsert({
      id: fc.id,
      campus_id: campusA.id,
      folder_id: fc.folder_id,
      section_name: fc.section_name,
      field_name: fc.field_name,
      field_label: fc.field_label,
      field_type: fc.field_type,
      is_required: fc.is_required ?? 0,
      options_json: typeof fc.options_json === 'string' ? JSON.parse(fc.options_json) : fc.options_json,
      display_order: fc.display_order ?? 0,
    }, { onConflict: 'id' });

    if (error) console.error(`Error migrating form config ${fc.id}:`, error.message);
    else configsMigrated++;
  }
  console.log(`✓ Form Configs migrated: ${configsMigrated} / ${sourceConfigs.length}\n`);

  // 4. Migrate Student Records
  console.log('3. Migrating Student Records...');
  const sourceStudents = rawDb.student_records || [];
  let studentsMigrated = 0;
  for (const s of sourceStudents) {
    const { error } = await supabase.from('student_records').upsert({
      id: s.id,
      campus_id: campusA.id,
      folder_id: s.folder_id || 'folder_1st_year',
      year: s.year,
      name: s.name,
      roll_number: s.roll_number.trim().toUpperCase(),
      profile_image: s.profile_image,
      gender: s.gender,
      branch: s.branch,
      section: s.section,
      college: s.college,
      admission_type: s.admission_type,
      dob: s.dob,
      blood_group: s.blood_group,
      aadhaar_no: s.aadhaar_no,
      father_name: s.father_name,
      father_occupation: s.father_occupation,
      mother_name: s.mother_name,
      mother_occupation: s.mother_occupation,
      reservation_category: s.reservation_category,
      mode_of_transport: s.mode_of_transport,
      accommodation_type: s.accommodation_type,
      permanent_address: s.permanent_address,
      present_address: s.present_address,
      permanent_pincode: s.permanent_pincode,
      present_pincode: s.present_pincode,
      permanent_phone: s.permanent_phone,
      present_phone: s.present_phone,
      phone: s.phone,
      email: s.email,
      ssc_marks: s.ssc_marks,
      inter_marks: s.inter_marks,
      diploma_marks: s.diploma_marks,
      student_data: s,
      is_draft: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) console.error(`Error migrating student ${s.roll_number}:`, error.message);
    else studentsMigrated++;
  }
  console.log(`✓ Student Records migrated: ${studentsMigrated} / ${sourceStudents.length}\n`);

  // 5. Reconciliation & Integrity Verification
  console.log('4. Performing Database Reconciliation Verification...');
  const { count: postgreStudents } = await supabase.from('student_records').select('*', { count: 'exact', head: true });
  const { count: postgreFolders } = await supabase.from('year_folders').select('*', { count: 'exact', head: true });
  const { count: postgreConfigs } = await supabase.from('form_configs').select('*', { count: 'exact', head: true });

  const reconciliationReport = `
# Data Migration & Reconciliation Report
- Date: ${new Date().toISOString()}
- Source File: data/db.json
- Target Database: Supabase PostgreSQL (Project: oqehuczoyeffyiofcomk)

| Entity | Source (db.json) | Migrated | Target (PostgreSQL) | Reconciliation Status |
| :--- | :--- | :--- | :--- | :--- |
| Year Folders | ${sourceFolders.length} | ${foldersMigrated} | ${postgreFolders} | ${sourceFolders.length === foldersMigrated ? 'PASSED' : 'DISCREPANCY'} |
| Form Configs | ${sourceConfigs.length} | ${configsMigrated} | ${postgreConfigs} | ${sourceConfigs.length === configsMigrated ? 'PASSED' : 'DISCREPANCY'} |
| Student Records | ${sourceStudents.length} | ${studentsMigrated} | ${postgreStudents} | ${sourceStudents.length <= (postgreStudents || 0) ? 'PASSED' : 'DISCREPANCY'} |
`;

  console.log(reconciliationReport);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'RECONCILIATION_REPORT.md'), reconciliationReport);
  console.log('Saved reconciliation report to docs/RECONCILIATION_REPORT.md');
}

runMigration().catch(console.error);
