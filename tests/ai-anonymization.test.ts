/**
 * CITYAPP AI — PII Anonymization & Redaction Test Suite
 * Tests detection, substitution, and leakage prevention across all 8 PII categories:
 * [NAME], [ROLL_NUMBER], [STUDENT_ID], [EMAIL], [PHONE], [AADHAAR], [ADDRESS], [CREDENTIALS]
 */

import { ConversationLearningService } from '../src/lib/ai/conversation-learning';

async function runAnonymizationSuite() {
  console.log('================================================================');
  console.log('CITYAPP AI — PII ANONYMIZATION & REDACTION TEST SUITE');
  console.log('Target: Zero PII/Credentials in Learning & Regression Datasets');
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

  // 1. AADHAAR NUMBERS
  console.log('1. Testing Aadhaar Number Redaction...');
  const aadhaarSamples = [
    { input: 'My aadhaar is 1234 5678 9012', expected: '[AADHAAR]' },
    { input: 'Aadhaar: 9876-5432-1098 please update', expected: '[AADHAAR]' },
  ];
  for (const s of aadhaarSamples) {
    const res = ConversationLearningService.redactPII(s.input);
    assert(res.piiDetected && res.redacted.includes(s.expected), `Aadhaar masked: "${s.input}" -> "${res.redacted}"`);
    assert(!res.redacted.includes('1234') && !res.redacted.includes('9876'), 'Raw Aadhaar digits eliminated');
  }

  // 2. EMAIL ADDRESSES
  console.log('\n2. Testing Email Address Redaction...');
  const emailSamples = [
    'Send copy to student.24ht1a43g2@campus.edu',
    'Contact parent at ramarao.parent@gmail.com immediately',
  ];
  for (const s of emailSamples) {
    const res = ConversationLearningService.redactPII(s);
    assert(res.piiDetected && res.redacted.includes('[EMAIL]'), `Email masked: "${s}" -> "${res.redacted}"`);
    assert(!res.redacted.includes('@'), 'No @ symbol remaining in email context');
  }

  // 3. PHONE NUMBERS
  console.log('\n3. Testing Phone Number Redaction...');
  const phoneSamples = [
    'My mobile is 9876543210',
    'Call father on +91 9123456780',
    'Emergency: +91-8877665544',
  ];
  for (const s of phoneSamples) {
    const res = ConversationLearningService.redactPII(s);
    assert(res.piiDetected && res.redacted.includes('[PHONE]'), `Phone masked: "${s}" -> "${res.redacted}"`);
    assert(!res.redacted.includes('9876543210') && !res.redacted.includes('9123456780'), 'Raw phone digits eliminated');
  }

  // 4. ROLL NUMBERS
  console.log('\n4. Testing University Roll Number Redaction...');
  const rollSamples = [
    'Check result for 24HT1A43G2',
    'Is 23HT1A0501 eligible?',
    'Roll 21B91A04J1 marks',
  ];
  for (const s of rollSamples) {
    const res = ConversationLearningService.redactPII(s);
    assert(res.piiDetected && res.redacted.includes('[ROLL_NUMBER]'), `Roll number masked: "${s}" -> "${res.redacted}"`);
    assert(!res.redacted.includes('24HT1A43G2') && !res.redacted.includes('23HT1A0501'), 'Raw roll number eliminated');
  }

  // 5. STUDENT IDS
  console.log('\n5. Testing Student Internal ID Redaction...');
  const idSamples = [
    'Internal ID is student-usr-01',
    'Account STU-984712 status',
    'Ref ID: 582910 verification',
  ];
  for (const s of idSamples) {
    const res = ConversationLearningService.redactPII(s);
    assert(res.piiDetected && res.redacted.includes('[STUDENT_ID]'), `Student ID masked: "${s}" -> "${res.redacted}"`);
    assert(!res.redacted.includes('student-usr-01') && !res.redacted.includes('STU-984712'), 'Internal ID eliminated');
  }

  // 6. CREDENTIALS & API KEYS
  console.log('\n6. Testing Credentials & Secrets Redaction...');
  const secretSamples = [
    'My password is secretPass123! and token is eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'Using key sk-1234567890abcdef1234567890 for testing',
    'Header Bearer abcdef1234567890',
  ];
  for (const s of secretSamples) {
    const res = ConversationLearningService.redactPII(s);
    assert(res.piiDetected && res.redacted.includes('[CREDENTIALS]'), `Credential masked: "${s.slice(0, 30)}..." -> "${res.redacted}"`);
    assert(!res.redacted.includes('secretPass123!') && !res.redacted.includes('sk-'), 'Raw secret eliminated');
  }

  // 7. ADDRESSES
  console.log('\n7. Testing Residential Address Redaction...');
  const addressSamples = [
    'Address is Plot No. 42 Jubilee Hills Hyderabad',
    'Living at Flat No. 302 Green Meadows Gachibowli',
    'Residence D.No. 12-4-56/A Main Road Vijayawada',
  ];
  for (const s of addressSamples) {
    const res = ConversationLearningService.redactPII(s);
    assert(res.piiDetected && res.redacted.includes('[ADDRESS]'), `Address masked: "${s}" -> "${res.redacted}"`);
    assert(!res.redacted.includes('Plot No. 42') && !res.redacted.includes('Flat No. 302'), 'Raw address eliminated');
  }

  // 8. EXPLICIT STUDENT NAMES
  console.log('\n8. Testing Explicit Name Redaction...');
  const nameSamples = [
    'Hi, my name is John Doe, show my marks',
    'Hello I am Shaik Nazeer Basha, my details',
  ];
  for (const s of nameSamples) {
    const res = ConversationLearningService.redactPII(s);
    assert(res.piiDetected && res.redacted.includes('[NAME]'), `Name masked: "${s}" -> "${res.redacted}"`);
    assert(!res.redacted.includes('John Doe') && !res.redacted.includes('Shaik Nazeer Basha'), 'Raw name eliminated');
  }

  // 9. COMPLEX MULTI-PII STRING
  console.log('\n9. Testing Complex Mixed PII String...');
  const multiPII =
    'My name is Aditya Varma, roll 24HT1A43G2, phone 9876543210, email aditya@gmail.com, aadhaar 5544-3322-1100, living at Plot No. 10 Road No. 2 Banjara Hills, token Bearer secret_tok_123';
  const multiRes = ConversationLearningService.redactPII(multiPII);

  const requiredTokens = ['[NAME]', '[ROLL_NUMBER]', '[PHONE]', '[EMAIL]', '[AADHAAR]', '[ADDRESS]', '[CREDENTIALS]'];
  for (const tok of requiredTokens) {
    assert(multiRes.redacted.includes(tok), `Complex string sanitized token: ${tok}`);
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAnonymizationSuite();
