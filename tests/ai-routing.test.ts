process.env.ALLOW_DEV_AI_MOCK = 'true';
import { AIOrchestrator } from '../src/lib/ai/orchestrator';
import type { AuthContext } from '../src/lib/auth/types';

async function runRoutingTests() {
  console.log('================================================================');
  console.log('CITYAPP AI — QUERY ROUTING & ISOLATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  const studentContext: AuthContext = {
    userId: 'student-usr-01',
    role: 'student',
    email: '24HT1A43G2@campus.edu',
    campusId: 'de1a8da7-a875-4648-94c8-3e642ed6c45c',
    profile: {
      id: 'student-usr-01',
      email: '24HT1A43G2@campus.edu',
      full_name: 'Shaik Nazeer Basha',
    },
    memberships: [],
    activeMembership: null,
  };

  // 1. Self-Service Identity Routing (PostgreSQL source of truth)
  console.log('1. Testing Self-Service Student Queries:');
  const res1 = await AIOrchestrator.handleMessage('my marks', [], studentContext, 'deterministic');
  assert(res1.toolResults.some((t) => t.tool === 'getAcademicRecord'), 'Routes "my marks" -> getAcademicRecord');
  assert(!res1.toolResults.some((t) => t.tool === 'searchKnowledge'), 'Does NOT fall back to RAG for "my marks"');
  assert(res1.reply.includes('Shaik Nazeer Basha') || res1.reply.includes('24HT1A43G2'), 'Grounds answer with authenticated student data');

  const res2 = await AIOrchestrator.handleMessage('my details', [], studentContext, 'deterministic');
  assert(res2.toolResults.some((t) => t.tool === 'getStudentProfile'), 'Routes "my details" -> getStudentProfile');
  assert(!res2.toolResults.some((t) => t.tool === 'searchKnowledge'), 'Does NOT fall back to RAG for "my details"');

  const res3 = await AIOrchestrator.handleMessage('am i eligible for the merit scholarship?', [], studentContext, 'deterministic');
  assert(res3.toolResults.some((t) => t.tool === 'getEligibilityData'), 'Routes eligibility query -> getEligibilityData');

  // 2. Normalized Typo & Telugu Routing
  console.log('\n2. Testing Normalized Typo & Telugu Query Routing:');
  const res4 = await AIOrchestrator.handleMessage('wat is my rol nuber?', [], studentContext, 'deterministic');
  assert(res4.toolResults.some((t) => t.tool === 'getStudentProfile'), 'Routes noisy "wat is my rol nuber" -> getStudentProfile');

  const res5 = await AIOrchestrator.handleMessage('naa marks cheppu', [], studentContext, 'deterministic');
  assert(res5.toolResults.some((t) => t.tool === 'getAcademicRecord'), 'Routes Telugu-English "naa marks cheppu" -> getAcademicRecord');

  const res6 = await AIOrchestrator.handleMessage('attendance entha', [], studentContext, 'deterministic');
  assert(res6.toolResults.some((t) => t.tool === 'getAttendanceRecord'), 'Routes Telugu-English "attendance entha" -> getAttendanceRecord');

  // 3. Strict Institutional Knowledge (RAG) Routing
  console.log('\n3. Testing Institutional Policy & Document Queries (RAG):');
  const rag1 = await AIOrchestrator.handleMessage('what documents are required for admission?', [], studentContext, 'deterministic');
  assert(rag1.toolResults.some((t) => t.tool === 'searchKnowledge'), 'Routes admission documents query -> searchKnowledge');
  assert(Boolean(rag1.citations && rag1.citations.length > 0), 'Provides document citations for policy response');

  const rag2 = await AIOrchestrator.handleMessage('what is the fee refund policy?', [], studentContext, 'deterministic');
  assert(rag2.toolResults.some((t) => t.tool === 'searchKnowledge'), 'Routes fee refund policy query -> searchKnowledge');

  // Summary
  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRoutingTests();
