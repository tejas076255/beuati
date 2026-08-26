-- Phase 3G.1A: submit_lead() authoritative phone validation + customer
-- deduplication.
--
-- Root cause audit: submit_lead() previously only checked that _phone was
-- non-empty (coalesce(trim(_phone),'') = '') and unconditionally INSERTed a
-- new `leads` row on every call. Manual testing confirmed both real bugs:
--   1. Non-numeric strings ("Singh", "Shukla", "Shah", "dd") were accepted
--      as valid phone values, since no format check existed anywhere —
--      not client-side, and (critically) not server-side either, so a
--      crafted request could always bypass any browser-only validation.
--   2. The same person submitting twice (even with identical, valid data)
--      always created a second, unrelated `leads` row instead of reusing
--      the existing customer + adding a new `lead_inquiries` row — the
--      lead/lead_inquiries "one customer, many enquiries" architecture
--      already existed but was never actually used for repeat customers.
--
-- Fix, entirely inside this function (no new tables/columns):
--   - Reject phone values that don't normalize (digits only) to 8-15
--     digits — a deliberately country-agnostic range, not hardcoded to
--     India's 10-digit mobile format, per the audit's explicit instruction.
--     Comparison/validation normalizes with regexp_replace(_phone,
--     '\D','','g'); the STORED value is left as the beautician's own
--     typed formatting (trimmed), matching the existing convention already
--     used for beautician_profiles.phone/whatsapp_number (human-readable
--     storage, digits-only stripping only where actually needed for
--     comparison/links).
--   - Match an existing customer within the SAME beautician profile by
--     comparing normalized phone digits (never across profiles — always
--     scoped by the _bp resolved from the published _slug, identical to
--     the existing ownership model). If found, reuse that lead row: update
--     its top-level snapshot (name/phone/service/event/location/message)
--     to the latest enquiry and insert a new `lead_inquiries` row under it
--     — a genuine repeat enquiry, not a new customer.
--   - Accidental-duplicate guard: if the matched lead already has a
--     lead_inquiries row for the same event_date + service_requested tag
--     created within the last 5 minutes, treat this call as idempotent —
--     return the existing lead id without inserting a second identical
--     inquiry. A different service/date, or the same one more than 5
--     minutes later, is treated as a legitimate new enquiry.
--
-- Known limitation (documented, not silently "fixed" with a fragile
-- heuristic): normalizing "+91 83206 99679" and "8320699679" both strip to
-- digits-only, but the country-code prefix means they don't reduce to the
-- identical digit string, so the same real number typed with vs. without a
-- country code will not be matched as the same customer. Stripping a
-- specific country code would require assuming India-only usage, which the
-- audit explicitly said not to hardcode. Left as a known gap rather than
-- guessed at.
CREATE OR REPLACE FUNCTION public.submit_lead(
  _slug text,
  _name text,
  _phone text,
  _email text DEFAULT NULL::text,
  _message text DEFAULT NULL::text,
  _event_date date DEFAULT NULL::date,
  _location text DEFAULT NULL::text,
  _service_id uuid DEFAULT NULL::uuid,
  _package_id uuid DEFAULT NULL::uuid,
  _source text DEFAULT 'portfolio'::text,
  _service_requested text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bp UUID;
  _id UUID;
  _inquiry_id UUID;
  _normalized_phone TEXT;
  _existing_lead_id UUID;
  _recent_duplicate_id UUID;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  _normalized_phone := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF length(_normalized_phone) < 8 OR length(_normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Enter a valid phone number.';
  END IF;

  SELECT id INTO _existing_lead_id
  FROM public.leads
  WHERE beautician_profile_id = _bp
    AND regexp_replace(coalesce(phone,''), '\D', '', 'g') = _normalized_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF _existing_lead_id IS NOT NULL THEN
    SELECT li.id INTO _recent_duplicate_id
    FROM public.lead_inquiries li
    WHERE li.lead_id = _existing_lead_id
      AND li.created_at > now() - interval '5 minutes'
      AND coalesce(li.event_date, '0001-01-01'::date) = coalesce(_event_date, '0001-01-01'::date)
      AND (
        (coalesce(trim(_service_requested), '') = '' AND NOT EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis WHERE lis.inquiry_id = li.id
        ))
        OR EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis
          WHERE lis.inquiry_id = li.id AND lis.service_tag = trim(coalesce(_service_requested, ''))
        )
      )
    ORDER BY li.created_at DESC
    LIMIT 1;

    IF _recent_duplicate_id IS NOT NULL THEN
      RETURN _existing_lead_id;
    END IF;
  END IF;

  IF _existing_lead_id IS NOT NULL THEN
    _id := _existing_lead_id;
    UPDATE public.leads SET
      name = left(trim(_name), 120),
      phone = left(trim(_phone), 32),
      email = coalesce(nullif(left(coalesce(_email,''),160), ''), email),
      service_id = coalesce(_service_id, service_id),
      package_id = coalesce(_package_id, package_id),
      event_date = coalesce(_event_date, event_date),
      location = coalesce(nullif(left(coalesce(_location,''),160), ''), location),
      message = coalesce(nullif(left(coalesce(_message,''),2000), ''), message),
      service_requested = coalesce(nullif(left(coalesce(_service_requested,''),160), ''), service_requested),
      updated_at = now()
    WHERE id = _id;
  ELSE
    INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source, service_requested)
    VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40), left(coalesce(_service_requested,''),160))
    RETURNING id INTO _id;
  END IF;

  INSERT INTO public.lead_inquiries (lead_id, event_date, venue_area, requirement)
  VALUES (_id, _event_date, NULLIF(trim(coalesce(_location,'')),''), NULLIF(trim(coalesce(_message,'')),''))
  RETURNING id INTO _inquiry_id;

  IF coalesce(trim(_service_requested),'') <> '' THEN
    INSERT INTO public.lead_inquiry_services (inquiry_id, service_tag) VALUES (_inquiry_id, trim(_service_requested));
  END IF;

  INSERT INTO public.lead_activities (lead_id, activity_type, channel, direction, body)
  VALUES (
    _id, 'note', 'manual', 'inbound',
    CASE
      WHEN _existing_lead_id IS NOT NULL THEN 'New enquiry received via public portfolio (repeat customer).'
      ELSE 'Enquiry received via public portfolio.'
    END
  );

  RETURN _id;
END;
$function$;
