-- ============================================================================
-- BeautyFolio QA Schema-Only Bootstrap Artifact
-- Generated: QA-1D Step 2A — AUDIT + PACKAGE ONLY, NOT YET APPLIED
--
-- SOURCE: this repository's supabase/migrations/*.sql (25 files), assembled
-- in original chronological order. This is a STRUCTURAL, BEST-AVAILABLE
-- artifact — NOT a verified live pg_dump of the protected source backend
-- (ivbujlyilzmlublqzalu). No pg_dump / Supabase CLI / MCP live introspection
-- method was available in this environment without requesting new source-DB
-- credentials, which this phase's instructions explicitly forbid requesting.
-- See the QA-1D Step 2A report for the full method-availability audit.
--
-- Cross-checked against src/integrations/supabase/types.ts (Lovable's own
-- live-generated types file): all 26 tables and both enum sets MATCH exactly
-- between migrations and types. This is corroborating evidence, not proof —
-- it cannot verify RLS policy text, trigger bodies, index definitions, or
-- grants, all of which exist only in the migration files themselves.
--
-- EXCLUDED FROM THIS ARTIFACT (deliberately):
--   - supabase/seed-demo-dharti.sql        (real professional PII — name,
--                                            phone, address, email, reviews)
--   - supabase/link-demo-media.sql          (real storage paths + real
--                                            production project ref URL)
--   - supabase/setup-portfolio-media-bucket.sql (superseded by the storage
--                                            policy migration below; the
--                                            live bucket never actually had
--                                            this script's policy applied,
--                                            per that migration's own note)
--   - One conditional backfill DML block inside
--     20260822120000_leads_crm_upgrade.sql (operates on pre-existing lead
--     rows; a fresh QA database has none, so it would be a safe no-op, but
--     it is DML, not schema, and is excluded per the "schema-only, zero
--     INSERT for records" requirement)
--
-- NOT INCLUDED (must be created separately, see the storage bootstrap plan
-- in the QA-1D Step 2A report):
--   - storage.buckets row for 'portfolio-media' (bucket creation itself is
--     NOT in any tracked migration — only its RLS policies are; the bucket
--     was created out-of-band via the Supabase dashboard on the source
--     project, per setup-portfolio-media-bucket.sql's own comments)
--
-- THIS FILE HAS NOT BEEN APPLIED TO ANY DATABASE. Review before Step 2B.
-- ============================================================================

-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260814053705_20118a74-9740-449a-ad4b-3277671d43e6.sql
-- ============================================================================

-- ============ enums ============
CREATE TYPE public.app_role AS ENUM ('beautician','admin');
CREATE TYPE public.portfolio_status AS ENUM ('draft','published','unpublished','suspended');
CREATE TYPE public.price_type AS ENUM ('fixed','starting_from','custom_quote');
CREATE TYPE public.before_after_image_type AS ENUM ('before','after');
CREATE TYPE public.video_platform AS ENUM ('youtube','instagram','uploaded','other');
CREATE TYPE public.lead_status AS ENUM ('new','contacted','qualified','booked','lost','archived');

-- ============ shared trigger fn ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE NOT NULL,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- auto-create a profile row for each new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, display_name, email)
  VALUES (NEW.id, NULLIF(NEW.raw_user_meta_data->>'display_name',''), NEW.email)
  ON CONFLICT (auth_user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'beautician')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ beautician_profiles ============
CREATE TABLE public.beautician_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_name TEXT,
  display_name TEXT NOT NULL,
  professional_title TEXT,
  short_tagline TEXT,
  bio TEXT,
  bio_secondary TEXT,
  profile_image_url TEXT,
  cover_image_url TEXT,
  primary_city TEXT,
  locality TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'India',
  years_experience INTEGER CHECK (years_experience >= 0),
  rating NUMERIC(2,1) CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  client_count INTEGER NOT NULL DEFAULT 0 CHECK (client_count >= 0),
  metrics_verified BOOLEAN NOT NULL DEFAULT false,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  phone TEXT,
  whatsapp_number TEXT,
  email TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  youtube_url TEXT,
  website_url TEXT,
  address TEXT,
  working_hours TEXT,
  travel_note TEXT,
  map_query TEXT,
  latitude NUMERIC CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC CHECK (longitude BETWEEN -180 AND 180),
  status public.portfolio_status NOT NULL DEFAULT 'draft',
  is_published BOOLEAN GENERATED ALWAYS AS (status = 'published') STORED,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beautician_profiles TO authenticated;
GRANT SELECT ON public.beautician_profiles TO anon;
GRANT ALL ON public.beautician_profiles TO service_role;
ALTER TABLE public.beautician_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_bp_updated BEFORE UPDATE ON public.beautician_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_bp_slug_status ON public.beautician_profiles (slug) WHERE status = 'published';
CREATE INDEX idx_bp_status ON public.beautician_profiles (status);
CREATE INDEX idx_bp_profile_id ON public.beautician_profiles (profile_id);

-- ownership + publication helpers
CREATE OR REPLACE FUNCTION public.owns_beautician_profile(_bp_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beautician_profiles bp
    JOIN public.profiles p ON p.id = bp.profile_id
    WHERE bp.id = _bp_id AND p.auth_user_id = auth.uid()
  ) OR public.has_role(auth.uid(),'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_published_profile(_bp_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.beautician_profiles WHERE id = _bp_id AND status = 'published');
$$;

CREATE POLICY "bp_public_read_published" ON public.beautician_profiles FOR SELECT TO anon, authenticated
  USING (status = 'published');
CREATE POLICY "bp_owner_read" ON public.beautician_profiles FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "bp_owner_insert" ON public.beautician_profiles FOR INSERT TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY "bp_owner_update" ON public.beautician_profiles FOR UPDATE TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "bp_owner_delete" ON public.beautician_profiles FOR DELETE TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

-- ============ reference tables ============
CREATE TABLE public.specializations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.specializations TO anon, authenticated;
GRANT ALL ON public.specializations TO service_role;
ALTER TABLE public.specializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spec_public_read" ON public.specializations FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "spec_admin_write" ON public.specializations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_categories TO anon, authenticated;
GRANT ALL ON public.service_categories TO service_role;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_cat_public_read" ON public.service_categories FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "svc_cat_admin_write" ON public.service_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.beautician_specializations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  specialization_id UUID NOT NULL REFERENCES public.specializations(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (beautician_profile_id, specialization_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beautician_specializations TO authenticated;
GRANT SELECT ON public.beautician_specializations TO anon;
GRANT ALL ON public.beautician_specializations TO service_role;
ALTER TABLE public.beautician_specializations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_bspec_bp ON public.beautician_specializations (beautician_profile_id);
CREATE POLICY "bspec_public_read" ON public.beautician_specializations FOR SELECT TO anon, authenticated
  USING (public.is_published_profile(beautician_profile_id));
CREATE POLICY "bspec_owner_all" ON public.beautician_specializations FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

-- ============ services ============
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT,
  category TEXT,
  short_description TEXT,
  description TEXT,
  price NUMERIC(10,2) CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  price_type public.price_type NOT NULL DEFAULT 'fixed',
  duration_minutes INTEGER CHECK (duration_minutes > 0),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (beautician_profile_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT ON public.services TO anon;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_services_bp ON public.services (beautician_profile_id);
CREATE INDEX idx_services_bp_active ON public.services (beautician_profile_id, is_active);
CREATE INDEX idx_services_category ON public.services (category);
CREATE POLICY "services_public_read" ON public.services FOR SELECT TO anon, authenticated
  USING (is_active AND public.is_published_profile(beautician_profile_id));
CREATE POLICY "services_owner_all" ON public.services FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

-- ============ packages ============
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  best_for TEXT,
  note TEXT,
  price NUMERIC(10,2) CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  price_type public.price_type NOT NULL DEFAULT 'fixed',
  inclusions TEXT[] NOT NULL DEFAULT '{}',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (beautician_profile_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT SELECT ON public.packages TO anon;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_packages_updated BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_packages_bp ON public.packages (beautician_profile_id);
CREATE POLICY "packages_public_read" ON public.packages FOR SELECT TO anon, authenticated
  USING (is_active AND public.is_published_profile(beautician_profile_id));
CREATE POLICY "packages_owner_all" ON public.packages FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

CREATE TABLE public.package_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (package_id, service_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_services TO authenticated;
GRANT SELECT ON public.package_services TO anon;
GRANT ALL ON public.package_services TO service_role;
ALTER TABLE public.package_services ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pkg_services_pkg ON public.package_services (package_id);
CREATE INDEX idx_pkg_services_svc ON public.package_services (service_id);
CREATE POLICY "pkg_services_public_read" ON public.package_services FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND p.is_active AND public.is_published_profile(p.beautician_profile_id)));
CREATE POLICY "pkg_services_owner_all" ON public.package_services FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND public.owns_beautician_profile(p.beautician_profile_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND public.owns_beautician_profile(p.beautician_profile_id)));

-- ============ portfolio items + images ============
CREATE TABLE public.portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  location TEXT,
  event_type TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_items TO authenticated;
GRANT SELECT ON public.portfolio_items TO anon;
GRANT ALL ON public.portfolio_items TO service_role;
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pitems_updated BEFORE UPDATE ON public.portfolio_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_pitems_bp ON public.portfolio_items (beautician_profile_id, is_published);
CREATE INDEX idx_pitems_category ON public.portfolio_items (category);
CREATE POLICY "pitems_public_read" ON public.portfolio_items FOR SELECT TO anon, authenticated
  USING (is_published AND public.is_published_profile(beautician_profile_id));
CREATE POLICY "pitems_owner_all" ON public.portfolio_items FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

CREATE TABLE public.portfolio_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_item_id UUID NOT NULL REFERENCES public.portfolio_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  alt_text TEXT,
  caption TEXT,
  width INTEGER CHECK (width > 0),
  height INTEGER CHECK (height > 0),
  mime_type TEXT,
  file_size_bytes BIGINT CHECK (file_size_bytes >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_cover BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_images TO authenticated;
GRANT SELECT ON public.portfolio_images TO anon;
GRANT ALL ON public.portfolio_images TO service_role;
ALTER TABLE public.portfolio_images ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pimages_updated BEFORE UPDATE ON public.portfolio_images FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_pimages_item ON public.portfolio_images (portfolio_item_id, sort_order);
CREATE POLICY "pimages_public_read" ON public.portfolio_images FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolio_items i WHERE i.id = portfolio_item_id AND i.is_published AND public.is_published_profile(i.beautician_profile_id)));
CREATE POLICY "pimages_owner_all" ON public.portfolio_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolio_items i WHERE i.id = portfolio_item_id AND public.owns_beautician_profile(i.beautician_profile_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portfolio_items i WHERE i.id = portfolio_item_id AND public.owns_beautician_profile(i.beautician_profile_id)));

-- ============ before / after ============
CREATE TABLE public.before_after_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  location TEXT,
  event_type TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.before_after_items TO authenticated;
GRANT SELECT ON public.before_after_items TO anon;
GRANT ALL ON public.before_after_items TO service_role;
ALTER TABLE public.before_after_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ba_updated BEFORE UPDATE ON public.before_after_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ba_bp ON public.before_after_items (beautician_profile_id, is_published);
CREATE POLICY "ba_public_read" ON public.before_after_items FOR SELECT TO anon, authenticated
  USING (is_published AND public.is_published_profile(beautician_profile_id));
CREATE POLICY "ba_owner_all" ON public.before_after_items FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

CREATE TABLE public.before_after_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  before_after_id UUID NOT NULL REFERENCES public.before_after_items(id) ON DELETE CASCADE,
  image_type public.before_after_image_type NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  alt_text TEXT,
  width INTEGER CHECK (width > 0),
  height INTEGER CHECK (height > 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.before_after_images TO authenticated;
GRANT SELECT ON public.before_after_images TO anon;
GRANT ALL ON public.before_after_images TO service_role;
ALTER TABLE public.before_after_images ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_baimg_updated BEFORE UPDATE ON public.before_after_images FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_baimg_item ON public.before_after_images (before_after_id, sort_order);
CREATE POLICY "baimg_public_read" ON public.before_after_images FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.before_after_items b WHERE b.id = before_after_id AND b.is_published AND public.is_published_profile(b.beautician_profile_id)));
CREATE POLICY "baimg_owner_all" ON public.before_after_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.before_after_items b WHERE b.id = before_after_id AND public.owns_beautician_profile(b.beautician_profile_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.before_after_items b WHERE b.id = before_after_id AND public.owns_beautician_profile(b.beautician_profile_id)));

