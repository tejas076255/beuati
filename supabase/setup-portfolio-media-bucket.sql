-- BeautyFolio — portfolio media Storage bucket + read-only policy
-- Run this in the same SQL editor used for the demo data seed
-- (Lovable Cloud dashboard -> Cloud -> SQL editor).
--
-- What this does:
--   1. Creates ONE public-read bucket: "portfolio-media"
--   2. Adds a SELECT policy so published media can be read without auth
--   3. Does NOT create any insert/update/delete policy — uploads/edits are
--      intentionally left for the future, authenticated Portfolio Builder.
--
-- Suggested path convention inside the bucket (app code doesn't enforce
-- this — it's just how we recommend organizing uploads):
--   portfolios/{beautician_profile_id}/profile/...
--   portfolios/{beautician_profile_id}/gallery/...
--   portfolios/{beautician_profile_id}/before-after/...
--   portfolios/{beautician_profile_id}/videos/...

insert into storage.buckets (id, name, public)
values ('portfolio-media', 'portfolio-media', true)
on conflict (id) do nothing;

drop policy if exists "portfolio_media_public_read" on storage.objects;
create policy "portfolio_media_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'portfolio-media');

-- Intentionally no INSERT/UPDATE/DELETE policy here.
-- Public visitors and the anon/publishable key can read but never write.
-- Uploading files (via the dashboard Storage UI, which uses your own
-- authenticated session, not the public API) is unaffected by this and
-- works regardless — this policy only governs the public app's access.
