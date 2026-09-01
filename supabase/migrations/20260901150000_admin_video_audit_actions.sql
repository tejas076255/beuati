-- Phase 5.2E — additive admin_audit_action values + one new entity_type
-- for the new Admin Videos Manager, following the same "one focused
-- migration, item is the audited unit" convention already used for
-- Gallery (5.2C) and Before & After (5.2D).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'video_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'video_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'video_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'video';