-- ============ videos ============
CREATE TABLE public.portfolio_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  video_url TEXT,
  storage_path TEXT,
  thumbnail_url TEXT,
  platform public.video_platform NOT NULL DEFAULT 'youtube',
  category TEXT,
  duration_seconds INTEGER CHECK (duration_seconds >= 0),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_videos TO authenticated;
GRANT SELECT ON public.portfolio_videos TO anon;
GRANT ALL ON public.portfolio_videos TO service_role;
ALTER TABLE public.portfolio_videos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_videos_updated BEFORE UPDATE ON public.portfolio_videos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_videos_bp ON public.portfolio_videos (beautician_profile_id, is_published);
CREATE POLICY "videos_public_read" ON public.portfolio_videos FOR SELECT TO anon, authenticated
  USING (is_published AND public.is_published_profile(beautician_profile_id));
CREATE POLICY "videos_owner_all" ON public.portfolio_videos FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

-- ============ reviews ============
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  service_name TEXT,
  event_type TEXT,
  review_date DATE,
  source TEXT,
  source_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_reviews_bp ON public.reviews (beautician_profile_id, is_published);
CREATE POLICY "reviews_public_read" ON public.reviews FOR SELECT TO anon, authenticated
  USING (is_published AND public.is_published_profile(beautician_profile_id));
CREATE POLICY "reviews_owner_all" ON public.reviews FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

-- verification stays out of user control
CREATE OR REPLACE FUNCTION public.guard_review_verification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.is_verified := false;
  ELSE NEW.is_verified := OLD.is_verified; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_reviews_verification BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_verification();

-- ============ service areas ============
CREATE TABLE public.service_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  area_name TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'India',
  latitude NUMERIC CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC CHECK (longitude BETWEEN -180 AND 180),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_areas TO authenticated;
GRANT SELECT ON public.service_areas TO anon;
GRANT ALL ON public.service_areas TO service_role;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_areas_updated BEFORE UPDATE ON public.service_areas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_areas_bp ON public.service_areas (beautician_profile_id, is_active);
CREATE POLICY "areas_public_read" ON public.service_areas FOR SELECT TO anon, authenticated
  USING (is_active AND public.is_published_profile(beautician_profile_id));
CREATE POLICY "areas_owner_all" ON public.service_areas FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

-- ============ faqs ============
CREATE TABLE public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT SELECT ON public.faqs TO anon;
GRANT ALL ON public.faqs TO service_role;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_faqs_updated BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_faqs_bp ON public.faqs (beautician_profile_id, is_published);
CREATE POLICY "faqs_public_read" ON public.faqs FOR SELECT TO anon, authenticated
  USING (is_published AND public.is_published_profile(beautician_profile_id));
CREATE POLICY "faqs_owner_all" ON public.faqs FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

-- ============ availability ============
CREATE TABLE public.availability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID UNIQUE NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  accepting_bookings BOOLEAN NOT NULL DEFAULT true,
  advance_booking_days INTEGER CHECK (advance_booking_days >= 0),
  minimum_notice_hours INTEGER CHECK (minimum_notice_hours >= 0),
  working_hours_note TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_settings TO authenticated;
GRANT SELECT ON public.availability_settings TO anon;
GRANT ALL ON public.availability_settings TO service_role;
ALTER TABLE public.availability_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_avail_updated BEFORE UPDATE ON public.availability_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "avail_public_read" ON public.availability_settings FOR SELECT TO anon, authenticated
  USING (public.is_published_profile(beautician_profile_id));
CREATE POLICY "avail_owner_all" ON public.availability_settings FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

-- ============ seo ============
CREATE TABLE public.portfolio_seo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID UNIQUE NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  seo_title TEXT,
  meta_description TEXT,
  canonical_url TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image_url TEXT,
  robots_index BOOLEAN NOT NULL DEFAULT true,
  robots_follow BOOLEAN NOT NULL DEFAULT true,
  primary_keyword TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_seo TO authenticated;
GRANT SELECT ON public.portfolio_seo TO anon;
GRANT ALL ON public.portfolio_seo TO service_role;
ALTER TABLE public.portfolio_seo ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_seo_updated BEFORE UPDATE ON public.portfolio_seo FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "seo_public_read" ON public.portfolio_seo FOR SELECT TO anon, authenticated
  USING (public.is_published_profile(beautician_profile_id));
CREATE POLICY "seo_owner_all" ON public.portfolio_seo FOR ALL TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));

-- ============ leads (private) ============
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  email TEXT,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  event_date DATE,
  location TEXT,
  message TEXT,
  source TEXT,
  status public.lead_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_leads_bp ON public.leads (beautician_profile_id, status, created_at DESC);
CREATE POLICY "leads_owner_read" ON public.leads FOR SELECT TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id));
CREATE POLICY "leads_owner_update" ON public.leads FOR UPDATE TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id))
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));
CREATE POLICY "leads_owner_delete" ON public.leads FOR DELETE TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id));

CREATE OR REPLACE FUNCTION public.submit_lead(
  _slug TEXT, _name TEXT, _phone TEXT, _email TEXT DEFAULT NULL,
  _message TEXT DEFAULT NULL, _event_date DATE DEFAULT NULL, _location TEXT DEFAULT NULL,
  _service_id UUID DEFAULT NULL, _package_id UUID DEFAULT NULL, _source TEXT DEFAULT 'portfolio'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bp UUID; _id UUID;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF coalesce(trim(_phone),'') = '' THEN RAISE EXCEPTION 'Phone is required'; END IF;
  INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source)
  VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40))
  RETURNING id INTO _id;
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT) TO anon, authenticated;

-- ============ analytics events (private, no PII) ============
CREATE TABLE public.portfolio_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id UUID NOT NULL REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view','whatsapp_click','call_click','availability_click','lead_submitted','gallery_view','service_view','package_view','video_view')),
  session_id TEXT,
  referrer TEXT,
  device_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.portfolio_events TO authenticated;
GRANT ALL ON public.portfolio_events TO service_role;
ALTER TABLE public.portfolio_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_events_bp ON public.portfolio_events (beautician_profile_id, created_at DESC);
CREATE POLICY "events_owner_read" ON public.portfolio_events FOR SELECT TO authenticated
  USING (public.owns_beautician_profile(beautician_profile_id));

