const { createClient } = require('@supabase/supabase-js');
const path = require('path');

if (process.loadEnvFile) {
  try { process.loadEnvFile(path.join(__dirname, '..', '.env.local')); } catch (_) {}
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function seedFoundations() {
  console.log('Seeding default Organization, Campuses, and Departments...');

  // 1. Create or get Organization
  let { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', 'city-university')
    .single();

  if (!org) {
    const { data: newOrg, error: insOrgErr } = await supabase
      .from('organizations')
      .insert({
        name: 'City University Educational Network',
        slug: 'city-university'
      })
      .select()
      .single();
    if (insOrgErr) throw insOrgErr;
    org = newOrg;
    console.log('Created Organization:', org.name, org.id);
  } else {
    console.log('Found Organization:', org.name, org.id);
  }

  // 2. Create or get Campus A (Main)
  let { data: campusA, error: cErrA } = await supabase
    .from('campuses')
    .select('*')
    .eq('code', 'CAMPUS_A')
    .single();

  if (!campusA) {
    const { data: newA, error: insErrA } = await supabase
      .from('campuses')
      .insert({
        organization_id: org.id,
        name: 'City Engineering College - Main Campus',
        code: 'CAMPUS_A',
        branding: {
          college_name: 'City Engineering College',
          chatbot_title: 'Campus AI Assistant',
          theme: 'emerald'
        }
      })
      .select()
      .single();
    if (insErrA) throw insErrA;
    campusA = newA;
    console.log('Created Campus A:', campusA.name, campusA.id);
  } else {
    console.log('Found Campus A:', campusA.name, campusA.id);
  }

  // 3. Create or get Campus B (Tech) for multi-tenant isolation tests
  let { data: campusB, error: cErrB } = await supabase
    .from('campuses')
    .select('*')
    .eq('code', 'CAMPUS_B')
    .single();

  if (!campusB) {
    const { data: newB, error: insErrB } = await supabase
      .from('campuses')
      .insert({
        organization_id: org.id,
        name: 'City Institute of Technology - North Campus',
        code: 'CAMPUS_B',
        branding: {
          college_name: 'City Institute of Technology',
          chatbot_title: 'CIT Assistant',
          theme: 'indigo'
        }
      })
      .select()
      .single();
    if (insErrB) throw insErrB;
    campusB = newB;
    console.log('Created Campus B (Isolation Target):', campusB.name, campusB.id);
  } else {
    console.log('Found Campus B:', campusB.name, campusB.id);
  }

  // 4. Attach unassigned year_folders, form_configs, and student_records to Campus A
  const { error: fUpErr } = await supabase
    .from('year_folders')
    .update({ campus_id: campusA.id })
    .is('campus_id', null);
  if (fUpErr) console.warn('Warning updating year_folders campus_id:', fUpErr.message);

  const { error: fcUpErr } = await supabase
    .from('form_configs')
    .update({ campus_id: campusA.id })
    .is('campus_id', null);
  if (fcUpErr) console.warn('Warning updating form_configs campus_id:', fcUpErr.message);

  const { error: sUpErr } = await supabase
    .from('student_records')
    .update({ campus_id: campusA.id })
    .is('campus_id', null);
  if (sUpErr) console.warn('Warning updating student_records campus_id:', sUpErr.message);

  console.log('Foundations seeded and linked to Campus A successfully.');
}

seedFoundations().catch(console.error);
