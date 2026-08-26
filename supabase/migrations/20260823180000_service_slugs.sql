-- Phase 3F.4: stable per-profile service slugs for SEO service landing
-- pages (/portfolio/{profileSlug}/services/{serviceSlug}).
--
-- services.slug already existed (TEXT, nullable) but had no format
-- constraint, no uniqueness guarantee, and no write path anywhere in the
-- app — every row's slug was NULL. This migration only adds integrity
-- constraints; it does not touch any existing row's data.
--
-- Uniqueness is scoped per beautician_profile_id (not global) because the
-- public URL already namespaces by profile slug — two different
-- professionals may legitimately have a service that slugifies to the same
-- string (e.g. both offer "bridal-makeup").
ALTER TABLE public.services
  ADD CONSTRAINT services_slug_format CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

CREATE UNIQUE INDEX idx_services_bp_slug
  ON public.services (beautician_profile_id, slug)
  WHERE slug IS NOT NULL;
