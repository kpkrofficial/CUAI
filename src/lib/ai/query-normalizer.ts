import fs from 'fs';
import path from 'path';

export interface NormalizedQuery {
  originalText: string;
  normalizedText: string;
  language: 'en' | 'te' | 'te-en';
  languageConfidence: number;
  normalizationApplied: boolean;
  normalizationConfidence: number;
  intent?: string;
  entities?: Record<string, any>;
  variantType?: 'standard' | 'spelling' | 'abbreviation' | 'telugu_english' | 'voice' | 'informal';
  alternateCandidates?: string[];
}

export interface ConversationTurnContext {
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
}

export class QueryNormalizer {
  private static dictionariesLoaded = false;
  private static terminology: any = null;
  private static synonyms: any = null;
  private static abbreviations: Record<string, string> = {};
  private static typos: Record<string, string> = {};
  private static contextualTypos: Array<{ trigger: string; context_pattern: string; replacement: string; confidence: number }> = [];
  private static teluguEnglishPhrases: Array<{ source_pattern: string; target_normalized: string; intent: string; domain: string }> = [];
  private static teluguLexicon: Record<string, string> = {};
  private static voiceVariants: any = null;

  /**
   * Lazily loads normalization dictionaries from data/ai/normalization/
   */
  private static ensureDictionariesLoaded() {
    if (this.dictionariesLoaded) return;

    try {
      const baseDir = path.resolve(process.cwd(), 'data/ai/normalization');
      if (fs.existsSync(baseDir)) {
        const termPath = path.join(baseDir, 'terminology.json');
        if (fs.existsSync(termPath)) this.terminology = JSON.parse(fs.readFileSync(termPath, 'utf8'));

        const synPath = path.join(baseDir, 'synonyms.json');
        if (fs.existsSync(synPath)) this.synonyms = JSON.parse(fs.readFileSync(synPath, 'utf8'));

        const abbrPath = path.join(baseDir, 'abbreviations.json');
        if (fs.existsSync(abbrPath)) {
          const raw = JSON.parse(fs.readFileSync(abbrPath, 'utf8'));
          this.abbreviations = raw.abbreviations || {};
        }

        const typoPath = path.join(baseDir, 'typos.json');
        if (fs.existsSync(typoPath)) {
          const raw = JSON.parse(fs.readFileSync(typoPath, 'utf8'));
          this.typos = raw.typos || {};
          this.contextualTypos = raw.contextual_typos || [];
        }

        const tePath = path.join(baseDir, 'telugu-english.json');
        if (fs.existsSync(tePath)) {
          const raw = JSON.parse(fs.readFileSync(tePath, 'utf8'));
          this.teluguEnglishPhrases = raw.canonical_phrases || [];
          this.teluguLexicon = raw.transliterated_lexicon || {};
        }

        const voicePath = path.join(baseDir, 'voice-variants.json');
        if (fs.existsSync(voicePath)) this.voiceVariants = JSON.parse(fs.readFileSync(voicePath, 'utf8'));
      }
    } catch (err) {
      console.warn('[QueryNormalizer] Notice: Dictionaries loaded with in-memory fallbacks', err);
    }

    this.dictionariesLoaded = true;
  }

  /**
   * Detect language and script (English vs Telugu script vs Telugu-English transliterated)
   */
  static detectLanguage(text: string): { language: 'en' | 'te' | 'te-en'; confidence: number } {
    this.ensureDictionariesLoaded();
    const clean = text.toLowerCase().trim();

    // Check for native Telugu Unicode script range (\u0C00-\u0C7F)
    const teluguScriptRegex = /[\u0C00-\u0C7F]/;
    if (teluguScriptRegex.test(clean)) {
      return { language: 'te', confidence: 0.99 };
    }

    // Check for Telugu transliterated markers in Latin script
    const teluguMarkers = [
      'naa', 'na', 'naku', 'naaku', 'enti', 'entha', 'cheppu', 'cheppandi', 'chupinchu',
      'chupandi', 'undi', 'undha', 'kavali', 'eppudu', 'batti', 'nenu', 'vivaralu',
      'ki', 'aa', 'em', 'emi'
    ];
    const words = clean.split(/[\s,?.!]+/);
    const markerMatches = words.filter((w) => teluguMarkers.includes(w));

    if (markerMatches.length > 0) {
      const confidence = Math.min(0.99, 0.75 + markerMatches.length * 0.12);
      return { language: 'te-en', confidence };
    }

    return { language: 'en', confidence: 0.98 };
  }

