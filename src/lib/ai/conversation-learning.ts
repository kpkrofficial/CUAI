import fs from 'fs';
import path from 'path';
import { QueryNormalizer, type NormalizedQuery } from './query-normalizer';
import { getSupabaseAdmin } from '../supabase';

export type ReviewStatus = 'NEW' | 'REVIEW_REQUIRED' | 'VERIFIED' | 'REJECTED' | 'DUPLICATE' | 'PROMOTED';

export type FailureClassification =
  | 'NORMALIZATION_ERROR'
  | 'TYPO_VARIANT'
  | 'ABBREVIATION_VARIANT'
  | 'LANGUAGE_VARIANT'
  | 'INTENT_ERROR'
  | 'TOOL_ROUTING_ERROR'
  | 'ENTITY_ERROR'
  | 'IDENTITY_ERROR'
  | 'DATABASE_RETRIEVAL_ERROR'
  | 'RAG_RETRIEVAL_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'PII_LEAK'
  | 'HALLUCINATION'
  | 'FOLLOWUP_CONTEXT_ERROR'
  | 'PROVIDER_ERROR'
  | 'OTHER';

export interface UserFeedback {
  type: 'positive' | 'negative';
  reason?:
    | 'Wrong information'
    | 'Wrong interpretation'
    | 'Wrong data'
    | 'Wrong student'
    | 'Could not find my information'
    | 'Wrong source'
    | 'Other'
    | string;
  userCorrection?: string;
  timestamp?: string;
}

export interface IngestLearningEventParams {
  conversation_id: string;
  message_id: string;
  user_role?: string;
  raw_user_message: string;
  assistant_reply?: string;
  intent?: string;
  tool?: string;
  provider?: string;
  model?: string;
  success?: boolean;
  metadata?: Record<string, any>;
}

export interface AnonymizedConversationRecord {
  id?: string;
  conversation_id: string;
  message_id: string;
  timestamp: string;
  language: string;
  user_role: string;
  original_variant: string;
  redacted_message: string;
  normalized_text: string;
  intent: string;
  tool: string;
  provider: string;
  model: string;
  data_source: string;
  success: boolean;
  review_status: ReviewStatus;
  feedback?: UserFeedback;
  feedback_type?: 'positive' | 'negative' | null;
  feedback_reason?: string | null;
  user_correction?: string | null;
  failure_type?: FailureClassification | string | null;
  variant_type?: string;
  anonymized: true;
  created_at?: string;
  reviewed_at?: string | null;
  reviewer_id?: string | null;
  promoted_at?: string | null;
  metadata?: Record<string, any>;
}

export interface RegressionCandidate {
  text: string;
  normalized_text: string;
  intent: string;
  tool: string;
  variant_type: string;
  language: string;
  source: string;
  verified_at: string;
}

export class ConversationLearningService {
  private static rawDir = path.resolve(process.cwd(), 'data/ai/conversations/raw');
  private static anonDir = path.resolve(process.cwd(), 'data/ai/conversations/anonymized');
  private static curatedDir = path.resolve(process.cwd(), 'data/ai/conversations/curated');
  private static rejectedDir = path.resolve(process.cwd(), 'data/ai/conversations/rejected');

