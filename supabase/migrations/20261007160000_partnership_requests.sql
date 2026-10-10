-- MODALIA — B2B partnership requests
-- Public form -> admin inbox

CREATE TABLE IF NOT EXISTS public.partnership_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  partnership_type TEXT NOT NULL DEFAULT 'general' CHECK (partnership_type IN ('general','supplier','distributor','brand','logistics','other')),
  description TEXT NOT NULL,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','in_progress','closed','rejected')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partnership_status ON public.partnership_requests(status);
CREATE INDEX IF NOT EXISTS idx_partnership_created ON public.partnership_requests(created_at DESC);

ALTER TABLE public.partnership_requests ENABLE ROW LEVEL SECURITY;

-- Public can submit; only admins can read/manage
DROP POLICY IF EXISTS partnership_public_insert ON public.partnership_requests;
CREATE POLICY partnership_public_insert ON public.partnership_requests FOR INSERT
  WITH CHECK (true);
DROP POLICY IF EXISTS partnership_admin ON public.partnership_requests;
CREATE POLICY partnership_admin ON public.partnership_requests FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
