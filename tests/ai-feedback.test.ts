/**
 * CITYAPP AI — Production Feedback Test Suite
 * Tests thumbs up/down recording, failure reasons, user corrections,
 * durable Supabase persistence, and automatic review queuing.
 */

import { ConversationLearningService } from '../src/lib/ai/conversation-learning';
import { getSupabaseAdmin } from '../src/lib/supabase';

async function runFeedbackSuite() {
  console.log('================================================================');
  console.log('CITYAPP AI — PRODUCTION FEEDBACK TEST SUITE');
  console.log('Target: Verify 👍 / 👎 user feedback & durable Supabase storage');
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

  const testId = `feedback_test_${Date.now()}`;
  const conversationId = `conv_${testId}`;
  const messageId = `msg_${testId}`;

  // 1. Ingest baseline event
  console.log('1. Ingesting Baseline Interaction Event into Supabase...');
  const initialEvent = await ConversationLearningService.ingestEvent({
    conversation_id: conversationId,
    message_id: messageId,
    user_role: 'student',
    raw_user_message: 'my roll no',
    assistant_reply: 'Your roll number is 24HT1A43G2',
    intent: 'PROFILE_SELF',
    tool: 'getStudentProfile',
    provider: 'gemini',
    model: 'gemini-flash-lite-latest',
    success: true,
  });

  assert(initialEvent.review_status === 'NEW', 'Initial interaction starts in NEW review status');

  // Verify stored in Supabase
  const supabase = getSupabaseAdmin();
  const { data: initialDbRow } = await supabase!
    .from('ai_learning_events')
    .select('*')
    .eq('message_id', messageId)
    .single();

  assert(!!initialDbRow, 'Interaction event persisted to Supabase ai_learning_events table');
  assert(initialDbRow?.review_status === 'NEW', 'Supabase row initialized with status NEW');

  // 2. Submit Positive Feedback (👍)
  console.log('\n2. Testing Positive Feedback Submission (👍)...');
  const posOk = await ConversationLearningService.recordFeedback(messageId, {
    type: 'positive',
    timestamp: new Date().toISOString(),
  });

  assert(posOk, 'Positive feedback accepted and recorded');

  const { data: posDbRow } = await supabase!
    .from('ai_learning_events')
    .select('*')
    .eq('message_id', messageId)
    .single();

  assert(posDbRow?.feedback_type === 'positive', 'Supabase record updated with feedback_type = positive');
  assert(posDbRow?.review_status === 'NEW', 'Positive feedback remains in NEW status (not flagged as error)');

  // 3. Submit Negative Feedback (👎) with Reason and Correction
  console.log('\n3. Testing Negative Feedback Submission (👎) with Reason & Correction...');
  const negMessageId = `msg_neg_${testId}`;
  await ConversationLearningService.ingestEvent({
    conversation_id: conversationId,
    message_id: negMessageId,
    user_role: 'student',
    raw_user_message: 'wat is my marks',
    assistant_reply: 'Could not find your student record.',
    intent: 'ACADEMIC_RECORD',
    tool: 'getAcademicRecord',
    provider: 'gemini',
    model: 'gemini-flash-lite-latest',
    success: true,
  });

  const negOk = await ConversationLearningService.recordFeedback(negMessageId, {
    type: 'negative',
    reason: 'Wrong information',
    userCorrection: 'I asked for marks, not my roll number. (phone 9876543210)',
    timestamp: new Date().toISOString(),
  });

  assert(negOk, 'Negative feedback accepted and recorded');

  const { data: negDbRow } = await supabase!
    .from('ai_learning_events')
    .select('*')
    .eq('message_id', negMessageId)
    .single();

  assert(negDbRow?.feedback_type === 'negative', 'Supabase record updated with feedback_type = negative');
  assert(negDbRow?.feedback_reason === 'Wrong information', 'Supabase record has feedback_reason = Wrong information');
  assert(
    negDbRow?.review_status === 'REVIEW_REQUIRED',
    'Negative feedback automatically escalates record to REVIEW_REQUIRED'
  );
  assert(
    negDbRow?.failure_type === 'HALLUCINATION',
    'Feedback reason "Wrong information" classified as failure_type HALLUCINATION'
  );
  assert(
    !negDbRow?.user_correction?.includes('9876543210'),
    'User correction had phone number sanitized to [PHONE] before DB storage'
  );

  // 4. Test All Negative Feedback Reasons
  console.log('\n4. Verifying All Standard Negative Feedback Reasons...');
  const reasonsToTest = [
    { reason: 'Wrong interpretation', expectedFailure: 'INTENT_ERROR' },
    { reason: 'Wrong data', expectedFailure: 'DATABASE_RETRIEVAL_ERROR' },
    { reason: 'Wrong student', expectedFailure: 'IDENTITY_ERROR' },
    { reason: 'Could not find my information', expectedFailure: 'DATABASE_RETRIEVAL_ERROR' },
    { reason: 'Wrong source', expectedFailure: 'RAG_RETRIEVAL_ERROR' },
    { reason: 'Other', expectedFailure: 'OTHER' },
  ];

  for (const r of reasonsToTest) {
    const classification = ConversationLearningService.classifyFailureReason(r.reason);
    assert(
      classification === r.expectedFailure,
      `Reason "${r.reason}" correctly mapped to failure classification ${r.expectedFailure}`
    );
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runFeedbackSuite();
