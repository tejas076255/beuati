-- BeautyFolio: Seed standard service categories into the reference taxonomy table
INSERT INTO public.service_categories (name, slug, sort_order, is_active)
VALUES
  ('Bridal Makeup', 'bridal-makeup', 1, true),
  ('Party / Occasion Makeup', 'party-occasion-makeup', 2, true),
  ('Makeup Services', 'makeup-services', 3, true),
  ('Hair Services', 'hair-services', 4, true),
  ('Nail Services', 'nail-services', 5, true),
  ('Skin & Beauty', 'skin-beauty', 6, true),
  ('Eyelash & Eyebrow', 'eyelash-eyebrow', 7, true),
  ('Mehndi', 'mehndi', 8, true),
  ('Waxing & Hair Removal', 'waxing-hair-removal', 9, true),
  ('Body Care & Spa', 'body-care-spa', 10, true),
  ('Manicure & Pedicure', 'manicure-pedicure', 11, true),
  ('Draping & Styling', 'draping-styling', 12, true),
  ('Pre-Bridal Care', 'pre-bridal-care', 13, true),
  ('Beauty Consultation & Training', 'beauty-consultation-training', 14, true),
  ('Other', 'other', 15, true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;