CREATE OR REPLACE FUNCTION public.record_portfolio_event(
  _slug TEXT, _event_type TEXT, _session_id TEXT DEFAULT NULL,
  _referrer TEXT DEFAULT NULL, _device_type TEXT DEFAULT NULL, _metadata JSONB DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bp UUID;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RETURN; END IF;
  INSERT INTO public.portfolio_events (beautician_profile_id, event_type, session_id, referrer, device_type, metadata)
  VALUES (_bp, _event_type, left(coalesce(_session_id,''),64), left(coalesce(_referrer,''),300), left(coalesce(_device_type,''),20), _metadata);
END; $$;
REVOKE ALL ON FUNCTION public.record_portfolio_event(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_portfolio_event(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) TO anon, authenticated;


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260818154609_add_profile_highlights.sql
-- ============================================================================
-- Adds storage for the two public-portfolio content sections that had no
-- database column at all: the About section's highlight bullets, and the
-- "Why choose me" list. Mirrors the existing packages.inclusions TEXT[]
-- pattern (same type, same nullability). NOT NULL DEFAULT '{}' means every
-- existing row (including the live demo profile) gets a valid empty array
-- automatically — no backfill required.
ALTER TABLE public.beautician_profiles
  ADD COLUMN about_highlights TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN why_choose_points TEXT[] NOT NULL DEFAULT '{}';


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260819070928_admin_role_management.sql
-- ============================================================================
-- Lets admins grant/revoke the 'admin' role from the app instead of a
-- manual SQL step every time. Every signup already gets 'beautician' via
-- handle_new_user() — that path is untouched. Before this, user_roles only
-- granted SELECT to authenticated (admins could already see every role via
-- the has_role() OR in user_roles_select_own); only service_role could write.
GRANT INSERT, DELETE ON public.user_roles TO authenticated;

CREATE POLICY "user_roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260819074500_admin_taxonomy_write_grants.sql
-- ============================================================================
-- svc_cat_admin_write / spec_admin_write RLS policies already exist and are
-- already admin-only (USING/WITH CHECK has_role(auth.uid(),'admin')), but the
-- table-level GRANT for `authenticated` only ever included SELECT — same gap
-- as user_roles before its own migration. Adds the missing write grants;
-- RLS (already correct) is what actually restricts this to admins.
GRANT INSERT, UPDATE, DELETE ON public.service_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.specializations TO authenticated;


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260819123937_profile_verification_featured.sql
-- ============================================================================
-- Phase 1 Step 2: Verification + Featured flags on beautician_profiles.
--
-- Two independent admin-only booleans. Distinct from the existing
-- metrics_verified column (unrelated — that one only gates whether the
-- demo profile's stats display, not a professional-verification badge).
--
-- Security note: bp_owner_update's RLS is row-level, not column-level — an
-- owner is allowed to UPDATE their own row at all, which would let them set
-- is_verified/is_featured on themselves via a direct API call bypassing the
-- admin-only UI (the app code never sends these fields, but RLS alone
-- doesn't stop a hand-crafted request). Mirrors the exact same problem
-- reviews.is_verified already had, and reuses that table's exact fix:
-- guard_review_verification()'s pattern (BEFORE INSERT OR UPDATE trigger
-- that resets the column unless the caller is admin) — see reviews table
-- setup in the initial schema migration for the precedent.
ALTER TABLE public.beautician_profiles
  ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_beautician_profile_flags()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false;
    NEW.is_featured := false;
  ELSE
    NEW.is_verified := OLD.is_verified;
    NEW.is_featured := OLD.is_featured;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_beautician_profiles_flags BEFORE INSERT OR UPDATE ON public.beautician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_beautician_profile_flags();


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260820070918_admin_audit_logs.sql
-- ============================================================================
-- Phase 1 Step 3: platform-wide, append-only audit trail for Main Admin actions.
--
-- Scope (per explicit Step 3 spec): profile status changes, verification
-- changes, featured changes, admin role grants/revokes, review moderation
-- (publish/unpublish, verify/unverify, delete). Taxonomy CRUD and lead
-- status changes are intentionally NOT logged in this step — not in the
-- specified minimum scope, and lower-sensitivity than profile/role/review
-- moderation. Can be added later by extending admin_audit_action.
CREATE TYPE public.admin_audit_action AS ENUM (
  'profile_status_changed',
  'verification_changed',
  'featured_changed',
  'admin_role_granted',
  'admin_role_revoked',
  'review_moderated',
  'review_deleted'
);

CREATE TYPE public.admin_audit_entity_type AS ENUM (
  'beautician_profile',
  'user_role',
  'review'
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  action public.admin_audit_action NOT NULL,
  entity_type public.admin_audit_entity_type NOT NULL,
  entity_id UUID NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Intentionally NO foreign keys to beautician_profiles/reviews/user_roles:
-- an audit record must remain readable even after the entity it describes
-- is deleted (e.g. review_deleted's own record would break a FK the moment
-- the review row it references is gone). actor_user_id is also left as a
-- bare UUID with no FK to auth.users, matching the existing convention
-- already used by profiles.auth_user_id and user_roles.user_id.

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs (actor_user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

-- Read: admins only.
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- No INSERT/UPDATE/DELETE policy for `authenticated` at all, and no such
-- GRANT either — this makes the table append-only from the application's
-- perspective. Writes only happen through log_admin_action() below, a
-- SECURITY DEFINER function (runs as the table owner, the same mechanism
-- submit_lead()/record_portfolio_event() already use to write into their
-- own RLS-protected tables without a client-facing write grant). No client,
-- including an admin's own browser session, can INSERT/UPDATE/DELETE
-- audit_logs directly through PostgREST.
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action public.admin_audit_action,
  _entity_type public.admin_audit_entity_type,
  _entity_id UUID,
  _old_value JSONB DEFAULT NULL,
  _new_value JSONB DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _old_value, _new_value, _metadata)
  RETURNING id INTO _id;
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.log_admin_action(public.admin_audit_action, public.admin_audit_entity_type, UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(public.admin_audit_action, public.admin_audit_entity_type, UUID, JSONB, JSONB, JSONB) TO authenticated;


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260821054621_portfolio_media_storage_policies.sql
-- ============================================================================
-- Phase 2 Step 1: Storage policy foundation for the portfolio-media bucket.
--
-- Live inspection (2026-08-21, confirmed by project owner via the Supabase
-- dashboard) found the bucket public with ZERO storage.objects policies of
-- any kind — not even the read policy the original setup-portfolio-media-
-- bucket.sql script intended, despite that file being tracked in this repo.
-- This migration is the first one to actually apply Storage policies via a
-- tracked, reproducible migration file.
--
-- Exactly 4 new SQL objects are created: 1 function + 3 policies.
--
-- owns_beautician_profile_by_slug(): storage.objects only exposes the
-- object's path (`name`) and bucket_id — not a beautician_profile_id — so
-- the existing owns_beautician_profile(_bp_id UUID) can't be called
-- directly from a Storage policy. This is the identical ownership query,
-- just keyed by slug (the second path segment in
-- profiles/{slug}/{category}/{filename}) instead of a UUID, including the
-- same admin bypass every other ownership check in this schema already has.
CREATE OR REPLACE FUNCTION public.owns_beautician_profile_by_slug(_slug TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beautician_profiles bp
    JOIN public.profiles p ON p.id = bp.profile_id
    WHERE bp.slug = _slug AND p.auth_user_id = auth.uid()
  ) OR public.has_role(auth.uid(),'admin');
$$;

-- Public read — re-affirms what setup-portfolio-media-bucket.sql intended
-- but which the live project never actually had.
DROP POLICY IF EXISTS "portfolio_media_public_read" ON storage.objects;
CREATE POLICY "portfolio_media_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'portfolio-media');

-- Owner-scoped insert. No UPDATE policy: uploads always use upsert:false
-- with a Date.now()-unique path (confirmed in src/lib/storage-upload.ts),
-- so no code path ever overwrites an existing object in place.
DROP POLICY IF EXISTS "portfolio_media_owner_insert" ON storage.objects;
CREATE POLICY "portfolio_media_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'portfolio-media'
  AND public.owns_beautician_profile_by_slug((storage.foldername(name))[2])
);

-- Owner-scoped delete.
DROP POLICY IF EXISTS "portfolio_media_owner_delete" ON storage.objects;
CREATE POLICY "portfolio_media_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'portfolio-media'
  AND public.owns_beautician_profile_by_slug((storage.foldername(name))[2])
);


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260821140000_availability_booking_system.sql
-- ============================================================================
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


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260821180000_service_areas_travel_settings.sql
-- ============================================================================
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


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260822090000_leads_notes_and_service_requested.sql
-- ============================================================================
-- Phase 3B — Leads module. Reuses the existing `leads` table (already
-- RLS-correct: owner-only SELECT/UPDATE/DELETE, insert only via the
-- SECURITY DEFINER submit_lead() RPC) and the existing `lead_status` enum
-- (new/contacted/qualified/booked/lost/archived — relabeled in the UI as
-- New/Contacted/Follow-up/Converted/Not Interested/Closed, no schema change
-- needed for status). Only two genuinely missing fields are added.

-- Internal notes a beautician keeps on a lead — never shown on the public
-- portfolio, only readable/writable by the lead's owner (existing
-- leads_owner_read / leads_owner_update RLS policies already cover it).
ALTER TABLE public.leads
  ADD COLUMN notes TEXT;

-- Free-text requested service, captured directly from the enquiry form.
-- Kept separate from `service_id` (a real FK to a specific services row,
-- which the public form doesn't currently collect) and from `message`
-- (the customer's free-text note) so each renders as its own field on the
-- lead detail view instead of being concatenated into the message text.
ALTER TABLE public.leads
  ADD COLUMN service_requested TEXT;

-- Postgres treats a different parameter list as a distinct overload rather
-- than replacing this function in place, so the old 10-arg signature must be
-- dropped explicitly — otherwise PostgREST's RPC call-by-name resolution
-- would find two ambiguous overloads and start rejecting every submission.
DROP FUNCTION IF EXISTS public.submit_lead(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.submit_lead(
  _slug TEXT, _name TEXT, _phone TEXT, _email TEXT DEFAULT NULL,
  _message TEXT DEFAULT NULL, _event_date DATE DEFAULT NULL, _location TEXT DEFAULT NULL,
  _service_id UUID DEFAULT NULL, _package_id UUID DEFAULT NULL, _source TEXT DEFAULT 'portfolio',
  _service_requested TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bp UUID; _id UUID;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF coalesce(trim(_phone),'') = '' THEN RAISE EXCEPTION 'Phone is required'; END IF;
  INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source, service_requested)
  VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40), left(coalesce(_service_requested,''),160))
  RETURNING id INTO _id;
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT,TEXT) TO anon, authenticated;


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260822120000_leads_crm_upgrade.sql
-- NOTE: backfill DML block (original lines 154-171) stripped — see header.
-- ============================================================================
-- Phase 3B — Leads → Mini CRM upgrade.
--
-- This script is written to be safely re-runnable: the previous attempt
-- failed partway through (a prior "notes"/"service_requested" migration had
-- never actually been applied), so every step here is guarded so re-running
-- the whole thing from scratch is safe no matter how far the first attempt got.
--
-- Design summary (see chat for full rationale):
--   * `leads` stays the permanent CUSTOMER + pipeline-status record (unchanged
--     columns preserved — nothing dropped, nothing renamed). New convenience
--     columns are added for fast dashboard "who's due" queries.
--   * `lead_inquiries` (NEW) holds the per-enquiry, event-specific details,
--     one-to-many from `leads` — the schema already supports multiple
--     inquiries per customer even though today's UI only creates one per
--     lead submission, matching the "future-ready" requirement.
--   * `lead_inquiry_services` (NEW) is the relational join for the
--     inquiry's multi-select requested services (one row per selected
--     service, not a comma-separated string).
--   * `lead_activities` (NEW) is a single append-only timeline table that
--     covers status changes, logged follow-ups, and free notes alike —
--     exactly the activity_type/channel/direction shape requested for
--     future WhatsApp/SMS automation to plug into later.
--   * `lead_status` enum is extended (not replaced) with 'quoted',
--     'negotiation' and 'completed' so the existing 6 values (and all
--     existing lead rows) keep working unchanged.
--   * Every existing lead is backfilled with one `lead_inquiries` row (and
--     a matching `lead_inquiry_services` row when it already had a
--     `service_requested` value) so old and new leads render identically
--     in the upgraded UI. No existing data is deleted or overwritten.

-- ---------- 1. extend the pipeline status enum ----------
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'quoted' AFTER 'qualified';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'negotiation' AFTER 'quoted';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'completed' AFTER 'booked';

-- ---------- 2. columns on `leads` ----------
-- Source of truth for "next follow-up" / "last contacted" is `lead_activities`;
-- these are denormalized copies kept in sync by the app so the leads list and
-- summary cards don't need a join+aggregate on every render.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  -- `notes` / `service_requested` belong to an earlier Leads migration that
  -- turned out never to have been applied — added here too so this script
  -- is self-contained regardless.
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS service_requested TEXT;

-- ---------- 3. inquiries (event-specific detail, many-to-one with leads) ----------
CREATE TABLE IF NOT EXISTS public.lead_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_date DATE,
  event_type TEXT,
  num_persons INTEGER CHECK (num_persons > 0),
  location_type TEXT CHECK (location_type IN ('studio', 'client_location', 'both')),
  venue_area TEXT,
  requirement TEXT,
  budget NUMERIC CHECK (budget >= 0),
  special_requirements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_inquiries TO authenticated;
GRANT ALL ON public.lead_inquiries TO service_role;
ALTER TABLE public.lead_inquiries ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_lead_inquiries_updated ON public.lead_inquiries;
CREATE TRIGGER trg_lead_inquiries_updated BEFORE UPDATE ON public.lead_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_lead_inquiries_lead ON public.lead_inquiries (lead_id, created_at DESC);
DROP POLICY IF EXISTS "lead_inquiries_owner_all" ON public.lead_inquiries;
CREATE POLICY "lead_inquiries_owner_all" ON public.lead_inquiries FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ));

