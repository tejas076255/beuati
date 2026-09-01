-- Phase 5.2F — additive admin_audit_action values + one new entity_type
-- for the new Admin Packages Manager, following the same "one focused
-- migration, item is the audited unit" convention already used for
-- Gallery (5.2C), Before & After (5.2D), and Videos (5.2E).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'package_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'package_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'package_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'package';
