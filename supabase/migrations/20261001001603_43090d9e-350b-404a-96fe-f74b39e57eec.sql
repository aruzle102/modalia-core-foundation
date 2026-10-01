ALTER TABLE public.seller_applications
  ALTER COLUMN applicant_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS additional_information text;

ALTER TABLE public.seller_applications
  DROP CONSTRAINT IF EXISTS seller_application_reviewed_check;

ALTER TABLE public.seller_applications
  ADD CONSTRAINT seller_application_reviewed_check CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR status <> 'pending'
  );

GRANT INSERT ON public.seller_applications TO anon;

DROP POLICY IF EXISTS "seller_applications_create_own" ON public.seller_applications;
CREATE POLICY "seller_applications_public_submit"
ON public.seller_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'pending'
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
  AND rejection_reason IS NULL
  AND admin_notes IS NULL
  AND seller_id IS NULL
);

CREATE OR REPLACE FUNCTION public.seller_can(_seller_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = _seller_id
        AND s.owner_id = auth.uid()
        AND s.account_status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.seller_staff ss
      WHERE ss.seller_id = _seller_id
        AND ss.user_id = auth.uid()
        AND ss.permissions ? _permission
    );
$$;

REVOKE EXECUTE ON FUNCTION public.seller_can(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_can(uuid, text) TO authenticated;