-- Phase 3B — Availability upgrade: booking preferences, working hours, and
-- blocked dates. Extends the existing `availability_settings` table (owner
-- CRUD + public read already correct, unchanged) rather than introducing a
-- parallel structure, and adds one small new owner-scoped table for blocked
-- dates, mirroring the exact RLS pattern already used by every other
-- portfolio table (faqs, reviews, etc.): owner_all via
-- owns_beautician_profile(), public_read via is_published_profile().

ALTER TABLE public.availability_settings
  ADD COLUMN appointment_type TEXT NOT NULL DEFAULT 'both'
    CHECK (appointment_type IN ('studio', 'client_location', 'both')),
  ADD COLUMN travel_available BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN working_hours JSONB;

-- ============ availability blocked dates ============
CREATE TABLE public.availability_blocked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (beautician_profile_id, blocked_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_blocked_dates TO authenticated;
GRANT SELECT ON public.availability_blocked_dates TO anon;
GRANT ALL ON public.availability_blocked_dates TO service_role;
ALTER TABLE public.availability_blocked_dates ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_avail_blocked_bp ON public.availability_blocked_dates (beautician_profile_id, blocked_date);
CREATE POLICY "avail_blocked_public_read" ON public.availability_blocked_dates FOR SELECT TO anon, authenticated
  USING (public.is_published_profile(beautician_profile_id));
CREATE POLICY "avail_blocked_owner_all" ON public.availability_blocked_dates FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));
