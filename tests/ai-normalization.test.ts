import { QueryNormalizer } from '../src/lib/ai/query-normalizer';

async function runNormalizationTests() {
  console.log('================================================================');
  console.log('CITYAPP AI — QUERY NORMALIZATION & LINGUISTIC SUITE');
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

  // 1. Controlled Typo Handling
  console.log('1. Testing Controlled Typo & Spelling Normalization:');
  const t1 = QueryNormalizer.normalize('wat is my rol nuber?');
  assert(t1.normalizedText.includes('what is my roll number'), 'Normalizes "wat is my rol nuber" -> "what is my roll number"');
  assert(t1.language === 'en', 'Detected English language for standard typo');

  const t2 = QueryNormalizer.normalize('my attendence entha');
  assert(t2.normalizedText.includes('attendance'), 'Fixes "attendence" typo within mixed phrase');

  // 2. Meaning Preservation (No Blind Global Substitution)
  console.log('\n2. Testing Meaning Preservation (Contextual Word Boundaries):');
  const m1 = QueryNormalizer.normalize('my role no');
  assert(m1.normalizedText.includes('roll number'), 'Converts "my role no" to "my roll number"');

  const m2 = QueryNormalizer.normalize('what is the role of the campus warden?');
  assert(m2.normalizedText.includes('role of the campus warden'), 'Preserves legitimate "role" word without corrupting into "roll"');

  // 3. Abbreviation Expansion
  console.log('\n3. Testing Abbreviation Expansion:');
  const a1 = QueryNormalizer.normalize('my 10th perc');
  assert(a1.normalizedText.includes('percentage'), 'Expands "perc" -> "percentage"');

  const a2 = QueryNormalizer.normalize('my clg app status');
  assert(a2.normalizedText.includes('college') && a2.normalizedText.includes('application'), 'Expands "clg" -> "college" and "app" -> "application"');

  // 4. Telugu & Telugu-English Mixed Queries
  console.log('\n4. Testing Telugu & Telugu-English Transliterated Queries:');
  const te1 = QueryNormalizer.normalize('naa details enti');
  assert(te1.language === 'te-en', 'Detected "te-en" language marker for "naa details enti"');
  assert(te1.normalizedText === 'what are my details', 'Normalized "naa details enti" -> "what are my details"');
  assert(te1.intent === 'PROFILE_SELF', 'Directly resolved PROFILE_SELF intent');

  const te2 = QueryNormalizer.normalize('naa SSC marks entha');
  assert(te2.normalizedText === 'what are my SSC marks', 'Normalized "naa SSC marks entha"');
  assert(te2.intent === 'ACADEMIC_SELF', 'Resolved ACADEMIC_SELF intent');

  const te3 = QueryNormalizer.normalize('scholarship ki eligible aa');
  assert(te3.normalizedText === 'am I eligible for the scholarship', 'Normalized scholarship eligibility query');
  assert(te3.intent === 'ELIGIBILITY_SELF', 'Resolved ELIGIBILITY_SELF intent');

  const te4 = QueryNormalizer.normalize('attendance entha');
  assert(te4.normalizedText === 'what is my attendance', 'Normalized attendance query');
  assert(te4.intent === 'ATTENDANCE_SELF', 'Resolved ATTENDANCE_SELF intent');

  const te5 = QueryNormalizer.normalize('admission ki em documents kavali');
  assert(te5.normalizedText === 'what documents are required for admission', 'Normalized admission docs query');
  assert(te5.intent === 'ADMISSION_DOCUMENTS', 'Resolved ADMISSION_DOCUMENTS intent');

  // 5. Voice & Speech-to-Text Transcription Noise
  console.log('\n5. Testing Voice & Transcription Noise Handling:');
  const v1 = QueryNormalizer.normalize('whatismyrollnumber');
  assert(v1.normalizedText === 'what is my roll number', 'Splits merged voice transcription "whatismyrollnumber"');

  const v2 = QueryNormalizer.normalize('can you please tell me what is my roll number');
  assert(v2.normalizedText === 'what is my roll number', 'Strips noisy conversational voice filler prefix');

  const v3 = QueryNormalizer.normalize("tell me my mark's");
  assert(v3.normalizedText === 'my marks', 'Strips voice transcription apostrophe in "mark\'s"');

  // 6. Multi-Turn Context Normalization
  console.log('\n6. Testing Multi-Turn Context Normalization:');
  const history = [
    { role: 'user' as const, content: 'show my academic details' },
    { role: 'assistant' as const, content: 'Here is your academic profile: SSC 540/600, Inter 94%' },
  ];
  const mt1 = QueryNormalizer.normalize('what about 10th?', history);
  assert(mt1.normalizedText === 'what are my SSC marks?', 'Resolves "what about 10th?" to SSC in academic context');
  assert(mt1.intent === 'ACADEMIC_SELF', 'Resolved ACADEMIC_SELF intent in follow-up turn');

  const mt2 = QueryNormalizer.normalize('and am i eligible?', history);
  assert(mt2.normalizedText === 'am I eligible for the scholarship?', 'Resolves eligibility follow-up in context');
  assert(mt2.intent === 'ELIGIBILITY_SELF', 'Resolved ELIGIBILITY_SELF follow-up');

  // Summary
  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runNormalizationTests();
