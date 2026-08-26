-- Phase 3B — Leads module. Reuses the existing `leads` table (already
-- RLS-correct: owner-only SELECT/UPDATE/DELETE, insert only via the
-- SECURITY DEFINER submit_lead() RPC) and the existing `lead_status` enum
-- (new/contacted/qualified/booked/lost/archived — relabeled in the UI as
-- New/Contacted/Follow-up/Converted/Not Interested/Closed, no schema change
-- needed for status). Only two genuinely missing fields are added.

-- Internal notes a beautician keeps on a lead — never shown on the public
-- portfolio, only readable/writable by the lead's owner (existing
-- leads_owner_read / leads_owner_update RLS policies already cover it).
ALTER TABLE public.leads
  ADD COLUMN notes TEXT;

-- Free-text requested service, captured directly from the enquiry form.
-- Kept separate from `service_id` (a real FK to a specific services row,
-- which the public form doesn't currently collect) and from `message`
-- (the customer's free-text note) so each renders as its own field on the
-- lead detail view instead of being concatenated into the message text.
ALTER TABLE public.leads
  ADD COLUMN service_requested TEXT;

-- Postgres treats a different parameter list as a distinct overload rather
-- than replacing this function in place, so the old 10-arg signature must be
-- dropped explicitly — otherwise PostgREST's RPC call-by-name resolution
-- would find two ambiguous overloads and start rejecting every submission.
DROP FUNCTION IF EXISTS public.submit_lead(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.submit_lead(
  _slug TEXT, _name TEXT, _phone TEXT, _email TEXT DEFAULT NULL,
  _message TEXT DEFAULT NULL, _event_date DATE DEFAULT NULL, _location TEXT DEFAULT NULL,
  _service_id UUID DEFAULT NULL, _package_id UUID DEFAULT NULL, _source TEXT DEFAULT 'portfolio',
  _service_requested TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bp UUID; _id UUID;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF coalesce(trim(_phone),'') = '' THEN RAISE EXCEPTION 'Phone is required'; END IF;
  INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source, service_requested)
  VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40), left(coalesce(_service_requested,''),160))
  RETURNING id INTO _id;
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT,TEXT) TO anon, authenticated;