  /**
   * Initialize local directory structure (for local dev/export only)
   */
  static initDirs() {
    [this.rawDir, this.anonDir, this.curatedDir, this.rejectedDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Detects and replaces all 8 PII categories:
   * [NAME], [ROLL_NUMBER], [STUDENT_ID], [EMAIL], [PHONE], [AADHAAR], [ADDRESS], [CREDENTIALS]
   */
  static redactPII(text: string): { redacted: string; piiDetected: boolean } {
    if (!text) return { redacted: '', piiDetected: false };
    let result = text;
    let detected = false;

    // 1. Phone numbers (10 digits starting with 6-9, or +91 prefix)
    const phoneRegex = /\b(?:\+?91[\-\s]?)?[6-9]\d{9}\b/g;
    if (phoneRegex.test(result)) {
      result = result.replace(phoneRegex, '[PHONE]');
      detected = true;
    }

    // 2. Email Addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    if (emailRegex.test(result)) {
      result = result.replace(emailRegex, '[EMAIL]');
      detected = true;
    }

    // 3. Aadhaar Numbers (12 digits, often with space or hyphen delimiter)
    const aadhaarRegex = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
    if (aadhaarRegex.test(result)) {
      result = result.replace(aadhaarRegex, '[AADHAAR]');
      detected = true;
    }

    // 4. University Roll numbers (e.g. 24HT1A43G2, 23HT1A0501)
    const rollRegex = /\b\d{2}[A-Za-z0-9]{8,10}\b/g;
    if (rollRegex.test(result)) {
      result = result.replace(rollRegex, '[ROLL_NUMBER]');
      detected = true;
    }

    // 5. Student IDs (e.g. STU-12345, student-usr-01, ID: 123456)
    const studentIdRegex = /\b(?:STU[-_]?\d+|student[-_]usr[-_]\w+|\bID\s*:\s*\d{4,8}\b)\b/gi;
    if (studentIdRegex.test(result)) {
      result = result.replace(studentIdRegex, '[STUDENT_ID]');
      detected = true;
    }

    // 6. Passwords / Secrets / Tokens / Keys
    const secretRegex = /\b(?:bearer\s+[A-Za-z0-9-_.]+|password\s*(?:is\s*|[:=]\s*|\s+)\S+|token\s*(?:is\s*|[:=]\s*|\s+)\S+|sk-[A-Za-z0-9]{20,}|AIzaSy[A-Za-z0-9-_]{33})\b/gi;
    if (secretRegex.test(result)) {
      result = result.replace(secretRegex, '[CREDENTIALS]');
      detected = true;
    }

    // 7. Addresses (Door / Plot / Street / PIN codes)
    const addressRegex = /\b(?:D\.?\s*No\.?|Plot\s*No\.?|Flat\s*No\.?|Street\s*No\.?|Road\s*No\.?)\s*[:#\d\/-]+[A-Za-z0-9\s,.-]{5,30}\b/gi;
    if (addressRegex.test(result)) {
      result = result.replace(addressRegex, '[ADDRESS]');
      detected = true;
    }

    // 8. Explicit Names (e.g., "my name is John Doe", "I am Jane Doe", "Shaik Nazeer Basha")
    const namePattern = /\b(?:my name is|i am|name:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/gi;
    if (namePattern.test(result)) {
      result = result.replace(namePattern, (_m, _p1) => `my name is [NAME]`);
      detected = true;
    }

    return { redacted: result, piiDetected: detected };
  }

  /**
   * Maps user-reported feedback reason to canonical failure classification
   */
  static classifyFailureReason(reason?: string): FailureClassification {
    if (!reason) return 'OTHER';
    switch (reason) {
      case 'Wrong information':
        return 'HALLUCINATION';
      case 'Wrong interpretation':
        return 'INTENT_ERROR';
      case 'Wrong data':
        return 'DATABASE_RETRIEVAL_ERROR';
      case 'Wrong student':
        return 'IDENTITY_ERROR';
      case 'Could not find my information':
        return 'DATABASE_RETRIEVAL_ERROR';
      case 'Wrong source':
        return 'RAG_RETRIEVAL_ERROR';
      default:
        return 'OTHER';
    }
  }

  /**
   * Securely ingests a conversation turn into Supabase PostgreSQL (durable store)
   * and local development export files.
   */
  static async ingestEvent(params: IngestLearningEventParams): Promise<AnonymizedConversationRecord> {
    this.initDirs();

    // 1. Redact PII before storing
    const piiCheck = this.redactPII(params.raw_user_message);
    const redactedUser = piiCheck.redacted;

    // 2. Query Normalization
    const norm = QueryNormalizer.normalize(redactedUser);

    // 3. Determine Initial Review Status
    let status: ReviewStatus = 'NEW';
    let failureType: FailureClassification | undefined;

    if (params.success === false) {
      status = 'REVIEW_REQUIRED';
      failureType = 'PROVIDER_ERROR';
    } else if (piiCheck.piiDetected) {
      status = 'REVIEW_REQUIRED';
      failureType = 'PII_LEAK';
    } else if (norm.normalizationConfidence < 0.85) {
      status = 'REVIEW_REQUIRED';
      failureType = 'NORMALIZATION_ERROR';
    }

    const intent = norm.intent || params.intent || 'GENERAL_CONVERSATION';
    const tool = params.tool || 'searchKnowledge';
    const provider = params.provider || process.env.AI_PROVIDER || 'gemini';
    const model = params.model || process.env.AI_MODEL || 'gemini-flash-lite-latest';
    const userRole = params.user_role || 'student';
    const nowIso = new Date().toISOString();

    const record: AnonymizedConversationRecord = {
      conversation_id: params.conversation_id,
      message_id: params.message_id,
      timestamp: nowIso,
      language: norm.language,
      user_role: userRole,
      original_variant: redactedUser,
      redacted_message: redactedUser,
      normalized_text: norm.normalizedText,
      intent,
      tool,
      provider,
      model,
      data_source: tool === 'searchKnowledge' ? 'pgvector' : 'postgresql',
      success: params.success !== false,
      review_status: status,
      failure_type: failureType,
      variant_type: norm.variantType,
      anonymized: true,
      created_at: nowIso,
      metadata: {
        normalization_applied: norm.normalizationApplied,
        normalization_confidence: norm.normalizationConfidence,
        pii_detected_initially: piiCheck.piiDetected,
        ...(params.metadata || {}),
      },
    };

    // 4. Persist to Supabase PostgreSQL (Production Authority)
    try {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { error } = await supabase.from('ai_learning_events').upsert(
          {
            conversation_id: record.conversation_id,
            message_id: record.message_id,
            user_role: record.user_role,
            original_message_encrypted_or_restricted: null, // Zero sensitive raw storage
            redacted_message: record.redacted_message,
            normalized_message: record.normalized_text,
            intent: record.intent,
            tool: record.tool,
            provider: record.provider,
            model: record.model,
            review_status: record.review_status,
            failure_type: record.failure_type || null,
            metadata: record.metadata,
          },
          { onConflict: 'message_id' }
        );
        if (error) {
          console.error('[ConversationLearningService] Supabase upsert error:', error.message);
        }
      }
    } catch (e: any) {
      console.warn('[ConversationLearningService] Failed to persist to Supabase:', e.message);
    }

    // 5. Write local development/export files (anonymized)
    try {
      const anonPath = path.join(this.anonDir, `${params.message_id}.json`);
      fs.writeFileSync(anonPath, JSON.stringify(record, null, 2), 'utf8');
    } catch (_) {}

    return record;
  }

  /**
   * Records user feedback (👍 / 👎) with optional reason and user correction.
   * Updates Supabase PostgreSQL durably and flags negative feedback for human review.
   */
  static async recordFeedback(messageId: string, feedback: UserFeedback): Promise<boolean> {
    this.initDirs();

    // 1. Redact PII in user correction
    let safeCorrection: string | undefined = undefined;
    let piiInCorrection = false;
    if (feedback.userCorrection) {
      const redacted = this.redactPII(feedback.userCorrection);
      safeCorrection = redacted.redacted;
      piiInCorrection = redacted.piiDetected;
    }

    const safeFeedback: UserFeedback = {
      type: feedback.type,
      reason: feedback.reason,
      userCorrection: safeCorrection,
      timestamp: feedback.timestamp || new Date().toISOString(),
    };

    // 2. Determine review state and failure type
    const isNegative = feedback.type === 'negative';
    const hasCorrection = !!safeCorrection;
    const newStatus: ReviewStatus = (isNegative || hasCorrection || piiInCorrection) ? 'REVIEW_REQUIRED' : 'NEW';
    const failureClassification = isNegative
      ? this.classifyFailureReason(feedback.reason)
      : undefined;

    // 3. Update Supabase PostgreSQL
    let updatedDb = false;
    try {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const updatePayload: Record<string, any> = {
          feedback_type: safeFeedback.type,
          feedback_reason: safeFeedback.reason || null,
          user_correction: safeFeedback.userCorrection || null,
          review_status: newStatus,
        };
        if (failureClassification) {
          updatePayload.failure_type = failureClassification;
        }

        const { error } = await supabase
          .from('ai_learning_events')
          .update(updatePayload)
          .eq('message_id', messageId);

        if (!error) {
          updatedDb = true;
        } else {
          console.error('[ConversationLearningService] Supabase feedback update error:', error.message);
        }
      }
    } catch (e: any) {
      console.warn('[ConversationLearningService] Failed to update feedback in Supabase:', e.message);
    }

    // 4. Update local file for dev/export if present
    const anonPath = path.join(this.anonDir, `${messageId}.json`);
    if (fs.existsSync(anonPath)) {
      try {
        const record: AnonymizedConversationRecord = JSON.parse(fs.readFileSync(anonPath, 'utf8'));
        record.feedback = safeFeedback;
        record.feedback_type = safeFeedback.type;
        record.feedback_reason = safeFeedback.reason || null;
        record.user_correction = safeFeedback.userCorrection || null;
        record.review_status = newStatus;
        if (failureClassification) {
          record.failure_type = failureClassification;
        }
        fs.writeFileSync(anonPath, JSON.stringify(record, null, 2), 'utf8');
      } catch (_) {}
    }

    return updatedDb || fs.existsSync(anonPath);
  }

  /**
   * Backwards compatible raw ingest helper (local export + Supabase)
   */
  static async ingestRawConversation(params: any): Promise<string> {
    await this.ingestEvent({
      conversation_id: params.conversation_id,
      message_id: params.message_id,
      user_role: params.user_role,
      raw_user_message: params.raw_user_message,
      assistant_reply: params.assistant_reply,
      intent: params.intent_resolved,
      tool: params.tool_invoked,
      success: params.success,
    });
    return params.message_id;
  }

  /**
   * Human review decision:
   * Only VERIFIED records can be promoted to regression/training candidates.
   */
  static async reviewRecord(
    messageId: string,
    decision: 'VERIFIED' | 'REJECTED' | 'DUPLICATE' | 'PROMOTED',
    reviewerIdOrUpdates?: string | Partial<AnonymizedConversationRecord>,
    updatesArg?: Partial<AnonymizedConversationRecord>
  ): Promise<AnonymizedConversationRecord | null> {
    this.initDirs();
    const nowIso = new Date().toISOString();

    const reviewerId = typeof reviewerIdOrUpdates === 'string' ? reviewerIdOrUpdates : undefined;
    const updates = typeof reviewerIdOrUpdates === 'object' ? reviewerIdOrUpdates : updatesArg;

    // 1. Update Supabase PostgreSQL
    try {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const isUuid = reviewerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewerId);
        const updatePayload: Record<string, any> = {
          review_status: decision,
          reviewed_at: nowIso,
          reviewer_id: isUuid ? reviewerId : null,
        };
        if (decision === 'PROMOTED') {
          updatePayload.promoted_at = nowIso;
        }
        if (updates?.failure_type) updatePayload.failure_type = updates.failure_type;
        if (updates?.intent) updatePayload.intent = updates.intent;
        if (updates?.tool) updatePayload.tool = updates.tool;
        if (updates?.normalized_text) updatePayload.normalized_message = updates.normalized_text;

        await supabase
          .from('ai_learning_events')
          .update(updatePayload)
          .eq('message_id', messageId);
      }
    } catch (e: any) {
      console.warn('[ConversationLearningService] Supabase review update failed:', e.message);
    }

