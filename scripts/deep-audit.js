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

async function deepAudit() {
  console.log('--- DEEP AUDIT FOR ACTUAL STUDENT APPLICATIONS ---');

  // 1. Photos list in Supabase Storage
  const { data: photos } = await supabase.storage.from('student-assets').list('student-photos');
  console.log(`\n1. Supabase Storage Photos: ${photos?.length || 0} photos found:`);
  for (const p of photos || []) {
    console.log(`   Photo: ${p.name}`);
  }

  // 2. Form diagnostics in Supabase
  const { data: diagnostics, error: dErr } = await supabase.from('form_diagnostics').select('*');
  console.log(`\n2. Supabase Form Diagnostics: ${diagnostics?.length || 0} entries`);
  if (diagnostics && diagnostics.length > 0) {
    for (const d of diagnostics) {
      console.log(`   Diagnostic: [${d.folder_id}] ${d.student_name} (${d.roll_number}) - ${d.status}`);
      if (d.details) console.log(`     Details: ${d.details}`);
    }
  }

  // 3. Audit logs in Supabase
  const { data: auditLogs, error: aErr } = await supabase.from('audit_logs').select('*');
  console.log(`\n3. Supabase Audit Logs: ${auditLogs?.length || 0} entries`);
  if (auditLogs && auditLogs.length > 0) {
    for (const a of auditLogs) {
      console.log(`   Log: ${a.action} - ${a.details}`);
    }
  }

  // 4. Scan transcript files in .gemini/antigravity/brain
  const brainDir = 'C:\\Users\\23ht1\\.gemini\\antigravity\\brain';
  const foundInTranscripts = new Map();
  if (fs.existsSync(brainDir)) {
    const convs = fs.readdirSync(brainDir);
    console.log(`\n4. Scanning ${convs.length} conversation directories in brain...`);
    for (const c of convs) {
      const fullLog = path.join(brainDir, c, '.system_generated', 'logs', 'transcript_full.jsonl');
      const compactLog = path.join(brainDir, c, '.system_generated', 'logs', 'transcript.jsonl');
      const target = fs.existsSync(fullLog) ? fullLog : (fs.existsSync(compactLog) ? compactLog : null);
      if (target) {
        try {
          const content = fs.readFileSync(target, 'utf8');
          // Search for patterns like roll_number, student submission, form submission
          const lines = content.split('\n');
          for (const line of lines) {
            if (line.includes('23HT') || line.includes('24HT') || line.includes('25HT') || line.includes('26HT')) {
              // Extract potential student submissions
              const rollMatches = line.match(/(2[3456]HT[15]A43[A-Z0-9]{2})/gi);
              if (rollMatches) {
                for (const r of rollMatches) {
                  foundInTranscripts.set(r.toUpperCase(), { roll: r.toUpperCase(), conv: c });
                }
              }
            }
          }
        } catch (e) {}
      }
    }
  }

  console.log(`\nFound ${foundInTranscripts.size} student roll numbers referenced in transcripts:`);
  for (const [roll, info] of foundInTranscripts.entries()) {
    console.log(`   Roll: ${roll} (conv: ${info.conv})`);
  }
}

deepAudit().catch(console.error);