-- ---------- 4. requested services (multi-select, relational) ----------
CREATE TABLE IF NOT EXISTS public.lead_inquiry_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.lead_inquiries(id) ON DELETE CASCADE,
  -- Free text rather than an FK to `services`: the CRM checklist offers a
  -- centrally-configured set of generic categories plus the beautician's own
  -- catalog (src/lib/lead-config.ts), and the selection must stay legible even
  -- if the beautician later renames or deletes that service.
  service_tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inquiry_id, service_tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_inquiry_services TO authenticated;
GRANT ALL ON public.lead_inquiry_services TO service_role;
ALTER TABLE public.lead_inquiry_services ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lead_inquiry_services_inquiry ON public.lead_inquiry_services (inquiry_id);
DROP POLICY IF EXISTS "lead_inquiry_services_owner_all" ON public.lead_inquiry_services;
CREATE POLICY "lead_inquiry_services_owner_all" ON public.lead_inquiry_services FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lead_inquiries li
    JOIN public.leads l ON l.id = li.lead_id
    WHERE li.id = inquiry_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lead_inquiries li
    JOIN public.leads l ON l.id = li.lead_id
    WHERE li.id = inquiry_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ));

-- ---------- 5. activity timeline (follow-ups, notes, status changes) ----------
DO $$ BEGIN
  CREATE TYPE public.lead_activity_type AS ENUM
    ('call', 'whatsapp', 'sms', 'email', 'note', 'status_change', 'follow_up', 'booking');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.lead_activity_channel AS ENUM ('phone', 'whatsapp', 'sms', 'email', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.lead_activity_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  activity_type public.lead_activity_type NOT NULL,
  channel public.lead_activity_channel,
  direction public.lead_activity_direction,
  -- When the interaction happened (lets a beautician log a call after the
  -- fact); defaults to now() for immediate logging.
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  body TEXT,
  outcome TEXT,
  next_followup_at TIMESTAMPTZ,
  -- Free-form extension point — e.g. {from,to} on a status_change row today,
  -- and the natural place for a future automated-message provider payload
  -- (WhatsApp/SMS message id, delivery status, etc.) without a schema change.
  metadata JSONB,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON public.lead_activities (lead_id, occurred_at DESC);
DROP POLICY IF EXISTS "lead_activities_owner_all" ON public.lead_activities;
CREATE POLICY "lead_activities_owner_all" ON public.lead_activities FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.owns_beautician_profile(l.beautician_profile_id)
  ));

-- ---------- 7. submit_lead(): also create the initial inquiry + activity ----------
-- Drop every prior signature this function may currently have — the earlier
-- migration that introduced the 11-arg (_service_requested) version may not
-- have run, in which case the original 10-arg version is still live.
DROP FUNCTION IF EXISTS public.submit_lead(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.submit_lead(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_lead(
  _slug TEXT, _name TEXT, _phone TEXT, _email TEXT DEFAULT NULL,
  _message TEXT DEFAULT NULL, _event_date DATE DEFAULT NULL, _location TEXT DEFAULT NULL,
  _service_id UUID DEFAULT NULL, _package_id UUID DEFAULT NULL, _source TEXT DEFAULT 'portfolio',
  _service_requested TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bp UUID; _id UUID; _inquiry_id UUID;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF coalesce(trim(_phone),'') = '' THEN RAISE EXCEPTION 'Phone is required'; END IF;

  INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source, service_requested)
  VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40), left(coalesce(_service_requested,''),160))
  RETURNING id INTO _id;

  INSERT INTO public.lead_inquiries (lead_id, event_date, venue_area, requirement)
  VALUES (_id, _event_date, NULLIF(trim(coalesce(_location,'')),''), NULLIF(trim(coalesce(_message,'')),''))
  RETURNING id INTO _inquiry_id;

  IF coalesce(trim(_service_requested),'') <> '' THEN
    INSERT INTO public.lead_inquiry_services (inquiry_id, service_tag) VALUES (_inquiry_id, trim(_service_requested));
  END IF;

  INSERT INTO public.lead_activities (lead_id, activity_type, channel, direction, body)
  VALUES (_id, 'note', 'manual', 'inbound', 'Enquiry received via public portfolio.');

  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID,UUID,TEXT,TEXT) TO anon, authenticated;


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260822130000_leads_owner_insert.sql
-- ============================================================================
-- `leads` was only ever insertable via the SECURITY DEFINER submit_lead()
-- RPC (used by the public portfolio form) — there was never a direct INSERT
-- grant/policy for the authenticated owner. The new "Add Lead" dashboard
-- feature inserts directly as the beautician, through their RLS-scoped
-- client, so that path needs to be opened up too.
GRANT INSERT ON public.leads TO authenticated;

