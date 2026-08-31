-- Phase 5.2A — Master Admin Console, Services pilot.
-- Additive-only: extends the existing admin_audit_action /
-- admin_audit_entity_type enums with the values needed to audit-log admin
-- writes to a beautician's services, mirroring the exact pattern already
-- used for profile/review moderation (profile_status_changed,
-- review_moderated, etc.). No table, column, or RLS change — the existing
-- owner_all policies on `services` already resolve true for admins via
-- owns_beautician_profile()'s built-in has_role(...,'admin') OR-clause
-- (confirmed in the Phase 5.1 audit), so no RLS change is required for the
-- admin Services workspace to function.

ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'service_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'service_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'service_deleted';

ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'service';
