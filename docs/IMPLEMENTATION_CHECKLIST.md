# CityApp AI — Backend Rebuild Implementation Checklist

## Locked Business Decisions
- [x] **Student Peer Lookup**: STRICT SELF-ACCESS (No peer directory lookup).
- [x] **Cross-Campus Knowledge**: ISOLATED CAMPUSES (Enforce `campus_id = user.campus_id`).
- [x] **Legacy Credentials**: ONE-TIME PASSWORD RESET (Supabase Auth is sole auth system).

---

## Phase Sequence & Progress

### Phase 1: Security, Secrets & Supabase Auth Foundations
- [ ] Remove hardcoded Supabase keys, JWT secret fallbacks, and credentials from all source files and scripts.
- [ ] Configure clean environment variable bindings (`.env.example` and `.env.local` template).
- [ ] Implement Supabase client factory for Server Components, Route Handlers, and Middleware using `@supabase/ssr`.
- [ ] Implement unified session handler and eliminate the legacy 3-cookie model (`user_auth_token`, `admin_auth_token`, `superadmin_auth_token`).
- [ ] Update Next.js Middleware to perform session validation, refresh token rotation, and route gating via Supabase Auth + profile roles.

### Phase 2: Database Schema, Hardened RLS & Multi-Tenant Model
- [ ] Design and write production PostgreSQL migration (`supabase/migrations/20261004_target_schema.sql`):
  - `organizations` & `campuses` (Multi-tenant foundations)
  - `profiles` (1-to-1 with `auth.users`)
  - `tenant_memberships` (`profile_id`, `campus_id`, `role`, `status`)
  - `departments` & `year_folders`
  - `student_records` (Normalized with soft deletes, unique constraints, and encrypted Aadhaar)
  - `form_configs` & `form_drafts` (Debounced drafts without full-DB serialization)
  - `chat_sessions` & `chat_messages` (Strict `profile_id` ownership)
  - `knowledge_documents` & `knowledge_chunks` (With `pgvector` embeddings)
  - `audit_logs` (Server-generated, tamper-resistant)
- [ ] Implement security definer helper functions and hardened Row-Level Security (RLS) policies.
- [ ] Revoke public/anon table grants.

### Phase 3: Data-Access & Domain Service Layer
- [ ] Implement database client / query layer with parameterized queries.
- [ ] Implement domain services:
  - `AuthService` (Profile resolution, tenant context, session checks)
  - `StudentService` (CRUD, paginated filter/sort, roll-number lookup, PII masking)
  - `FolderService` (Year folder lifecycle, dynamic form configs)
  - `FormService` (Submission processing, atomic applicant insertion, debounced draft saves)
  - `ChatService` (Session ownership validation, message persistence, history retrieval)
  - `StorageService` (Signed upload URLs, MIME/size verification, signed download URLs)
  - `AuditService` (Server-generated immutable audit trails)
- [ ] Connect Zod validation schemas to all domain boundaries.
- [ ] Implement standardized API response envelopes (`apiSuccess`, `apiError`).

### Phase 4: Core API Migration
- [ ] Migrate `/api/auth/*` (`login`, `register`, `logout`, `me`).
- [ ] Migrate `/api/admin/students/*` (`students`, `[id]`, `import`, `export`, `bulk-students`).
- [ ] Migrate `/api/admin/folders/*` (`folders`, `[slug]`, `[slug]/form-config`).
- [ ] Migrate `/api/admin/users/*` (Eliminate privilege escalation; superadmin-only roles).
- [ ] Migrate `/api/admin/analytics`, `/api/admin/stats`, `/api/admin/logs`, `/api/admin/notifications`.
- [ ] Deprecate/remove `/api/admin/reset-db` and `/api/super-admin/supabase` `.env.local` mutation exploits.

### Phase 5: Storage & Form Intake Rebuild
- [ ] Implement `/api/storage/presign` with strict authentication, role validation, file-type whitelisting, and size limits.
- [ ] Implement `/api/storage/verify` to confirm uploads before saving records.
- [ ] Rebuild public `/api/forms/[slug]` to save directly to PostgreSQL with idempotency.
- [ ] Rebuild `/api/forms/auto-save` to save to `form_drafts` without disk/full-DB writes.

### Phase 6: Chat Infrastructure & Session Ownership
- [ ] Migrate `/api/chat/sessions` and `/api/chat/sessions/[id]` with strict ownership checks (`profile_id = auth.uid()`).
- [ ] Prevent BOLA/IDOR; users can only read, update, or delete their own sessions.

### Phase 7: Real AI Chatbot & Tool Calling
- [ ] Implement Gemini orchestration service using `@google/genai` and `gemini-2.5-flash`.
- [ ] Build 9-tool catalog with server-side authorization and PII filtering:
  - `getStudentProfile` (Strict self-access for students; campus-scoped for staff/admin)
  - `searchStudents` (Staff/admin only; masked PII)
  - `countStudents` (Staff/admin only)
  - `getApplicationStatus` (Self or admin)
  - `searchApplications` (Staff/admin only)
  - `getFormSubmission` (Staff/admin only)
  - `searchAcademicRecords` (Self or admin)
  - `getEligibilityData` (Invokes deterministic rule engine)
  - `searchKnowledge` (Campus-isolated vector search)
- [ ] Implement grounded truth guarantee: refuse to fabricate data if tools return empty.

### Phase 8: Knowledge / RAG Pipeline & Versioning
- [ ] Implement document chunking and vector embedding via `gemini-embedding-2` / `text-embedding-004`.
- [ ] Implement pgvector cosine similarity search strictly scoped to `campus_id`.
- [ ] Implement knowledge versioning and effective date filters.
- [ ] Output verified source citations in chat responses.

### Phase 9: Deterministic Business-Rule Engine
- [ ] Implement `EligibilityService` for scholarship and admission criteria.
- [ ] Ensure LLM only explains calculated pass/fail facts and does not invent calculations.

### Phase 10: Testing, Legacy Migration & Verification
- [ ] Write and run offline migration script: `data/db.json` -> Staging PostgreSQL.
- [ ] Generate migration reconciliation report.
- [ ] Run full automated test suite (Auth, RBAC, PII, Grounding, Concurrency).
- [ ] Verify frontend regression across all portals.
- [ ] Remove legacy `memoryDb` and `data/db.json` from production code path.
- [ ] Final production verification report.
