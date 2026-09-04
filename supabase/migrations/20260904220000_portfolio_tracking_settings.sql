-- Per-portfolio GTM + marketing tracking phase — a dedicated 1:1
-- tracking-settings table, admin-managed only this phase. No arbitrary
-- script/snippet column: gtm_container_id is the ONLY configurable value,
-- constrained to the canonical GTM-XXXXXXX shape at the database level as
-- defense-in-depth alongside the application's own server-side validation.
-- QA-only migration — NOT applied to the protected backend yet (see the
-- phase report for the exact protected-rollout recommendation).
CREATE TABLE public.portfolio_tracking_settings (
  beautician_profile_id UUID PRIMARY KEY REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  gtm_container_id TEXT NULL CHECK (gtm_container_id IS NULL OR gtm_container_id ~ '^GTM-[A-Z0-9]{4,10}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portfolio_tracking_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.portfolio_tracking_settings TO authenticated;
GRANT ALL ON public.portfolio_tracking_settings TO service_role;

ALTER TABLE public.portfolio_tracking_settings ENABLE ROW LEVEL SECURITY;

-- Same existing set_updated_at() trigger function used by every other
-- timestamped table (services, beautician_profiles, lead_inquiries, ...).
CREATE TRIGGER trg_portfolio_tracking_settings_updated
  BEFORE UPDATE ON public.portfolio_tracking_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Public/anon may read tracking config only for a published portfolio —
-- reuses the existing is_published_profile() helper, never a new one.
CREATE POLICY "pts_public_read_published" ON public.portfolio_tracking_settings
  FOR SELECT TO anon, authenticated
  USING (public.is_published_profile(beautician_profile_id));

-- Admin can manage all rows. No owner/professional write policy this
-- phase — the GRANT above technically permits authenticated INSERT/UPDATE/
-- DELETE, but with no matching non-admin RLS policy, a non-admin
-- professional's write is blocked at the row-security layer regardless
-- (the same GRANT-vs-POLICY split already used throughout this schema,
-- e.g. services/packages: broad GRANT, narrow owner/admin POLICY).
CREATE POLICY "pts_admin_all" ON public.portfolio_tracking_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Same "one focused migration, item is the audited unit" convention as
-- Gallery/Before & After/Videos/Packages/FAQs.
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'tracking_settings_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'tracking_settings_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'tracking_settings_removed';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'tracking_settings';
