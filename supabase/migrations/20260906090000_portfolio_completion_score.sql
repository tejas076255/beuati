-- Portfolio Completion Score (Stage 1) — 0-100, system-generated only.
-- Free reaches exactly 100 using only universally-available content; no
-- paid-only feature contributes points (Packages/Videos/Reviews/GTM/
-- Verification/Lead Performance/plan are entirely outside this formula).
--
-- QA-only migration. ONE authoritative scoring algorithm
-- (compute_portfolio_score) lives here in SQL — never reimplemented in
-- TypeScript — because every scored child table already has an
-- owner-level RLS policy permitting a direct authenticated client write
-- that would silently bypass any application-layer recomputation. DB
-- triggers are the only mechanism that sees every write path (app server
-- functions, direct Supabase client writes, and Admin actions alike).
--
-- Additive only: 1 column, 4 functions, 7 triggers, 1 backfill UPDATE.
-- No RLS redesign.
--
-- Wrapped in a single transaction so the column, every function/trigger,
-- and the existing-profile backfill apply atomically in the SQL Editor —
-- either the whole migration lands, or none of it does.
BEGIN;

-- ---------- persisted score column ----------
ALTER TABLE public.beautician_profiles
  ADD COLUMN completion_score INTEGER NOT NULL DEFAULT 0
    CHECK (completion_score BETWEEN 0 AND 100);

-- ---------- the ONE authoritative scoring algorithm ----------
-- Takes the full row (not just an id) so it works identically whether the
-- row is already persisted (UPDATE, RPC calls) or not yet committed
-- (BEFORE INSERT, using NEW directly) — child-table subqueries correctly
-- return 0/false for a brand-new profile id regardless of whether the
-- parent row is fully committed, since FK integrity only constrains
-- writes, never reads.
--
-- Deliberately NOT granted to PUBLIC/authenticated (see REVOKE below) —
-- callable only by other SECURITY DEFINER functions that already own it
-- (the trigger below, and compute_portfolio_score_by_id), so a client can
-- never call this directly with an arbitrary row to read another
-- professional's breakdown, bypassing the ownership check in the RPC
-- wrapper. This is the structural reason "no private breakdown leak" is
-- guaranteed, not just the wrapper's own IF check.
--
-- Validation rules (exact, per product sign-off):
--   - every text field is trimmed before being judged "present";
--     whitespace-only values earn zero, identically to an empty string.
--   - bio uses length(trim(bio)) >= 80, the same trim-then-length
--     semantics as the existing Readiness MIN_BIO_LENGTH check
--     (src/lib/seo-helpers.ts) — not reused code, but reused semantics.
--   - Highlights / Why Choose You count only array items that are
--     non-empty after trimming; a list of blank strings scores as empty.
--   - Services/Service Areas: only is_active = true rows count.
--   - Gallery/Before & After: only is_published = true rows count.
--   - FAQs: only is_published = true rows count.
--   - Availability: "configured" requires at least one working_hours
--     array entry with available = true and both start/end matching
--     ^\d{2}:\d{2} — the exact same predicate as
--     buildOpeningHoursSpecification() in src/lib/seo-helpers.ts, ported
--     to SQL rather than re-derived, so the two can never silently drift
--     in meaning even though they're necessarily two implementations
--     (one JS helper for public JSON-LD rendering, one SQL helper for
--     scoring) — hardening against a malformed/non-array JSON value is
--     built in (falls back to an empty array, never errors).
CREATE OR REPLACE FUNCTION public.compute_portfolio_score(_profile public.beautician_profiles)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _identity_pts INTEGER := 0;
  _photo_pts INTEGER := 0;
  _bio_pts INTEGER := 0;
  _location_pts INTEGER := 0;
  _contact_pts INTEGER := 0;
  _services_pts INTEGER := 0;
  _portfolio_pts INTEGER := 0;
  _availability_pts INTEGER := 0;
  _areas_pts INTEGER := 0;
  _faqs_pts INTEGER := 0;
  _highlights_pts INTEGER := 0;

  _bio_len INTEGER;
  _services_count INTEGER;
  _portfolio_count INTEGER;
  _areas_count INTEGER;
  _faqs_count INTEGER;
  _highlights_count INTEGER;
  _why_choose_count INTEGER;
  _availability_configured BOOLEAN;
  _total INTEGER;