DROP POLICY IF EXISTS "leads_owner_insert" ON public.leads;
CREATE POLICY "leads_owner_insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260823180000_service_slugs.sql
-- ============================================================================
-- Phase 3F.4: stable per-profile service slugs for SEO service landing
-- pages (/portfolio/{profileSlug}/services/{serviceSlug}).
--
-- services.slug already existed (TEXT, nullable) but had no format
-- constraint, no uniqueness guarantee, and no write path anywhere in the
-- app — every row's slug was NULL. This migration only adds integrity
-- constraints; it does not touch any existing row's data.
--
-- Uniqueness is scoped per beautician_profile_id (not global) because the
-- public URL already namespaces by profile slug — two different
-- professionals may legitimately have a service that slugifies to the same
-- string (e.g. both offer "bridal-makeup").
ALTER TABLE public.services
  ADD CONSTRAINT services_slug_format CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

CREATE UNIQUE INDEX idx_services_bp_slug
  ON public.services (beautician_profile_id, slug)
  WHERE slug IS NOT NULL;


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260824090000_drop_redundant_service_slug_index.sql
-- ============================================================================
-- Phase 3F.4A.1: remove the redundant partial unique index added by
-- 20260823180000_service_slugs.sql.
--
-- Audit finding (Phase 3F.4A): `services` already had a full
-- `UNIQUE (beautician_profile_id, slug)` constraint since the very first
-- migration (20260814053705, inline in the CREATE TABLE statement),
-- auto-named `services_beautician_profile_id_slug_key`. A plain UNIQUE
-- constraint on a nullable column already treats every NULL as distinct
-- from every other NULL (standard SQL semantics) — so it already allowed
-- unlimited NULL slugs while rejecting duplicate non-null (profile, slug)
-- pairs, identical behavior to the partial index added in Phase 3F.4.
--
-- `idx_services_bp_slug` therefore added zero real behavior beyond what
-- already existed. Verified before dropping (in a rolled-back transaction)
-- that `services_beautician_profile_id_slug_key` alone still correctly
-- rejects a duplicate slug within the same profile.
--
-- services_slug_format (the format CHECK) and every existing service slug
-- are untouched by this migration.
DROP INDEX IF EXISTS public.idx_services_bp_slug;


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260825100000_guard_media_service_ownership.sql
-- ============================================================================
-- Phase 3F.5: cross-profile service-linking protection.
--
-- Audit finding: the RLS owner-write policies on portfolio_items and
-- before_after_items only check `owns_beautician_profile(beautician_profile_id)`
-- — i.e. that the caller owns the ROW being written. Neither the RLS policy
-- nor the `service_id UUID REFERENCES public.services(id) ON DELETE SET NULL`
-- foreign key checks that the referenced service actually belongs to that
-- same beautician_profile_id — the FK only checks the service EXISTS
-- somewhere. A forged request (bypassing the dashboard's own dropdown,
-- which only ever offers the caller's own services) could technically set
-- Profile A's portfolio_items.service_id to point at Profile B's service.
--
-- Fix: the smallest safe database-level protection consistent with this
-- schema's existing pattern — a BEFORE INSERT/UPDATE trigger, mirroring
-- guard_beautician_profile_flags()/guard_review_verification() exactly
-- rather than introducing a new authorization mechanism.
CREATE OR REPLACE FUNCTION public.guard_media_service_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.service_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = NEW.service_id
        AND s.beautician_profile_id = NEW.beautician_profile_id
    ) THEN
      RAISE EXCEPTION 'service_id must belong to the same beautician profile as this item';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_portfolio_items_service_ownership
  BEFORE INSERT OR UPDATE ON public.portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_media_service_ownership();

CREATE TRIGGER trg_before_after_items_service_ownership
  BEFORE INSERT OR UPDATE ON public.before_after_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_media_service_ownership();


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260825140000_service_detail_enrichment.sql
-- ============================================================================
-- Phase 3F.7: service-detail enrichment (What's Included / Suitable For /
-- Preparation Notes).
--
-- Audit finding (live schema + repo migrations): `services` has no existing
-- field for inclusions/suitability/preparation/booking notes/add-ons.
-- `package_services` is a pure package<->service junction table with no
-- detail-relation columns. No duplicate is being created.
--
-- `packages.inclusions` already establishes the exact convention this
-- schema uses for list-style content: `TEXT[] NOT NULL DEFAULT '{}'::text[]`
-- (confirmed live: column_default = '{}'::text[], is_nullable = NO).
-- Reused verbatim for consistency rather than inventing a second pattern
-- (e.g. jsonb) for the same kind of data.
--
-- All three columns are additive, nullable/empty-by-default, and require
-- zero backfill — every existing service ends up with included_items = {},
-- suitable_for = {}, preparation_notes = NULL, which the application
-- treats identically to "nothing entered yet." No sample/seed content.
ALTER TABLE public.services
  ADD COLUMN included_items TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN suitable_for TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN preparation_notes TEXT;

-- No RLS change: RLS is row-level, not column-level. The existing
-- `services_owner_all` (owner write) and `services_public_read` (public
-- read of active/published services) policies already cover these new
-- columns automatically, exactly as they do for every other column on
-- this table.


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260825180000_submit_lead_phone_validation_and_dedup.sql
-- ============================================================================
-- Phase 3G.1A: submit_lead() authoritative phone validation + customer
-- deduplication.
--
-- Root cause audit: submit_lead() previously only checked that _phone was
-- non-empty (coalesce(trim(_phone),'') = '') and unconditionally INSERTed a
-- new `leads` row on every call. Manual testing confirmed both real bugs:
--   1. Non-numeric strings ("Singh", "Shukla", "Shah", "dd") were accepted
--      as valid phone values, since no format check existed anywhere —
--      not client-side, and (critically) not server-side either, so a
--      crafted request could always bypass any browser-only validation.
--   2. The same person submitting twice (even with identical, valid data)
--      always created a second, unrelated `leads` row instead of reusing
--      the existing customer + adding a new `lead_inquiries` row — the
--      lead/lead_inquiries "one customer, many enquiries" architecture
--      already existed but was never actually used for repeat customers.
--
-- Fix, entirely inside this function (no new tables/columns):
--   - Reject phone values that don't normalize (digits only) to 8-15
--     digits — a deliberately country-agnostic range, not hardcoded to
--     India's 10-digit mobile format, per the audit's explicit instruction.
--     Comparison/validation normalizes with regexp_replace(_phone,
--     '\D','','g'); the STORED value is left as the beautician's own
--     typed formatting (trimmed), matching the existing convention already
--     used for beautician_profiles.phone/whatsapp_number (human-readable
--     storage, digits-only stripping only where actually needed for
--     comparison/links).
--   - Match an existing customer within the SAME beautician profile by
--     comparing normalized phone digits (never across profiles — always
--     scoped by the _bp resolved from the published _slug, identical to
--     the existing ownership model). If found, reuse that lead row: update
--     its top-level snapshot (name/phone/service/event/location/message)
--     to the latest enquiry and insert a new `lead_inquiries` row under it
--     — a genuine repeat enquiry, not a new customer.
--   - Accidental-duplicate guard: if the matched lead already has a
--     lead_inquiries row for the same event_date + service_requested tag
--     created within the last 5 minutes, treat this call as idempotent —
--     return the existing lead id without inserting a second identical
--     inquiry. A different service/date, or the same one more than 5
--     minutes later, is treated as a legitimate new enquiry.
--
-- Known limitation (documented, not silently "fixed" with a fragile
-- heuristic): normalizing "+91 83206 99679" and "8320699679" both strip to
-- digits-only, but the country-code prefix means they don't reduce to the
-- identical digit string, so the same real number typed with vs. without a
-- country code will not be matched as the same customer. Stripping a
-- specific country code would require assuming India-only usage, which the
-- audit explicitly said not to hardcode. Left as a known gap rather than
-- guessed at.
CREATE OR REPLACE FUNCTION public.submit_lead(
  _slug text,
  _name text,
  _phone text,
  _email text DEFAULT NULL::text,
  _message text DEFAULT NULL::text,
  _event_date date DEFAULT NULL::date,
  _location text DEFAULT NULL::text,
  _service_id uuid DEFAULT NULL::uuid,
  _package_id uuid DEFAULT NULL::uuid,
  _source text DEFAULT 'portfolio'::text,
  _service_requested text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bp UUID;
  _id UUID;
  _inquiry_id UUID;
  _normalized_phone TEXT;
  _existing_lead_id UUID;
  _recent_duplicate_id UUID;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  _normalized_phone := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF length(_normalized_phone) < 8 OR length(_normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Enter a valid phone number.';
  END IF;

  SELECT id INTO _existing_lead_id
  FROM public.leads
  WHERE beautician_profile_id = _bp
    AND regexp_replace(coalesce(phone,''), '\D', '', 'g') = _normalized_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF _existing_lead_id IS NOT NULL THEN
    SELECT li.id INTO _recent_duplicate_id
    FROM public.lead_inquiries li
    WHERE li.lead_id = _existing_lead_id
      AND li.created_at > now() - interval '5 minutes'
      AND coalesce(li.event_date, '0001-01-01'::date) = coalesce(_event_date, '0001-01-01'::date)
      AND (
        (coalesce(trim(_service_requested), '') = '' AND NOT EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis WHERE lis.inquiry_id = li.id
        ))
        OR EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis
          WHERE lis.inquiry_id = li.id AND lis.service_tag = trim(coalesce(_service_requested, ''))
        )
      )
    ORDER BY li.created_at DESC
    LIMIT 1;

    IF _recent_duplicate_id IS NOT NULL THEN
      RETURN _existing_lead_id;
    END IF;
  END IF;

  IF _existing_lead_id IS NOT NULL THEN
    _id := _existing_lead_id;
    UPDATE public.leads SET
      name = left(trim(_name), 120),
      phone = left(trim(_phone), 32),
      email = coalesce(nullif(left(coalesce(_email,''),160), ''), email),
      service_id = coalesce(_service_id, service_id),
      package_id = coalesce(_package_id, package_id),
      event_date = coalesce(_event_date, event_date),
      location = coalesce(nullif(left(coalesce(_location,''),160), ''), location),
      message = coalesce(nullif(left(coalesce(_message,''),2000), ''), message),
      service_requested = coalesce(nullif(left(coalesce(_service_requested,''),160), ''), service_requested),
      updated_at = now()
    WHERE id = _id;
  ELSE
    INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source, service_requested)
    VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40), left(coalesce(_service_requested,''),160))
    RETURNING id INTO _id;
  END IF;

  INSERT INTO public.lead_inquiries (lead_id, event_date, venue_area, requirement)
  VALUES (_id, _event_date, NULLIF(trim(coalesce(_location,'')),''), NULLIF(trim(coalesce(_message,'')),''))
  RETURNING id INTO _inquiry_id;

  IF coalesce(trim(_service_requested),'') <> '' THEN
    INSERT INTO public.lead_inquiry_services (inquiry_id, service_tag) VALUES (_inquiry_id, trim(_service_requested));
  END IF;

  INSERT INTO public.lead_activities (lead_id, activity_type, channel, direction, body)
  VALUES (
    _id, 'note', 'manual', 'inbound',
    CASE
      WHEN _existing_lead_id IS NOT NULL THEN 'New enquiry received via public portfolio (repeat customer).'
      ELSE 'Enquiry received via public portfolio.'
    END
  );

  RETURN _id;
