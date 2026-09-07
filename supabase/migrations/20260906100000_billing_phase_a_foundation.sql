-- BILLING PHASE A — foundation schema for self-serve/Admin-manual paid plans.
-- Approved architecture: Free is permanent; Starter/Silver/Gold/Platinum are
-- fixed-duration (monthly/yearly), no auto-renew. Payment verification is
-- server-side only — a client can never mark its own order paid/activated.
-- This migration adds the billing tables, the 4 new commercial-state columns
-- on beautician_profiles, and the SQL functions that give the system one
-- canonical compatibility engine and one canonical reconciliation authority.
-- No gateway integration, no webhook endpoint, no real/test provider order —
-- those remain Phase B. NOT applied to QA or protected as part of this pass.

BEGIN;

-- ============================================================
-- 1. Enums
-- ============================================================
CREATE TYPE public.billing_order_status AS ENUM (
  'created', 'activated', 'failed', 'cancelled', 'needs_review', 'superseded'
);
CREATE TYPE public.payment_status AS ENUM ('captured', 'failed', 'refunded');
CREATE TYPE public.billing_cycle  AS ENUM ('monthly', 'yearly');
CREATE TYPE public.plan_source    AS ENUM ('free', 'manual', 'paid');

-- ============================================================
-- 2. billing_orders
-- ============================================================
-- gateway_order_id is nullable: the local order is always created first
-- (and wins the one-open-order slot) before any external provider call is
-- ever attempted — see gateway_creation_started_at below for the atomic
-- claim that ensures only one caller ever makes that external call.
CREATE TABLE public.billing_orders (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id       UUID NOT NULL REFERENCES public.beautician_profiles(id),
  plan                        public.portfolio_plan NOT NULL,
  billing_cycle               public.billing_cycle NOT NULL,
  amount_paise                INTEGER NOT NULL CHECK (amount_paise > 0),
  currency                    TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  gateway                     TEXT NOT NULL,
  gateway_order_id            TEXT NULL,
  status                      public.billing_order_status NOT NULL DEFAULT 'created',
  expected_state_version      INTEGER NOT NULL,
  -- Atomic provider-creation claim (Phase A foundation only — no HTTP call
  -- is ever made by this migration). A caller may only call the external
  -- provider after winning the claim below; see
  -- src/data/billing/order.server.ts for the claim protocol.
  gateway_creation_started_at TIMESTAMPTZ NULL,
  -- Immutable, per-order historical record of what THIS order produced —
  -- never re-derived from beautician_profiles.plan_expires_at, which is
  -- only the profile's CURRENT effective expiry and changes on renewal.
  activated_at                TIMESTAMPTZ NULL,
  access_starts_at            TIMESTAMPTZ NULL,
  access_expires_at           TIMESTAMPTZ NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_orders_plan_not_free CHECK (plan <> 'free'),
  UNIQUE (gateway, gateway_order_id)
);

CREATE INDEX idx_billing_orders_profile ON public.billing_orders (beautician_profile_id);
CREATE INDEX idx_billing_orders_status  ON public.billing_orders (status);

-- One unresolved checkout per profile at a time (not scoped by plan/cycle —
-- simpler and closes the "two simultaneous open checkouts" ambiguity).
CREATE UNIQUE INDEX idx_billing_orders_one_open
  ON public.billing_orders (beautician_profile_id)
  WHERE status = 'created';

-- Reuse the existing canonical updated_at trigger helper (set_updated_at,
-- defined in the original schema migration) — no duplicate utility.
CREATE TRIGGER trg_billing_orders_updated BEFORE UPDATE ON public.billing_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. payments
-- ============================================================
CREATE TABLE public.payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_order_id     UUID NOT NULL REFERENCES public.billing_orders(id),
  gateway              TEXT NOT NULL,
  gateway_payment_id   TEXT NOT NULL,
  amount_paise         INTEGER NOT NULL CHECK (amount_paise > 0),
  currency             TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  status               public.payment_status NOT NULL,
  verified_at          TIMESTAMPTZ NULL,
  raw_gateway_payload  JSONB NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_payment_id)
);

CREATE INDEX idx_payments_order ON public.payments (billing_order_id);

