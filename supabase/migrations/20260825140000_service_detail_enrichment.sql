-- Phase 3F.7: service-detail enrichment (What's Included / Suitable For /
-- Preparation Notes).
--
-- Audit finding (live schema + repo migrations): `services` has no existing
-- field for inclusions/suitability/preparation/booking notes/add-ons.
-- `package_services` is a pure package<->service junction table with no
-- detail-relation columns. No duplicate is being created.
--
-- `packages.inclusions` already establishes the exact convention this
-- schema uses for list-style content: `TEXT[] NOT NULL DEFAULT '{}'::text[]`
-- (confirmed live: column_default = '{}'::text[], is_nullable = NO).
-- Reused verbatim for consistency rather than inventing a second pattern
-- (e.g. jsonb) for the same kind of data.
--
-- All three columns are additive, nullable/empty-by-default, and require
-- zero backfill — every existing service ends up with included_items = {},
-- suitable_for = {}, preparation_notes = NULL, which the application
-- treats identically to "nothing entered yet." No sample/seed content.
ALTER TABLE public.services
  ADD COLUMN included_items TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN suitable_for TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN preparation_notes TEXT;

-- No RLS change: RLS is row-level, not column-level. The existing
-- `services_owner_all` (owner write) and `services_public_read` (public
-- read of active/published services) policies already cover these new
-- columns automatically, exactly as they do for every other column on
-- this table.