END;
$function$;


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260825220000_lead_inquiries_attribution.sql
-- ============================================================================
-- Phase 3G.3A — persistent enquiry-level attribution.
--
-- Attribution belongs to the ENQUIRY, not the customer: one customer can
-- submit many enquiries from different acquisition channels over time, and
-- each one must remain separately attributable (a repeat customer's second
-- enquiry from a Google Ads click must not silently inherit their first
-- enquiry's "Google Organic" attribution). leads.source remains untouched —
-- it continues to behave exactly as it does today (a customer-level
-- snapshot, set once on first insert, never overwritten on reuse).
-- lead_inquiries.source below is the new, authoritative per-enquiry value.
--
-- All 10 new columns are nullable — historical rows get NULL, never
-- fabricated "Direct"/"Portfolio" guesses. No column here is exposed to
-- RLS decisions, ownership checks, or any security-relevant logic — the
-- existing lead_inquiries_owner_all policy already scopes access by
-- lead_id -> leads.beautician_profile_id and needs no change (row-level,
-- not column-level).
ALTER TABLE public.lead_inquiries
  ADD COLUMN source text,
  ADD COLUMN utm_source text,
  ADD COLUMN utm_medium text,
  ADD COLUMN utm_campaign text,
  ADD COLUMN utm_content text,
  ADD COLUMN utm_term text,
  ADD COLUMN landing_path text,
  ADD COLUMN conversion_path text,
  ADD COLUMN referrer_host text,
  ADD COLUMN cta_location text;

-- submit_lead() now accepts and persists the enquiry-level attribution
-- snapshot. All new parameters are optional/nullable (never breaks a
-- caller that omits them) and are sanitized server-side — control
-- characters stripped, length-capped — since this is untrusted client
-- input (Phase 3G.3A §13/§25). Attribution never influences the
-- beautician_profile_id lookup, the phone-based customer match, or the
-- 5-minute idempotency window above it — those checks are unchanged from
-- the Phase 3G.1A version.
CREATE OR REPLACE FUNCTION public.submit_lead(
  _slug text,
  _name text,
  _phone text,
  _email text DEFAULT NULL::text,
  _message text DEFAULT NULL::text,
  _event_date date DEFAULT NULL::date,
  _location text DEFAULT NULL::text,
  _service_id uuid DEFAULT NULL::uuid,
  _package_id uuid DEFAULT NULL::uuid,
  _source text DEFAULT 'portfolio'::text,
  _service_requested text DEFAULT NULL::text,
  _utm_source text DEFAULT NULL::text,
  _utm_medium text DEFAULT NULL::text,
  _utm_campaign text DEFAULT NULL::text,
  _utm_content text DEFAULT NULL::text,
  _utm_term text DEFAULT NULL::text,
  _landing_path text DEFAULT NULL::text,
  _conversion_path text DEFAULT NULL::text,
  _referrer_host text DEFAULT NULL::text,
  _cta_location text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bp UUID;
  _id UUID;
  _inquiry_id UUID;
  _normalized_phone TEXT;
  _existing_lead_id UUID;
  _recent_duplicate_id UUID;
  _clean_source TEXT;
  _clean_utm_source TEXT;
  _clean_utm_medium TEXT;
  _clean_utm_campaign TEXT;
  _clean_utm_content TEXT;
  _clean_utm_term TEXT;
  _clean_landing_path TEXT;
  _clean_conversion_path TEXT;
  _clean_referrer_host TEXT;
  _clean_cta_location TEXT;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  _normalized_phone := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF length(_normalized_phone) < 8 OR length(_normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Enter a valid phone number.';
  END IF;

  -- Server-side sanitization of untrusted attribution input (§6/§13/§25):
  -- strip control characters, cap length, collapse blank strings to NULL.
  -- Never trusts the browser alone; never allowed to affect ownership.
  _clean_source := NULLIF(left(regexp_replace(coalesce(_source,''), '[[:cntrl:]]', '', 'g'), 50), '');
  _clean_utm_source := NULLIF(left(regexp_replace(coalesce(_utm_source,''), '[[:cntrl:]]', '', 'g'), 120), '');
  _clean_utm_medium := NULLIF(left(regexp_replace(coalesce(_utm_medium,''), '[[:cntrl:]]', '', 'g'), 120), '');
  _clean_utm_campaign := NULLIF(left(regexp_replace(coalesce(_utm_campaign,''), '[[:cntrl:]]', '', 'g'), 200), '');
  _clean_utm_content := NULLIF(left(regexp_replace(coalesce(_utm_content,''), '[[:cntrl:]]', '', 'g'), 200), '');
  _clean_utm_term := NULLIF(left(regexp_replace(coalesce(_utm_term,''), '[[:cntrl:]]', '', 'g'), 200), '');
  _clean_landing_path := NULLIF(left(regexp_replace(coalesce(_landing_path,''), '[[:cntrl:]]', '', 'g'), 500), '');
  _clean_conversion_path := NULLIF(left(regexp_replace(coalesce(_conversion_path,''), '[[:cntrl:]]', '', 'g'), 500), '');
  _clean_referrer_host := NULLIF(left(regexp_replace(coalesce(_referrer_host,''), '[[:cntrl:]]', '', 'g'), 253), '');
  _clean_cta_location := NULLIF(left(regexp_replace(coalesce(_cta_location,''), '[[:cntrl:]]', '', 'g'), 80), '');

  SELECT id INTO _existing_lead_id
  FROM public.leads
  WHERE beautician_profile_id = _bp
    AND regexp_replace(coalesce(phone,''), '\D', '', 'g') = _normalized_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF _existing_lead_id IS NOT NULL THEN
    SELECT li.id INTO _recent_duplicate_id
    FROM public.lead_inquiries li
    WHERE li.lead_id = _existing_lead_id
      AND li.created_at > now() - interval '5 minutes'
      AND coalesce(li.event_date, '0001-01-01'::date) = coalesce(_event_date, '0001-01-01'::date)
      AND (
        (coalesce(trim(_service_requested), '') = '' AND NOT EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis WHERE lis.inquiry_id = li.id
        ))
        OR EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis
          WHERE lis.inquiry_id = li.id AND lis.service_tag = trim(coalesce(_service_requested, ''))
        )
      )
    ORDER BY li.created_at DESC
    LIMIT 1;

    -- Duplicate protection is unchanged (§24) — identity/timing/service
    -- match alone decides this; differing attribution never creates or
    -- blocks a duplicate decision either way.
    IF _recent_duplicate_id IS NOT NULL THEN
      RETURN _existing_lead_id;
    END IF;
  END IF;

  IF _existing_lead_id IS NOT NULL THEN
    _id := _existing_lead_id;
    UPDATE public.leads SET
      name = left(trim(_name), 120),
      phone = left(trim(_phone), 32),
      email = coalesce(nullif(left(coalesce(_email,''),160), ''), email),
      service_id = coalesce(_service_id, service_id),
      package_id = coalesce(_package_id, package_id),
      event_date = coalesce(_event_date, event_date),
      location = coalesce(nullif(left(coalesce(_location,''),160), ''), location),
      message = coalesce(nullif(left(coalesce(_message,''),2000), ''), message),
      service_requested = coalesce(nullif(left(coalesce(_service_requested,''),160), ''), service_requested),
      updated_at = now()
    WHERE id = _id;
  ELSE
    INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source, service_requested)
    VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40), left(coalesce(_service_requested,''),160))
    RETURNING id INTO _id;
  END IF;

  -- Every NEW enquiry gets its own attribution snapshot (§20) — this insert
  -- always fires fresh per submission (the 5-minute duplicate check above
  -- already returned early for true duplicates), so a repeat customer's
  -- second, differently-attributed enquiry is never merged with their first.
  INSERT INTO public.lead_inquiries (
    lead_id, event_date, venue_area, requirement,
    source, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    landing_path, conversion_path, referrer_host, cta_location
  )
  VALUES (
    _id, _event_date, NULLIF(trim(coalesce(_location,'')),''), NULLIF(trim(coalesce(_message,'')),''),
    coalesce(_clean_source, 'portfolio'), _clean_utm_source, _clean_utm_medium, _clean_utm_campaign,
    _clean_utm_content, _clean_utm_term, _clean_landing_path, _clean_conversion_path,
    _clean_referrer_host, _clean_cta_location
  )
  RETURNING id INTO _inquiry_id;

  IF coalesce(trim(_service_requested),'') <> '' THEN
    INSERT INTO public.lead_inquiry_services (inquiry_id, service_tag) VALUES (_inquiry_id, trim(_service_requested));
  END IF;

  INSERT INTO public.lead_activities (lead_id, activity_type, channel, direction, body)
  VALUES (
    _id, 'note', 'manual', 'inbound',
    CASE
      WHEN _existing_lead_id IS NOT NULL THEN 'New enquiry received via public portfolio (repeat customer).'
      ELSE 'Enquiry received via public portfolio.'
    END
  );

  RETURN _id;
