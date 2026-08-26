-- Adds storage for the two public-portfolio content sections that had no
-- database column at all: the About section's highlight bullets, and the
-- "Why choose me" list. Mirrors the existing packages.inclusions TEXT[]
-- pattern (same type, same nullability). NOT NULL DEFAULT '{}' means every
-- existing row (including the live demo profile) gets a valid empty array
-- automatically — no backfill required.
ALTER TABLE public.beautician_profiles
  ADD COLUMN about_highlights TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN why_choose_points TEXT[] NOT NULL DEFAULT '{}';
