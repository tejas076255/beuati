-- Phase 3G.3A — persistent enquiry-level attribution.
--
-- Attribution belongs to the ENQUIRY, not the customer: one customer can
-- submit many enquiries from different acquisition channels over time, and
-- each one must remain separately attributable (a repeat customer's second
-- enquiry from a Google Ads click must not silently inherit their first
-- enquiry's "Google Organic" attribution). leads.source remains untouched —
-- it continues to behave exactly as it does today (a customer-level
-- snapshot, set once on first insert, never overwritten on reuse).
-- lead_inquiries.source below is the new, authoritative per-enquiry value.
--
-- All 10 new columns are nullable — historical rows get NULL, never
-- fabricated "Direct"/"Portfolio" guesses. No column here is exposed to
-- RLS decisions, ownership checks, or any security-relevant logic — the
-- existing lead_inquiries_owner_all policy already scopes access by
-- lead_id -> leads.beautician_profile_id and needs no change (row-level,
-- not column-level).
ALTER TABLE public.lead_inquiries
  ADD COLUMN source text,
  ADD COLUMN utm_source text,
  ADD COLUMN utm_medium text,
  ADD COLUMN utm_campaign text,
  ADD COLUMN utm_content text,
  ADD COLUMN utm_term text,
  ADD COLUMN landing_path text,
  ADD COLUMN conversion_path text,
  ADD COLUMN referrer_host text,
  ADD COLUMN cta_location text;

-- submit_lead() now accepts and persists the enquiry-level attribution
-- snapshot. All new parameters are optional/nullable (never breaks a
-- caller that omits them) and are sanitized server-side — control
-- characters stripped, length-capped — since this is untrusted client
-- input (Phase 3G.3A §13/§25). Attribution never influences the
-- beautician_profile_id lookup, the phone-based customer match, or the
-- 5-minute idempotency window above it — those checks are unchanged from
-- the Phase 3G.1A version.
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
  _service_requested text DEFAULT NULL::text,
  _utm_source text DEFAULT NULL::text,
  _utm_medium text DEFAULT NULL::text,
  _utm_campaign text DEFAULT NULL::text,
  _utm_content text DEFAULT NULL::text,
  _utm_term text DEFAULT NULL::text,
  _landing_path text DEFAULT NULL::text,
  _conversion_path text DEFAULT NULL::text,
  _referrer_host text DEFAULT NULL::text,
  _cta_location text DEFAULT NULL::text
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
  _clean_source TEXT;
  _clean_utm_source TEXT;
  _clean_utm_medium TEXT;
  _clean_utm_campaign TEXT;
  _clean_utm_content TEXT;
  _clean_utm_term TEXT;
  _clean_landing_path TEXT;
  _clean_conversion_path TEXT;
  _clean_referrer_host TEXT;
  _clean_cta_location TEXT;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  _normalized_phone := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF length(_normalized_phone) < 8 OR length(_normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Enter a valid phone number.';
  END IF;

  -- Server-side sanitization of untrusted attribution input (§6/§13/§25):
  -- strip control characters, cap length, collapse blank strings to NULL.
  -- Never trusts the browser alone; never allowed to affect ownership.
  _clean_source := NULLIF(left(regexp_replace(coalesce(_source,''), '[[:cntrl:]]', '', 'g'), 50), '');
  _clean_utm_source := NULLIF(left(regexp_replace(coalesce(_utm_source,''), '[[:cntrl:]]', '', 'g'), 120), '');
  _clean_utm_medium := NULLIF(left(regexp_replace(coalesce(_utm_medium,''), '[[:cntrl:]]', '', 'g'), 120), '');
  _clean_utm_campaign := NULLIF(left(regexp_replace(coalesce(_utm_campaign,''), '[[:cntrl:]]', '', 'g'), 200), '');
  _clean_utm_content := NULLIF(left(regexp_replace(coalesce(_utm_content,''), '[[:cntrl:]]', '', 'g'), 200), '');
  _clean_utm_term := NULLIF(left(regexp_replace(coalesce(_utm_term,''), '[[:cntrl:]]', '', 'g'), 200), '');
  _clean_landing_path := NULLIF(left(regexp_replace(coalesce(_landing_path,''), '[[:cntrl:]]', '', 'g'), 500), '');
  _clean_conversion_path := NULLIF(left(regexp_replace(coalesce(_conversion_path,''), '[[:cntrl:]]', '', 'g'), 500), '');
  _clean_referrer_host := NULLIF(left(regexp_replace(coalesce(_referrer_host,''), '[[:cntrl:]]', '', 'g'), 253), '');
  _clean_cta_location := NULLIF(left(regexp_replace(coalesce(_cta_location,''), '[[:cntrl:]]', '', 'g'), 80), '');

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

    -- Duplicate protection is unchanged (§24) — identity/timing/service
    -- match alone decides this; differing attribution never creates or
    -- blocks a duplicate decision either way.
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

  -- Every NEW enquiry gets its own attribution snapshot (§20) — this insert
  -- always fires fresh per submission (the 5-minute duplicate check above
  -- already returned early for true duplicates), so a repeat customer's
  -- second, differently-attributed enquiry is never merged with their first.
  INSERT INTO public.lead_inquiries (
    lead_id, event_date, venue_area, requirement,
    source, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    landing_path, conversion_path, referrer_host, cta_location
  )
  VALUES (
    _id, _event_date, NULLIF(trim(coalesce(_location,'')),''), NULLIF(trim(coalesce(_message,'')),''),
    coalesce(_clean_source, 'portfolio'), _clean_utm_source, _clean_utm_medium, _clean_utm_campaign,
    _clean_utm_content, _clean_utm_term, _clean_landing_path, _clean_conversion_path,
    _clean_referrer_host, _clean_cta_location
  )
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
