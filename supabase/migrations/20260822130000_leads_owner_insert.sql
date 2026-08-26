-- `leads` was only ever insertable via the SECURITY DEFINER submit_lead()
-- RPC (used by the public portfolio form) — there was never a direct INSERT
-- grant/policy for the authenticated owner. The new "Add Lead" dashboard
-- feature inserts directly as the beautician, through their RLS-scoped
-- client, so that path needs to be opened up too.
GRANT INSERT ON public.leads TO authenticated;

DROP POLICY IF EXISTS "leads_owner_insert" ON public.leads;
CREATE POLICY "leads_owner_insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));
