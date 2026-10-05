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

// Deterministic 768-dim pseudo-embedding generator for test seeds
function generateDeterministicEmbedding(text) {
  const embedding = new Array(768).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  for (let i = 0; i < 768; i++) {
    const val = Math.sin(hash + i) * Math.cos((i * 13) % 97);
    embedding[i] = parseFloat(val.toFixed(6));
  }
  // Normalize vector
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => parseFloat((val / norm).toFixed(6)));
}

async function seedKnowledge() {
  console.log('--- SEEDING CAMPUS KNOWLEDGE BASE (ISOLATED PER CAMPUS) ---');

  const { data: campusA } = await supabase.from('campuses').select('id').eq('code', 'CAMPUS_A').single();
  const { data: campusB } = await supabase.from('campuses').select('id').eq('code', 'CAMPUS_B').single();

  if (!campusA || !campusB) {
    throw new Error('Campuses not found. Run seed-tenant-foundations.js first.');
  }

  // 1. Campus A: Admission Guidelines 2026
  const docA1 = {
    campus_id: campusA.id,
    title: 'City Engineering College Admission Guidelines 2026',
    category: 'Admissions',
    version: 1,
    is_active: true,
    effective_date: '2026-01-01',
    metadata: {
      institution: 'City Engineering College - Main Campus',
      academic_year: '2026-2027',
      approved_by: 'Academic Council'
    }
  };

  const { data: insertedDocA1, error: docErr1 } = await supabase
    .from('knowledge_documents')
    .insert(docA1)
    .select()
    .single();

  if (docErr1) throw docErr1;

  const chunksA1 = [
    {
      document_id: insertedDocA1.id,
      campus_id: campusA.id,
      chunk_index: 0,
      content: 'Required Documents for Admission: 1. SSC / 10th Class Original Marks Memo and 3 photocopies. 2. Intermediate / 10+2 / Diploma Marks Memo and Pass Certificate. 3. Transfer Certificate (T.C.) from the previous institution. 4. Study / Bonafide Certificates from Class 6 to 12. 5. Caste / Category Certificate (if applicable). 6. Income Certificate issued by competent revenue authority. 7. Six passport-size color photographs. 8. Aadhaar Card copy (for identity verification only).',
      metadata: { section: 'Required Documents', page: 2 }
    },
    {
      document_id: insertedDocA1.id,
      campus_id: campusA.id,
      chunk_index: 1,
      content: 'Tuition Fee Payment and Refund Policy: Full tuition fee must be cleared at the time of seat allotment. Cancellations requested before the formal commencement of classes are eligible for a 90% refund minus processing fees of ₹1,000. No refund is admissible after 30 calendar days from the orientation date.',
      metadata: { section: 'Fee and Refund Regulations', page: 4 }
    },
    {
      document_id: insertedDocA1.id,
      campus_id: campusA.id,
      chunk_index: 2,
      content: 'Merit Scholarship Guidelines: Students securing CGPA 8.5 and above in each semester, with zero standing arrears and a minimum of 80% biometric attendance, are awarded a 25% waiver on annual tuition fees under the CityApp Merit Scholarship scheme.',
      metadata: { section: 'Scholarship Regulations', page: 5 }
    }
  ];

  for (const c of chunksA1) {
    const embedding = generateDeterministicEmbedding(c.content);
    await supabase.from('knowledge_chunks').insert({
      ...c,
      embedding: embedding
    });
  }

  console.log('✓ Seeded Campus A Knowledge: Admission Guidelines & Required Documents');

  // 2. Campus B: CIT North Campus Regulations (Used for Multi-Tenant Isolation Verification)
  const docB1 = {
    campus_id: campusB.id,
    title: 'City Institute of Technology (CIT) Private Regulations',
    category: 'Institutional Policies',
    version: 1,
    is_active: true,
    effective_date: '2026-01-01',
    metadata: {
      institution: 'City Institute of Technology - North Campus',
      restricted: true
    }
  };

  const { data: insertedDocB1, error: docErrB } = await supabase
    .from('knowledge_documents')
    .insert(docB1)
    .select()
    .single();

  if (docErrB) throw docErrB;

  const chunksB1 = [
    {
      document_id: insertedDocB1.id,
      campus_id: campusB.id,
      chunk_index: 0,
      content: 'CIT North Campus Confidential: Special Robotics & AI Innovation Wing funding guidelines and secret research laboratory protocols for Campus B faculty and research scholars.',
      metadata: { section: 'Classified Campus B Protocols', page: 1 }
    }
  ];

  for (const c of chunksB1) {
    const embedding = generateDeterministicEmbedding(c.content);
    await supabase.from('knowledge_chunks').insert({
      ...c,
      embedding: embedding
    });
  }

  console.log('✓ Seeded Campus B Isolated Knowledge (Isolation Verification Target)');
  console.log('--- CAMPUS KNOWLEDGE SEEDING COMPLETED ---');
}

seedKnowledge().catch(console.error);
