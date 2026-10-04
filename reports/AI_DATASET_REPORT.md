# CityApp AI — Question Understanding & Evaluation Dataset Report

## 1. Dataset Overview
- **Total Dataset Size:** 2,500 canonical examples
- **Storage Format:** JSONL (`data/ai/questions.jsonl`, `data/ai/train.jsonl`, `data/ai/validation.jsonl`, `data/ai/test.jsonl`)
- **Intent Taxonomy:** 54 strictly typed intents defined in `data/ai/intents.json`
- **Tool Mapping:** Defined in `data/ai/tool-mapping.json`

---

## 2. Category Distribution

| Category | Record Count | Target | Status |
|---|:---:|:---:|:---:|
| Profile / Identity | 150 | 150 | ✓ Verified |
| Academic / Marks / CGPA | 250 | 250 | ✓ Verified |
| Application / Admission Status | 150 | 150 | ✓ Verified |
| Attendance | 200 | 200 | ✓ Verified |
| Leave | 150 | 150 | ✓ Verified |
| Fees / Payments | 150 | 150 | ✓ Verified |
| Hostel | 150 | 150 | ✓ Verified |
| Scholarships / Eligibility | 150 | 150 | ✓ Verified |
| Campus Policies / RAG | 225 | 225 | ✓ Verified |
| Courses / Subjects / Curriculum | 150 | 150 | ✓ Verified |
| Timetable / Events / Schedule | 125 | 125 | ✓ Verified |
| Admin Analytics | 150 | 150 | ✓ Verified |
| Faculty / Staff Operations | 100 | 100 | ✓ Verified |
| Multi-turn / Follow-up | 200 | 200 | ✓ Verified |
| Ambiguous / Clarification | 100 | 100 | ✓ Verified |
| Security / RBAC / Prompt Injection | 100 | 100 | ✓ Verified |
| **TOTAL** | **2,500** | **2,500** | **✓ Complete** |

---

## 3. Data Split Summary

| Split | Percentage | Records | File Path |
|---|:---:|:---:|---|
| **Training Set** | 70.0% | 1,750 | `data/ai/train.jsonl` |
| **Validation Set** | 15.0% | 375 | `data/ai/validation.jsonl` |
| **Hidden Evaluation Set** | 15.0% | 375 | `data/ai/test.jsonl` |
| **Consolidated Dataset** | 100.0% | 2,500 | `data/ai/questions.jsonl` |

---

## 4. Linguistic & Phrasing Diversity
The dataset encompasses realistic user phrasings across:
- **Formal English:** Complete grammatical questions with polite phrasing.
- **Casual English & Slang:** "gimme my marks", "who dis student", "my clg details".
- **Indian English Collocations:** "standing arrears", "bonafide certificate", "convener quota", "counselling seat".
- **Abbreviations & Short Queries:** "SSC", "Inter perc", "CGPA", "my marks", "status?".
- **Common Spelling Errors & Typos:** "atendance", "schollarship", "clg", "intermidiate", "libary".
- **Telugu & Telugu-English Code-Switching:** "naa marks entha", "my SSC marks entha", "scholarship ki nenu eligible aa", "library timings enti".

---

## 5. Security & Privacy Audit Result
- **Unique Questions Verified:** 2,500 / 2,500 (Zero duplicate questions)
- **Train / Test Leakage:** 0 sentences leaked into hidden test set
- **Real PII Exposure:** 0 occurrences of real Aadhaar or personal phone numbers
- **Secrets / Tokens:** 0 API keys, JWTs, or service credentials
- **Mandatory Schema Compliance:** 100% of records contain all 17 required keys
