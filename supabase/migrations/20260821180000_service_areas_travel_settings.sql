-- Phase 3B — Service Areas module. Reuses the existing `service_areas`
-- table (already RLS-correct, already fed to the public portfolio) and the
-- existing `availability_settings.appointment_type` / `travel_available`
-- columns (added in the previous Availability step) as the single source of
-- truth for "where do you provide services" — no duplicate settings.
-- Only genuinely new, currently-nonexistent fields are added.

-- Optional PIN code on a service area (Area/City/State already exist).
ALTER TABLE public.service_areas
  ADD COLUMN postal_code TEXT;

-- Travel radius/charges belong with the other travel settings already on
-- availability_settings (travel_available, appointment_type) — one table
-- for all travel-related configuration, not a new parallel table.
ALTER TABLE public.availability_settings
  ADD COLUMN travel_radius_km INTEGER CHECK (travel_radius_km >= 0),
  ADD COLUMN travel_charge_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN travel_charge_type TEXT CHECK (travel_charge_type IN ('fixed', 'per_km', 'quote')),
  ADD COLUMN travel_charge_amount NUMERIC CHECK (travel_charge_amount >= 0);
