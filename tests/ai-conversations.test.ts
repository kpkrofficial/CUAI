import { ConversationLearningService } from '../src/lib/ai/conversation-learning';
import fs from 'fs';
import path from 'path';

async function runConversationTests() {
  console.log('================================================================');
  console.log('CITYAPP AI — CONVERSATION LEARNING & PRIVACY SUITE');
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

  // 1. PII Redaction
  console.log('1. Testing Comprehensive PII Redaction:');
  const sensitiveText = 'Student Rahul Kumar, roll 24HT1A43G2, aadhaar 9876 5432 1098, email test@univ.ac.in, phone +91 9848022338, token sk-ant-api-key-secret12345';
  const red = ConversationLearningService.redactPII(sensitiveText);
  assert(red.piiDetected, 'Detected PII tokens in sensitive text');
  assert(!red.redacted.includes('9876 5432 1098'), 'Aadhaar number redacted');
  assert(red.redacted.includes('[AADHAAR]'), 'Replaced with [AADHAAR] token');
  assert(!red.redacted.includes('test@univ.ac.in'), 'Email address redacted');
  assert(red.redacted.includes('[EMAIL]'), 'Replaced with [EMAIL] token');
  assert(!red.redacted.includes('9848022338'), 'Phone number redacted');
  assert(red.redacted.includes('[PHONE]'), 'Replaced with [PHONE] token');
  assert(!red.redacted.includes('24HT1A43G2'), 'Student Roll Number redacted');
  assert(red.redacted.includes('[ROLL_NUMBER]'), 'Replaced with [ROLL_NUMBER] token');
  assert(!red.redacted.includes('sk-ant-api-key-secret12345'), 'Secret API credentials redacted');
  assert(red.redacted.includes('[CREDENTIALS]'), 'Replaced with [CREDENTIALS] token');

  // 2. Raw Conversation Ingestion & Anonymization
  console.log('\n2. Testing Conversation Ingestion & Storage Separation:');
  const testId = `msg_test_${Date.now()}`;
  await ConversationLearningService.ingestRawConversation({
    conversation_id: 'conv_unit_01',
    message_id: testId,
    timestamp: new Date().toISOString(),
    user_role: 'student',
    raw_user_message: 'wat is my rol nuber for 24HT1A43G2?',
    assistant_reply: 'Your roll number is 24HT1A43G2',
    tool_invoked: 'getStudentProfile',
    data_source: 'postgresql',
    intent_resolved: 'PROFILE_SELF',
    success: true,
  });

  const anonPath = path.resolve(process.cwd(), `data/ai/conversations/anonymized/${testId}.json`);
  assert(fs.existsSync(anonPath), 'Created anonymized candidate record');
  const anonRecord = JSON.parse(fs.readFileSync(anonPath, 'utf8'));
  assert(anonRecord.anonymized === true, 'Flagged as anonymized: true');
  assert(!anonRecord.original_variant.includes('24HT1A43G2'), 'Raw student roll redacted in anonymized record');
  assert(anonRecord.original_variant.includes('[ROLL_NUMBER]'), 'Contains [ROLL_NUMBER] placeholder');
  assert(anonRecord.normalized_text.includes('roll number'), 'Normalized text generated correctly');

  // 3. User Feedback & Failure Harvesting
  console.log('\n3. Testing User Feedback & Review State Machine:');
  await ConversationLearningService.recordFeedback(testId, {
    type: 'negative',
    reason: 'Wrong information',
    userCorrection: 'I asked for marks not roll number',
    timestamp: new Date().toISOString(),
  });

  const updatedAnon = JSON.parse(fs.readFileSync(anonPath, 'utf8'));
  assert(
    updatedAnon.failure_type === 'HALLUCINATION' || updatedAnon.failure_type === 'Wrong information',
    'Captured structured failure reason'
  );
  assert(updatedAnon.feedback?.userCorrection === 'I asked for marks not roll number', 'Captured user correction');

  // 4. Human Review & Verified Promotion Pipeline
  console.log('\n4. Testing Human Review & Promotion:');
  await ConversationLearningService.reviewRecord(testId, 'VERIFIED', {
    normalized_text: 'what are my academic marks',
    intent: 'ACADEMIC_SELF',
    tool: 'getAcademicRecord',
  });

  const curatedPath = path.resolve(process.cwd(), `data/ai/conversations/curated/${testId}.json`);
  assert(fs.existsSync(curatedPath), 'Verified record moved to curated store');

  const promotedCount = ConversationLearningService.promoteVerifiedToTrainingCandidates();
  assert(promotedCount >= 1, 'Promoted verified example to training candidates');

  const trainingCandidatesPath = path.resolve(process.cwd(), 'data/ai/growth/training-candidates.jsonl');
  assert(fs.existsSync(trainingCandidatesPath), 'training-candidates.jsonl exists');
  const testSet = fs.readFileSync(path.resolve(process.cwd(), 'data/ai/test.jsonl'), 'utf8');
  assert(!testSet.includes(testId), 'Guaranteed: Hidden test set is NEVER polluted with harvested data');

  // Summary
  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runConversationTests();