END;
$function$;


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260827090000_p2_security_relational_hardening.sql
-- ============================================================================
-- Phase 3I.2 — Database-side P2 security + relational integrity hardening.
-- Three independent, minimal changes, each closing one confirmed P2 finding
-- from Phase 3H.2E / 3H.2F / 3I.1 / 3I.1A. No RLS-shape change, no table/
-- column change, no weakening of any existing ownership check.

-- =====================================================================
-- A + B. Storage INSERT/DELETE namespace hardening
-- Aligns portfolio_media_owner_insert / portfolio_media_owner_delete with
-- the already-correct portfolio_media_owner_update policy: requires the
-- first storage path segment to be 'profiles', in addition to the
-- existing profile-slug ownership check on the second segment (still via
-- owns_beautician_profile_by_slug — unchanged, ownership never weakened).
-- Closes the arbitrary-top-level-folder gap confirmed in Phase 3H.2E — no
-- cross-profile risk ever existed there; this is namespace hygiene only.
-- SELECT/public-read (portfolio_media_public_read) is untouched.
-- =====================================================================

DROP POLICY IF EXISTS portfolio_media_owner_insert ON storage.objects;
CREATE POLICY portfolio_media_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio-media'
    AND (storage.foldername(name))[1] = 'profiles'
    AND owns_beautician_profile_by_slug((storage.foldername(name))[2])
  );

DROP POLICY IF EXISTS portfolio_media_owner_delete ON storage.objects;
CREATE POLICY portfolio_media_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio-media'
    AND (storage.foldername(name))[1] = 'profiles'
    AND owns_beautician_profile_by_slug((storage.foldername(name))[2])
  );

-- =====================================================================
-- C. submit_lead — service/package relational-integrity hardening
-- Both overloads: before persisting _service_id/_package_id, verify each
-- belongs to the resolved target beautician profile (_bp). An invalid or
-- cross-profile reference is normalized to NULL rather than rejecting the
-- enquiry — the public lead-capture flow must never fail over a secondary
-- metadata field the visitor doesn't directly control (normally resolved
-- from the profile's own service dropdown; only a crafted direct RPC call
-- could ever supply a mismatched value). Phase 3H.2F / 3I.1 / 3I.1A
-- finding. Every other validated behavior (name/phone requirement, 8-15
-- digit phone, per-profile customer dedup, 5-minute idempotency,
-- attribution sanitization, lead_inquiry_services linkage) is unchanged.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.submit_lead(_slug text, _name text, _phone text, _email text DEFAULT NULL::text, _message text DEFAULT NULL::text, _event_date date DEFAULT NULL::date, _location text DEFAULT NULL::text, _service_id uuid DEFAULT NULL::uuid, _package_id uuid DEFAULT NULL::uuid, _source text DEFAULT 'portfolio'::text, _service_requested text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bp UUID;
  _id UUID;
  _inquiry_id UUID;
  _normalized_phone TEXT;
  _existing_lead_id UUID;
  _recent_duplicate_id UUID;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  _normalized_phone := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF length(_normalized_phone) < 8 OR length(_normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Enter a valid phone number.';
  END IF;

  -- Phase 3I.2 — never let a service/package reference cross a
  -- beautician-profile boundary. Normalize to NULL, never reject.
  IF _service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.services s WHERE s.id = _service_id AND s.beautician_profile_id = _bp
  ) THEN
    _service_id := NULL;
  END IF;
  IF _package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.packages p WHERE p.id = _package_id AND p.beautician_profile_id = _bp
  ) THEN
    _package_id := NULL;
  END IF;

  SELECT id INTO _existing_lead_id
  FROM public.leads
  WHERE beautician_profile_id = _bp
    AND regexp_replace(coalesce(phone,''), '\D', '', 'g') = _normalized_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF _existing_lead_id IS NOT NULL THEN
    SELECT li.id INTO _recent_duplicate_id
    FROM public.lead_inquiries li
    WHERE li.lead_id = _existing_lead_id
      AND li.created_at > now() - interval '5 minutes'
      AND coalesce(li.event_date, '0001-01-01'::date) = coalesce(_event_date, '0001-01-01'::date)
      AND (
        (coalesce(trim(_service_requested), '') = '' AND NOT EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis WHERE lis.inquiry_id = li.id
        ))
        OR EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis
          WHERE lis.inquiry_id = li.id AND lis.service_tag = trim(coalesce(_service_requested, ''))
        )
      )
    ORDER BY li.created_at DESC
    LIMIT 1;

    IF _recent_duplicate_id IS NOT NULL THEN
      RETURN _existing_lead_id;
    END IF;
  END IF;

  IF _existing_lead_id IS NOT NULL THEN
    _id := _existing_lead_id;
    UPDATE public.leads SET
      name = left(trim(_name), 120),
      phone = left(trim(_phone), 32),
      email = coalesce(nullif(left(coalesce(_email,''),160), ''), email),
      service_id = coalesce(_service_id, service_id),
      package_id = coalesce(_package_id, package_id),
      event_date = coalesce(_event_date, event_date),
      location = coalesce(nullif(left(coalesce(_location,''),160), ''), location),
      message = coalesce(nullif(left(coalesce(_message,''),2000), ''), message),
      service_requested = coalesce(nullif(left(coalesce(_service_requested,''),160), ''), service_requested),
      updated_at = now()
    WHERE id = _id;
  ELSE
    INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source, service_requested)
    VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40), left(coalesce(_service_requested,''),160))
    RETURNING id INTO _id;
  END IF;

  INSERT INTO public.lead_inquiries (lead_id, event_date, venue_area, requirement)
  VALUES (_id, _event_date, NULLIF(trim(coalesce(_location,'')),''), NULLIF(trim(coalesce(_message,'')),''))
  RETURNING id INTO _inquiry_id;

  IF coalesce(trim(_service_requested),'') <> '' THEN
    INSERT INTO public.lead_inquiry_services (inquiry_id, service_tag) VALUES (_inquiry_id, trim(_service_requested));
  END IF;

  INSERT INTO public.lead_activities (lead_id, activity_type, channel, direction, body)
  VALUES (
    _id, 'note', 'manual', 'inbound',
    CASE
      WHEN _existing_lead_id IS NOT NULL THEN 'New enquiry received via public portfolio (repeat customer).'
      ELSE 'Enquiry received via public portfolio.'
    END
  );

  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_lead(_slug text, _name text, _phone text, _email text DEFAULT NULL::text, _message text DEFAULT NULL::text, _event_date date DEFAULT NULL::date, _location text DEFAULT NULL::text, _service_id uuid DEFAULT NULL::uuid, _package_id uuid DEFAULT NULL::uuid, _source text DEFAULT 'portfolio'::text, _service_requested text DEFAULT NULL::text, _utm_source text DEFAULT NULL::text, _utm_medium text DEFAULT NULL::text, _utm_campaign text DEFAULT NULL::text, _utm_content text DEFAULT NULL::text, _utm_term text DEFAULT NULL::text, _landing_path text DEFAULT NULL::text, _conversion_path text DEFAULT NULL::text, _referrer_host text DEFAULT NULL::text, _cta_location text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bp UUID;
  _id UUID;
  _inquiry_id UUID;
  _normalized_phone TEXT;
  _existing_lead_id UUID;
  _recent_duplicate_id UUID;
  _clean_source TEXT;
  _clean_utm_source TEXT;
  _clean_utm_medium TEXT;
  _clean_utm_campaign TEXT;
  _clean_utm_content TEXT;
  _clean_utm_term TEXT;
  _clean_landing_path TEXT;
  _clean_conversion_path TEXT;
  _clean_referrer_host TEXT;
  _clean_cta_location TEXT;
BEGIN
  SELECT id INTO _bp FROM public.beautician_profiles WHERE slug = _slug AND status = 'published';
  IF _bp IS NULL THEN RAISE EXCEPTION 'Portfolio not available'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  _normalized_phone := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF length(_normalized_phone) < 8 OR length(_normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Enter a valid phone number.';
  END IF;

  -- Phase 3I.2 — same relational-integrity guard as the 11-arg overload.
  IF _service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.services s WHERE s.id = _service_id AND s.beautician_profile_id = _bp
  ) THEN
    _service_id := NULL;
  END IF;
  IF _package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.packages p WHERE p.id = _package_id AND p.beautician_profile_id = _bp
  ) THEN
    _package_id := NULL;
  END IF;

  _clean_source := NULLIF(left(regexp_replace(coalesce(_source,''), '[[:cntrl:]]', '', 'g'), 50), '');
  _clean_utm_source := NULLIF(left(regexp_replace(coalesce(_utm_source,''), '[[:cntrl:]]', '', 'g'), 120), '');
  _clean_utm_medium := NULLIF(left(regexp_replace(coalesce(_utm_medium,''), '[[:cntrl:]]', '', 'g'), 120), '');
  _clean_utm_campaign := NULLIF(left(regexp_replace(coalesce(_utm_campaign,''), '[[:cntrl:]]', '', 'g'), 200), '');
  _clean_utm_content := NULLIF(left(regexp_replace(coalesce(_utm_content,''), '[[:cntrl:]]', '', 'g'), 200), '');
  _clean_utm_term := NULLIF(left(regexp_replace(coalesce(_utm_term,''), '[[:cntrl:]]', '', 'g'), 200), '');
  _clean_landing_path := NULLIF(left(regexp_replace(coalesce(_landing_path,''), '[[:cntrl:]]', '', 'g'), 500), '');
  _clean_conversion_path := NULLIF(left(regexp_replace(coalesce(_conversion_path,''), '[[:cntrl:]]', '', 'g'), 500), '');
  _clean_referrer_host := NULLIF(left(regexp_replace(coalesce(_referrer_host,''), '[[:cntrl:]]', '', 'g'), 253), '');
  _clean_cta_location := NULLIF(left(regexp_replace(coalesce(_cta_location,''), '[[:cntrl:]]', '', 'g'), 80), '');

  SELECT id INTO _existing_lead_id
  FROM public.leads
  WHERE beautician_profile_id = _bp
    AND regexp_replace(coalesce(phone,''), '\D', '', 'g') = _normalized_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF _existing_lead_id IS NOT NULL THEN
    SELECT li.id INTO _recent_duplicate_id
    FROM public.lead_inquiries li
    WHERE li.lead_id = _existing_lead_id
      AND li.created_at > now() - interval '5 minutes'
      AND coalesce(li.event_date, '0001-01-01'::date) = coalesce(_event_date, '0001-01-01'::date)
      AND (
        (coalesce(trim(_service_requested), '') = '' AND NOT EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis WHERE lis.inquiry_id = li.id
        ))
        OR EXISTS (
          SELECT 1 FROM public.lead_inquiry_services lis
          WHERE lis.inquiry_id = li.id AND lis.service_tag = trim(coalesce(_service_requested, ''))
        )
      )
    ORDER BY li.created_at DESC
    LIMIT 1;

    IF _recent_duplicate_id IS NOT NULL THEN
      RETURN _existing_lead_id;
    END IF;
  END IF;

  IF _existing_lead_id IS NOT NULL THEN
    _id := _existing_lead_id;
    UPDATE public.leads SET
      name = left(trim(_name), 120),
      phone = left(trim(_phone), 32),
      email = coalesce(nullif(left(coalesce(_email,''),160), ''), email),
      service_id = coalesce(_service_id, service_id),
      package_id = coalesce(_package_id, package_id),
      event_date = coalesce(_event_date, event_date),
      location = coalesce(nullif(left(coalesce(_location,''),160), ''), location),
      message = coalesce(nullif(left(coalesce(_message,''),2000), ''), message),
      service_requested = coalesce(nullif(left(coalesce(_service_requested,''),160), ''), service_requested),
      updated_at = now()
    WHERE id = _id;
  ELSE
    INSERT INTO public.leads (beautician_profile_id, name, phone, email, service_id, package_id, event_date, location, message, source, service_requested)
    VALUES (_bp, left(trim(_name),120), left(trim(_phone),32), left(coalesce(_email,''),160), _service_id, _package_id, _event_date, left(coalesce(_location,''),160), left(coalesce(_message,''),2000), left(coalesce(_source,'portfolio'),40), left(coalesce(_service_requested,''),160))
    RETURNING id INTO _id;
  END IF;

  INSERT INTO public.lead_inquiries (
    lead_id, event_date, venue_area, requirement,
    source, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    landing_path, conversion_path, referrer_host, cta_location
  )
  VALUES (
    _id, _event_date, NULLIF(trim(coalesce(_location,'')),''), NULLIF(trim(coalesce(_message,'')),''),
    coalesce(_clean_source, 'portfolio'), _clean_utm_source, _clean_utm_medium, _clean_utm_campaign,
    _clean_utm_content, _clean_utm_term, _clean_landing_path, _clean_conversion_path,
    _clean_referrer_host, _clean_cta_location
  )
  RETURNING id INTO _inquiry_id;

  IF coalesce(trim(_service_requested),'') <> '' THEN
    INSERT INTO public.lead_inquiry_services (inquiry_id, service_tag) VALUES (_inquiry_id, trim(_service_requested));
  END IF;

  INSERT INTO public.lead_activities (lead_id, activity_type, channel, direction, body)
  VALUES (
    _id, 'note', 'manual', 'inbound',
    CASE
      WHEN _existing_lead_id IS NOT NULL THEN 'New enquiry received via public portfolio (repeat customer).'
      ELSE 'Enquiry received via public portfolio.'
    END
  );

  RETURN _id;
