-- Phase 5.2D — additive admin_audit_action values + one new entity_type
-- for the new Admin Before & After Manager. Image-level tweaks (before/
-- after image replacement, alt text change) are logged under
-- 'before_after_updated' rather than proliferating further action values —
-- the addressable audited unit is the before_after_items row (the pair),
-- matching the same "item is the unit of work" convention already used
-- for gallery_item_updated in Phase 5.2C.
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'before_after_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'before_after_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'before_after_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'before_after_item';
