-- Lets admins grant/revoke the 'admin' role from the app instead of a
-- manual SQL step every time. Every signup already gets 'beautician' via
-- handle_new_user() — that path is untouched. Before this, user_roles only
-- granted SELECT to authenticated (admins could already see every role via
-- the has_role() OR in user_roles_select_own); only service_role could write.
GRANT INSERT, DELETE ON public.user_roles TO authenticated;

CREATE POLICY "user_roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