BEGIN
  -- 1. Identity basics (10 = 4 name + 3 title + 3 tagline)
  IF trim(coalesce(_profile.display_name, '')) <> '' THEN _identity_pts := _identity_pts + 4; END IF;
  IF trim(coalesce(_profile.professional_title, '')) <> '' THEN _identity_pts := _identity_pts + 3; END IF;
  IF trim(coalesce(_profile.short_tagline, '')) <> '' THEN _identity_pts := _identity_pts + 3; END IF;

  -- 2. Profile photo (10, binary)
  IF trim(coalesce(_profile.profile_image_url, '')) <> '' THEN _photo_pts := 10; END IF;

  -- 3. About / bio (15) — 0 empty, 7 non-empty but <80 chars, 15 if >=80
  _bio_len := length(trim(coalesce(_profile.bio, '')));
  IF _bio_len >= 80 THEN
    _bio_pts := 15;
  ELSIF _bio_len > 0 THEN
    _bio_pts := 7;
  END IF;

  -- 4. Location (8 = 5 city + 3 locality)
  IF trim(coalesce(_profile.primary_city, '')) <> '' THEN _location_pts := _location_pts + 5; END IF;
  IF trim(coalesce(_profile.locality, '')) <> '' THEN _location_pts := _location_pts + 3; END IF;

  -- 5. Contact (8, binary — phone OR whatsapp)
  IF trim(coalesce(_profile.phone, '')) <> '' OR trim(coalesce(_profile.whatsapp_number, '')) <> '' THEN
    _contact_pts := 8;
  END IF;

  -- 6. Services (12) — active only. 0 -> 0, 1-2 -> 6, >=3 -> 12
  SELECT count(*) INTO _services_count FROM public.services
    WHERE beautician_profile_id = _profile.id AND is_active = true;
  IF _services_count >= 3 THEN
    _services_pts := 12;
  ELSIF _services_count >= 1 THEN
    _services_pts := 6;
  END IF;

  -- 7. Portfolio work (10) — published gallery items + published
  -- before/after items, combined. 0 -> 0, 1-2 -> 5, >=3 -> 10
  SELECT
    (SELECT count(*) FROM public.portfolio_items
      WHERE beautician_profile_id = _profile.id AND is_published = true)
    + (SELECT count(*) FROM public.before_after_items
      WHERE beautician_profile_id = _profile.id AND is_published = true)
  INTO _portfolio_count;
  IF _portfolio_count >= 3 THEN
    _portfolio_pts := 10;
  ELSIF _portfolio_count >= 1 THEN
    _portfolio_pts := 5;
  END IF;

  -- 8. Availability (8, binary) — real working_hours semantics, ported
  -- from buildOpeningHoursSpecification(); never errors on NULL/malformed
  -- JSON (falls back to an empty array).
  SELECT EXISTS (
    SELECT 1
    FROM public.availability_settings avs
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(avs.working_hours) = 'array' THEN avs.working_hours ELSE '[]'::jsonb END
    ) AS entry
    WHERE avs.beautician_profile_id = _profile.id
      AND entry->>'available' = 'true'
      AND (entry->>'start') ~ '^\d{2}:\d{2}'
      AND (entry->>'end') ~ '^\d{2}:\d{2}'
  ) INTO _availability_configured;
  IF _availability_configured THEN _availability_pts := 8; END IF;

  -- 9. Service areas (7, binary) — active only
  SELECT count(*) INTO _areas_count FROM public.service_areas
    WHERE beautician_profile_id = _profile.id AND is_active = true;
  IF _areas_count >= 1 THEN _areas_pts := 7; END IF;

  -- 10. FAQs (6) — published only. 0 -> 0, 1 -> 3, >=2 -> 6
  SELECT count(*) INTO _faqs_count FROM public.faqs
    WHERE beautician_profile_id = _profile.id AND is_published = true;
  IF _faqs_count >= 2 THEN
    _faqs_pts := 6;
  ELSIF _faqs_count >= 1 THEN
    _faqs_pts := 3;
  END IF;

  -- 11. Highlights + Why Choose You (6) — only non-empty trimmed items
  -- count; a list of blank strings is treated as empty. 0 if both lists
  -- have zero qualifying items; 3 if either list has >=1; 6 if BOTH
  -- lists have >=2.
  SELECT count(*) INTO _highlights_count
    FROM unnest(coalesce(_profile.about_highlights, '{}')) AS h WHERE trim(h) <> '';
  SELECT count(*) INTO _why_choose_count
    FROM unnest(coalesce(_profile.why_choose_points, '{}')) AS w WHERE trim(w) <> '';
  IF _highlights_count >= 2 AND _why_choose_count >= 2 THEN
    _highlights_pts := 6;
  ELSIF _highlights_count >= 1 OR _why_choose_count >= 1 THEN
    _highlights_pts := 3;
  END IF;

  _total := _identity_pts + _photo_pts + _bio_pts + _location_pts + _contact_pts
    + _services_pts + _portfolio_pts + _availability_pts + _areas_pts + _faqs_pts + _highlights_pts;

  RETURN jsonb_build_object(
    'total', _total,
    'criteria', jsonb_build_array(
      jsonb_build_object('id','identity','label','Identity basics','earned',_identity_pts,'max',10),
      jsonb_build_object('id','photo','label','Profile photo','earned',_photo_pts,'max',10),
      jsonb_build_object('id','bio','label','About / bio','earned',_bio_pts,'max',15),
      jsonb_build_object('id','location','label','Location','earned',_location_pts,'max',8),
      jsonb_build_object('id','contact','label','Contact','earned',_contact_pts,'max',8),
      jsonb_build_object('id','services','label','Services','earned',_services_pts,'max',12),
      jsonb_build_object('id','portfolio_work','label','Portfolio work','earned',_portfolio_pts,'max',10),
      jsonb_build_object('id','availability','label','Availability','earned',_availability_pts,'max',8),
      jsonb_build_object('id','service_areas','label','Service areas','earned',_areas_pts,'max',7),
      jsonb_build_object('id','faqs','label','FAQs','earned',_faqs_pts,'max',6),
      jsonb_build_object('id','highlights','label','Highlights + Why Choose You','earned',_highlights_pts,'max',6)
    )
  );
