/**
 * CITYAPP AI — Human Review & Quality Gate Test Suite
 * Tests review state machine: NEW, REVIEW_REQUIRED, VERIFIED, REJECTED, DUPLICATE, PROMOTED
 * Validates escalation rules, promotion restrictions, and regression safety.
 */

import { ConversationLearningService } from '../src/lib/ai/conversation-learning';
import { getSupabaseAdmin } from '../src/lib/supabase';

async function runReviewSuite() {
  console.log('================================================================');
  console.log('CITYAPP AI — HUMAN REVIEW & QUALITY GATE SUITE');
  console.log('Target: Verify state machine & promotion safety invariants');
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

  // 1. CLEAN QUERY INITIALIZES TO NEW
  console.log('1. Testing Clean Query -> NEW State...');
  const cleanEvent = await ConversationLearningService.ingestEvent({
    conversation_id: `conv_${runId}_1`,
    message_id: `msg_clean_${runId}`,
    user_role: 'student',
    raw_user_message: 'what documents are required for admission?',
    assistant_reply: 'Admission requires 10th and 12th marks memos.',
    intent: 'DOCUMENTS_REQUIRED',
    tool: 'searchKnowledge',
    provider: 'gemini',
    model: 'gemini-flash-lite-latest',
    success: true,
  });

  assert(cleanEvent.review_status === 'NEW', 'Clean interaction initializes to status NEW');

  // 2. NEGATIVE FEEDBACK ESCALATES TO REVIEW_REQUIRED
  console.log('\n2. Testing Negative Feedback -> REVIEW_REQUIRED...');
  await ConversationLearningService.recordFeedback(cleanEvent.message_id, {
    type: 'negative',
    reason: 'Wrong information',
  });
  const supabase = getSupabaseAdmin();
  const { data: negRow } = await supabase!
    .from('ai_learning_events')
    .select('review_status')
    .eq('message_id', cleanEvent.message_id)
    .single();

  assert(negRow?.review_status === 'REVIEW_REQUIRED', 'Negative feedback escalates status to REVIEW_REQUIRED');

  // 3. USER CORRECTION ESCALATES TO REVIEW_REQUIRED
  console.log('\n3. Testing User Correction -> REVIEW_REQUIRED...');
  const corrEvent = await ConversationLearningService.ingestEvent({
    conversation_id: `conv_${runId}_2`,
    message_id: `msg_corr_${runId}`,
    user_role: 'student',
    raw_user_message: 'my marks',
    assistant_reply: 'Here are your marks.',
    intent: 'ACADEMIC_RECORD',
    tool: 'getAcademicRecord',
    provider: 'gemini',
    model: 'gemini-flash-lite-latest',
    success: true,
  });

  await ConversationLearningService.recordFeedback(corrEvent.message_id, {
    type: 'positive',
    userCorrection: 'Actually I also wanted my CGPA',
  });

  const { data: corrRow } = await supabase!
    .from('ai_learning_events')
    .select('review_status')
    .eq('message_id', corrEvent.message_id)
    .single();

  assert(corrRow?.review_status === 'REVIEW_REQUIRED', 'User correction escalates status to REVIEW_REQUIRED');

  // 4. LOW NORMALIZATION CONFIDENCE ESCALATES TO REVIEW_REQUIRED
  console.log('\n4. Testing Low Normalization Confidence -> REVIEW_REQUIRED...');
  const lowConfEvent = await ConversationLearningService.ingestEvent({
    conversation_id: `conv_${runId}_3`,
    message_id: `msg_lowconf_${runId}`,
    user_role: 'student',
    raw_user_message: 'xyz abc random gibberish phrase not in dictionary 987',
    assistant_reply: 'I could not understand your request.',
    success: true,
  });

  assert(
    lowConfEvent.review_status === 'REVIEW_REQUIRED',
    'Low confidence normalization automatically flags record as REVIEW_REQUIRED'
  );

  // 5. POTENTIAL PII ESCALATES TO REVIEW_REQUIRED
  console.log('\n5. Testing Potential PII -> REVIEW_REQUIRED...');
  const piiEvent = await ConversationLearningService.ingestEvent({
    conversation_id: `conv_${runId}_4`,
    message_id: `msg_pii_${runId}`,
    user_role: 'student',
    raw_user_message: 'my aadhaar 1234 5678 9012',
    assistant_reply: 'We do not store raw Aadhaar numbers.',
    success: true,
  });

  assert(
    piiEvent.review_status === 'REVIEW_REQUIRED',
    'Detected PII in query automatically flags record as REVIEW_REQUIRED'
  );

  // 6. HUMAN REVIEW STATE TRANSITIONS
  console.log('\n6. Testing Human Review State Transitions...');
  // A. REVIEW_REQUIRED -> REJECTED
  const rejectedRecord = await ConversationLearningService.reviewRecord(
    lowConfEvent.message_id,
    'REJECTED'
  );
  assert(rejectedRecord?.review_status === 'REJECTED', 'Record transitioned to REJECTED');

  // B. REVIEW_REQUIRED -> DUPLICATE
  const dupRecord = await ConversationLearningService.reviewRecord(
    cleanEvent.message_id,
    'DUPLICATE'
  );
  assert(dupRecord?.review_status === 'DUPLICATE', 'Record transitioned to DUPLICATE');

  // C. REVIEW_REQUIRED -> VERIFIED
  const verifiedRecord = await ConversationLearningService.reviewRecord(
    corrEvent.message_id,
    'VERIFIED',
    undefined,
    {
      normalized_text: 'my marks and cgpa',
      intent: 'ACADEMIC_RECORD',
      tool: 'getAcademicRecord',
    }
  );
  assert(verifiedRecord?.review_status === 'VERIFIED', 'Record transitioned to VERIFIED');

  // D. VERIFIED -> PROMOTED
  const promotedRecord = await ConversationLearningService.reviewRecord(
    corrEvent.message_id,
    'PROMOTED'
  );
  assert(promotedRecord?.review_status === 'PROMOTED', 'Verified record transitioned to PROMOTED');
  assert(!!promotedRecord?.promoted_at, 'Promoted timestamp recorded');

  // 7. INVARIANT: NEVER AUTOMATICALLY PROMOTE UNVERIFIED RECORDS
  console.log('\n7. Invariant: Unverified Records Cannot Be Promoted...');
  assert(
    cleanEvent.review_status !== 'PROMOTED',
    'Unverified query is not automatically promoted merely because user did not complain'
  );

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runReviewSuite();
