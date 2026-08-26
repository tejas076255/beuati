-- Storage URL origin rewrite — FUTURE TOOLING, NOT FOR EXECUTION NOW.
--
-- Prepared during Phase 3F.4A.1 as a ready-to-use script for the day a real
-- backend migration is approved. Do not run this against the live database
-- as part of routine work — it is documentation/tooling only until a
-- migration is explicitly decided and its target origin is known.
--
-- Purpose: rewrite the 3 columns identified in
-- docs/architecture/backend-portability.md §14 as storing absolute,
-- backend-specific Supabase Storage URLs, so they point at a new project's
-- origin after a migration — while leaving every other URL (YouTube,
-- Instagram, relative storage_path values) completely untouched.
--
-- Affected columns (bucket/path segment is always preserved verbatim —
-- only the scheme+host origin is ever replaced):
--   beautician_profiles.profile_image_url
--   beautician_profiles.cover_image_url
--   portfolio_videos.thumbnail_url
--
-- Explicitly NEVER touched by this script (do not extend it to these):
--   portfolio_videos.video_url        — external platform URL (YouTube/Instagram), not backend-specific
--   portfolio_images.public_url       — already NULL on every row; app resolves storage_path dynamically
--   before_after_images.public_url    — same as above
--   any *.storage_path column         — already a relative path, portable as-is
--
-- Usage:
--   1. Replace :old_origin and :new_origin below with the real values
--      (e.g. 'https://ivbujlyilzmlublqzalu.supabase.co' and the
--      destination project's origin).
--   2. Run the DRY-RUN section first. It only SELECTs — makes no changes —
--      and reports exactly which rows would be affected and the before/after
--      value, so you can eyeball it before touching anything.
--   3. Only after reviewing the dry-run output, run the UPDATE section.
--   4. Re-run the dry-run afterward — it should report 0 affected rows,
--      confirming completion. Running the UPDATE section a second time is
--      a safe no-op (idempotent): once a row's origin no longer matches
--      :old_origin, the WHERE clause simply excludes it.

-- ===================== DRY RUN (safe — read only) =====================

-- \set old_origin 'https://ivbujlyilzmlublqzalu.supabase.co'
-- \set new_origin 'https://REPLACE-WITH-DESTINATION-PROJECT.supabase.co'

SELECT
  'beautician_profiles.profile_image_url' AS column_name,
  count(*) AS rows_affected
FROM public.beautician_profiles
WHERE profile_image_url LIKE :'old_origin' || '/%'
UNION ALL
SELECT
  'beautician_profiles.cover_image_url',
  count(*)
FROM public.beautician_profiles
WHERE cover_image_url LIKE :'old_origin' || '/%'
UNION ALL
SELECT
  'portfolio_videos.thumbnail_url',
  count(*)
FROM public.portfolio_videos
WHERE thumbnail_url LIKE :'old_origin' || '/%';

-- Row-level preview (before/after), profile_image_url example — repeat the
-- same shape for cover_image_url and portfolio_videos.thumbnail_url:
SELECT
  id,
  profile_image_url AS before_value,
  regexp_replace(profile_image_url, '^' || :'old_origin', :'new_origin') AS after_value
FROM public.beautician_profiles
WHERE profile_image_url LIKE :'old_origin' || '/%';

-- ===================== ACTUAL REWRITE (destructive — only run after review) =====================
-- Uncomment to execute. Each statement only touches rows whose value
-- currently starts with :old_origin — already-migrated or never-set rows
-- are left alone, which is what makes re-running this safe.

-- UPDATE public.beautician_profiles
-- SET profile_image_url = regexp_replace(profile_image_url, '^' || :'old_origin', :'new_origin')
-- WHERE profile_image_url LIKE :'old_origin' || '/%';

-- UPDATE public.beautician_profiles
-- SET cover_image_url = regexp_replace(cover_image_url, '^' || :'old_origin', :'new_origin')
-- WHERE cover_image_url LIKE :'old_origin' || '/%';

-- UPDATE public.portfolio_videos
-- SET thumbnail_url = regexp_replace(thumbnail_url, '^' || :'old_origin', :'new_origin')
-- WHERE thumbnail_url LIKE :'old_origin' || '/%';

-- ===================== POST-CHECK =====================
-- Re-run the DRY RUN section's count query above — every count should now
-- read 0, confirming no row still references the old origin.
