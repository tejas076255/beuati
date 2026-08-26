-- Phase 3F.5: cross-profile service-linking protection.
--
-- Audit finding: the RLS owner-write policies on portfolio_items and
-- before_after_items only check `owns_beautician_profile(beautician_profile_id)`
-- — i.e. that the caller owns the ROW being written. Neither the RLS policy
-- nor the `service_id UUID REFERENCES public.services(id) ON DELETE SET NULL`
-- foreign key checks that the referenced service actually belongs to that
-- same beautician_profile_id — the FK only checks the service EXISTS
-- somewhere. A forged request (bypassing the dashboard's own dropdown,
-- which only ever offers the caller's own services) could technically set
-- Profile A's portfolio_items.service_id to point at Profile B's service.
--
-- Fix: the smallest safe database-level protection consistent with this
-- schema's existing pattern — a BEFORE INSERT/UPDATE trigger, mirroring
-- guard_beautician_profile_flags()/guard_review_verification() exactly
-- rather than introducing a new authorization mechanism.
CREATE OR REPLACE FUNCTION public.guard_media_service_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.service_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = NEW.service_id
        AND s.beautician_profile_id = NEW.beautician_profile_id
    ) THEN
      RAISE EXCEPTION 'service_id must belong to the same beautician profile as this item';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_portfolio_items_service_ownership
  BEFORE INSERT OR UPDATE ON public.portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_media_service_ownership();

CREATE TRIGGER trg_before_after_items_service_ownership
  BEFORE INSERT OR UPDATE ON public.before_after_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_media_service_ownership();
