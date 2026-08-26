-- BeautyFolio — link uploaded demo media to the dharti-panchal portfolio
-- Run this in the Lovable Cloud SQL editor (same one used for the demo seed
-- and the bucket setup). All paths below are filled in from files already
-- confirmed live via the public Storage API — no placeholders left.
--
-- Actual uploaded structure (profiles/<slug>/... convention):
--   profiles/dharti-panchal/profile/dharti-portrait.jpg
--   profiles/dharti-panchal/gallery/dharti-gallery-4.jpg
--   profiles/dharti-panchal/gallery/dharti-gallery-5.jpg
--   profiles/dharti-panchal/before-after/dharti-gallery-5.jpg  (before)
--   profiles/dharti-panchal/before-after/dharti-gallery-6.jpg  (after)

DO $$
DECLARE
  v_bp_id uuid := 'ee63cce2-ba1d-4104-b13f-dd53753f64aa';
  v_item_id uuid;
  v_ba_id uuid;
BEGIN
  -- 1) Profile image (Phase 4) — plain URL column, not storage_path-based.
  UPDATE public.beautician_profiles
  SET profile_image_url = 'https://ivbujlyilzmlublqzalu.supabase.co/storage/v1/object/public/portfolio-media/profiles/dharti-panchal/profile/dharti-portrait.jpg'
  WHERE id = v_bp_id;

  -- 2) Gallery (Phase 5) — one portfolio_item with 2 images.
  INSERT INTO public.portfolio_items (beautician_profile_id, title, category, is_published, sort_order)
  VALUES (v_bp_id, 'Bridal HD Makeup', 'hd', true, 1)
  RETURNING id INTO v_item_id;

  INSERT INTO public.portfolio_images (portfolio_item_id, storage_path, alt_text, caption, sort_order, is_cover)
  VALUES
    (v_item_id, 'profiles/dharti-panchal/gallery/dharti-gallery-4.jpg', 'HD bridal makeup look', 'HD bridal makeup', 1, true),
    (v_item_id, 'profiles/dharti-panchal/gallery/dharti-gallery-5.jpg', 'Bridal makeup with jewellery', 'Bridal look', 2, false);

  -- 3) Before/after (Phase 6) — one pair.
  INSERT INTO public.before_after_items (beautician_profile_id, title, event_type, location, is_published, sort_order)
  VALUES (v_bp_id, 'HD Bridal Transformation', 'Wedding', 'Ahmedabad', true, 1)
  RETURNING id INTO v_ba_id;

  INSERT INTO public.before_after_images (before_after_id, image_type, storage_path, alt_text, sort_order)
  VALUES
    (v_ba_id, 'before', 'profiles/dharti-panchal/before-after/dharti-gallery-5.jpg', 'Natural look before makeup', 1),
    (v_ba_id, 'after', 'profiles/dharti-panchal/before-after/dharti-gallery-6.jpg', 'Finished bridal makeup look', 1);

  RAISE NOTICE 'Linked demo media for beautician_profile id: %', v_bp_id;
END $$;

-- Phase 7 (video) is intentionally NOT included here: there is no real video
-- asset to link. portfolio_videos.thumbnail_url/video_url/platform columns
-- already support it whenever a real video becomes available — see the
-- final report for details. Do not insert a video row with a fake/borrowed
-- thumbnail just to fill this in.
