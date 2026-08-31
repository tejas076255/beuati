-- Phase 5.2B — one additive admin_audit_action value for the new Admin
-- Profile Manager's general field-level updates (name, bio, contact,
-- location, social links, images, etc.). The existing
-- "profile_status_changed"/"verification_changed"/"featured_changed"
-- actions stay reserved for their own specific, narrower controls
-- (admin/profiles.server.ts) — this one covers the general Profile form
-- save, mirroring the existing "beautician_profile" entity_type (already
-- present, no new entity_type needed).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'profile_updated';
