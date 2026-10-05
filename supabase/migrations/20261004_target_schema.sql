-- ==============================================================================
-- TARGET MULTI-TENANT POSTGRESQL SCHEMA WITH HARDENED RLS & PGVECTOR
-- Migration: 20261004_target_schema.sql
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. ENUMS
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('superadmin', 'campus_admin', 'staff', 'student');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.membership_status AS ENUM ('active', 'suspended', 'pending');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. CORE TENANT TABLES: ORGANIZATIONS & CAMPUSES
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    branding JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(campus_id, code)
);

-- 4. IDENTITY & PROFILES (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TENANT MEMBERSHIPS (Role & Campus Binding)
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    role public.user_role NOT NULL,
    status public.membership_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(profile_id, campus_id, role)
);

-- 6. ACADEMIC COHORTS / YEAR FOLDERS
CREATE TABLE IF NOT EXISTS public.year_folders (
    id TEXT PRIMARY KEY,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    year_label TEXT NOT NULL,
    description TEXT,
    is_form_active INTEGER DEFAULT 1,
    form_token TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure campus_id exists on year_folders if table already existed
DO $$ BEGIN
  ALTER TABLE public.year_folders ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN null;
END $$;

-- 7. FORM CONFIGURATIONS
CREATE TABLE IF NOT EXISTS public.form_configs (
    id TEXT PRIMARY KEY,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL REFERENCES public.year_folders(id) ON DELETE CASCADE,
    section_name TEXT NOT NULL,
    field_name TEXT NOT NULL,
    field_label TEXT NOT NULL,
    field_type TEXT NOT NULL,
    is_required INTEGER DEFAULT 0,
    options_json JSONB DEFAULT '[]'::jsonb,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.form_configs ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN null;
END $$;

-- 8. STUDENT RECORDS (With Tenant Isolation & Profile Anchor)
CREATE TABLE IF NOT EXISTS public.student_records (
    id TEXT PRIMARY KEY,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL REFERENCES public.year_folders(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    year TEXT NOT NULL,
    name TEXT NOT NULL,
    roll_number TEXT NOT NULL,
    profile_image TEXT,
    gender TEXT,
    branch TEXT NOT NULL,
    section TEXT,
    college TEXT NOT NULL,
    admission_type TEXT,
    dob TEXT,
    blood_group TEXT,
    aadhaar_no TEXT,
    father_name TEXT,
    father_occupation TEXT,
    mother_name TEXT,
    mother_occupation TEXT,
    reservation_category TEXT,
    mode_of_transport TEXT,
    accommodation_type TEXT,
    permanent_address TEXT,
    present_address TEXT,
    permanent_pincode TEXT,
    present_pincode TEXT,
    permanent_phone TEXT,
    present_phone TEXT,
    phone TEXT,
    email TEXT,
    ssc_marks TEXT,
    inter_marks TEXT,
    diploma_marks TEXT,
    student_data JSONB DEFAULT '{}'::jsonb,
    is_draft INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.student_records ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE;
  ALTER TABLE public.student_records ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  ALTER TABLE public.student_records ADD COLUMN IF NOT EXISTS student_data JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE public.student_records ADD COLUMN IF NOT EXISTS is_draft INTEGER DEFAULT 0;
EXCEPTION WHEN others THEN null;
END $$;

-- 9. FORM DRAFTS (Debounced Intake Auto-save)
CREATE TABLE IF NOT EXISTS public.form_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL REFERENCES public.year_folders(id) ON DELETE CASCADE,
    roll_number TEXT NOT NULL,
    draft_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(folder_id, roll_number)
);

-- 10. CHAT SESSIONS & MESSAGES (Tenant & Profile Bound)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id TEXT PRIMARY KEY,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE;
  ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    rag_sources JSONB,
    tool_invocations JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. KNOWLEDGE MANAGEMENT & VECTOR RAG (Isolated per Campus)
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
    campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role TEXT,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN null;
END $$;

-- 13. INDEXES FOR PERFORMANCE & TENANT ISOLATION
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_profile ON public.tenant_memberships (profile_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_campus ON public.tenant_memberships (campus_id, role);
CREATE INDEX IF NOT EXISTS idx_student_records_campus_roll ON public.student_records (campus_id, roll_number);
CREATE INDEX IF NOT EXISTS idx_student_records_account ON public.student_records (account_id);
CREATE INDEX IF NOT EXISTS idx_student_records_folder ON public.student_records (folder_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_account ON public.chat_sessions (account_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON public.chat_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_campus ON public.knowledge_documents (campus_id, is_active);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_campus ON public.knowledge_chunks (campus_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON public.knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_form_drafts_lookup ON public.form_drafts (campus_id, folder_id, roll_number);

-- 14. VECTOR COSINE INDEX (HNSW for high-performance pgvector retrieval)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_vector
ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- 15. SECURITY DEFINER HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE profile_id = (SELECT auth.uid())
      AND role = 'superadmin'
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_campus_access(target_campus_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE profile_id = (SELECT auth.uid())
        AND campus_id = target_campus_id
        AND status = 'active'
    )
  );
$$;

-- 16. ROW LEVEL SECURITY ENFORCEMENT
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.year_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 17. HARDENED POLICIES (NO `USING (true)` ON PRIVATE DATA)

-- Profiles
DROP POLICY IF EXISTS "profiles_select_own_or_campus" ON public.profiles;
CREATE POLICY "profiles_select_own_or_campus" ON public.profiles
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = id
  OR public.is_superadmin()
);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

-- Tenant Memberships
DROP POLICY IF EXISTS "memberships_select" ON public.tenant_memberships;
CREATE POLICY "memberships_select" ON public.tenant_memberships
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = profile_id
  OR (campus_id IS NOT NULL AND public.has_campus_access(campus_id))
  OR public.is_superadmin()
);

-- Year Folders (Public Read for Active Intake Forms, Managed by Campus Staff)
DROP POLICY IF EXISTS "year_folders_read" ON public.year_folders;
CREATE POLICY "year_folders_read" ON public.year_folders
FOR SELECT TO authenticated, anon
USING (is_form_active = 1 OR (campus_id IS NOT NULL AND public.has_campus_access(campus_id)));

-- Student Records: STRICT ISOLATION & STRICT STUDENT SELF-ACCESS
DROP POLICY IF EXISTS "student_records_select" ON public.student_records;
CREATE POLICY "student_records_select" ON public.student_records
FOR SELECT TO authenticated
USING (
  public.is_superadmin()
  OR (campus_id IS NOT NULL AND public.has_campus_access(campus_id) AND EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE profile_id = (SELECT auth.uid())
        AND campus_id = student_records.campus_id
        AND role IN ('campus_admin', 'staff')
        AND status = 'active'
  ))
  OR ((SELECT auth.uid()) = account_id) -- Strict self-access for students
);

-- Chat Sessions: Strictly Owned by Authenticated User
DROP POLICY IF EXISTS "chat_sessions_owner_access" ON public.chat_sessions;
CREATE POLICY "chat_sessions_owner_access" ON public.chat_sessions
FOR ALL TO authenticated
USING ((SELECT auth.uid()) = account_id)
WITH CHECK ((SELECT auth.uid()) = account_id);

-- Chat Messages: Strictly Owned by Session Owner
DROP POLICY IF EXISTS "chat_messages_owner_access" ON public.chat_messages;
CREATE POLICY "chat_messages_owner_access" ON public.chat_messages
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_sessions
    WHERE id = chat_messages.session_id
      AND account_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_sessions
    WHERE id = chat_messages.session_id
      AND account_id = (SELECT auth.uid())
  )
);

-- Knowledge Documents & Chunks: STRICT CAMPUS ISOLATION
DROP POLICY IF EXISTS "knowledge_docs_campus_isolation" ON public.knowledge_documents;
CREATE POLICY "knowledge_docs_campus_isolation" ON public.knowledge_documents
FOR SELECT TO authenticated
USING (
  is_active = true
  AND public.has_campus_access(campus_id)
);

DROP POLICY IF EXISTS "knowledge_chunks_campus_isolation" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_campus_isolation" ON public.knowledge_chunks
FOR SELECT TO authenticated
USING (
  public.has_campus_access(campus_id)
);

-- Audit Logs: Insert allowed, Read strictly restricted to Admins
DROP POLICY IF EXISTS "audit_logs_read" ON public.audit_logs;
CREATE POLICY "audit_logs_read" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.is_superadmin()
  OR (campus_id IS NOT NULL AND public.has_campus_access(campus_id) AND EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE profile_id = (SELECT auth.uid())
        AND campus_id = audit_logs.campus_id
        AND role = 'campus_admin'
        AND status = 'active'
  ))
);
