-- ============================================================================
-- V8 Sec 47: admin support mode ("Open Seller Dashboard") — grant ledger
-- ============================================================================
-- Short-lived, single-use-ish grants that let a super_admin VIEW a seller's
-- workspace through the Seller OS without ever touching the seller's
-- credentials. The grant is:
--   - created server-side by createSupportSession (assertAdmin, super_admin)
--   - bound to the CREATING admin (admin_id); only that admin may redeem it
--   - bearer token: the raw token is handed to the admin's browser once;
--     only its SHA-256 hash is stored (token_hash)
--   - expires after 30 minutes; revocable at any time (revoked_at)
--   - audit-logged on create / open / revoke (audit_logs, action
--     support_session_created|opened|revoked, resource "seller")
--
-- RLS: enabled with NO policies — deny-all for anon/authenticated. Every
-- access goes through the service-role client inside server functions that
-- re-verify (assertAdmin + creator binding + expiry) on every use.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seller_support_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 hex of the bearer token handed to the admin browser. The raw
  -- token is never persisted.
  token_hash text NOT NULL UNIQUE,
  -- The super_admin who opened the session. Only this admin may redeem it.
  admin_id uuid NOT NULL,
  -- Lookup key only: resolved server-side at creation; never trusted from
  -- the client afterwards.
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz
);

ALTER TABLE public.seller_support_grants ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: deny-all. Service-role access only, from server
-- functions that re-verify admin identity, creator binding and expiry.

CREATE INDEX IF NOT EXISTS seller_support_grants_admin_idx
  ON public.seller_support_grants (admin_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS seller_support_grants_seller_idx
  ON public.seller_support_grants (seller_id);
