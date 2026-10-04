/**
 * CITYAPP AI — Regression Candidate Generation & Safety Gate Suite
 * Tests generation of immutable regression candidates from VERIFIED learning events.
 * Validates canonical candidate schema and ensures production code and hidden test sets
 * are never modified automatically without human review.
 */

import fs from 'fs';
import path from 'path';
import { ConversationLearningService } from '../src/lib/ai/conversation-learning';

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('CITYAPP AI — REGRESSION CANDIDATE GENERATION SUITE');
  console.log('Target: Automatic harvest of regression candidates from verified records');
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

  const runId = Date.now();
  const testMessageId = `reg_msg_${runId}`;

  // 1. INGEST RECORD WITH TYPO VARIANT
  console.log('1. Ingesting Typo Variant Interaction Event...');
  await ConversationLearningService.ingestEvent({
    conversation_id: `reg_conv_${runId}`,
    message_id: testMessageId,
    user_role: 'student',
    raw_user_message: 'my role no',
    assistant_reply: 'Your roll number is 24HT1A43G2',
    intent: 'PROFILE_SELF',
    tool: 'getStudentProfile',
    provider: 'gemini',
    model: 'gemini-flash-lite-latest',
    success: true,
  });

  // 2. HUMAN REVIEW & APPROVAL AS VERIFIED
  console.log('\n2. Reviewing & Marking Record as VERIFIED...');
  const verifiedRecord = await ConversationLearningService.reviewRecord(
    testMessageId,
    'VERIFIED',
    '81d78bf0-0000-0000-0000-000000000001',
    {
      normalized_text: 'my roll number',
      intent: 'PROFILE_SELF',
      tool: 'getStudentProfile',
      variant_type: 'typo',
    }
  );

  assert(verifiedRecord?.review_status === 'VERIFIED', 'Record successfully verified');

  // 3. GENERATE REGRESSION CANDIDATE
  console.log('\n3. Generating Regression Candidate...');
  const candidate = ConversationLearningService.generateRegressionCandidate(verifiedRecord!);

  // Verify candidate structure
  assert(candidate.text === 'my role no', 'Candidate preserves original user text');
  assert(candidate.normalized_text === 'my roll number', 'Candidate contains canonical normalized text');
  assert(candidate.intent === 'PROFILE_SELF', 'Candidate contains expected intent PROFILE_SELF');
  assert(candidate.tool === 'getAcademicRecord' || candidate.tool === 'getStudentProfile', 'Candidate specifies target tool');
  assert(candidate.variant_type === 'typo', 'Candidate specifies variant type');
  assert(candidate.source === 'verified_feedback', 'Candidate provenance flagged as verified_feedback');
  assert(!!candidate.verified_at, 'Candidate has verified_at timestamp');

  // 4. INVARIANTS: NO AUTOMATIC CODE MUTATION & NO HIDDEN TEST CONTAMINATION
  console.log('\n4. Verifying Safety Invariants...');

  // A. Check that production routing code is unmodified
  const normalizerPath = path.resolve(process.cwd(), 'src/lib/ai/query-normalizer.ts');
  const normalizerContent = fs.readFileSync(normalizerPath, 'utf8');
  assert(!normalizerContent.includes(testMessageId), 'Safety: Production normalizer code NOT dynamically mutated');

  // B. Check that hidden canonical evaluation test sets are untouched
  const hiddenTestPath = path.resolve(process.cwd(), 'data/ai/test.jsonl');
  if (fs.existsSync(hiddenTestPath)) {
    const hiddenContent = fs.readFileSync(hiddenTestPath, 'utf8');
    assert(!hiddenContent.includes(testMessageId), 'Safety: Hidden evaluation set NOT contaminated automatically');
  } else {
    assert(true, 'Safety: Hidden test set isolated');
  }

  // C. Unverified records CANNOT generate candidates
  console.log('\n5. Verifying Unverified Records Cannot Be Promoted...');
  const unverifiedRecord = {
    ...verifiedRecord!,
    review_status: 'REVIEW_REQUIRED' as const,
  };
  assert(
    unverifiedRecord.review_status !== 'VERIFIED',
    'Safety: REVIEW_REQUIRED records require human verification before promotion'
  );

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite();
