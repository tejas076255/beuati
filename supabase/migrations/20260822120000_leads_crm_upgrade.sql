-- Phase 3B — Leads → Mini CRM upgrade.
--
-- This script is written to be safely re-runnable: the previous attempt
-- failed partway through (a prior "notes"/"service_requested" migration had
-- never actually been applied), so every step here is guarded so re-running
-- the whole thing from scratch is safe no matter how far the first attempt got.
--
-- Design summary (see chat for full rationale):
--   * `leads` stays the permanent CUSTOMER + pipeline-status record (unchanged
--     columns preserved — nothing dropped, nothing renamed). New convenience
--     columns are added for fast dashboard "who's due" queries.
--   * `lead_inquiries` (NEW) holds the per-enquiry, event-specific details,
--     one-to-many from `leads` — the schema already supports multiple
--     inquiries per customer even though today's UI only creates one per
--     lead submission, matching the "future-ready" requirement.
--   * `lead_inquiry_services` (NEW) is the relational join for the
--     inquiry's multi-select requested services (one row per selected
--     service, not a comma-separated string).
--   * `lead_activities` (NEW) is a single append-only timeline table that
--     covers status changes, logged follow-ups, and free notes alike —
--     exactly the activity_type/channel/direction shape requested for
--     future WhatsApp/SMS automation to plug into later.
--   * `lead_status` enum is extended (not replaced) with 'quoted',
--     'negotiation' and 'completed' so the existing 6 values (and all
--     existing lead rows) keep working unchanged.
--   * Every existing lead is backfilled with one `lead_inquiries` row (and
--     a matching `lead_inquiry_services` row when it already had a
--     `service_requested` value) so old and new leads render identically
--     in the upgraded UI. No existing data is deleted or overwritten.

-- ---------- 1. extend the pipeline status enum ----------
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'quoted' AFTER 'qualified';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'negotiation' AFTER 'quoted';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'completed' AFTER 'booked';

-- ---------- 2. columns on `leads` ----------
-- Source of truth for "next follow-up" / "last contacted" is `lead_activities`;
-- these are denormalized copies kept in sync by the app so the leads list and
-- summary cards don't need a join+aggregate on every render.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  -- `notes` / `service_requested` belong to an earlier Leads migration that
  -- turned out never to have been applied — added here too so this script
  -- is self-contained regardless.
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS service_requested TEXT;

-- ---------- 3. inquiries (event-specific detail, many-to-one with leads) ----------
CREATE TABLE IF NOT EXISTS public.lead_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_date DATE,
  event_type TEXT,
  num_persons INTEGER CHECK (num_persons > 0),
  location_type TEXT CHECK (location_type IN ('studio', 'client_location', 'both')),
  venue_area TEXT,
  requirement TEXT,
  budget NUMERIC CHECK (budget >= 0),
  special_requirements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_inquiries TO authenticated;
GRANT ALL ON public.lead_inquiries TO service_role;
ALTER TABLE public.lead_inquiries ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_lead_inquiries_updated ON public.lead_inquiries;
CREATE TRIGGER trg_lead_inquiries_updated BEFORE UPDATE ON public.lead_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_lead_inquiries_lead ON public.lead_inquiries (lead_id, created_at DESC);
DROP POLICY IF EXISTS "lead_inquiries_owner_all" ON public.lead_inquiries;
CREATE POLICY "lead_inquiries_owner_all" ON public.lead_inquiries FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ));

-- ---------- 4. requested services (multi-select, relational) ----------
CREATE TABLE IF NOT EXISTS public.lead_inquiry_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.lead_inquiries(id) ON DELETE CASCADE,
  -- Free text rather than an FK to `services`: the CRM checklist offers a
  -- centrally-configured set of generic categories plus the beautician's own
  -- catalog (src/lib/lead-config.ts), and the selection must stay legible even
  -- if the beautician later renames or deletes that service.
  service_tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inquiry_id, service_tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_inquiry_services TO authenticated;
