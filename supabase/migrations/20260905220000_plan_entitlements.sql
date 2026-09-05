-- 5-tier entitlements (free/starter/silver/gold/platinum). Free remains
-- genuinely useful and stays capable of a future 100/100 Completion Score
-- (not implemented in this phase). Paid tiers add capacity/richness/growth.
--
-- QA-only migration. Adds one enum, one column, extends the existing
-- privileged-field guard (mirrors is_verified/is_featured exactly), and
-- adds DB-level content-limit enforcement on the 8 owner-created content
-- tables plus the gallery photos child table. No RLS redesign: every
-- owner_all/public_read policy on these tables is untouched — enforcement
-- is a BEFORE INSERT trigger layer only, the same division of
-- responsibility already used for is_verified/is_featured and
-- guard_media_service_ownership().
--
-- Numeric limits mirror src/lib/plan-limits.ts exactly — that file is the
-- canonical application-level source; keep both in sync if these ever
-- change.

-- ---------- plan column ----------
CREATE TYPE public.portfolio_plan AS ENUM ('free','starter','silver','gold','platinum');

ALTER TABLE public.beautician_profiles
  ADD COLUMN plan public.portfolio_plan NOT NULL DEFAULT 'free';

-- Admin's plan-change action is logged through the existing
-- logAdminAction()/audit_logs mechanism, same as every other admin
-- action — one new enum value, no new audit table/path.
ALTER TYPE public.admin_audit_action ADD VALUE IF NOT EXISTS 'plan_changed';

-- ---------- extend the existing privileged-field guard ----------
-- guard_beautician_profile_flags() already resets is_verified/is_featured
-- to false/OLD for any non-admin writer (20260819123937). Extending it
-- (CREATE OR REPLACE, same trigger, no new one) is the smallest way to make
-- `plan` admin-only-writable too, exactly as instructed.
--
-- One deliberate difference from is_verified/is_featured: a NULL auth.uid()
-- (service-role/backend caller — no JWT actor, e.g. QA fixture setup or a
-- future backend billing job) is exempt from the `plan` reset specifically,
-- so seeding/changing a profile's plan directly via service-role tooling
-- keeps working. This is safe because RLS's row-level bp_owner_update policy
-- already requires a genuine authenticated JWT matching ownership for a real
-- professional's write to reach this trigger at all — a NULL actor can only
-- be service_role (bypasses RLS with the secret key) or anon (no
-- INSERT/UPDATE grant on this table at all), never a malicious professional.
-- is_verified/is_featured behavior is intentionally left byte-for-byte
-- unchanged (no NULL exemption added there) to avoid altering any
-- pre-existing guarantee.
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

  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.plan := 'free';
    ELSE
      NEW.plan := OLD.plan;
    END IF;
  END IF;

  RETURN NEW;
END; $$;
-- trg_beautician_profiles_flags (BEFORE INSERT OR UPDATE) already exists and
-- picks up this new logic automatically — no CREATE TRIGGER needed here.