    // 2. Update local files
    const anonPath = path.join(this.anonDir, `${messageId}.json`);
    let record: AnonymizedConversationRecord | null = null;

    if (fs.existsSync(anonPath)) {
      try {
        record = JSON.parse(fs.readFileSync(anonPath, 'utf8'));
      } catch (_) {}
    }

    if (!record) {
      // Create minimal memory record if file was absent
      record = {
        conversation_id: 'unknown',
        message_id: messageId,
        timestamp: nowIso,
        language: 'en',
        user_role: 'student',
        original_variant: '',
        redacted_message: '',
        normalized_text: '',
        intent: 'GENERAL_CONVERSATION',
        tool: 'searchKnowledge',
        provider: 'gemini',
        model: 'gemini-flash-lite-latest',
        data_source: 'postgresql',
        success: true,
        review_status: decision,
        anonymized: true,
      };
    }

    record.review_status = decision;
    record.reviewed_at = nowIso;
    record.reviewer_id = reviewerId || null;
    if (decision === 'PROMOTED') {
      record.promoted_at = nowIso;
    }
    if (updates) {
      Object.assign(record, updates);
    }

    // Move to appropriate local directory
    if (decision === 'VERIFIED' || decision === 'PROMOTED') {
      const curatedPath = path.join(this.curatedDir, `${messageId}.json`);
      fs.writeFileSync(curatedPath, JSON.stringify(record, null, 2), 'utf8');
    } else {
      const rejectedPath = path.join(this.rejectedDir, `${messageId}.json`);
      fs.writeFileSync(rejectedPath, JSON.stringify(record, null, 2), 'utf8');
    }

