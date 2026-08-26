-- Phase 1 Step 3: platform-wide, append-only audit trail for Main Admin actions.
--
-- Scope (per explicit Step 3 spec): profile status changes, verification
-- changes, featured changes, admin role grants/revokes, review moderation
-- (publish/unpublish, verify/unverify, delete). Taxonomy CRUD and lead
-- status changes are intentionally NOT logged in this step — not in the
-- specified minimum scope, and lower-sensitivity than profile/role/review
-- moderation. Can be added later by extending admin_audit_action.
CREATE TYPE public.admin_audit_action AS ENUM (
  'profile_status_changed',
  'verification_changed',
  'featured_changed',
  'admin_role_granted',
  'admin_role_revoked',
  'review_moderated',
  'review_deleted'
);

CREATE TYPE public.admin_audit_entity_type AS ENUM (
  'beautician_profile',
  'user_role',
  'review'
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  action public.admin_audit_action NOT NULL,
  entity_type public.admin_audit_entity_type NOT NULL,
  entity_id UUID NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Intentionally NO foreign keys to beautician_profiles/reviews/user_roles:
-- an audit record must remain readable even after the entity it describes
-- is deleted (e.g. review_deleted's own record would break a FK the moment
-- the review row it references is gone). actor_user_id is also left as a
-- bare UUID with no FK to auth.users, matching the existing convention
-- already used by profiles.auth_user_id and user_roles.user_id.

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs (actor_user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

-- Read: admins only.
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- No INSERT/UPDATE/DELETE policy for `authenticated` at all, and no such
-- GRANT either — this makes the table append-only from the application's
-- perspective. Writes only happen through log_admin_action() below, a
-- SECURITY DEFINER function (runs as the table owner, the same mechanism
-- submit_lead()/record_portfolio_event() already use to write into their
-- own RLS-protected tables without a client-facing write grant). No client,
-- including an admin's own browser session, can INSERT/UPDATE/DELETE
-- audit_logs directly through PostgREST.
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action public.admin_audit_action,
  _entity_type public.admin_audit_entity_type,
  _entity_id UUID,
  _old_value JSONB DEFAULT NULL,
  _new_value JSONB DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _old_value, _new_value, _metadata)
  RETURNING id INTO _id;
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.log_admin_action(public.admin_audit_action, public.admin_audit_entity_type, UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(public.admin_audit_action, public.admin_audit_entity_type, UUID, JSONB, JSONB, JSONB) TO authenticated;
