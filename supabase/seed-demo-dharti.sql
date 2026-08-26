-- BeautyFolio — demo seed for the "dharti-panchal" portfolio
-- Run this in the Supabase SQL editor (Lovable Cloud dashboard -> Supabase -> SQL Editor).
-- Safe/idempotent-ish: uses is_demo = true so it's identifiable and easy to remove later
-- (see the DELETE block at the bottom). Does NOT touch schema, RLS, or storage.

DO $$
DECLARE
  v_profile_id uuid;
  v_bp_id uuid;
BEGIN
  -- profiles.auth_user_id has no FK to auth.users, so a random UUID is fine for a demo row.
  INSERT INTO public.profiles (auth_user_id, display_name, email)
  VALUES (gen_random_uuid(), 'Dharti Panchal (Demo)', 'demo@example.com')
  RETURNING id INTO v_profile_id;

  INSERT INTO public.beautician_profiles (
    profile_id, slug, display_name, professional_title, short_tagline,
    bio, bio_secondary, primary_city, locality, state, country,
    years_experience, rating, review_count, client_count, is_demo,
    phone, whatsapp_number, email, address, working_hours, travel_note, map_query,
    status
  ) VALUES (
    v_profile_id, 'dharti-panchal', 'Dharti Panchal', 'Bridal Makeup Artist',
    'Bridal & Luxury Makeup',
    'I''m Dharti — I''ve spent the last eight years doing bridal makeup in Ahmedabad, and I still start every wedding the same way: understanding the bride, her outfit and how she wants to feel when she walks in.',
    'My work is skin-first — clean prep, a breathable HD or airbrush base, and detailing built to survive a fourteen-hour function and photograph beautifully.',
    'Ahmedabad', 'Satellite', 'Gujarat', 'India',
    8, 4.9, 214, 600, true,
    '+91 98250 41200', '919825041200', 'hello@dhartipanchal.in',
    '204, Silver Arc, Satellite Road, Ahmedabad, Gujarat 380015',
    'Mon–Sun · 8:00 AM – 9:00 PM (by appointment)',
    'Available for bridal makeup appointments across Ahmedabad and nearby areas, including destination weddings in Gujarat.',
    'Satellite, Ahmedabad, Gujarat',
    'published'
  ) RETURNING id INTO v_bp_id;

  INSERT INTO public.services (beautician_profile_id, name, category, short_description, price, price_type, duration_minutes, sort_order)
  VALUES
    (v_bp_id, 'HD Bridal Makeup', 'Makeup', 'Full face HD base, lashes, hairstyling and draping at your venue.', 18000, 'fixed', 180, 1),
    (v_bp_id, 'Airbrush Bridal Makeup', 'Makeup', 'Weightless airbrush finish built for long shoots and humid mandap mornings.', 22000, 'fixed', 210, 2),
    (v_bp_id, 'Party & Sangeet Makeup', 'Makeup', 'Studio or on-location glam for sangeet, haldi and cocktail nights.', 5500, 'fixed', 90, 3);

  INSERT INTO public.packages (beautician_profile_id, name, price, price_type, note, best_for, inclusions, is_featured, is_popular, sort_order)
  VALUES (
    v_bp_id, 'Complete Bridal Package', 38000, 'fixed', 'Most popular',
    'Full multi-day weddings from haldi to reception',
    ARRAY['Haldi, mehendi, wedding & reception looks','Free trial before the wedding','Airbrush base for the wedding day','Hair, draping & jewellery setting'],
    true, true, 1
  );

  INSERT INTO public.reviews (beautician_profile_id, client_name, rating, review_text, service_name, event_type, review_date, is_verified, is_published)
  VALUES
    (v_bp_id, 'Priya Mehta', 5, 'Best bridal look I could have asked for. The airbrush base held up through a 14-hour day and every photo came out flawless.', 'HD Bridal Makeup', 'Wedding, Ahmedabad', '2026-03-01', true, true),
    (v_bp_id, 'Aisha Khan', 5, 'Booked directly and got a quote in ten minutes. Dharti understood my brief instantly.', 'Reception Makeup', 'Gandhinagar', '2026-02-01', true, true);

  INSERT INTO public.service_areas (beautician_profile_id, city, area_name, is_primary, sort_order)
  VALUES
    (v_bp_id, 'Ahmedabad', 'Satellite', true, 1),
    (v_bp_id, 'Ahmedabad', 'Bodakdev', false, 2),
    (v_bp_id, 'Ahmedabad', 'Prahlad Nagar', false, 3);

  INSERT INTO public.faqs (beautician_profile_id, question, answer, sort_order)
  VALUES
    (v_bp_id, 'How much does bridal makeup cost in Ahmedabad?', 'HD bridal makeup starts at ₹18,000 and airbrush bridal makeup at ₹22,000, including hair, lashes and draping.', 1),
    (v_bp_id, 'Do you travel to the bride''s location?', 'Yes. On-location service across Ahmedabad and nearby areas is included.', 2);

  -- Optional shared reference rows + link them to this demo profile (skipped safely if it fails to find any).
  INSERT INTO public.specializations (name, slug)
  VALUES ('Bridal Makeup', 'bridal-makeup'), ('HD Makeup', 'hd-makeup')
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.beautician_specializations (beautician_profile_id, specialization_id, sort_order)
  SELECT v_bp_id, id, row_number() OVER ()
  FROM public.specializations
  WHERE slug IN ('bridal-makeup', 'hd-makeup');

  RAISE NOTICE 'Seeded demo beautician_profile id: %', v_bp_id;
END $$;

-- ---------------------------------------------------------------------------
-- To remove this demo data later, run:
--
-- DELETE FROM public.beautician_profiles WHERE slug = 'dharti-panchal' AND is_demo = true;
-- (cascades to services/packages/reviews/service_areas/faqs/beautician_specializations)
-- DELETE FROM public.profiles WHERE email = 'demo@example.com';
-- ---------------------------------------------------------------------------