END; $$;

-- Never directly callable by any client — internal use only (see header
-- comment). Both SECURITY DEFINER callers below already own this
-- function and can invoke it regardless of this revoke.
REVOKE ALL ON FUNCTION public.compute_portfolio_score(public.beautician_profiles) FROM PUBLIC;

-- ---------- secure breakdown RPC ----------
-- Professional: may read only their own breakdown (owns_beautician_profile).
-- Admin: may read any professional's breakdown (has_role check).
-- Professional B / anonymous: rejected by the explicit IF check below,
-- and additionally blocked at the grant layer (REVOKE ALL + GRANT to
-- authenticated only) so an unauthenticated caller cannot reach the
-- function at all, not just fail its internal check. Fixed search_path
-- (SET search_path = public) prevents search-path hijacking, per Postgres
-- SECURITY DEFINER hardening guidance. Returns nothing beyond the score
-- breakdown itself — no customer/private data of any kind.
CREATE OR REPLACE FUNCTION public.compute_portfolio_score_by_id(_bp_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _profile public.beautician_profiles;
BEGIN
  IF NOT (public.owns_beautician_profile(_bp_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorized to view this portfolio completion score';
  END IF;

  SELECT * INTO _profile FROM public.beautician_profiles WHERE id = _bp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN public.compute_portfolio_score(_profile);
END; $$;

REVOKE ALL ON FUNCTION public.compute_portfolio_score_by_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_portfolio_score_by_id(UUID) TO authenticated;

-- ---------- automatic recomputation: beautician_profiles itself ----------
-- Unconditionally overwrites NEW.completion_score on every insert/update,
-- regardless of what changed or who the actor is — there is no
-- legitimate direct-set case for this column for ANY actor (unlike
-- plan/is_verified, which admins may set), so unlike
-- guard_beautician_profile_flags() there is no actor branching at all:
-- professional and Admin edits are recomputed identically. A BEFORE
-- trigger mutating NEW in-memory issues no further UPDATE statement, so
-- this cannot recurse or re-fire any other trigger.
CREATE OR REPLACE FUNCTION public.recompute_completion_score()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.completion_score := (public.compute_portfolio_score(NEW)->>'total')::integer;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_beautician_profiles_score BEFORE INSERT OR UPDATE ON public.beautician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.recompute_completion_score();

-- ---------- automatic recomputation: the 6 scored child tables ----------
-- One generic AFTER trigger function, attached to all 6 tables that share
-- the beautician_profile_id column shape — mirrors the exact
-- "one generic function, N CREATE TRIGGER attachments" pattern already
-- used for enforce_plan_content_limit() in the entitlements migration.
-- Contains ZERO scoring knowledge: it only "pokes" the parent row so
-- beautician_profiles' own BEFORE trigger (above) performs the actual,
-- single authoritative computation. This is what guarantees the scoring
-- formula is never duplicated into a child trigger. The literal value
-- assigned in the UPDATE's SET clause is irrelevant — it exists only to
-- make Postgres fire the parent's BEFORE UPDATE trigger, which then
-- overwrites completion_score with the freshly computed value regardless.
-- TG_OP-explicit rather than a single COALESCE(NEW, OLD) read: on UPDATE,
-- a scored child row can be reassigned to a different parent (its
-- beautician_profile_id changed), and COALESCE(NEW, OLD) would only ever
-- touch the NEW parent, leaving the OLD parent's completion_score stale
-- (e.g. it would keep credit for a service that moved away). This handles
-- INSERT (touch NEW's parent), DELETE (touch OLD's parent), and UPDATE
-- (touch NEW's parent, and ALSO touch OLD's parent when the row moved to
-- a different profile) explicitly. Still contains ZERO scoring knowledge
-- — it only "pokes" whichever parent row(s) need to recompute.
-- portfolio_images is intentionally excluded — no criterion depends on
-- photo-level counts (criterion 7 is scored at the portfolio_items row
-- level), so it needs no trigger here.
CREATE OR REPLACE FUNCTION public.touch_portfolio_score()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.beautician_profile_id IS NOT NULL THEN
      UPDATE public.beautician_profiles SET completion_score = completion_score
        WHERE id = NEW.beautician_profile_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.beautician_profile_id IS NOT NULL THEN
      UPDATE public.beautician_profiles SET completion_score = completion_score
        WHERE id = OLD.beautician_profile_id;
    END IF;
    RETURN OLD;
  ELSE -- UPDATE
    IF NEW.beautician_profile_id IS NOT NULL THEN
      UPDATE public.beautician_profiles SET completion_score = completion_score
        WHERE id = NEW.beautician_profile_id;
    END IF;
    IF OLD.beautician_profile_id IS NOT NULL
      AND OLD.beautician_profile_id IS DISTINCT FROM NEW.beautician_profile_id THEN
      UPDATE public.beautician_profiles SET completion_score = completion_score
        WHERE id = OLD.beautician_profile_id;
    END IF;
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER trg_services_score AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_portfolio_items_score AFTER INSERT OR UPDATE OR DELETE ON public.portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_before_after_items_score AFTER INSERT OR UPDATE OR DELETE ON public.before_after_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_availability_settings_score AFTER INSERT OR UPDATE OR DELETE ON public.availability_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_service_areas_score AFTER INSERT OR UPDATE OR DELETE ON public.service_areas
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_faqs_score AFTER INSERT OR UPDATE OR DELETE ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();

-- ---------- existing-profile backfill ----------
-- Every trigger/function above must exist BEFORE this runs. Assigning a
-- column to itself still fires the BEFORE UPDATE trigger on every row
-- (Postgres fires triggers based on the UPDATE statement targeting the
-- row, not on whether the assigned value differs) — trg_beautician_profiles_score
-- then overwrites completion_score with the true computed value for every
-- historical profile in one statement. No profile is left at the DEFAULT 0.
UPDATE public.beautician_profiles SET completion_score = completion_score;

COMMIT;