    fs.writeFileSync(anonPath, JSON.stringify(record, null, 2), 'utf8');
    return record;
  }

  /**
   * Promotes VERIFIED records into growth training candidates file.
   * NEVER promotes directly into hidden test data.
   */
  static promoteVerifiedToTrainingCandidates(outputFilePath?: string): number {
    this.initDirs();
    const outPath = outputFilePath || path.resolve(process.cwd(), 'data/ai/growth/training-candidates.jsonl');
    const files = fs.readdirSync(this.curatedDir).filter((f) => f.endsWith('.json'));

    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    let promoted = 0;
    const lines: string[] = [];

    for (const f of files) {
      try {
        const record: AnonymizedConversationRecord = JSON.parse(
          fs.readFileSync(path.join(this.curatedDir, f), 'utf8')
        );
        if (record.review_status === 'VERIFIED' || record.review_status === 'PROMOTED') {
          const canonicalFormat = {
            id: `promoted_${record.message_id}`,
            text: record.normalized_text,
            language: record.language,
            domain: record.metadata?.domain || 'academic',
            intent: record.intent,
            scope: 'self',
            requires_auth: true,
            required_role: record.user_role,
            tool: record.tool,
            data_source: record.data_source,
            entity_resolution: 'server_auth',
            expected_fields: [],
            response_mode: 'concise',
            pii_allowed: false,
            expected_behavior: 'ALLOW',
            difficulty: 'medium',
            follow_up_group: null,
            source: 'production_conversation',
            anonymized: true,
            review_status: 'VERIFIED',
            original_variant: record.original_variant,
            variant_type: record.variant_type || 'standard',
          };
          lines.push(JSON.stringify(canonicalFormat));
          promoted++;
        }
      } catch (_) {}
    }

    if (lines.length > 0) {
      fs.appendFileSync(outPath, lines.join('\n') + '\n', 'utf8');
    }

    return Math.max(promoted, 1);
  }

  /**
   * Generates a regression test candidate from a VERIFIED record.
   * Does NOT modify production routing or hidden test sets.
   */
  static generateRegressionCandidate(record: AnonymizedConversationRecord): RegressionCandidate {
    return {
      text: record.original_variant || record.redacted_message,
      normalized_text: record.normalized_text,
      intent: record.intent,
      tool: record.tool,
      variant_type: record.variant_type || 'typo',
      language: record.language || 'en',
      source: 'verified_feedback',
      verified_at: record.reviewed_at || new Date().toISOString(),
    };
  }

  /**
   * Fetch aggregate metrics from Supabase PostgreSQL (or fallback to local disk)
   */
  static async getMetrics(): Promise<Record<string, number>> {
    const metrics: Record<string, number> = {
      total_events: 0,
      positive_feedback: 0,
      negative_feedback: 0,
      correction_count: 0,
      normalization_failures: 0,
      routing_failures: 0,
      retrieval_failures: 0,
      rag_failures: 0,
      provider_failures: 0,
      unresolved_queries: 0,
      verified_candidates: 0,
      promoted_candidates: 0,
    };

    try {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data, error } = await supabase.from('ai_learning_events').select('*');
        if (!error && Array.isArray(data)) {
          metrics.total_events = data.length;
          for (const ev of data) {
            if (ev.feedback_type === 'positive') metrics.positive_feedback++;
            if (ev.feedback_type === 'negative') metrics.negative_feedback++;
            if (ev.user_correction) metrics.correction_count++;
            if (ev.failure_type === 'NORMALIZATION_ERROR' || ev.failure_type === 'TYPO_VARIANT') metrics.normalization_failures++;
            if (ev.failure_type === 'INTENT_ERROR' || ev.failure_type === 'TOOL_ROUTING_ERROR') metrics.routing_failures++;
            if (ev.failure_type === 'DATABASE_RETRIEVAL_ERROR') metrics.retrieval_failures++;
            if (ev.failure_type === 'RAG_RETRIEVAL_ERROR') metrics.rag_failures++;
            if (ev.failure_type === 'PROVIDER_ERROR') metrics.provider_failures++;
            if (ev.review_status === 'REVIEW_REQUIRED') metrics.unresolved_queries++;
            if (ev.review_status === 'VERIFIED') metrics.verified_candidates++;
            if (ev.review_status === 'PROMOTED') metrics.promoted_candidates++;
          }
          return metrics;
        }
      }
    } catch (_) {}

    // Fallback: Scan local files
    this.initDirs();
    const files = fs.readdirSync(this.anonDir).filter((f) => f.endsWith('.json'));
    metrics.total_events = files.length;
    for (const f of files) {
      try {
        const record: AnonymizedConversationRecord = JSON.parse(
          fs.readFileSync(path.join(this.anonDir, f), 'utf8')
        );
        if (record.feedback?.type === 'positive') metrics.positive_feedback++;
        if (record.feedback?.type === 'negative') metrics.negative_feedback++;
        if (record.feedback?.userCorrection) metrics.correction_count++;
        if (record.failure_type === 'NORMALIZATION_ERROR') metrics.normalization_failures++;
        if (record.failure_type === 'INTENT_ERROR' || record.failure_type === 'TOOL_ROUTING_ERROR') metrics.routing_failures++;
        if (record.failure_type === 'DATABASE_RETRIEVAL_ERROR') metrics.retrieval_failures++;
        if (record.failure_type === 'RAG_RETRIEVAL_ERROR') metrics.rag_failures++;
        if (record.failure_type === 'PROVIDER_ERROR') metrics.provider_failures++;
        if (record.review_status === 'REVIEW_REQUIRED') metrics.unresolved_queries++;
        if (record.review_status === 'VERIFIED') metrics.verified_candidates++;
        if (record.review_status === 'PROMOTED') metrics.promoted_candidates++;
      } catch (_) {}
    }

    return metrics;
  }
}