END;
$function$;

-- =====================================================================
-- D. SECURITY DEFINER grant hygiene — has_role / log_admin_action
--
-- has_role(_user_id uuid, _role app_role): live dependency-graph audit
-- (Phase 3I.2) confirmed it is referenced inside 10 RLS policies across 6
-- tables (audit_logs, beautician_profiles x3, profiles, service_categories,
-- specializations, user_roles x3) — every one of them scoped to
-- {authenticated} only; none apply to anon. authenticated EXECUTE is
-- therefore load-bearing for RLS evaluation and MUST be preserved. Only
-- the unnecessary PUBLIC/anon grant (no legitimate anon caller or anon-
-- facing policy depends on it) is removed.
--
-- log_admin_action(...): confirmed zero RLS-policy dependents and zero
-- function-body dependents anywhere in the public schema (its only
-- caller is the authenticated admin dashboard). Its internal
-- has_role(auth.uid(),'admin') self-check is unchanged and remains as
-- defense-in-depth regardless of this grant change.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(admin_audit_action, admin_audit_entity_type, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(admin_audit_action, admin_audit_entity_type, uuid, jsonb, jsonb, jsonb) TO authenticated, service_role;

-- =====================================================================
-- ROLLBACK (manual, if ever needed — not executed by this migration):
--
-- DROP POLICY portfolio_media_owner_insert ON storage.objects;
-- CREATE POLICY portfolio_media_owner_insert ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'portfolio-media' AND owns_beautician_profile_by_slug((storage.foldername(name))[2]));
--
-- DROP POLICY portfolio_media_owner_delete ON storage.objects;
-- CREATE POLICY portfolio_media_owner_delete ON storage.objects
--   FOR DELETE TO authenticated
--   USING (bucket_id = 'portfolio-media' AND owns_beautician_profile_by_slug((storage.foldername(name))[2]));
--
-- Re-apply the previous submit_lead bodies from
-- 20260825220000_lead_inquiries_attribution.sql (pre-guard version).
--
-- GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.log_admin_action(admin_audit_action, admin_audit_entity_type, uuid, jsonb, jsonb, jsonb) TO PUBLIC;
-- =====================================================================


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260831090000_admin_service_audit_actions.sql
-- ============================================================================
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


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260831190000_admin_profile_update_audit_action.sql
-- ============================================================================
-- Phase 5.2B — one additive admin_audit_action value for the new Admin
-- Profile Manager's general field-level updates (name, bio, contact,
-- location, social links, images, etc.). The existing
-- "profile_status_changed"/"verification_changed"/"featured_changed"
-- actions stay reserved for their own specific, narrower controls
-- (admin/profiles.server.ts) — this one covers the general Profile form
-- save, mirroring the existing "beautician_profile" entity_type (already
-- present, no new entity_type needed).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'profile_updated';


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260901090000_admin_gallery_audit_actions.sql
-- ============================================================================
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


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260901120000_admin_before_after_audit_actions.sql
-- ============================================================================
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


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260901150000_admin_video_audit_actions.sql
-- ============================================================================
-- Phase 5.2E — additive admin_audit_action values + one new entity_type
-- for the new Admin Videos Manager, following the same "one focused
-- migration, item is the audited unit" convention already used for
-- Gallery (5.2C) and Before & After (5.2D).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'video_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'video_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'video_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'video';


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260901180000_admin_package_audit_actions.sql
-- ============================================================================
-- Phase 5.2F — additive admin_audit_action values + one new entity_type
-- for the new Admin Packages Manager, following the same "one focused
-- migration, item is the audited unit" convention already used for
-- Gallery (5.2C), Before & After (5.2D), and Videos (5.2E).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'package_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'package_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'package_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'package';


-- ============================================================================
-- SOURCE MIGRATION: supabase/migrations/20260901200000_admin_faq_audit_actions.sql
-- ============================================================================
-- Phase 5.2G — additive admin_audit_action values + one new entity_type
-- for the new Admin FAQs Manager, following the same "one focused
-- migration, item is the audited unit" convention already used for
-- Gallery (5.2C), Before & After (5.2D), Videos (5.2E), and Packages
-- (5.2F).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'faq_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'faq_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'faq_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'faq';


