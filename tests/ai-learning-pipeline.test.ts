/**
 * CITYAPP AI — Continuous Conversation Learning Pipeline Suite
 * Tests end-to-end data lifecycle: Ingestion -> PII Redaction -> Normalization ->
 * Supabase Durable Storage -> User Feedback -> Escalation -> Human Review -> Candidate Harvest
 */

import { ConversationLearningService } from '../src/lib/ai/conversation-learning';
import { getSupabaseAdmin } from '../src/lib/supabase';

async function runLearningPipelineSuite() {
  console.log('================================================================');
  console.log('CITYAPP AI — CONTINUOUS LEARNING PIPELINE SUITE');
  console.log('Target: End-to-end learning lifecycle in durable Supabase storage');
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

  const pipelineRunId = Date.now();
  const testMessageId = `pipe_msg_${pipelineRunId}`;
  const testConvId = `pipe_conv_${pipelineRunId}`;

  // 1. INGESTION & REDACTION
  console.log('1. INGESTION & PII REDACTION STAGE');
  console.log('----------------------------------');

  const rawUserQuery = 'my role no is 24HT1A43G2 and phone 9876543210';
  const event = await ConversationLearningService.ingestEvent({
    conversation_id: testConvId,
    message_id: testMessageId,
    user_role: 'student',
    raw_user_message: rawUserQuery,
    assistant_reply: 'Your student details are displayed above.',
    intent: 'PROFILE_SELF',
    tool: 'getStudentProfile',
    provider: 'gemini',
    model: 'gemini-flash-lite-latest',
    success: true,
  });

  assert(event.anonymized === true, 'Event marked as anonymized');
  assert(!event.redacted_message.includes('24HT1A43G2'), 'Raw roll number redacted from stored message');
  assert(!event.redacted_message.includes('9876543210'), 'Raw phone number redacted from stored message');
  assert(event.redacted_message.includes('[ROLL_NUMBER]'), 'Contains [ROLL_NUMBER] placeholder');
  assert(event.redacted_message.includes('[PHONE]'), 'Contains [PHONE] placeholder');

  // 2. SUPABASE DURABLE STORAGE VERIFICATION
  console.log('\n2. DURABLE SUPABASE POSTGRESQL VERIFICATION');
  console.log('------------------------------------------');

  const supabase = getSupabaseAdmin();
  assert(!!supabase, 'Supabase admin client available');

  const { data: dbRecord, error: dbError } = await supabase!
    .from('ai_learning_events')
    .select('*')
    .eq('message_id', testMessageId)
    .single();

  assert(!dbError && !!dbRecord, 'Record successfully written to Supabase ai_learning_events table');
  assert(dbRecord?.original_message_encrypted_or_restricted === null, 'Zero raw sensitive conversation stored in DB');
  assert(dbRecord?.redacted_message === event.redacted_message, 'Redacted message stored in Supabase');
  assert(dbRecord?.review_status === 'REVIEW_REQUIRED', 'Event with detected PII correctly initialized with REVIEW_REQUIRED');

  // 3. NEGATIVE FEEDBACK & FAILURE HARVESTING
  console.log('\n3. USER FEEDBACK & FAILURE HARVESTING');
  console.log('-------------------------------------');

  const feedbackRecorded = await ConversationLearningService.recordFeedback(testMessageId, {
    type: 'negative',
    reason: 'Wrong interpretation',
    userCorrection: 'I asked for my marks, not my roll number.',
  });

  assert(feedbackRecorded, 'Feedback successfully applied');

  const { data: updatedDbRecord } = await supabase!
    .from('ai_learning_events')
    .select('*')
    .eq('message_id', testMessageId)
    .single();

  assert(updatedDbRecord?.feedback_type === 'negative', 'Feedback type persisted as negative');
  assert(updatedDbRecord?.feedback_reason === 'Wrong interpretation', 'Feedback reason persisted');
  assert(updatedDbRecord?.failure_type === 'INTENT_ERROR', 'Failure type automatically classified as INTENT_ERROR');
  assert(updatedDbRecord?.review_status === 'REVIEW_REQUIRED', 'Record remains in REVIEW_REQUIRED status');

  // 4. HUMAN REVIEW WORKFLOW
  console.log('\n4. HUMAN REVIEW & VERIFICATION WORKFLOW');
  console.log('---------------------------------------');

  const reviewedRecord = await ConversationLearningService.reviewRecord(
    testMessageId,
    'VERIFIED',
    'admin-reviewer-uuid',
    {
      intent: 'ACADEMIC_RECORD',
      tool: 'getAcademicRecord',
    }
  );

  assert(reviewedRecord?.review_status === 'VERIFIED', 'Human review updated status to VERIFIED');
  assert(!!reviewedRecord?.reviewed_at, 'Human review timestamp recorded');
  assert(reviewedRecord?.reviewer_id === 'admin-reviewer-uuid', 'Reviewer ID recorded');

  const { data: verifiedDbRecord } = await supabase!
    .from('ai_learning_events')
    .select('*')
    .eq('message_id', testMessageId)
    .single();

  assert(verifiedDbRecord?.review_status === 'VERIFIED', 'Supabase table reflects VERIFIED review status');

  // 5. REGRESSION CANDIDATE HARVESTING
  console.log('\n5. REGRESSION CANDIDATE HARVESTING');
  console.log('----------------------------------');

  const regressionCandidate = ConversationLearningService.generateRegressionCandidate(reviewedRecord!);
  assert(!!regressionCandidate.text, 'Regression candidate contains original text');
  assert(regressionCandidate.intent === 'ACADEMIC_RECORD', 'Regression candidate reflects corrected intent');
  assert(regressionCandidate.tool === 'getAcademicRecord', 'Regression candidate reflects corrected tool');
  assert(regressionCandidate.source === 'verified_feedback', 'Regression candidate source flagged as verified_feedback');

  // 6. METRICS AGGREGATION AUDIT
  console.log('\n6. METRICS AGGREGATION AUDIT');
  console.log('----------------------------');

  const metrics = await ConversationLearningService.getMetrics();
  assert(metrics.total_events > 0, `Total learning events count verified: ${metrics.total_events}`);
  assert(metrics.negative_feedback > 0, `Negative feedback count verified: ${metrics.negative_feedback}`);
  assert(metrics.verified_candidates > 0, `Verified candidates count verified: ${metrics.verified_candidates}`);

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runLearningPipelineSuite();
