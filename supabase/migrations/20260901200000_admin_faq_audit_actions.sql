-- Phase 5.2G — additive admin_audit_action values + one new entity_type
-- for the new Admin FAQs Manager, following the same "one focused
-- migration, item is the audited unit" convention already used for
-- Gallery (5.2C), Before & After (5.2D), Videos (5.2E), and Packages
-- (5.2F).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'faq_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'faq_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'faq_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'faq';
