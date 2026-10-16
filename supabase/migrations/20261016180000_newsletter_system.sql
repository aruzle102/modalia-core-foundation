-- ============================================================================
-- MODALIA — Newsletter & Campaign System
-- ============================================================================
-- Extends newsletter_subscribers with consent/status tracking.
-- Adds newsletter_campaigns for campaign management.
-- ============================================================================

-- Extend subscribers table
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained')),
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_token TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'footer',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Campaigns table
CREATE TABLE IF NOT EXISTS public.newsletter_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT,
  html_content TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('ar', 'fr', 'en')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'archived')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  unsubscribed_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign sends (individual tracking)
CREATE TABLE IF NOT EXISTS public.newsletter_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES public.newsletter_subscribers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  resend_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'complained')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_campaign ON public.newsletter_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status ON public.newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_token ON public.newsletter_subscribers(unsubscribe_token);

-- RLS
ALTER TABLE public.newsletter_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_sends ENABLE ROW LEVEL SECURITY;

-- Campaigns: super_admin + email.manage
CREATE POLICY "newsletter_campaigns_admin_all" ON public.newsletter_campaigns
  FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.admin_members am
      WHERE am.user_id = auth.uid()
        AND am.is_active = true
        AND (am.permissions ? 'email.manage')
    )
  );

CREATE POLICY "newsletter_sends_admin_all" ON public.newsletter_sends
  FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.admin_members am
      WHERE am.user_id = auth.uid()
        AND am.is_active = true
        AND (am.permissions ? 'email.manage')
    )
  );

-- Subscribers: extend admin read to include email.manage
DROP POLICY IF EXISTS "newsletter_admin_read" ON public.newsletter_subscribers;
CREATE POLICY "newsletter_admin_read" ON public.newsletter_subscribers
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.admin_members am
      WHERE am.user_id = auth.uid()
        AND am.is_active = true
        AND (am.permissions ? 'email.manage' OR am.permissions ? 'email.view')
    )
  );

-- Allow service_role to update (for unsubscribe via token)
-- Unsubscribe is handled via server function with service role