  /**
   * Normalizes noisy user queries into canonical campus terminology.
   * Does NOT answer the question. Only standardizes the text representation.
   */
  static normalize(query: string, history?: ConversationTurnContext[]): NormalizedQuery {
    this.ensureDictionariesLoaded();
    const raw = query.trim();
    if (!raw) {
      return {
        originalText: query,
        normalizedText: '',
        language: 'en',
        languageConfidence: 1.0,
        normalizationApplied: false,
        normalizationConfidence: 1.0,
      };
    }

    const langInfo = this.detectLanguage(raw);
    let workingText = raw.trim();
    let applied = false;
    let confidence = 0.95;
    let detectedIntent: string | undefined;
    let variantType: NormalizedQuery['variantType'] = 'standard';
    const alternateCandidates: string[] = [];
    const entities: Record<string, any> = {};

    // 1. Voice and merged-word preprocessing
    if (this.voiceVariants?.merged_word_patterns) {
      for (const m of this.voiceVariants.merged_word_patterns) {
        if (workingText.toLowerCase().replace(/[^a-z0-9]/g, '') === m.pattern) {
          workingText = m.normalized;
          applied = true;
          variantType = 'voice';
          confidence = 0.98;
          if (m.intent) detectedIntent = m.intent;
          break;
        }
      }
    }

    // 2. Voice filler stripping (e.g. "actually", "can you please tell me")
    const lowerWorking = workingText.toLowerCase();
    const fillerPrefixes = [
      'can you please tell me',
      'can you tell me',
      'please tell me',
      'could you please tell me',
      'tell me',
      'show me',
      'actually',
      'i want to know',
    ];
    for (const prefix of fillerPrefixes) {
      if (lowerWorking.startsWith(prefix) && lowerWorking.length > prefix.length + 3) {
        workingText = workingText.substring(prefix.length).trim().replace(/^[\s,:]+/, '');
        applied = true;
        variantType = 'voice';
        break;
      }
    }

    // Clean common voice speech artifact: "mark's" -> "marks"
    if (/\bmark's\b/i.test(workingText)) {
      workingText = workingText.replace(/\bmark's\b/gi, 'marks');
      applied = true;
      variantType = 'voice';
    }

    // 3. Telugu-English canonical phrase matching
    if (langInfo.language === 'te-en') {
      for (const phrase of this.teluguEnglishPhrases) {
        const regex = new RegExp(`(^|\\b)(${phrase.source_pattern})($|\\b)`, 'i');
        if (regex.test(workingText)) {
          alternateCandidates.push(workingText);
          workingText = phrase.target_normalized;
          applied = true;
          variantType = 'telugu_english';
          confidence = 0.97;
          detectedIntent = phrase.intent;
          break;
        }
      }
    }

    // 4. Contextual Typos (Preserves meaning without blind substitution)
    // E.g. "my role no" -> "my roll number", but leaves "role of warden" untouched!
    for (const ct of this.contextualTypos) {
      const reg = new RegExp(ct.context_pattern, 'i');
      if (reg.test(workingText)) {
        alternateCandidates.push(workingText);
        workingText = workingText.replace(reg, (match) => {
          return match.replace(new RegExp(ct.trigger, 'i'), ct.replacement);
        });
        applied = true;
        variantType = 'spelling';
        confidence = Math.max(confidence, ct.confidence);
      }
    }

    // 5. Global/Direct Typo Corrections from typos.json and voice fixes
    if (/^wat\b/i.test(workingText)) {
      workingText = workingText.replace(/^wat\b/i, 'what');
      applied = true;
    }
    if (/\brol\b/i.test(workingText)) {
      workingText = workingText.replace(/\brol\b/i, 'roll');
      applied = true;
    }
    if (/\bnuber\b/i.test(workingText)) {
      workingText = workingText.replace(/\bnuber\b/i, 'number');
      applied = true;
    }

    // 5. Global/Direct Typo Corrections from typos.json
    for (const [typo, replacement] of Object.entries(this.typos)) {
      const typoRegex = new RegExp(`\\b${typo}\\b`, 'i');
      if (typoRegex.test(workingText)) {
        alternateCandidates.push(workingText);
        workingText = workingText.replace(typoRegex, replacement);
        applied = true;
        variantType = 'spelling';
      }
    }

    // 6. Abbreviation expansion from abbreviations.json
    for (const [abbr, expansion] of Object.entries(this.abbreviations)) {
      // Only replace if exact abbreviation boundary matches
      const abbrRegex = new RegExp(`\\b${abbr}\\b`, 'i');
      if (abbrRegex.test(workingText)) {
        // Guard: Don't expand "app" if it is part of "CityApp"
        if (abbr === 'app' && /cityapp/i.test(workingText)) continue;
        workingText = workingText.replace(abbrRegex, expansion);
        applied = true;
        if (variantType === 'standard') variantType = 'abbreviation';
      }
    }

    // 7. Multi-Turn Context Resolution
    if (history && history.length > 0) {
      const lastAssistantTurn = [...history].reverse().find((h) => h.role === 'assistant');
      const lastUserTurn = [...history].reverse().find((h) => h.role === 'user');
      const contextText = `${lastUserTurn?.content || ''} ${lastAssistantTurn?.content || ''}`.toLowerCase();

      // Example: Turn 1 was academic details, Turn 2 is "what about 10th?" or "and inter?"
      if (contextText.includes('academic') || contextText.includes('marks') || contextText.includes('cgpa')) {
        if (/^(what about|and)?\s*(10th|tenth|ssc)\??$/i.test(workingText)) {
          workingText = 'what are my SSC marks?';
          detectedIntent = 'ACADEMIC_SELF';
          entities.subject = 'ssc';
          applied = true;
          confidence = 0.98;
        } else if (/^(what about|and)?\s*(inter|intermediate|12th)\??$/i.test(workingText)) {
          workingText = 'what are my intermediate marks?';
          detectedIntent = 'ACADEMIC_SELF';
          entities.subject = 'intermediate';
          applied = true;
          confidence = 0.98;
        } else if (/^(am i|and am i)?\s*eligible\??$/i.test(workingText) || /scholarship ki eligible aa/i.test(workingText)) {
          workingText = 'am I eligible for the scholarship?';
          detectedIntent = 'ELIGIBILITY_SELF';
          entities.program = 'merit_scholarship';
          applied = true;
          confidence = 0.98;
        }
      }
    }

    // 8. Extract canonical entities if present
    const rollMatch = workingText.match(/\b([0-9]{2}[A-Za-z0-9]{5,10})\b/);
    if (rollMatch) {
      entities.roll_number = rollMatch[1].toUpperCase();
    }
    if (/\b(ssc|10th|tenth)\b/i.test(workingText)) {
      entities.academic_stage = 'ssc';
    }
    if (/\b(inter|intermediate|12th)\b/i.test(workingText)) {
      entities.academic_stage = 'intermediate';
    }
    if (/\b(merit\s+scholarship|fee\s+reimbursement)\b/i.test(workingText)) {
      entities.scholarship_type = 'merit_scholarship';
    }

    // 9. Canonical Intent Pattern Mapping
    if (!detectedIntent) {
      const lower = workingText.toLowerCase();
      if (/documents.*(?:required|admission)|admission.*documents|admission\s+guidelines/i.test(lower)) {
        detectedIntent = 'DOCUMENTS_REQUIRED';
      } else if (/\b(marks|cgpa|percentage|grades?|scores?|arrears?|results?)\b/i.test(lower)) {
        detectedIntent = 'ACADEMIC_RECORD';
      } else if (/\b(roll\s*number|details|profile|biodata|who\s+am\s+i|about\s+myself)\b/i.test(lower)) {
        detectedIntent = 'PROFILE_SELF';
      } else if (/\bapplication\s*status\b/i.test(lower)) {
        detectedIntent = 'APPLICATION_STATUS';
      } else if (/\b(eligible|eligibility|scholarship)\b/i.test(lower)) {
        detectedIntent = 'ELIGIBILITY_SELF';
      } else if (/\battendance\b/i.test(lower)) {
        detectedIntent = 'ATTENDANCE_RECORD';
      } else if (/\b(fees?|payment|dues)\b/i.test(lower)) {
        detectedIntent = 'FEE_PAYMENT';
      } else if (/\b(leave|vacation|permission|absence)\b/i.test(lower)) {
        detectedIntent = 'LEAVE_RECORD';
      } else if (/\b(hostel|room|mess)\b/i.test(lower)) {
        detectedIntent = 'HOSTEL_INFO';
      }
    }

    return {
      originalText: query,
      normalizedText: workingText.trim(),
      language: langInfo.language,
      languageConfidence: langInfo.confidence,
      normalizationApplied: applied,
      normalizationConfidence: detectedIntent ? confidence : 0.50,
      intent: detectedIntent,
      entities: Object.keys(entities).length > 0 ? entities : undefined,
      variantType,
      alternateCandidates: alternateCandidates.length > 0 ? alternateCandidates : undefined,
    };
  }
}
