-- ============================================================================
-- MODALIA — Email Center & Admin Invitation System
-- ============================================================================
-- IMPORTANT: This migration is NOT applied automatically.
-- Review required before applying to production.
--
-- Tables:
--   1. email_templates  — reusable email templates with variables
--   2. email_logs       — sent email history with delivery status
--   3. admin_invitations — secure admin invitation tokens
--
-- Security:
--   - All tables have RLS enabled
--   - Only super_admin and users with email.manage can access email tables
--   - Invitation tokens are stored as SHA-256 hashes (never plaintext)
--   - No API keys, passwords, or raw tokens in logs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Email Templates
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'seller_application', 'store', 'order', 'customer', 'partner', 'platform', 'invitation')),
  locale TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('ar', 'fr', 'en')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Email Logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  resend_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'complained')),
  error_message TEXT,
  sent_by UUID REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_to_email ON public.email_logs(to_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_by ON public.email_logs(sent_by);

-- ----------------------------------------------------------------------------
-- 3. Admin Invitations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'viewer')),
  permissions JSONB NOT NULL DEFAULT '[]',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_email ON public.admin_invitations(email);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_token_hash ON public.admin_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_status ON public.admin_invitations(status);

-- ----------------------------------------------------------------------------
-- RLS Policies
-- ----------------------------------------------------------------------------

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

-- Email templates: super_admin + email.manage can do everything
CREATE POLICY "email_templates_admin_all" ON public.email_templates
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

-- Email logs: super_admin + email.manage can view; insert via service role only
-- (Edge Function uses service role for logging)
CREATE POLICY "email_logs_admin_view" ON public.email_logs
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.admin_members am
      WHERE am.user_id = auth.uid()
        AND am.is_active = true
        AND (am.permissions ? 'email.manage' OR am.permissions ? 'email.view')
    )
  );

-- Admin invitations: super_admin only (most sensitive)
CREATE POLICY "admin_invitations_super_admin_all" ON public.admin_invitations
  FOR ALL
  USING (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- Default email templates (seed data)
-- ----------------------------------------------------------------------------

INSERT INTO public.email_templates (slug, name, description, subject, html_body, variables, category, locale) VALUES
(
  'seller-application-received',
  'Seller Application Received',
  'Sent when a seller application is submitted',
  'Your Modalia seller application has been received',
  '<h2>Hello {{seller_name}},</h2><p>We have received your seller application for <strong>{{store_name}}</strong>.</p><p>Our team will review it and get back to you soon.</p><p>Best regards,<br/>The Modalia Team</p>',
  ARRAY['seller_name', 'store_name'],
  'seller_application',
  'en'
),
(
  'seller-application-approved',
  'Seller Application Approved',
  'Sent when a seller application is approved',
  'Your Modalia seller application has been approved! 🎉',
  '<h2>Congratulations {{seller_name}}!</h2><p>Your seller application for <strong>{{store_name}}</strong> has been approved.</p><p>You can now access your seller dashboard and start selling.</p><p>Login: {{login_url}}</p><p>Best regards,<br/>The Modalia Team</p>',
  ARRAY['seller_name', 'store_name', 'login_url'],
  'seller_application',
  'en'
),
(
  'seller-application-rejected',
  'Seller Application Rejected',
  'Sent when a seller application is rejected',
  'Update on your Modalia seller application',
  '<h2>Hello {{seller_name}},</h2><p>After review, we are unable to approve your seller application for <strong>{{store_name}}</strong> at this time.</p><p>Reason: {{reason}}</p><p>You may reapply after addressing the above.</p><p>Best regards,<br/>The Modalia Team</p>',
  ARRAY['seller_name', 'store_name', 'reason'],
  'seller_application',
  'en'
),
(
  'admin-invitation',
  'Admin Invitation',
  'Sent when inviting a new admin team member',
  'You are invited to join the Modalia admin team',
  '<h2>Hello,</h2><p>You have been invited to join the Modalia admin team as <strong>{{role}}</strong>.</p><p>Click the link below to accept and set your password (expires in 7 days):</p><p><a href="{{invitation_link}}">Accept Invitation</a></p><p>If you did not expect this, please ignore this email.</p><p>Best regards,<br/>The Modalia Team</p>',
  ARRAY['role', 'invitation_link'],
  'invitation',
  'en'
),
(
  'order-update',
  'Order Status Update',
  'Sent when an order status changes',
  'Update on your order {{order_number}}',
  '<h2>Hello {{customer_name}},</h2><p>Your order <strong>{{order_number}}</strong> status has been updated to: <strong>{{status}}</strong>.</p><p>Track your order: <a href="{{tracking_url}}">Track Order</a></p><p>Best regards,<br/>The Modalia Team</p>',
  ARRAY['customer_name', 'order_number', 'status', 'tracking_url'],
  'order',
  'en'
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- ROLLBACK (if needed):
--   DROP TABLE IF EXISTS public.admin_invitations;
--   DROP TABLE IF EXISTS public.email_logs;
--   DROP TABLE IF EXISTS public.email_templates;
-- ============================================================================