-- DB-enforced (not just trusted insert logic): a payment's gateway must
-- always match its parent order's gateway — provider-neutral correctness
-- backstop, not a defense against an untrusted client (payments has no
-- client-facing grant at all — see §7 below).
CREATE OR REPLACE FUNCTION public.enforce_payment_gateway_matches_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.gateway <> (SELECT gateway FROM public.billing_orders WHERE id = NEW.billing_order_id) THEN
    RAISE EXCEPTION 'payment gateway (%) does not match parent order gateway', NEW.gateway
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_payment_gateway
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_gateway_matches_order();

-- ============================================================
-- 4. billing_events
-- ============================================================
-- Two-stage webhook processing bookkeeping (approved design): the receipt/
-- attempt transaction commits processing_attempts/last_attempted_at BEFORE
-- business processing runs, so a business-transaction rollback can never
-- erase attempt history. last_error is a short, sanitized human-readable
-- reason only — never a raw stack trace, signature, or payload fragment.
-- No separate secrets/signature column: nothing about verifying a webhook
-- signature is ever persisted here or anywhere else.
CREATE TABLE public.billing_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway              TEXT NOT NULL,
  gateway_event_id     TEXT NOT NULL,
  event_type           TEXT NOT NULL,
  payload              JSONB NOT NULL,
  processed_at         TIMESTAMPTZ NULL,
  processing_attempts  INTEGER NOT NULL DEFAULT 0,
  last_error           TEXT NULL,
  last_attempted_at    TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_event_id)
);

-- ============================================================
-- 5. beautician_profiles — exactly 4 new commercial-state columns
-- ============================================================
-- Nullable first: plan_source's correct value depends on each row's
-- existing `plan`, so it cannot be safely backfilled with a single
-- blanket DEFAULT (see backfill block below).
ALTER TABLE public.beautician_profiles
  ADD COLUMN plan_source              public.plan_source NULL,
  ADD COLUMN plan_expires_at          TIMESTAMPTZ NULL,
  ADD COLUMN billing_hold             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN commercial_state_version INTEGER NOT NULL DEFAULT 0;

-- ---------- exact, data-aware backfill ----------
-- Existing Free profiles -> plan_source='free'.
-- Existing non-Free profiles (all manually set by Admin today, e.g.
-- dharti-panchal on Silver) -> plan_source='manual', NEVER 'free'. A
-- blanket DEFAULT 'free' would have silently mislabeled every existing
-- paid profile — this explicit UPDATE is why that is avoided.
UPDATE public.beautician_profiles
  SET plan_source = CASE
    WHEN plan = 'free' THEN 'free'::public.plan_source
    ELSE 'manual'::public.plan_source
  END;
-- plan_expires_at is correctly left NULL for every existing row (no plan
-- was ever purchased with a defined duration) — explicit no-op, no ALTER
-- needed. billing_hold=false and commercial_state_version=0 are already
-- correct for every row via their column defaults above.

ALTER TABLE public.beautician_profiles
  ALTER COLUMN plan_source SET NOT NULL,
  ALTER COLUMN plan_source SET DEFAULT 'free';

-- ---------- commercial-state DB constraints ----------
-- Only invariants with NO legitimate exception are enforced here.
-- Deliberately NOT enforced (remains application/reconciliation
-- semantics): "plan_source='manual' implies non-NULL plan_expires_at" —
-- a permanent Admin/manual complimentary grant is a valid, indefinite
-- non-Free plan with no expiry by design.
--
-- 'paid', however, DOES get that invariant enforced (paid-expiry patch):
-- plan_source='paid' means the entitlement came from a fixed-duration
-- paid purchase, which by definition always has a resulting expiry —
-- there is no legitimate "permanent paid" state, unlike 'manual'. This
-- runs AFTER the backfill above, against data the backfill has already
-- made compliant (every existing non-Free profile was backfilled to
-- plan_source='manual', never 'paid' — see §6 of the report for the
-- exact existing-row verification).
ALTER TABLE public.beautician_profiles
  ADD CONSTRAINT bp_commercial_state_version_nonneg
    CHECK (commercial_state_version >= 0),
  ADD CONSTRAINT bp_plan_source_free_is_free
    CHECK (plan_source <> 'free' OR plan = 'free'),
  ADD CONSTRAINT bp_plan_source_paid_not_free
    CHECK (plan_source <> 'paid' OR plan <> 'free'),
  ADD CONSTRAINT bp_plan_source_paid_has_expiry
    CHECK (plan_source <> 'paid' OR plan_expires_at IS NOT NULL),
  ADD CONSTRAINT bp_billing_hold_implies_free
    CHECK (NOT billing_hold OR plan = 'free');

