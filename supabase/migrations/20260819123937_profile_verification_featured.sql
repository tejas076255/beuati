-- Phase 1 Step 2: Verification + Featured flags on beautician_profiles.
--
-- Two independent admin-only booleans. Distinct from the existing
-- metrics_verified column (unrelated — that one only gates whether the
-- demo profile's stats display, not a professional-verification badge).
--
-- Security note: bp_owner_update's RLS is row-level, not column-level — an
-- owner is allowed to UPDATE their own row at all, which would let them set
-- is_verified/is_featured on themselves via a direct API call bypassing the
-- admin-only UI (the app code never sends these fields, but RLS alone
-- doesn't stop a hand-crafted request). Mirrors the exact same problem
-- reviews.is_verified already had, and reuses that table's exact fix:
-- guard_review_verification()'s pattern (BEFORE INSERT OR UPDATE trigger
-- that resets the column unless the caller is admin) — see reviews table
-- setup in the initial schema migration for the precedent.
ALTER TABLE public.beautician_profiles
  ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_beautician_profile_flags()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false;
    NEW.is_featured := false;
  ELSE
    NEW.is_verified := OLD.is_verified;
    NEW.is_featured := OLD.is_featured;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_beautician_profiles_flags BEFORE INSERT OR UPDATE ON public.beautician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_beautician_profile_flags();
