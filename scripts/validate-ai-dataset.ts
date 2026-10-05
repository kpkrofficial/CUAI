import * as fs from 'fs';
import * as path from 'path';

interface DatasetItem {
  id: string;
  text: string;
  language: string;
  domain: string;
  intent: string;
  scope: string;
  requires_auth: boolean;
  required_role: string;
  tool: string;
  data_source: string;
  entity_resolution: string;
  expected_fields: string[];
  response_mode: string;
  pii_allowed: boolean;
  expected_behavior: string;
  difficulty: string;
  follow_up_group: string | null;
  conversation_id?: string;
  turn?: number;
  entities?: Record<string, any>;
  expected_disambiguation?: string | null;
  expected_refusal_reason?: string | null;
}

const REQUIRED_FIELDS = [
  'id',
  'text',
  'language',
  'domain',
  'intent',
  'scope',
  'requires_auth',
  'required_role',
  'tool',
  'data_source',
  'entity_resolution',
  'expected_fields',
  'response_mode',
  'pii_allowed',
  'expected_behavior',
  'difficulty',
  'follow_up_group'
];

const VALID_ROLES = new Set(['student', 'admin', 'superadmin', 'anonymous', 'any']);
const VALID_LANGUAGES = new Set(['en', 'te', 'te-en', 'hi']);

// Load canonical schemas
const INTENTS_DATA = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data/ai/intents.json'), 'utf-8')
);
const VALID_INTENTS = new Set(INTENTS_DATA.intents.map((i: any) => i.intent));

const TOOL_MAPPING_DATA = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data/ai/tool-mapping.json'), 'utf-8')
);
const MAPPINGS = TOOL_MAPPING_DATA.mappings;
const VALID_TOOLS = new Set(Object.values(MAPPINGS).map((m: any) => m.tool));

function parseJsonl(filePath: string): DatasetItem[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line, idx) => {
      try {
        return JSON.parse(line);
      } catch (err: any) {
        throw new Error(`JSON parse error at ${filePath}:${idx + 1}: ${err.message}`);
      }
    });
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[?!.,;:'"()]/g, '').replace(/\s+/g, ' ');
}

