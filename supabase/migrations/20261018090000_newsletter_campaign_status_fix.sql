-- Phase 4: Reconcile newsletter_campaigns status CHECK with application logic
-- The application writes 'failed' and 'partial' statuses (newsletter.functions.ts:318)
-- but the original migration only allowed ('draft','scheduled','sending','sent','archived').
-- This migration widens the constraint to match the app. Safe: additive only, no data loss.
-- Live DB was already fixed via ad-hoc SQL in Phase 1; this codifies it for fresh installs.

DO $$
BEGIN
  -- Drop the old constraint if it exists (without failed/partial)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.newsletter_campaigns'::regclass
    AND conname = 'newsletter_campaigns_status_check'
  ) THEN
    ALTER TABLE public.newsletter_campaigns
      DROP CONSTRAINT newsletter_campaigns_status_check;
  END IF;
END $$;

ALTER TABLE public.newsletter_campaigns
  ADD CONSTRAINT newsletter_campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'partial', 'archived'));

-- Ensure unsubscribe_token is UNIQUE (was nullable TEXT in original migration)
-- Live DB already has this; codify for fresh installs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.newsletter_subscribers'::regclass
    AND conname = 'newsletter_subscribers_unsubscribe_token_key'
  ) THEN
    ALTER TABLE public.newsletter_subscribers
      ADD CONSTRAINT newsletter_subscribers_unsubscribe_token_key
      UNIQUE (unsubscribe_token);
  END IF;
END $$;

-- Phase 4 Item 3: Admin invitation atomic claim support
-- Add 'claimed' status and claimed_at column for race-safe invitation acceptance.
DO $$
BEGIN
  -- Add claimed_at column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_invitations' AND column_name = 'claimed_at'
  ) THEN
    ALTER TABLE public.admin_invitations ADD COLUMN claimed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Widen status CHECK to include 'claimed'
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.admin_invitations'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) LIKE '%pending%accepted%expired%revoked%'
  LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.admin_invitations DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.admin_invitations
  ADD CONSTRAINT admin_invitations_status_check
  CHECK (status IN ('pending', 'claimed', 'accepted', 'expired', 'revoked'));