-- ---------- content-limit lookup ----------
-- Single source of the numeric matrix on the DB side, mirroring
-- src/lib/plan-limits.ts's LIMITS table exactly. Kept as one small function
-- so the 8 enforcement triggers below stay generic instead of each
-- hardcoding its own copy of the numbers.
CREATE OR REPLACE FUNCTION public.get_plan_content_limit(_plan public.portfolio_plan, _key TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _key
    WHEN 'services' THEN
      CASE _plan WHEN 'free' THEN 5 WHEN 'starter' THEN 10 WHEN 'silver' THEN 20 WHEN 'gold' THEN 50 WHEN 'platinum' THEN 150 END
    WHEN 'packages' THEN
      CASE _plan WHEN 'free' THEN 0 WHEN 'starter' THEN 5 WHEN 'silver' THEN 15 WHEN 'gold' THEN 40 WHEN 'platinum' THEN 100 END
    WHEN 'gallery_photos' THEN
      CASE _plan WHEN 'free' THEN 12 WHEN 'starter' THEN 30 WHEN 'silver' THEN 75 WHEN 'gold' THEN 150 WHEN 'platinum' THEN 300 END
    WHEN 'before_after_items' THEN
      CASE _plan WHEN 'free' THEN 3 WHEN 'starter' THEN 10 WHEN 'silver' THEN 25 WHEN 'gold' THEN 60 WHEN 'platinum' THEN 120 END
    WHEN 'portfolio_videos' THEN
      CASE _plan WHEN 'free' THEN 0 WHEN 'starter' THEN 0 WHEN 'silver' THEN 5 WHEN 'gold' THEN 15 WHEN 'platinum' THEN 30 END
    WHEN 'faqs' THEN
      CASE _plan WHEN 'free' THEN 5 WHEN 'starter' THEN 10 WHEN 'silver' THEN 20 WHEN 'gold' THEN 40 WHEN 'platinum' THEN 80 END
    WHEN 'service_areas' THEN
      CASE _plan WHEN 'free' THEN 3 WHEN 'starter' THEN 8 WHEN 'silver' THEN 20 WHEN 'gold' THEN 50 WHEN 'platinum' THEN 100 END
    WHEN 'reviews' THEN
      CASE _plan WHEN 'free' THEN 0 WHEN 'starter' THEN 20 WHEN 'silver' THEN 50 WHEN 'gold' THEN 100 WHEN 'platinum' THEN 200 END
    ELSE NULL
  END;
$$;

-- ---------- generic content-limit trigger (7 of 8 tables) ----------
-- Covers every table whose plan-limited row count is counted directly
-- against its own beautician_profile_id column: services, packages, faqs,
-- service_areas, reviews, portfolio_videos, before_after_items. Gallery
-- photos (portfolio_images) is the one exception — its cap is on a child
-- table two hops from beautician_profiles — handled by a dedicated function
-- below.
--
-- BEFORE INSERT only (never UPDATE/DELETE): existing/over-cap rows must
-- remain fully editable and deletable (e.g. after a downgrade) — only the
-- creation of a brand-new row is ever blocked.
--
-- Deliberately NOT admin-exempt: the product rule is that Admin retains
-- full edit/delete/reorder/plan-change/status rights, but creating NEW
-- content must still respect the portfolio's stored plan — Admin has no
-- override mechanism for content creation. Admin's path to add more content
-- than a plan allows is to change the plan first (an action Admin can
-- always take), then create — never a bypass on the create path itself.
--
-- Only a NULL auth.uid() (service-role/backend caller — no JWT actor, e.g.
-- QA fixture setup or a future backend job) is exempt, for the same
-- RLS-backed reasoning used elsewhere in this migration: a malicious
-- professional can never present a NULL auth.uid() through the owner RLS
-- policies these tables already use, so this exemption cannot be exploited
-- by a real professional or by Admin acting through the normal app.
CREATE OR REPLACE FUNCTION public.enforce_plan_content_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plan public.portfolio_plan;
  _limit INTEGER;
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO _plan FROM public.beautician_profiles WHERE id = NEW.beautician_profile_id;
  IF _plan IS NULL THEN
    RETURN NEW;
  END IF;

  _limit := public.get_plan_content_limit(_plan, TG_TABLE_NAME);
  IF _limit IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE beautician_profile_id = $1', TG_TABLE_NAME)
    INTO _count
    USING NEW.beautician_profile_id;

  IF _count >= _limit THEN
    RAISE EXCEPTION 'Plan limit reached: your % plan allows up to % %. Upgrade for more capacity.',
      _plan, _limit, TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_services_plan_limit BEFORE INSERT ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_packages_plan_limit BEFORE INSERT ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_faqs_plan_limit BEFORE INSERT ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_service_areas_plan_limit BEFORE INSERT ON public.service_areas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_reviews_plan_limit BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_portfolio_videos_plan_limit BEFORE INSERT ON public.portfolio_videos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_before_after_items_plan_limit BEFORE INSERT ON public.before_after_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();

-- ---------- gallery photos (portfolio_images) ----------
-- The cap is "12 photos", matching marketing, not "12 gallery entries" —
-- portfolio_images has no beautician_profile_id of its own, so this
-- resolves it via portfolio_item_id -> portfolio_items.beautician_profile_id
-- and counts every photo across all of that profile's gallery entries.
--
-- Same admin-not-exempt / NULL-only-exempt reasoning as
-- enforce_plan_content_limit() above.
CREATE OR REPLACE FUNCTION public.enforce_plan_gallery_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bp_id UUID;
  _plan public.portfolio_plan;
  _limit INTEGER;
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT beautician_profile_id INTO _bp_id
    FROM public.portfolio_items WHERE id = NEW.portfolio_item_id;
  IF _bp_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO _plan FROM public.beautician_profiles WHERE id = _bp_id;
  IF _plan IS NULL THEN
    RETURN NEW;
  END IF;

  _limit := public.get_plan_content_limit(_plan, 'gallery_photos');

  SELECT count(*) INTO _count
    FROM public.portfolio_images pi
    JOIN public.portfolio_items it ON it.id = pi.portfolio_item_id
    WHERE it.beautician_profile_id = _bp_id;

  IF _count >= _limit THEN
    RAISE EXCEPTION 'Plan limit reached: your % plan allows up to % gallery photos. Upgrade for more capacity.',
      _plan, _limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_portfolio_images_plan_limit BEFORE INSERT ON public.portfolio_images
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_gallery_limit();