export function validateDataset() {
  console.log('================================================================');
  console.log('CITYAPP AI — COMPREHENSIVE DATASET VALIDATOR & CI AUDIT');
  console.log('================================================================\n');

  const questionsPath = path.join(process.cwd(), 'data/ai/questions.jsonl');
  const trainPath = path.join(process.cwd(), 'data/ai/train.jsonl');
  const valPath = path.join(process.cwd(), 'data/ai/validation.jsonl');
  const testPath = path.join(process.cwd(), 'data/ai/test.jsonl');

  const allItems = parseJsonl(questionsPath);
  const trainItems = parseJsonl(trainPath);
  const valItems = parseJsonl(valPath);
  const testItems = parseJsonl(testPath);

  console.log(`Loaded dataset counts:`);
  console.log(`- Consolidated questions.jsonl : ${allItems.length}`);
  console.log(`- Train (70%)                 : ${trainItems.length}`);
  console.log(`- Validation (15%)            : ${valItems.length}`);
  console.log(`- Hidden Test (15%)           : ${testItems.length}`);
  console.log('');

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Total records count
  if (allItems.length !== 2500) {
    errors.push(`Expected exactly 2500 total records, found ${allItems.length}`);
  }
  if (trainItems.length !== 1750) {
    errors.push(`Expected exactly 1750 train records, found ${trainItems.length}`);
  }
  if (valItems.length !== 375) {
    errors.push(`Expected exactly 375 validation records, found ${valItems.length}`);
  }
  if (testItems.length !== 375) {
    errors.push(`Expected exactly 375 test records, found ${testItems.length}`);
  }

  // Check 2: Missing fields & Schema validation
  const seenIds = new Set<string>();
  const seenTexts = new Map<string, string>(); // normalizedText -> id

  // Regex patterns for sensitive PII
  const AADHAAR_REGEX = /\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/;
  const PHONE_REGEX = /\b[6-9][0-9]{9}\b/;
  const SECRET_KEY_REGEX = /(sk-[a-zA-Z0-9]{20,}|gsk_[a-zA-Z0-9]{20,}|eyJh[a-zA-Z0-9_-]{30,})/;

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const loc = `Record ${item.id || `idx_${i}`}`;

    // Required fields check
    for (const field of REQUIRED_FIELDS) {
      if ((item as any)[field] === undefined) {
        errors.push(`${loc}: Missing mandatory field "${field}"`);
      }
    }

    // ID Uniqueness
    if (seenIds.has(item.id)) {
      errors.push(`${loc}: Duplicate ID detected "${item.id}"`);
    }
    seenIds.add(item.id);

    // Exact Duplicate Question Detection
    const norm = normalize(item.text);
    if (seenTexts.has(norm)) {
      const prevId = seenTexts.get(norm);
      errors.push(`${loc}: Duplicate question text detected (matches ${prevId}): "${item.text}"`);
    } else {
      seenTexts.set(norm, item.id);
    }

    // Intent validity
    if (!VALID_INTENTS.has(item.intent)) {
      errors.push(`${loc}: Invalid intent "${item.intent}". Must be one of 54 fixed intents.`);
    }

    // Tool validity
    if (!VALID_TOOLS.has(item.tool)) {
      errors.push(`${loc}: Invalid tool "${item.tool}".`);
    }

    // Canonical Tool Mapping coherence
    const expectedMapping = MAPPINGS[item.intent];
    if (expectedMapping) {
      if (item.tool !== expectedMapping.tool) {
        errors.push(`${loc}: Tool mismatch for intent "${item.intent}": expected "${expectedMapping.tool}", found "${item.tool}"`);
      }
      if (item.data_source !== expectedMapping.data_source) {
        errors.push(`${loc}: Data source mismatch for intent "${item.intent}": expected "${expectedMapping.data_source}", found "${item.data_source}"`);
      }
    }

    // Role validity
    if (!VALID_ROLES.has(item.required_role)) {
      errors.push(`${loc}: Invalid required_role "${item.required_role}".`);
    }

    // Language validity
    if (!VALID_LANGUAGES.has(item.language)) {
      warnings.push(`${loc}: Uncommon language tag "${item.language}".`);
    }

    // PII allowed rule
    if (item.pii_allowed !== false) {
      errors.push(`${loc}: pii_allowed MUST be false under institutional privacy rules.`);
    }

    // PII Scan
    if (AADHAAR_REGEX.test(item.text) && !item.text.includes('1234 5678') && !item.text.includes('9999 8888')) {
      errors.push(`${loc}: Real Aadhaar number pattern detected in prompt text: "${item.text}"`);
    }
    if (PHONE_REGEX.test(item.text) && !item.text.includes('9876543210') && !item.text.includes('9123456780')) {
      errors.push(`${loc}: Real phone number pattern detected in prompt text: "${item.text}"`);
    }
    if (SECRET_KEY_REGEX.test(item.text)) {
      errors.push(`${loc}: API key or secret token detected in prompt text!`);
    }

    // Contradictory security behavior
    if (item.intent.startsWith('PEER_DATA') && item.expected_behavior !== 'REFUSE_UNAUTHORIZED') {
      errors.push(`${loc}: Security contradiction - PEER_DATA_REQUEST must have expected_behavior REFUSE_UNAUTHORIZED`);
    }
    if (item.intent.startsWith('PROMPT_INJECTION') && item.expected_behavior !== 'REFUSE_INJECTION') {
      errors.push(`${loc}: Security contradiction - PROMPT_INJECTION must have expected_behavior REFUSE_INJECTION`);
    }
  }

  // Check 3: Train / Test Leakage Detection
  console.log('Auditing Train vs. Hidden Test Leakage...');
  const trainSet = new Set(trainItems.map(t => normalize(t.text)));
  let leakageCount = 0;
  for (const testItem of testItems) {
    const norm = normalize(testItem.text);
    if (trainSet.has(norm)) {
      errors.push(`DATA LEAKAGE: Test item ${testItem.id} "${testItem.text}" exists identically in Training set!`);
      leakageCount++;
    }
  }

  // Summary Report
  console.log('----------------------------------------------------------------');
  console.log(`VALIDATION AUDIT SUMMARY:`);
  console.log(`- Total Records Checked   : ${allItems.length}`);
  console.log(`- Unique Questions        : ${seenTexts.size} / ${allItems.length}`);
  console.log(`- Train / Test Leakage    : ${leakageCount} (Target: 0)`);
  console.log(`- Validation Warnings     : ${warnings.length}`);
  console.log(`- Critical Errors         : ${errors.length}`);
  console.log('----------------------------------------------------------------\n');

  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    warnings.slice(0, 5).forEach(w => console.log(`  ⚠ ${w}`));
    if (warnings.length > 5) console.log(`  ...and ${warnings.length - 5} more.`);
    console.log('');
  }

  if (errors.length > 0) {
    console.error(`FAILED: ${errors.length} critical dataset validation errors found!`);
    errors.slice(0, 20).forEach(e => console.error(`  ✗ ${e}`));
    if (errors.length > 20) console.error(`  ...and ${errors.length - 20} more.`);
    process.exit(1);
  }

  console.log('✓ PASS: All 2,500 dataset records verified 100% compliant with canonical schema, zero leakage, zero duplicates, and zero exposed PII.');
}

if (require.main === module) {
  validateDataset();
}
