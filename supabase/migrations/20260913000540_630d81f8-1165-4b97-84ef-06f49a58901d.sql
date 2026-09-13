REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public;
ALTER FUNCTION public.is_super_admin() SET search_path = public;