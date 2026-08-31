-- Phase 5.2C — additive admin_audit_action values + one new entity_type
-- for the new Admin Gallery Manager. Image-level tweaks (new images added,
-- alt text changed, one image removed) are all logged under
-- 'gallery_item_updated' rather than proliferating further action values —
-- the addressable audited unit is the portfolio_items row, matching how
-- the public/dashboard UI already treats a gallery "item" as the unit of
-- work (each item can hold multiple images).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'gallery_item_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'gallery_item_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'gallery_item_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'gallery_item';
