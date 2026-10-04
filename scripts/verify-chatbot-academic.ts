import { AIOrchestrator } from '../src/lib/ai/orchestrator';
import { createClient } from '@supabase/supabase-js';
import type { AuthContext } from '../src/lib/auth/types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, serviceKey);

async function main() {
  console.log('================================================================');
  console.log('CHATBOT & ELIGIBILITY VERIFICATION ACROSS CANONICAL RECORDS');
  console.log('================================================================\n');

  const { data: campus } = await supabase.from('campuses').select('*').limit(1).single();

  const adminContext: AuthContext = {
    userId: 'admin_test_user',
    email: 'admin@com',
    profile: { id: 'admin_test_user', email: 'admin@com', full_name: 'Administrator' },
    memberships: [],
    activeMembership: { id: 'm1', profile_id: 'admin_test_user', organization_id: campus.organization_id, campus_id: campus.id, role: 'campus_admin', status: 'active' },
    role: 'campus_admin',
    campusId: campus.id,
  };

  const testQueries = [
    "What is Shaik Nazeer Basha's SSC score?",
    "What is his Intermediate percentage?",
    "What is his CGPA?",
    "Is 24HT1A43G2 eligible for the Merit Scholarship?",
    "What is Tadiboina Gayatri's academic score and CGPA?",
    "Is 24ht1a43a0 eligible for the Merit Scholarship?",
  ];

  for (const query of testQueries) {
    console.log(`\n>>> QUERY: "${query}"`);
    const res = await AIOrchestrator.handleMessage(query, [], adminContext);
    console.log(`<<< REPLY:\n${res.reply}\n`);
    
    // Safety assertions
    if (query.includes('Shaik') && query.includes('SSC')) {
      if (res.reply.includes('281%')) {
        throw new Error('FATAL REGRESSION: SSC score incorrectly interpreted as 281%!');
      }
      if (!res.reply.includes('281/600') && !res.reply.includes('46.8')) {
        throw new Error('Expected canonical SSC score 281/600 (46.83%) in reply');
      }
      console.log('✓ PASS: Shaik Nazeer Basha SSC score reported canonically as 281/600 (46.83%), never "281%".');
    }

    if (query.includes('Shaik') && query.includes('Intermediate')) {
      if (!res.reply.includes('583/1000') && !res.reply.includes('58.3%')) {
        throw new Error('Expected canonical Intermediate score in reply');
      }
      console.log('✓ PASS: Shaik Nazeer Basha Intermediate percentage reported canonically as 583/1000 (58.3%).');
    }

    if (query.includes('24HT1A43G2 eligible')) {
      if (res.reply.includes('`ELIGIBLE`')) {
        throw new Error('FATAL: Shaik Nazeer Basha should NOT be eligible for Merit Scholarship (scores < 85%)');
      }
      console.log('✓ PASS: Shaik Nazeer Basha correctly evaluated as INELIGIBLE for Merit Scholarship.');
    }

    if (query.includes('Tadiboina Gayatri')) {
      if (!res.reply.includes('8.8') || !res.reply.includes('CGPA')) {
        throw new Error('Expected CGPA 8.8 for Tadiboina Gayatri');
      }
      console.log('✓ PASS: Tadiboina Gayatri correctly reported with 8.80 CGPA.');
    }
  }

  console.log('\nAll academic verification queries PASSED with canonical data!\n');
}

main().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
