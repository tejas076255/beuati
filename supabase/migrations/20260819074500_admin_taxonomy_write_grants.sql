-- svc_cat_admin_write / spec_admin_write RLS policies already exist and are
-- already admin-only (USING/WITH CHECK has_role(auth.uid(),'admin')), but the
-- table-level GRANT for `authenticated` only ever included SELECT — same gap
-- as user_roles before its own migration. Adds the missing write grants;
-- RLS (already correct) is what actually restricts this to admins.
GRANT INSERT, UPDATE, DELETE ON public.service_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.specializations TO authenticated;
