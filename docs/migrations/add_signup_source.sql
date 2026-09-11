-- Migration: add signup_source to beautician_profiles
-- Run this in the Supabase SQL editor before deploying the frontend changes.
--
-- Adds a free-text signup_source column (e.g. 'Direct', 'Expo', 'Ads').
-- Existing rows default to NULL; the app will show "Not set" for those.
-- Back-fills anyone who signed up via /expo (matched by checking if their
-- auth user email/phone was created from that flow is not possible server-
-- side here, so back-fill is left as a manual admin step via the
-- Professionals table inline dropdown, or a separate one-time script).

ALTER TABLE public.beautician_profiles
  ADD COLUMN IF NOT EXISTS signup_source TEXT DEFAULT NULL;

COMMENT ON COLUMN public.beautician_profiles.signup_source IS
  'How the professional found and signed up — e.g. Direct, Expo, Ads, Seminar, Reference. Set automatically on new sign-ups; editable by admins.';
