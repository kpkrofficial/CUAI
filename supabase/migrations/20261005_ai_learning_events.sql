-- CITYAPP AI — Production Learning Events Migration
-- Dedicated durable storage for conversation learning, PII-redacted user interactions,
-- feedback, human reviews, and regression candidate generation.

CREATE TABLE IF NOT EXISTS public.ai_learning_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT NOT NULL,
    message_id TEXT NOT NULL UNIQUE,
    user_role TEXT NOT NULL DEFAULT 'student',
    original_message_encrypted_or_restricted TEXT,
    redacted_message TEXT NOT NULL,
    normalized_message TEXT NOT NULL,
    intent TEXT,
    tool TEXT,
    provider TEXT,
    model TEXT,
    feedback_type TEXT,
    feedback_reason TEXT,
    user_correction TEXT,
    failure_type TEXT,
    review_status TEXT NOT NULL DEFAULT 'NEW' CHECK (review_status IN ('NEW', 'REVIEW_REQUIRED', 'VERIFIED', 'REJECTED', 'DUPLICATE', 'PROMOTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    promoted_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for Admin Dashboard Filtering and Querying
CREATE INDEX IF NOT EXISTS idx_ai_learning_status ON public.ai_learning_events (review_status);
CREATE INDEX IF NOT EXISTS idx_ai_learning_created_at ON public.ai_learning_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_learning_message_id ON public.ai_learning_events (message_id);
CREATE INDEX IF NOT EXISTS idx_ai_learning_intent ON public.ai_learning_events (intent);
CREATE INDEX IF NOT EXISTS idx_ai_learning_tool ON public.ai_learning_events (tool);
CREATE INDEX IF NOT EXISTS idx_ai_learning_failure_type ON public.ai_learning_events (failure_type);
CREATE INDEX IF NOT EXISTS idx_ai_learning_feedback_type ON public.ai_learning_events (feedback_type);

-- Row Level Security
ALTER TABLE public.ai_learning_events ENABLE ROW LEVEL SECURITY;

-- Admins / Superadmins can view and review learning events
DROP POLICY IF EXISTS "ai_learning_events_admin_select" ON public.ai_learning_events;
CREATE POLICY "ai_learning_events_admin_select" ON public.ai_learning_events
FOR SELECT TO authenticated
USING (
    public.is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.tenant_memberships
        WHERE profile_id = (SELECT auth.uid())
          AND role IN ('campus_admin', 'superadmin')
          AND status = 'active'
    )
);

DROP POLICY IF EXISTS "ai_learning_events_admin_update" ON public.ai_learning_events;
CREATE POLICY "ai_learning_events_admin_update" ON public.ai_learning_events
FOR UPDATE TO authenticated
USING (
    public.is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.tenant_memberships
        WHERE profile_id = (SELECT auth.uid())
          AND role IN ('campus_admin', 'superadmin')
          AND status = 'active'
    )
)
WITH CHECK (
    public.is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.tenant_memberships
        WHERE profile_id = (SELECT auth.uid())
          AND role IN ('campus_admin', 'superadmin')
          AND status = 'active'
    )
);
