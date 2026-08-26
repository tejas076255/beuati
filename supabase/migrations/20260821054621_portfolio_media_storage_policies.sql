-- Phase 2 Step 1: Storage policy foundation for the portfolio-media bucket.
--
-- Live inspection (2026-08-21, confirmed by project owner via the Supabase
-- dashboard) found the bucket public with ZERO storage.objects policies of
-- any kind — not even the read policy the original setup-portfolio-media-
-- bucket.sql script intended, despite that file being tracked in this repo.
-- This migration is the first one to actually apply Storage policies via a
-- tracked, reproducible migration file.
--
-- Exactly 4 new SQL objects are created: 1 function + 3 policies.
--
-- owns_beautician_profile_by_slug(): storage.objects only exposes the
-- object's path (`name`) and bucket_id — not a beautician_profile_id — so
-- the existing owns_beautician_profile(_bp_id UUID) can't be called
-- directly from a Storage policy. This is the identical ownership query,
-- just keyed by slug (the second path segment in
-- profiles/{slug}/{category}/{filename}) instead of a UUID, including the
-- same admin bypass every other ownership check in this schema already has.
CREATE OR REPLACE FUNCTION public.owns_beautician_profile_by_slug(_slug TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beautician_profiles bp
    JOIN public.profiles p ON p.id = bp.profile_id
    WHERE bp.slug = _slug AND p.auth_user_id = auth.uid()
  ) OR public.has_role(auth.uid(),'admin');
$$;

-- Public read — re-affirms what setup-portfolio-media-bucket.sql intended
-- but which the live project never actually had.
DROP POLICY IF EXISTS "portfolio_media_public_read" ON storage.objects;
CREATE POLICY "portfolio_media_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'portfolio-media');

-- Owner-scoped insert. No UPDATE policy: uploads always use upsert:false
-- with a Date.now()-unique path (confirmed in src/lib/storage-upload.ts),
-- so no code path ever overwrites an existing object in place.
DROP POLICY IF EXISTS "portfolio_media_owner_insert" ON storage.objects;
CREATE POLICY "portfolio_media_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'portfolio-media'
  AND public.owns_beautician_profile_by_slug((storage.foldername(name))[2])
);

-- Owner-scoped delete.
DROP POLICY IF EXISTS "portfolio_media_owner_delete" ON storage.objects;
CREATE POLICY "portfolio_media_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'portfolio-media'
  AND public.owns_beautician_profile_by_slug((storage.foldername(name))[2])
);