-- ============================================================
-- 6. Grace period — one canonical helper, never a repeated literal
-- ============================================================
-- Provisional Stage-1 value: 7 days. This is a business decision that
-- still requires explicit owner approval before protected billing launch
-- — see the implementation report. Changing it later is a one-function
-- CREATE OR REPLACE, never a multi-site find-and-replace.
CREATE OR REPLACE FUNCTION public.commercial_grace_period()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $$
  SELECT interval '7 days';
$$;

-- ============================================================
-- 7. Canonical Free-compatibility engine
-- ============================================================
-- Built on the SAME public.get_plan_content_limit() the entitlement
-- triggers already use (20260905220000_plan_entitlements.sql) — never a
-- second, independently-drifting copy of the limit numbers. Mirrors
-- validatePlanDowngrade()'s module coverage exactly (services, packages,
-- gallery_photos via the portfolio_items join, before_after_items,
-- portfolio_videos, faqs, service_areas, reviews) plus the same GTM check
-- — but with the divergence parameterized via _ignore_gtm rather than
-- duplicated as a second implementation.
CREATE OR REPLACE FUNCTION public.check_plan_compatibility(
  _bp_id UUID,
  _target_plan public.portfolio_plan,
  _ignore_gtm BOOLEAN DEFAULT false
)
RETURNS TABLE(module TEXT, current_count INTEGER, limit_count INTEGER, compatible BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _module TEXT;
  _limit INTEGER;
  _count INTEGER;
  _gallery_count INTEGER;
  _gallery_limit INTEGER;
  _gtm_exists BOOLEAN;
BEGIN
  FOREACH _module IN ARRAY ARRAY['services','packages','before_after_items','portfolio_videos','faqs','service_areas','reviews']
  LOOP
    _limit := public.get_plan_content_limit(_target_plan, _module);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE beautician_profile_id = $1', _module)
      INTO _count USING _bp_id;
    module := _module;
    current_count := _count;
    limit_count := _limit;
    compatible := _count <= _limit;
    RETURN NEXT;
  END LOOP;

  -- gallery_photos: two-hop relationship via portfolio_items, same as
  -- enforce_plan_gallery_limit() / validatePlanDowngrade()'s gallery check.
  _gallery_limit := public.get_plan_content_limit(_target_plan, 'gallery_photos');
  SELECT count(*) INTO _gallery_count
    FROM public.portfolio_images pi
    JOIN public.portfolio_items it ON it.id = pi.portfolio_item_id
    WHERE it.beautician_profile_id = _bp_id;
  module := 'gallery_photos';
  current_count := _gallery_count;
  limit_count := _gallery_limit;
  compatible := _gallery_count <= _gallery_limit;
  RETURN NEXT;

  -- GTM: _ignore_gtm=false (Admin manual downgrade) keeps today's strict
  -- rule — a stored GTM configuration blocks the move. _ignore_gtm=true
  -- (automatic expiry-to-Free) never blocks on GTM — dormant configuration
  -- simply stops being publicly injected (planAllowsGtm() read-time gate),
  -- and is never deleted here or anywhere else.
  IF NOT _ignore_gtm AND NOT public.plan_allows_gtm(_target_plan) THEN
    SELECT EXISTS(
      SELECT 1 FROM public.portfolio_tracking_settings WHERE beautician_profile_id = _bp_id
    ) INTO _gtm_exists;
    module := 'gtm_tracking';
    current_count := CASE WHEN _gtm_exists THEN 1 ELSE 0 END;
    limit_count := 0;
    compatible := NOT _gtm_exists;
    RETURN NEXT;
  END IF;
END;
$$;

-- Small mirror of src/lib/plan-limits.ts's planAllowsGtm() / GTM_MIN_PLAN
-- ("silver") — kept as its own tiny named function (not inlined) so the
-- single literal threshold is visible and grep-able in one place, same
-- spirit as commercial_grace_period().
CREATE OR REPLACE FUNCTION public.plan_allows_gtm(_plan public.portfolio_plan)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT _plan IN ('silver','gold','platinum');
$$;

REVOKE ALL ON FUNCTION public.check_plan_compatibility(UUID, public.portfolio_plan, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_plan_compatibility(UUID, public.portfolio_plan, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.check_plan_compatibility(UUID, public.portfolio_plan, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_plan_compatibility(UUID, public.portfolio_plan, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.plan_allows_gtm(public.portfolio_plan) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_allows_gtm(public.portfolio_plan) TO service_role;

-- ============================================================
-- 8. Canonical reconciliation authority
-- ============================================================
-- Idempotent; row-locks the target profile first so concurrent
-- reconciliation attempts for the SAME profile serialize safely without
-- an external lock manager. Increments commercial_state_version only when
-- the stored commercial state actually changes. Never deletes/unpublishes
-- content, never mutates `status` (publication choice stays entirely the
-- professional's own setting).
CREATE OR REPLACE FUNCTION public.reconcile_commercial_state(_bp_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.beautician_profiles%ROWTYPE;
  _compatible BOOLEAN;
BEGIN
  SELECT * INTO _row FROM public.beautician_profiles WHERE id = _bp_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- FREE: nothing to reconcile.
  IF _row.plan = 'free' THEN
    RETURN;
  END IF;

  -- MANUAL, NON-EXPIRING: a permanent Admin/manual grant. Valid, no-op.
  -- (plan_source='manual' is the ONLY source permitted a NULL expiry — see
  -- bp_plan_source_paid_has_expiry below.)
  IF _row.plan_source = 'manual' AND _row.plan_expires_at IS NULL THEN
    RETURN;
  END IF;

  -- Paid-expiry patch: by elimination, reaching here with a NULL expiry
  -- means plan_source='paid' with no expiry recorded — 'free' already
  -- returned above, and 'manual' + NULL expiry was just handled as the
  -- one valid permanent-grant case. plan_source='paid' NEVER has a
  -- legitimate permanent form: a fixed-duration paid purchase always
  -- produces an expiry by definition, and bp_plan_source_paid_has_expiry
  -- now makes this structurally impossible for any row written after
  -- this migration. This branch is therefore defensive-only — it must
  -- never silently invent an expiry, never guess "still active", and
  -- never alter entitlement automatically. It refuses reconciliation with
  -- a controlled exception so the failure is loud and logged (for
  -- support), and the public loader's already-implemented fail-closed
  -- safety path (ensurePublicAccessSafe() / is_commercial_access_current())
  -- takes over from there rather than this function guessing at a policy.
  IF _row.plan_expires_at IS NULL THEN
    RAISE EXCEPTION
      'Inconsistent commercial state for profile %: plan_source=paid with no plan_expires_at recorded — refusing to reconcile automatically.',
      _bp_id
      USING ERRCODE = 'P0001';
  END IF;

  -- PAID/MANUAL ACTIVE: expiry still in the future. No-op.
  IF _row.plan_expires_at > now() THEN
    RETURN;
  END IF;

  -- GRACE: expiry passed but still within the grace window. Retain
  -- current plan and visibility unchanged.
  IF now() <= _row.plan_expires_at + public.commercial_grace_period() THEN
    RETURN;
  END IF;

  -- GRACE ENDED. Evaluate Free-compatibility, ignoring GTM (dormant GTM
  -- must never block automatic expiry-to-Free).
  SELECT bool_and(compatible) INTO _compatible
    FROM public.check_plan_compatibility(_bp_id, 'free', true);

  IF _compatible THEN
    -- FREE-COMPATIBLE: drop to Free cleanly, no hold. Content, media, and
    -- the professional's own publication choice (`status`) are untouched.
    UPDATE public.beautician_profiles
      SET plan = 'free',
          plan_source = 'free',
          plan_expires_at = NULL,
          billing_hold = false,
          commercial_state_version = commercial_state_version + 1
      WHERE id = _bp_id;
  ELSE
    -- FREE-INCOMPATIBLE: `plan` is corrected to 'free' immediately (it is
    -- the live entitlement authority, never a place to keep a stale paid
    -- tier as implicit history — that history lives permanently in
    -- billing_orders/payments instead). billing_hold=true removes public
    -- visibility only; every piece of content, and the professional's own
    -- publication choice, remains exactly as it was.
    UPDATE public.beautician_profiles
      SET plan = 'free',
          plan_source = 'free',
          plan_expires_at = NULL,
          billing_hold = true,
          commercial_state_version = commercial_state_version + 1
      WHERE id = _bp_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_commercial_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_commercial_state(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_commercial_state(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_commercial_state(UUID) TO service_role;

-- ============================================================
-- 8a. Public-safety fallback: is current stored state safe to serve
--     WITHOUT running reconciliation? (final QA-gate patch)
-- ============================================================
-- Narrow, read-only, purely time/hold-based check — deliberately NOT a
-- second Free-compatibility engine. It answers only "would reconciliation,
-- if it ran right now, leave this profile in a publicly-servable state",
-- by mirroring reconcile_commercial_state()'s own branches exactly
-- (including its refusal to treat plan_source='paid' with a NULL expiry
-- as anything other than unsafe) — never an independently invented,
-- stricter, or looser policy. Uses the SAME commercial_grace_period()
-- helper — one authoritative grace definition, never a second 7-day
-- literal.
--
-- Paid-expiry patch: the prior rule "non-Free, non-permanent-manual, NULL
-- expiry = safe" is WITHDRAWN. reconcile_commercial_state() now refuses
-- (raises) on exactly that state rather than treating it as active, so
-- this function must agree: such a row is unsafe, not safe.
--
-- Exists so the public loader can fail CLOSED (never serve stale/expired
-- paid access) when reconcile_commercial_state() itself fails, instead of
-- either (a) blindly trusting whatever is currently stored, or (b)
-- recomputing Free-compatibility independently in TypeScript — both of
-- which this migration's design explicitly forbids.
CREATE OR REPLACE FUNCTION public.is_commercial_access_current(_bp_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.beautician_profiles%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.beautician_profiles WHERE id = _bp_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Already held: never safe, regardless of anything else.
  IF _row.billing_hold THEN
    RETURN false;
  END IF;

  -- FREE: always safe.
  IF _row.plan = 'free' THEN
    RETURN true;
  END IF;

  -- MANUAL, NON-EXPIRING: a permanent Admin/manual grant. Safe. This is
  -- the ONLY plan_source permitted a NULL expiry (bp_plan_source_paid_
  -- has_expiry enforces the same rule for 'paid' at the DB level).
  IF _row.plan_source = 'manual' AND _row.plan_expires_at IS NULL THEN
    RETURN true;
  END IF;

  -- WITHDRAWN (paid-expiry patch): this used to return true here for any
  -- non-Free, non-permanent-manual row with a NULL expiry. That rule is
  -- removed — reaching this point with a NULL expiry now means
  -- plan_source='paid' with no expiry recorded, an inconsistent state
  -- reconcile_commercial_state() refuses to reconcile (raises) rather
  -- than treating as active. This function must agree: unsafe, matching
  -- what reconciliation would actually do (fail), never a policy this
  -- function invents independently.
  IF _row.plan_expires_at IS NULL THEN
    RETURN false;
  END IF;

  -- PAID/MANUAL ACTIVE or within grace: safe. Past grace: unsafe — a
  -- correction to Free (possibly a hold) is due and has not yet run.
  RETURN now() <= _row.plan_expires_at + public.commercial_grace_period();
END;
$$;

REVOKE ALL ON FUNCTION public.is_commercial_access_current(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_commercial_access_current(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.is_commercial_access_current(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_commercial_access_current(UUID) TO service_role;

-- ============================================================
-- 9. Own-billing summary RPC (curated, professional-facing)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_own_billing_summary(_bp_id UUID)
RETURNS TABLE(
  order_id          UUID,
  plan              public.portfolio_plan,
  billing_cycle     public.billing_cycle,
  amount_paise      INTEGER,
  currency          TEXT,
  status            public.billing_order_status,
  created_at        TIMESTAMPTZ,
  activated_at      TIMESTAMPTZ,
  access_starts_at  TIMESTAMPTZ,
  access_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.owns_beautician_profile(_bp_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT o.id, o.plan, o.billing_cycle, o.amount_paise, o.currency, o.status,
         o.created_at, o.activated_at, o.access_starts_at, o.access_expires_at
  FROM public.billing_orders o
  WHERE o.beautician_profile_id = _bp_id
  ORDER BY o.created_at DESC;
END;
$$;

-- Curated by construction: raw_gateway_payload, billing_events.payload,
-- webhook headers/signatures, and last_error never appear in this return
-- shape — there is no column for them to leak through.
REVOKE ALL ON FUNCTION public.get_own_billing_summary(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_own_billing_summary(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_own_billing_summary(UUID) TO authenticated;

-- ============================================================
-- 10. RLS + explicit privileges — zero professional/anon table access
-- ============================================================
ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events  ENABLE ROW LEVEL SECURITY;

-- No CREATE POLICY grants SELECT/INSERT/UPDATE/DELETE to `authenticated`
-- on any of the three tables — RLS enabled with zero matching policies for
-- a role means that role gets zero rows/zero writes by default. Every
-- professional-facing read goes through get_own_billing_summary() above;
-- Admin support access is a future controlled RPC, not a blanket policy.
REVOKE ALL ON public.billing_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payments        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.billing_events  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.billing_orders TO service_role;
GRANT ALL ON public.payments        TO service_role;
GRANT ALL ON public.billing_events  TO service_role;

-- ============================================================
-- 11. Billing-hold -> Free recovery authority (foundation completeness)
-- ============================================================
-- The approved lifecycle never auto-clears billing_hold merely because
-- content becomes Free-compatible again — the professional must
-- explicitly choose "Continue on Free". This is that one trusted
-- authority. Idempotent: already-resolved (billing_hold already false) is
-- a safe no-op, never an error. Ownership/Admin is verified in-function,
-- the same pattern as get_own_billing_summary() — a professional may act
-- only on their own portfolio; Admin may act on any.
CREATE OR REPLACE FUNCTION public.confirm_continue_on_free(_bp_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.beautician_profiles%ROWTYPE;
  _blockers TEXT;
BEGIN
  IF NOT (public.owns_beautician_profile(_bp_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO _row FROM public.beautician_profiles WHERE id = _bp_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- Idempotent: nothing to resolve (never held, or already resolved by an
  -- Admin plan change / a prior successful call) is a safe no-op.
  IF NOT _row.billing_hold THEN
    RETURN;
  END IF;

  -- Should be structurally impossible given bp_billing_hold_implies_free,
  -- but defensive rather than assumed.
  IF _row.plan <> 'free' THEN
    RAISE EXCEPTION 'profile is not currently on the free plan' USING ERRCODE = 'P0001';
  END IF;

  -- Canonical compatibility engine, same call reconcile_commercial_state()
  -- makes at grace end — never a second, independent recomputation.
  SELECT string_agg(
    format('%s (%s of %s allowed)', module, current_count, limit_count), '; '
  ) INTO _blockers
  FROM public.check_plan_compatibility(_bp_id, 'free', true)
  WHERE NOT compatible;

  IF _blockers IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot continue on Free yet — remove excess content first: %', _blockers
      USING ERRCODE = 'P0001';
  END IF;

  -- plan/plan_source/plan_expires_at are already 'free'/'free'/NULL from
  -- the hold-entry write in reconcile_commercial_state() — only
  -- billing_hold and the version change here. `status` (publication
  -- choice) is never touched; no content is ever deleted by this function.
  UPDATE public.beautician_profiles
    SET billing_hold = false,
        commercial_state_version = commercial_state_version + 1
    WHERE id = _bp_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_continue_on_free(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_continue_on_free(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_continue_on_free(UUID) TO authenticated;

COMMIT;
