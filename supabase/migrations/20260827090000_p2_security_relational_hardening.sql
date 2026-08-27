-- Phase 3I.2 — Database-side P2 security + relational integrity hardening.
-- Three independent, minimal changes, each closing one confirmed P2 finding
-- from Phase 3H.2E / 3H.2F / 3I.1 / 3I.1A. No RLS-shape change, no table/
-- column change, no weakening of any existing ownership check.

-- =====================================================================
-- A + B. Storage INSERT/DELETE namespace hardening
-- Aligns portfolio_media_owner_insert / portfolio_media_owner_delete with
-- the already-correct portfolio_media_owner_update policy: requires the
-- first storage path segment to be 'profiles', in addition to the
-- existing profile-slug ownership check on the second segment (still via
-- owns_beautician_profile_by_slug — unchanged, ownership never weakened).
-- Closes the arbitrary-top-level-folder gap confirmed in Phase 3H.2E — no
-- cross-profile risk ever existed there; this is namespace hygiene only.
-- SELECT/public-read (portfolio_media_public_read) is untouched.
-- =====================================================================

DROP POLICY IF EXISTS portfolio_media_owner_insert ON storage.objects;
CREATE POLICY portfolio_media_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio-media'
    AND (storage.foldername(name))[1] = 'profiles'
    AND owns_beautician_profile_by_slug((storage.foldername(name))[2])
  );

DROP POLICY IF EXISTS portfolio_media_owner_delete ON storage.objects;
CREATE POLICY portfolio_media_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio-media'
    AND (storage.foldername(name))[1] = 'profiles'
    AND owns_beautician_profile_by_slug((storage.foldername(name))[2])
  );

-- =====================================================================
-- C. submit_lead — service/package relational-integrity hardening
-- Both overloads: before persisting _service_id/_package_id, verify each
-- belongs to the resolved target beautician profile (_bp). An invalid or
-- cross-profile reference is normalized to NULL rather than rejecting the
-- enquiry — the public lead-capture flow must never fail over a secondary
-- metadata field the visitor doesn't directly control (normally resolved
-- from the profile's own service dropdown; only a crafted direct RPC call
-- could ever supply a mismatched value). Phase 3H.2F / 3I.1 / 3I.1A
-- finding. Every other validated behavior (name/phone requirement, 8-15
-- digit phone, per-profile customer dedup, 5-minute idempotency,
-- attribution sanitization, lead_inquiry_services linkage) is unchanged.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.submit_lead(_slug text, _name text, _phone text, _email text DEFAULT NULL::text, _message text DEFAULT NULL::text, _event_date date DEFAULT NULL::date, _location text DEFAULT NULL::text, _service_id uuid DEFAULT NULL::uuid, _package_id uuid DEFAULT NULL::uuid, _source text DEFAULT 'portfolio'::text, _service_requested text DEFAULT NULL::text)
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

  -- Phase 3I.2 — never let a service/package reference cross a
  -- beautician-profile boundary. Normalize to NULL, never reject.
  IF _service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.services s WHERE s.id = _service_id AND s.beautician_profile_id = _bp
  ) THEN
    _service_id := NULL;
  END IF;
  IF _package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.packages p WHERE p.id = _package_id AND p.beautician_profile_id = _bp
  ) THEN
    _package_id := NULL;
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

CREATE OR REPLACE FUNCTION public.submit_lead(_slug text, _name text, _phone text, _email text DEFAULT NULL::text, _message text DEFAULT NULL::text, _event_date date DEFAULT NULL::date, _location text DEFAULT NULL::text, _service_id uuid DEFAULT NULL::uuid, _package_id uuid DEFAULT NULL::uuid, _source text DEFAULT 'portfolio'::text, _service_requested text DEFAULT NULL::text, _utm_source text DEFAULT NULL::text, _utm_medium text DEFAULT NULL::text, _utm_campaign text DEFAULT NULL::text, _utm_content text DEFAULT NULL::text, _utm_term text DEFAULT NULL::text, _landing_path text DEFAULT NULL::text, _conversion_path text DEFAULT NULL::text, _referrer_host text DEFAULT NULL::text, _cta_location text DEFAULT NULL::text)
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

  -- Phase 3I.2 — same relational-integrity guard as the 11-arg overload.
  IF _service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.services s WHERE s.id = _service_id AND s.beautician_profile_id = _bp
  ) THEN
    _service_id := NULL;
  END IF;
  IF _package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.packages p WHERE p.id = _package_id AND p.beautician_profile_id = _bp
  ) THEN
    _package_id := NULL;
  END IF;

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

-- =====================================================================
-- D. SECURITY DEFINER grant hygiene — has_role / log_admin_action
--
-- has_role(_user_id uuid, _role app_role): live dependency-graph audit
-- (Phase 3I.2) confirmed it is referenced inside 10 RLS policies across 6
-- tables (audit_logs, beautician_profiles x3, profiles, service_categories,
-- specializations, user_roles x3) — every one of them scoped to
-- {authenticated} only; none apply to anon. authenticated EXECUTE is
-- therefore load-bearing for RLS evaluation and MUST be preserved. Only
-- the unnecessary PUBLIC/anon grant (no legitimate anon caller or anon-
-- facing policy depends on it) is removed.
--
-- log_admin_action(...): confirmed zero RLS-policy dependents and zero
-- function-body dependents anywhere in the public schema (its only
-- caller is the authenticated admin dashboard). Its internal
-- has_role(auth.uid(),'admin') self-check is unchanged and remains as
-- defense-in-depth regardless of this grant change.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(admin_audit_action, admin_audit_entity_type, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(admin_audit_action, admin_audit_entity_type, uuid, jsonb, jsonb, jsonb) TO authenticated, service_role;

-- =====================================================================
-- ROLLBACK (manual, if ever needed — not executed by this migration):
--
-- DROP POLICY portfolio_media_owner_insert ON storage.objects;
-- CREATE POLICY portfolio_media_owner_insert ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'portfolio-media' AND owns_beautician_profile_by_slug((storage.foldername(name))[2]));
--
-- DROP POLICY portfolio_media_owner_delete ON storage.objects;
-- CREATE POLICY portfolio_media_owner_delete ON storage.objects
--   FOR DELETE TO authenticated
--   USING (bucket_id = 'portfolio-media' AND owns_beautician_profile_by_slug((storage.foldername(name))[2]));
--
-- Re-apply the previous submit_lead bodies from
-- 20260825220000_lead_inquiries_attribution.sql (pre-guard version).
--
-- GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.log_admin_action(admin_audit_action, admin_audit_entity_type, uuid, jsonb, jsonb, jsonb) TO PUBLIC;
-- =====================================================================
