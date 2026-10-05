const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

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

async function migrateAuth() {
  console.log('--- MIGRATING LEGACY IDENTITIES TO SUPABASE AUTH & TENANT MEMBERSHIPS ---');

  // 1. Get Organization and Campus A
  const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'city-university').single();
  const { data: campusA } = await supabase.from('campuses').select('id').eq('code', 'CAMPUS_A').single();
  const { data: campusB } = await supabase.from('campuses').select('id').eq('code', 'CAMPUS_B').single();

  if (!org || !campusA || !campusB) {
    throw new Error('Organization or Campuses not found. Run seed-tenant-foundations.js first.');
  }

  // Define target accounts from legacy database
  const accountsToMigrate = [
    {
      email: 'superadmin@com',
      password: 'Password@123',
      name: 'Master Super Admin',
      role: 'superadmin',
      campusId: null // Global
    },
    {
      email: 'admin@com',
      password: 'Password@123',
      name: 'Campus Administrator',
      role: 'campus_admin',
      campusId: campusA.id
    },
    {
      email: 'campusadmin@cityapp.edu',
      password: 'Password@123',
      name: 'Campus Admin Officer',
      role: 'campus_admin',
      campusId: campusA.id
    },
    {
      email: 'm@com',
      password: 'Password@123',
      name: 'Student User',
      role: 'student',
      campusId: campusA.id,
      rollNumber: '23CSE104' // Linked student record
    },
    {
      email: 'student_b@com',
      password: 'Password@123',
      name: 'Campus B Student',
      role: 'student',
      campusId: campusB.id,
      rollNumber: '23CIT201' // For isolation testing
    }
  ];

  // Fetch current auth users
  const { data: { users: existingAuthUsers } } = await supabase.auth.admin.listUsers();
  const userByEmail = new Map();
  (existingAuthUsers || []).forEach(u => userByEmail.set(u.email.toLowerCase(), u));

  for (const acc of accountsToMigrate) {
    let authUser = userByEmail.get(acc.email.toLowerCase());

    if (!authUser) {
      console.log(`Creating Supabase Auth user: ${acc.email} (${acc.role})...`);
      const { data: created, error: crErr } = await supabase.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { full_name: acc.name, role: acc.role },
        app_metadata: { role: acc.role }
      });
      if (crErr) {
        console.error(`Failed to create ${acc.email}:`, crErr.message);
        continue;
      }
      authUser = created.user;
    } else {
      console.log(`Supabase Auth user already exists: ${acc.email} (${authUser.id})`);
    }

    // Upsert Profile
    const { error: profErr } = await supabase
      .from('profiles')
      .upsert({
        id: authUser.id,
        email: acc.email,
        full_name: acc.name,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (profErr) {
      console.error(`Profile error for ${acc.email}:`, profErr.message);
    }

    // Upsert Tenant Membership
    const { data: existingMem } = await supabase
      .from('tenant_memberships')
      .select('id')
      .eq('profile_id', authUser.id)
      .maybeSingle();

    if (!existingMem) {
      const { error: memErr } = await supabase
        .from('tenant_memberships')
        .insert({
          profile_id: authUser.id,
          organization_id: org.id,
          campus_id: acc.campusId,
          role: acc.role,
          status: 'active'
        });
      if (memErr) console.error(`Membership error for ${acc.email}:`, memErr.message);
    }

    // If student has a roll number, link to student_records
    if (acc.rollNumber) {
      const { error: sLinkErr } = await supabase
        .from('student_records')
        .update({ account_id: authUser.id, email: acc.email })
        .eq('roll_number', acc.rollNumber);
      if (sLinkErr) console.warn(`Link student record error for ${acc.rollNumber}:`, sLinkErr.message);
    }

    console.log(`✓ Configured identity & membership for: ${acc.email}`);
  }

  console.log('--- AUTH IDENTITY MIGRATION COMPLETED SUCCESSFULLY ---');
}

migrateAuth().catch(console.error);