GRANT ALL ON public.lead_inquiry_services TO service_role;
ALTER TABLE public.lead_inquiry_services ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lead_inquiry_services_inquiry ON public.lead_inquiry_services (inquiry_id);
DROP POLICY IF EXISTS "lead_inquiry_services_owner_all" ON public.lead_inquiry_services;
CREATE POLICY "lead_inquiry_services_owner_all" ON public.lead_inquiry_services FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lead_inquiries li
    JOIN public.leads l ON l.id = li.lead_id
    WHERE li.id = inquiry_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lead_inquiries li
    JOIN public.leads l ON l.id = li.lead_id
    WHERE li.id = inquiry_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ));

-- ---------- 5. activity timeline (follow-ups, notes, status changes) ----------
DO $$ BEGIN
  CREATE TYPE public.lead_activity_type AS ENUM
    ('call', 'whatsapp', 'sms', 'email', 'note', 'status_change', 'follow_up', 'booking');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.lead_activity_channel AS ENUM ('phone', 'whatsapp', 'sms', 'email', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.lead_activity_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  activity_type public.lead_activity_type NOT NULL,
  channel public.lead_activity_channel,
  direction public.lead_activity_direction,
  -- When the interaction happened (lets a beautician log a call after the
  -- fact); defaults to now() for immediate logging.
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  body TEXT,
  outcome TEXT,
  next_followup_at TIMESTAMPTZ,
  -- Free-form extension point — e.g. {from,to} on a status_change row today,
  -- and the natural place for a future automated-message provider payload
  -- (WhatsApp/SMS message id, delivery status, etc.) without a schema change.
  metadata JSONB,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON public.lead_activities (lead_id, occurred_at DESC);
DROP POLICY IF EXISTS "lead_activities_owner_all" ON public.lead_activities;
CREATE POLICY "lead_activities_owner_all" ON public.lead_activities FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ));

-- ---------- 6. backfill: give every existing lead one inquiry row ----------
-- Guarded with NOT EXISTS so this is safe to re-run without creating
-- duplicate inquiries for leads that were already backfilled.
INSERT INTO public.lead_inquiries (lead_id, event_date, venue_area, requirement, created_at, updated_at)
SELECT l.id, l.event_date, l.location, l.message, l.created_at, l.updated_at
FROM public.leads l
WHERE NOT EXISTS (SELECT 1 FROM public.lead_inquiries li WHERE li.lead_id = l.id);

INSERT INTO public.lead_inquiry_services (inquiry_id, service_tag)
SELECT li.id, l.service_requested
FROM public.lead_inquiries li
JOIN public.leads l ON l.id = li.lead_id
WHERE l.service_requested IS NOT NULL AND trim(l.service_requested) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_inquiry_services s
    WHERE s.inquiry_id = li.id AND s.service_tag = l.service_requested
  );

-- ---------- 7. submit_lead(): also create the initial inquiry + activity ----------
-- Drop every prior signature this function may currently have — the earlier
-- migration that introduced the 11-arg (_service_requested) version may not
-- have run, in which case the original 10-arg version is still live.
DROP FUNCTION IF EXISTS public.submit_lead(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.submit_lead(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_lead(
  _slug TEXT, _name TEXT, _phone TEXT, _email TEXT DEFAULT NULL,
  _message TEXT DEFAULT NULL, _event_date DATE DEFAULT NULL, _location TEXT DEFAULT NULL,
  _service_id UUID DEFAULT NULL, _package_id UUID DEFAULT NULL, _source TEXT DEFAULT 'portfolio',
  _service_requested TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bp UUID; _id UUID; _inquiry_id UUID;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF coalesce(trim(_phone),'') = '' THEN RAISE EXCEPTION 'Phone is required'; END IF;

  INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source, service_requested)
  VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40), left(coalesce(_service_requested,''),160))
  RETURNING id INTO _id;

  INSERT INTO public.lead_inquiries (lead_id, event_date, venue_area, requirement)
  VALUES (_id, _event_date, NULLIF(trim(coalesce(_location,'')),''), NULLIF(trim(coalesce(_message,'')),''))
  RETURNING id INTO _inquiry_id;

  IF coalesce(trim(_service_requested),'') <> '' THEN
    INSERT INTO public.lead_inquiry_services (inquiry_id, service_tag) VALUES (_inquiry_id, trim(_service_requested));
  END IF;

  INSERT INTO public.lead_activities (lead_id, activity_type, channel, direction, body)
  VALUES (_id, 'note', 'manual', 'inbound', 'Enquiry received via public portfolio.');

  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT,TEXT) TO anon, authenticated;
