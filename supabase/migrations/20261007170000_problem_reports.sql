-- MODALIA — Problem reports (public -> admin inbox)
-- Users can report issues with optional image attachments.

CREATE TABLE IF NOT EXISTS public.problem_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_name TEXT,
  reporter_email TEXT,
  reporter_phone TEXT,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('order','product','store','payment','account','technical','other')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  image_urls TEXT[] DEFAULT '{}',
  order_id UUID,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','resolved','closed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_problem_reports_status ON public.problem_reports(status);
CREATE INDEX IF NOT EXISTS idx_problem_reports_created ON public.problem_reports(created_at DESC);

ALTER TABLE public.problem_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS problem_reports_public_insert ON public.problem_reports;
CREATE POLICY problem_reports_public_insert ON public.problem_reports FOR INSERT
  WITH CHECK (true);
DROP POLICY IF EXISTS problem_reports_admin ON public.problem_reports;
CREATE POLICY problem_reports_admin ON public.problem_reports FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
