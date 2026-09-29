REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

GRANT SELECT ON public.usage_alerts TO authenticated;

DROP POLICY IF EXISTS "Admins can read usage alerts" ON public.usage_alerts;
CREATE POLICY "Admins can read usage alerts"
ON public.usage_alerts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
));
