-- ====================================================
-- BEAUTYFOLIO MASTER DATABASE SCHEMA CONSOLIDATION
-- Generated for Supabase Project: uridppiuncvqiikrlmrw
-- Total migrations included: 30
-- ====================================================

-- >>> START OF: 20260814053705_20118a74-9740-449a-ad4b-3277671d43e6.sql >>>

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


-- <<< END OF: 20260814053705_20118a74-9740-449a-ad4b-3277671d43e6.sql <<<

-- >>> START OF: 20260818154609_add_profile_highlights.sql >>>
-- Adds storage for the two public-portfolio content sections that had no
-- database column at all: the About section's highlight bullets, and the
-- "Why choose me" list. Mirrors the existing packages.inclusions TEXT[]
-- pattern (same type, same nullability). NOT NULL DEFAULT '{}' means every
-- existing row (including the live demo profile) gets a valid empty array
-- automatically — no backfill required.
ALTER TABLE public.beautician_profiles
  ADD COLUMN about_highlights TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN why_choose_points TEXT[] NOT NULL DEFAULT '{}';


-- <<< END OF: 20260818154609_add_profile_highlights.sql <<<

-- >>> START OF: 20260819070928_admin_role_management.sql >>>
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


-- <<< END OF: 20260819070928_admin_role_management.sql <<<

-- >>> START OF: 20260819074500_admin_taxonomy_write_grants.sql >>>
-- svc_cat_admin_write / spec_admin_write RLS policies already exist and are
-- already admin-only (USING/WITH CHECK has_role(auth.uid(),'admin')), but the
-- table-level GRANT for `authenticated` only ever included SELECT — same gap
-- as user_roles before its own migration. Adds the missing write grants;
-- RLS (already correct) is what actually restricts this to admins.
GRANT INSERT, UPDATE, DELETE ON public.service_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.specializations TO authenticated;


-- <<< END OF: 20260819074500_admin_taxonomy_write_grants.sql <<<

-- >>> START OF: 20260819123937_profile_verification_featured.sql >>>
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


-- <<< END OF: 20260819123937_profile_verification_featured.sql <<<

-- >>> START OF: 20260820070918_admin_audit_logs.sql >>>
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


-- <<< END OF: 20260820070918_admin_audit_logs.sql <<<

-- >>> START OF: 20260821054621_portfolio_media_storage_policies.sql >>>
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


-- <<< END OF: 20260821054621_portfolio_media_storage_policies.sql <<<

-- >>> START OF: 20260821140000_availability_booking_system.sql >>>
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


-- <<< END OF: 20260821140000_availability_booking_system.sql <<<

-- >>> START OF: 20260821180000_service_areas_travel_settings.sql >>>
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


-- <<< END OF: 20260821180000_service_areas_travel_settings.sql <<<

-- >>> START OF: 20260822090000_leads_notes_and_service_requested.sql >>>
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


-- <<< END OF: 20260822090000_leads_notes_and_service_requested.sql <<<

-- >>> START OF: 20260822120000_leads_crm_upgrade.sql >>>
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

-- ---------- 6. backfill: give every existing lead one inquiry row ----------
-- Guarded with NOT EXISTS so this is safe to re-run without creating
-- duplicate inquiries for leads that were already backfilled.
INSERT INTO public.lead_inquiries (lead_id, event_date, venue_area, requirement, created_at, updated_at)
SELECT l.id, l.event_date, l.location, l.message, l.created_at, l.updated_at
FROM public.leads l
WHERE NOT EXISTS (SELECT 1 FROM public.lead_inquiries li WHERE li.lead_id = l.id);

INSERT INTO public.lead_inquiry_services (inquiry_id, service_tag)
SELECT li.id, l.service_requested
FROM public.lead_inquiries li
JOIN public.leads l ON l.id = li.lead_id
WHERE l.service_requested IS NOT NULL AND trim(l.service_requested) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_inquiry_services s
    WHERE s.inquiry_id = li.id AND s.service_tag = l.service_requested
  );

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


-- <<< END OF: 20260822120000_leads_crm_upgrade.sql <<<

-- >>> START OF: 20260822130000_leads_owner_insert.sql >>>
-- `leads` was only ever insertable via the SECURITY DEFINER submit_lead()
-- RPC (used by the public portfolio form) — there was never a direct INSERT
-- grant/policy for the authenticated owner. The new "Add Lead" dashboard
-- feature inserts directly as the beautician, through their RLS-scoped
-- client, so that path needs to be opened up too.
GRANT INSERT ON public.leads TO authenticated;

DROP POLICY IF EXISTS "leads_owner_insert" ON public.leads;
CREATE POLICY "leads_owner_insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.owns_beautician_profile(beautician_profile_id));


-- <<< END OF: 20260822130000_leads_owner_insert.sql <<<

-- >>> START OF: 20260823180000_service_slugs.sql >>>
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


-- <<< END OF: 20260823180000_service_slugs.sql <<<

-- >>> START OF: 20260824090000_drop_redundant_service_slug_index.sql >>>
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


-- <<< END OF: 20260824090000_drop_redundant_service_slug_index.sql <<<

-- >>> START OF: 20260825100000_guard_media_service_ownership.sql >>>
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


-- <<< END OF: 20260825100000_guard_media_service_ownership.sql <<<

-- >>> START OF: 20260825140000_service_detail_enrichment.sql >>>
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


-- <<< END OF: 20260825140000_service_detail_enrichment.sql <<<

-- >>> START OF: 20260825180000_submit_lead_phone_validation_and_dedup.sql >>>
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


-- <<< END OF: 20260825180000_submit_lead_phone_validation_and_dedup.sql <<<

-- >>> START OF: 20260825220000_lead_inquiries_attribution.sql >>>
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


-- <<< END OF: 20260825220000_lead_inquiries_attribution.sql <<<

-- >>> START OF: 20260827090000_p2_security_relational_hardening.sql >>>
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


-- <<< END OF: 20260827090000_p2_security_relational_hardening.sql <<<

-- >>> START OF: 20260831090000_admin_service_audit_actions.sql >>>
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


-- <<< END OF: 20260831090000_admin_service_audit_actions.sql <<<

-- >>> START OF: 20260831190000_admin_profile_update_audit_action.sql >>>
-- Phase 5.2B — one additive admin_audit_action value for the new Admin
-- Profile Manager's general field-level updates (name, bio, contact,
-- location, social links, images, etc.). The existing
-- "profile_status_changed"/"verification_changed"/"featured_changed"
-- actions stay reserved for their own specific, narrower controls
-- (admin/profiles.server.ts) — this one covers the general Profile form
-- save, mirroring the existing "beautician_profile" entity_type (already
-- present, no new entity_type needed).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'profile_updated';


-- <<< END OF: 20260831190000_admin_profile_update_audit_action.sql <<<

-- >>> START OF: 20260901090000_admin_gallery_audit_actions.sql >>>
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


-- <<< END OF: 20260901090000_admin_gallery_audit_actions.sql <<<

-- >>> START OF: 20260901120000_admin_before_after_audit_actions.sql >>>
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


-- <<< END OF: 20260901120000_admin_before_after_audit_actions.sql <<<

-- >>> START OF: 20260901150000_admin_video_audit_actions.sql >>>
-- Phase 5.2E — additive admin_audit_action values + one new entity_type
-- for the new Admin Videos Manager, following the same "one focused
-- migration, item is the audited unit" convention already used for
-- Gallery (5.2C) and Before & After (5.2D).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'video_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'video_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'video_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'video';


-- <<< END OF: 20260901150000_admin_video_audit_actions.sql <<<

-- >>> START OF: 20260901180000_admin_package_audit_actions.sql >>>
-- Phase 5.2F — additive admin_audit_action values + one new entity_type
-- for the new Admin Packages Manager, following the same "one focused
-- migration, item is the audited unit" convention already used for
-- Gallery (5.2C), Before & After (5.2D), and Videos (5.2E).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'package_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'package_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'package_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'package';


-- <<< END OF: 20260901180000_admin_package_audit_actions.sql <<<

-- >>> START OF: 20260901200000_admin_faq_audit_actions.sql >>>
-- Phase 5.2G — additive admin_audit_action values + one new entity_type
-- for the new Admin FAQs Manager, following the same "one focused
-- migration, item is the audited unit" convention already used for
-- Gallery (5.2C), Before & After (5.2D), Videos (5.2E), and Packages
-- (5.2F).
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'faq_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'faq_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'faq_deleted';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'faq';


-- <<< END OF: 20260901200000_admin_faq_audit_actions.sql <<<

-- >>> START OF: 20260904220000_portfolio_tracking_settings.sql >>>
-- Per-portfolio GTM + marketing tracking phase — a dedicated 1:1
-- tracking-settings table, admin-managed only this phase. No arbitrary
-- script/snippet column: gtm_container_id is the ONLY configurable value,
-- constrained to the canonical GTM-XXXXXXX shape at the database level as
-- defense-in-depth alongside the application's own server-side validation.
-- QA-only migration — NOT applied to the protected backend yet (see the
-- phase report for the exact protected-rollout recommendation).
CREATE TABLE public.portfolio_tracking_settings (
  beautician_profile_id UUID PRIMARY KEY REFERENCES public.beautician_profiles(id) ON DELETE CASCADE,
  gtm_container_id TEXT NULL CHECK (gtm_container_id IS NULL OR gtm_container_id ~ '^GTM-[A-Z0-9]{4,10}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portfolio_tracking_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.portfolio_tracking_settings TO authenticated;
GRANT ALL ON public.portfolio_tracking_settings TO service_role;

ALTER TABLE public.portfolio_tracking_settings ENABLE ROW LEVEL SECURITY;

-- Same existing set_updated_at() trigger function used by every other
-- timestamped table (services, beautician_profiles, lead_inquiries, ...).
CREATE TRIGGER trg_portfolio_tracking_settings_updated
  BEFORE UPDATE ON public.portfolio_tracking_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Public/anon may read tracking config only for a published portfolio —
-- reuses the existing is_published_profile() helper, never a new one.
CREATE POLICY "pts_public_read_published" ON public.portfolio_tracking_settings
  FOR SELECT TO anon, authenticated
  USING (public.is_published_profile(beautician_profile_id));

-- Admin can manage all rows. No owner/professional write policy this
-- phase — the GRANT above technically permits authenticated INSERT/UPDATE/
-- DELETE, but with no matching non-admin RLS policy, a non-admin
-- professional's write is blocked at the row-security layer regardless
-- (the same GRANT-vs-POLICY split already used throughout this schema,
-- e.g. services/packages: broad GRANT, narrow owner/admin POLICY).
CREATE POLICY "pts_admin_all" ON public.portfolio_tracking_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Same "one focused migration, item is the audited unit" convention as
-- Gallery/Before & After/Videos/Packages/FAQs.
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'tracking_settings_created';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'tracking_settings_updated';
ALTER TYPE admin_audit_action ADD VALUE IF NOT EXISTS 'tracking_settings_removed';
ALTER TYPE admin_audit_entity_type ADD VALUE IF NOT EXISTS 'tracking_settings';


-- <<< END OF: 20260904220000_portfolio_tracking_settings.sql <<<

-- >>> START OF: 20260905220000_plan_entitlements.sql >>>
-- 5-tier entitlements (free/starter/silver/gold/platinum). Free remains
-- genuinely useful and stays capable of a future 100/100 Completion Score
-- (not implemented in this phase). Paid tiers add capacity/richness/growth.
--
-- QA-only migration. Adds one enum, one column, extends the existing
-- privileged-field guard (mirrors is_verified/is_featured exactly), and
-- adds DB-level content-limit enforcement on the 8 owner-created content
-- tables plus the gallery photos child table. No RLS redesign: every
-- owner_all/public_read policy on these tables is untouched — enforcement
-- is a BEFORE INSERT trigger layer only, the same division of
-- responsibility already used for is_verified/is_featured and
-- guard_media_service_ownership().
--
-- Numeric limits mirror src/lib/plan-limits.ts exactly — that file is the
-- canonical application-level source; keep both in sync if these ever
-- change.

-- ---------- plan column ----------
CREATE TYPE public.portfolio_plan AS ENUM ('free','starter','silver','gold','platinum');

ALTER TABLE public.beautician_profiles
  ADD COLUMN plan public.portfolio_plan NOT NULL DEFAULT 'free';

-- Admin's plan-change action is logged through the existing
-- logAdminAction()/audit_logs mechanism, same as every other admin
-- action — one new enum value, no new audit table/path.
ALTER TYPE public.admin_audit_action ADD VALUE IF NOT EXISTS 'plan_changed';

-- ---------- extend the existing privileged-field guard ----------
-- guard_beautician_profile_flags() already resets is_verified/is_featured
-- to false/OLD for any non-admin writer (20260819123937). Extending it
-- (CREATE OR REPLACE, same trigger, no new one) is the smallest way to make
-- `plan` admin-only-writable too, exactly as instructed.
--
-- One deliberate difference from is_verified/is_featured: a NULL auth.uid()
-- (service-role/backend caller — no JWT actor, e.g. QA fixture setup or a
-- future backend billing job) is exempt from the `plan` reset specifically,
-- so seeding/changing a profile's plan directly via service-role tooling
-- keeps working. This is safe because RLS's row-level bp_owner_update policy
-- already requires a genuine authenticated JWT matching ownership for a real
-- professional's write to reach this trigger at all — a NULL actor can only
-- be service_role (bypasses RLS with the secret key) or anon (no
-- INSERT/UPDATE grant on this table at all), never a malicious professional.
-- is_verified/is_featured behavior is intentionally left byte-for-byte
-- unchanged (no NULL exemption added there) to avoid altering any
-- pre-existing guarantee.
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

  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.plan := 'free';
    ELSE
      NEW.plan := OLD.plan;
    END IF;
  END IF;

  RETURN NEW;
END; $$;
-- trg_beautician_profiles_flags (BEFORE INSERT OR UPDATE) already exists and
-- picks up this new logic automatically — no CREATE TRIGGER needed here.

-- ---------- content-limit lookup ----------
-- Single source of the numeric matrix on the DB side, mirroring
-- src/lib/plan-limits.ts's LIMITS table exactly. Kept as one small function
-- so the 8 enforcement triggers below stay generic instead of each
-- hardcoding its own copy of the numbers.
CREATE OR REPLACE FUNCTION public.get_plan_content_limit(_plan public.portfolio_plan, _key TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _key
    WHEN 'services' THEN
      CASE _plan WHEN 'free' THEN 5 WHEN 'starter' THEN 10 WHEN 'silver' THEN 20 WHEN 'gold' THEN 50 WHEN 'platinum' THEN 150 END
    WHEN 'packages' THEN
      CASE _plan WHEN 'free' THEN 0 WHEN 'starter' THEN 5 WHEN 'silver' THEN 15 WHEN 'gold' THEN 40 WHEN 'platinum' THEN 100 END
    WHEN 'gallery_photos' THEN
      CASE _plan WHEN 'free' THEN 12 WHEN 'starter' THEN 30 WHEN 'silver' THEN 75 WHEN 'gold' THEN 150 WHEN 'platinum' THEN 300 END
    WHEN 'before_after_items' THEN
      CASE _plan WHEN 'free' THEN 3 WHEN 'starter' THEN 10 WHEN 'silver' THEN 25 WHEN 'gold' THEN 60 WHEN 'platinum' THEN 120 END
    WHEN 'portfolio_videos' THEN
      CASE _plan WHEN 'free' THEN 0 WHEN 'starter' THEN 0 WHEN 'silver' THEN 5 WHEN 'gold' THEN 15 WHEN 'platinum' THEN 30 END
    WHEN 'faqs' THEN
      CASE _plan WHEN 'free' THEN 5 WHEN 'starter' THEN 10 WHEN 'silver' THEN 20 WHEN 'gold' THEN 40 WHEN 'platinum' THEN 80 END
    WHEN 'service_areas' THEN
      CASE _plan WHEN 'free' THEN 3 WHEN 'starter' THEN 8 WHEN 'silver' THEN 20 WHEN 'gold' THEN 50 WHEN 'platinum' THEN 100 END
    WHEN 'reviews' THEN
      CASE _plan WHEN 'free' THEN 0 WHEN 'starter' THEN 20 WHEN 'silver' THEN 50 WHEN 'gold' THEN 100 WHEN 'platinum' THEN 200 END
    ELSE NULL
  END;
$$;

-- ---------- generic content-limit trigger (7 of 8 tables) ----------
-- Covers every table whose plan-limited row count is counted directly
-- against its own beautician_profile_id column: services, packages, faqs,
-- service_areas, reviews, portfolio_videos, before_after_items. Gallery
-- photos (portfolio_images) is the one exception — its cap is on a child
-- table two hops from beautician_profiles — handled by a dedicated function
-- below.
--
-- BEFORE INSERT only (never UPDATE/DELETE): existing/over-cap rows must
-- remain fully editable and deletable (e.g. after a downgrade) — only the
-- creation of a brand-new row is ever blocked.
--
-- Deliberately NOT admin-exempt: the product rule is that Admin retains
-- full edit/delete/reorder/plan-change/status rights, but creating NEW
-- content must still respect the portfolio's stored plan — Admin has no
-- override mechanism for content creation. Admin's path to add more content
-- than a plan allows is to change the plan first (an action Admin can
-- always take), then create — never a bypass on the create path itself.
--
-- Only a NULL auth.uid() (service-role/backend caller — no JWT actor, e.g.
-- QA fixture setup or a future backend job) is exempt, for the same
-- RLS-backed reasoning used elsewhere in this migration: a malicious
-- professional can never present a NULL auth.uid() through the owner RLS
-- policies these tables already use, so this exemption cannot be exploited
-- by a real professional or by Admin acting through the normal app.
CREATE OR REPLACE FUNCTION public.enforce_plan_content_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plan public.portfolio_plan;
  _limit INTEGER;
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO _plan FROM public.beautician_profiles WHERE id = NEW.beautician_profile_id;
  IF _plan IS NULL THEN
    RETURN NEW;
  END IF;

  _limit := public.get_plan_content_limit(_plan, TG_TABLE_NAME);
  IF _limit IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE beautician_profile_id = $1', TG_TABLE_NAME)
    INTO _count
    USING NEW.beautician_profile_id;

  IF _count >= _limit THEN
    RAISE EXCEPTION 'Plan limit reached: your % plan allows up to % %. Upgrade for more capacity.',
      _plan, _limit, TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_services_plan_limit BEFORE INSERT ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_packages_plan_limit BEFORE INSERT ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_faqs_plan_limit BEFORE INSERT ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_service_areas_plan_limit BEFORE INSERT ON public.service_areas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_reviews_plan_limit BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_portfolio_videos_plan_limit BEFORE INSERT ON public.portfolio_videos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();
CREATE TRIGGER trg_before_after_items_plan_limit BEFORE INSERT ON public.before_after_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_content_limit();

-- ---------- gallery photos (portfolio_images) ----------
-- The cap is "12 photos", matching marketing, not "12 gallery entries" —
-- portfolio_images has no beautician_profile_id of its own, so this
-- resolves it via portfolio_item_id -> portfolio_items.beautician_profile_id
-- and counts every photo across all of that profile's gallery entries.
--
-- Same admin-not-exempt / NULL-only-exempt reasoning as
-- enforce_plan_content_limit() above.
CREATE OR REPLACE FUNCTION public.enforce_plan_gallery_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bp_id UUID;
  _plan public.portfolio_plan;
  _limit INTEGER;
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT beautician_profile_id INTO _bp_id
    FROM public.portfolio_items WHERE id = NEW.portfolio_item_id;
  IF _bp_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO _plan FROM public.beautician_profiles WHERE id = _bp_id;
  IF _plan IS NULL THEN
    RETURN NEW;
  END IF;

  _limit := public.get_plan_content_limit(_plan, 'gallery_photos');

  SELECT count(*) INTO _count
    FROM public.portfolio_images pi
    JOIN public.portfolio_items it ON it.id = pi.portfolio_item_id
    WHERE it.beautician_profile_id = _bp_id;

  IF _count >= _limit THEN
    RAISE EXCEPTION 'Plan limit reached: your % plan allows up to % gallery photos. Upgrade for more capacity.',
      _plan, _limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_portfolio_images_plan_limit BEFORE INSERT ON public.portfolio_images
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_gallery_limit();


-- <<< END OF: 20260905220000_plan_entitlements.sql <<<

-- >>> START OF: 20260906090000_portfolio_completion_score.sql >>>
-- Portfolio Completion Score (Stage 1) — 0-100, system-generated only.
-- Free reaches exactly 100 using only universally-available content; no
-- paid-only feature contributes points (Packages/Videos/Reviews/GTM/
-- Verification/Lead Performance/plan are entirely outside this formula).
--
-- QA-only migration. ONE authoritative scoring algorithm
-- (compute_portfolio_score) lives here in SQL — never reimplemented in
-- TypeScript — because every scored child table already has an
-- owner-level RLS policy permitting a direct authenticated client write
-- that would silently bypass any application-layer recomputation. DB
-- triggers are the only mechanism that sees every write path (app server
-- functions, direct Supabase client writes, and Admin actions alike).
--
-- Additive only: 1 column, 4 functions, 7 triggers, 1 backfill UPDATE.
-- No RLS redesign.
--
-- Wrapped in a single transaction so the column, every function/trigger,
-- and the existing-profile backfill apply atomically in the SQL Editor —
-- either the whole migration lands, or none of it does.
BEGIN;

-- ---------- persisted score column ----------
ALTER TABLE public.beautician_profiles
  ADD COLUMN completion_score INTEGER NOT NULL DEFAULT 0
    CHECK (completion_score BETWEEN 0 AND 100);

-- ---------- the ONE authoritative scoring algorithm ----------
-- Takes the full row (not just an id) so it works identically whether the
-- row is already persisted (UPDATE, RPC calls) or not yet committed
-- (BEFORE INSERT, using NEW directly) — child-table subqueries correctly
-- return 0/false for a brand-new profile id regardless of whether the
-- parent row is fully committed, since FK integrity only constrains
-- writes, never reads.
--
-- Deliberately NOT granted to PUBLIC/authenticated (see REVOKE below) —
-- callable only by other SECURITY DEFINER functions that already own it
-- (the trigger below, and compute_portfolio_score_by_id), so a client can
-- never call this directly with an arbitrary row to read another
-- professional's breakdown, bypassing the ownership check in the RPC
-- wrapper. This is the structural reason "no private breakdown leak" is
-- guaranteed, not just the wrapper's own IF check.
--
-- Validation rules (exact, per product sign-off):
--   - every text field is trimmed before being judged "present";
--     whitespace-only values earn zero, identically to an empty string.
--   - bio uses length(trim(bio)) >= 80, the same trim-then-length
--     semantics as the existing Readiness MIN_BIO_LENGTH check
--     (src/lib/seo-helpers.ts) — not reused code, but reused semantics.
--   - Highlights / Why Choose You count only array items that are
--     non-empty after trimming; a list of blank strings scores as empty.
--   - Services/Service Areas: only is_active = true rows count.
--   - Gallery/Before & After: only is_published = true rows count.
--   - FAQs: only is_published = true rows count.
--   - Availability: "configured" requires at least one working_hours
--     array entry with available = true and both start/end matching
--     ^\d{2}:\d{2} — the exact same predicate as
--     buildOpeningHoursSpecification() in src/lib/seo-helpers.ts, ported
--     to SQL rather than re-derived, so the two can never silently drift
--     in meaning even though they're necessarily two implementations
--     (one JS helper for public JSON-LD rendering, one SQL helper for
--     scoring) — hardening against a malformed/non-array JSON value is
--     built in (falls back to an empty array, never errors).
CREATE OR REPLACE FUNCTION public.compute_portfolio_score(_profile public.beautician_profiles)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _identity_pts INTEGER := 0;
  _photo_pts INTEGER := 0;
  _bio_pts INTEGER := 0;
  _location_pts INTEGER := 0;
  _contact_pts INTEGER := 0;
  _services_pts INTEGER := 0;
  _portfolio_pts INTEGER := 0;
  _availability_pts INTEGER := 0;
  _areas_pts INTEGER := 0;
  _faqs_pts INTEGER := 0;
  _highlights_pts INTEGER := 0;

  _bio_len INTEGER;
  _services_count INTEGER;
  _portfolio_count INTEGER;
  _areas_count INTEGER;
  _faqs_count INTEGER;
  _highlights_count INTEGER;
  _why_choose_count INTEGER;
  _availability_configured BOOLEAN;
  _total INTEGER;
BEGIN
  -- 1. Identity basics (10 = 4 name + 3 title + 3 tagline)
  IF trim(coalesce(_profile.display_name, '')) <> '' THEN _identity_pts := _identity_pts + 4; END IF;
  IF trim(coalesce(_profile.professional_title, '')) <> '' THEN _identity_pts := _identity_pts + 3; END IF;
  IF trim(coalesce(_profile.short_tagline, '')) <> '' THEN _identity_pts := _identity_pts + 3; END IF;

  -- 2. Profile photo (10, binary)
  IF trim(coalesce(_profile.profile_image_url, '')) <> '' THEN _photo_pts := 10; END IF;

  -- 3. About / bio (15) — 0 empty, 7 non-empty but <80 chars, 15 if >=80
  _bio_len := length(trim(coalesce(_profile.bio, '')));
  IF _bio_len >= 80 THEN
    _bio_pts := 15;
  ELSIF _bio_len > 0 THEN
    _bio_pts := 7;
  END IF;

  -- 4. Location (8 = 5 city + 3 locality)
  IF trim(coalesce(_profile.primary_city, '')) <> '' THEN _location_pts := _location_pts + 5; END IF;
  IF trim(coalesce(_profile.locality, '')) <> '' THEN _location_pts := _location_pts + 3; END IF;

  -- 5. Contact (8, binary — phone OR whatsapp)
  IF trim(coalesce(_profile.phone, '')) <> '' OR trim(coalesce(_profile.whatsapp_number, '')) <> '' THEN
    _contact_pts := 8;
  END IF;

  -- 6. Services (12) — active only. 0 -> 0, 1-2 -> 6, >=3 -> 12
  SELECT count(*) INTO _services_count FROM public.services
    WHERE beautician_profile_id = _profile.id AND is_active = true;
  IF _services_count >= 3 THEN
    _services_pts := 12;
  ELSIF _services_count >= 1 THEN
    _services_pts := 6;
  END IF;

  -- 7. Portfolio work (10) — published gallery items + published
  -- before/after items, combined. 0 -> 0, 1-2 -> 5, >=3 -> 10
  SELECT
    (SELECT count(*) FROM public.portfolio_items
      WHERE beautician_profile_id = _profile.id AND is_published = true)
    + (SELECT count(*) FROM public.before_after_items
      WHERE beautician_profile_id = _profile.id AND is_published = true)
  INTO _portfolio_count;
  IF _portfolio_count >= 3 THEN
    _portfolio_pts := 10;
  ELSIF _portfolio_count >= 1 THEN
    _portfolio_pts := 5;
  END IF;

  -- 8. Availability (8, binary) — real working_hours semantics, ported
  -- from buildOpeningHoursSpecification(); never errors on NULL/malformed
  -- JSON (falls back to an empty array).
  SELECT EXISTS (
    SELECT 1
    FROM public.availability_settings avs
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(avs.working_hours) = 'array' THEN avs.working_hours ELSE '[]'::jsonb END
    ) AS entry
    WHERE avs.beautician_profile_id = _profile.id
      AND entry->>'available' = 'true'
      AND (entry->>'start') ~ '^\d{2}:\d{2}'
      AND (entry->>'end') ~ '^\d{2}:\d{2}'
  ) INTO _availability_configured;
  IF _availability_configured THEN _availability_pts := 8; END IF;

  -- 9. Service areas (7, binary) — active only
  SELECT count(*) INTO _areas_count FROM public.service_areas
    WHERE beautician_profile_id = _profile.id AND is_active = true;
  IF _areas_count >= 1 THEN _areas_pts := 7; END IF;

  -- 10. FAQs (6) — published only. 0 -> 0, 1 -> 3, >=2 -> 6
  SELECT count(*) INTO _faqs_count FROM public.faqs
    WHERE beautician_profile_id = _profile.id AND is_published = true;
  IF _faqs_count >= 2 THEN
    _faqs_pts := 6;
  ELSIF _faqs_count >= 1 THEN
    _faqs_pts := 3;
  END IF;

  -- 11. Highlights + Why Choose You (6) — only non-empty trimmed items
  -- count; a list of blank strings is treated as empty. 0 if both lists
  -- have zero qualifying items; 3 if either list has >=1; 6 if BOTH
  -- lists have >=2.
  SELECT count(*) INTO _highlights_count
    FROM unnest(coalesce(_profile.about_highlights, '{}')) AS h WHERE trim(h) <> '';
  SELECT count(*) INTO _why_choose_count
    FROM unnest(coalesce(_profile.why_choose_points, '{}')) AS w WHERE trim(w) <> '';
  IF _highlights_count >= 2 AND _why_choose_count >= 2 THEN
    _highlights_pts := 6;
  ELSIF _highlights_count >= 1 OR _why_choose_count >= 1 THEN
    _highlights_pts := 3;
  END IF;

  _total := _identity_pts + _photo_pts + _bio_pts + _location_pts + _contact_pts
    + _services_pts + _portfolio_pts + _availability_pts + _areas_pts + _faqs_pts + _highlights_pts;

  RETURN jsonb_build_object(
    'total', _total,
    'criteria', jsonb_build_array(
      jsonb_build_object('id','identity','label','Identity basics','earned',_identity_pts,'max',10),
      jsonb_build_object('id','photo','label','Profile photo','earned',_photo_pts,'max',10),
      jsonb_build_object('id','bio','label','About / bio','earned',_bio_pts,'max',15),
      jsonb_build_object('id','location','label','Location','earned',_location_pts,'max',8),
      jsonb_build_object('id','contact','label','Contact','earned',_contact_pts,'max',8),
      jsonb_build_object('id','services','label','Services','earned',_services_pts,'max',12),
      jsonb_build_object('id','portfolio_work','label','Portfolio work','earned',_portfolio_pts,'max',10),
      jsonb_build_object('id','availability','label','Availability','earned',_availability_pts,'max',8),
      jsonb_build_object('id','service_areas','label','Service areas','earned',_areas_pts,'max',7),
      jsonb_build_object('id','faqs','label','FAQs','earned',_faqs_pts,'max',6),
      jsonb_build_object('id','highlights','label','Highlights + Why Choose You','earned',_highlights_pts,'max',6)
    )
  );
END; $$;

-- Never directly callable by any client — internal use only (see header
-- comment). Both SECURITY DEFINER callers below already own this
-- function and can invoke it regardless of this revoke.
REVOKE ALL ON FUNCTION public.compute_portfolio_score(public.beautician_profiles) FROM PUBLIC;

-- ---------- secure breakdown RPC ----------
-- Professional: may read only their own breakdown (owns_beautician_profile).
-- Admin: may read any professional's breakdown (has_role check).
-- Professional B / anonymous: rejected by the explicit IF check below,
-- and additionally blocked at the grant layer (REVOKE ALL + GRANT to
-- authenticated only) so an unauthenticated caller cannot reach the
-- function at all, not just fail its internal check. Fixed search_path
-- (SET search_path = public) prevents search-path hijacking, per Postgres
-- SECURITY DEFINER hardening guidance. Returns nothing beyond the score
-- breakdown itself — no customer/private data of any kind.
CREATE OR REPLACE FUNCTION public.compute_portfolio_score_by_id(_bp_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _profile public.beautician_profiles;
BEGIN
  IF NOT (public.owns_beautician_profile(_bp_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorized to view this portfolio completion score';
  END IF;

  SELECT * INTO _profile FROM public.beautician_profiles WHERE id = _bp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN public.compute_portfolio_score(_profile);
END; $$;

REVOKE ALL ON FUNCTION public.compute_portfolio_score_by_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_portfolio_score_by_id(UUID) TO authenticated;

-- ---------- automatic recomputation: beautician_profiles itself ----------
-- Unconditionally overwrites NEW.completion_score on every insert/update,
-- regardless of what changed or who the actor is — there is no
-- legitimate direct-set case for this column for ANY actor (unlike
-- plan/is_verified, which admins may set), so unlike
-- guard_beautician_profile_flags() there is no actor branching at all:
-- professional and Admin edits are recomputed identically. A BEFORE
-- trigger mutating NEW in-memory issues no further UPDATE statement, so
-- this cannot recurse or re-fire any other trigger.
CREATE OR REPLACE FUNCTION public.recompute_completion_score()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.completion_score := (public.compute_portfolio_score(NEW)->>'total')::integer;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_beautician_profiles_score BEFORE INSERT OR UPDATE ON public.beautician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.recompute_completion_score();

-- ---------- automatic recomputation: the 6 scored child tables ----------
-- One generic AFTER trigger function, attached to all 6 tables that share
-- the beautician_profile_id column shape — mirrors the exact
-- "one generic function, N CREATE TRIGGER attachments" pattern already
-- used for enforce_plan_content_limit() in the entitlements migration.
-- Contains ZERO scoring knowledge: it only "pokes" the parent row so
-- beautician_profiles' own BEFORE trigger (above) performs the actual,
-- single authoritative computation. This is what guarantees the scoring
-- formula is never duplicated into a child trigger. The literal value
-- assigned in the UPDATE's SET clause is irrelevant — it exists only to
-- make Postgres fire the parent's BEFORE UPDATE trigger, which then
-- overwrites completion_score with the freshly computed value regardless.
-- TG_OP-explicit rather than a single COALESCE(NEW, OLD) read: on UPDATE,
-- a scored child row can be reassigned to a different parent (its
-- beautician_profile_id changed), and COALESCE(NEW, OLD) would only ever
-- touch the NEW parent, leaving the OLD parent's completion_score stale
-- (e.g. it would keep credit for a service that moved away). This handles
-- INSERT (touch NEW's parent), DELETE (touch OLD's parent), and UPDATE
-- (touch NEW's parent, and ALSO touch OLD's parent when the row moved to
-- a different profile) explicitly. Still contains ZERO scoring knowledge
-- — it only "pokes" whichever parent row(s) need to recompute.
-- portfolio_images is intentionally excluded — no criterion depends on
-- photo-level counts (criterion 7 is scored at the portfolio_items row
-- level), so it needs no trigger here.
CREATE OR REPLACE FUNCTION public.touch_portfolio_score()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.beautician_profile_id IS NOT NULL THEN
      UPDATE public.beautician_profiles SET completion_score = completion_score
        WHERE id = NEW.beautician_profile_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.beautician_profile_id IS NOT NULL THEN
      UPDATE public.beautician_profiles SET completion_score = completion_score
        WHERE id = OLD.beautician_profile_id;
    END IF;
    RETURN OLD;
  ELSE -- UPDATE
    IF NEW.beautician_profile_id IS NOT NULL THEN
      UPDATE public.beautician_profiles SET completion_score = completion_score
        WHERE id = NEW.beautician_profile_id;
    END IF;
    IF OLD.beautician_profile_id IS NOT NULL
      AND OLD.beautician_profile_id IS DISTINCT FROM NEW.beautician_profile_id THEN
      UPDATE public.beautician_profiles SET completion_score = completion_score
        WHERE id = OLD.beautician_profile_id;
    END IF;
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER trg_services_score AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_portfolio_items_score AFTER INSERT OR UPDATE OR DELETE ON public.portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_before_after_items_score AFTER INSERT OR UPDATE OR DELETE ON public.before_after_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_availability_settings_score AFTER INSERT OR UPDATE OR DELETE ON public.availability_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_service_areas_score AFTER INSERT OR UPDATE OR DELETE ON public.service_areas
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();
CREATE TRIGGER trg_faqs_score AFTER INSERT OR UPDATE OR DELETE ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_score();

-- ---------- existing-profile backfill ----------
-- Every trigger/function above must exist BEFORE this runs. Assigning a
-- column to itself still fires the BEFORE UPDATE trigger on every row
-- (Postgres fires triggers based on the UPDATE statement targeting the
-- row, not on whether the assigned value differs) — trg_beautician_profiles_score
-- then overwrites completion_score with the true computed value for every
-- historical profile in one statement. No profile is left at the DEFAULT 0.
UPDATE public.beautician_profiles SET completion_score = completion_score;

COMMIT;


-- <<< END OF: 20260906090000_portfolio_completion_score.sql <<<

-- >>> START OF: 20260906100000_billing_phase_a_foundation.sql >>>
-- BILLING PHASE A — foundation schema for self-serve/Admin-manual paid plans.
-- Approved architecture: Free is permanent; Starter/Silver/Gold/Platinum are
-- fixed-duration (monthly/yearly), no auto-renew. Payment verification is
-- server-side only — a client can never mark its own order paid/activated.
-- This migration adds the billing tables, the 4 new commercial-state columns
-- on beautician_profiles, and the SQL functions that give the system one
-- canonical compatibility engine and one canonical reconciliation authority.
-- No gateway integration, no webhook endpoint, no real/test provider order —
-- those remain Phase B. NOT applied to QA or protected as part of this pass.

BEGIN;

-- ============================================================
-- 1. Enums
-- ============================================================
CREATE TYPE public.billing_order_status AS ENUM (
  'created', 'activated', 'failed', 'cancelled', 'needs_review', 'superseded'
);
CREATE TYPE public.payment_status AS ENUM ('captured', 'failed', 'refunded');
CREATE TYPE public.billing_cycle  AS ENUM ('monthly', 'yearly');
CREATE TYPE public.plan_source    AS ENUM ('free', 'manual', 'paid');

-- ============================================================
-- 2. billing_orders
-- ============================================================
-- gateway_order_id is nullable: the local order is always created first
-- (and wins the one-open-order slot) before any external provider call is
-- ever attempted — see gateway_creation_started_at below for the atomic
-- claim that ensures only one caller ever makes that external call.
CREATE TABLE public.billing_orders (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beautician_profile_id       UUID NOT NULL REFERENCES public.beautician_profiles(id),
  plan                        public.portfolio_plan NOT NULL,
  billing_cycle               public.billing_cycle NOT NULL,
  amount_paise                INTEGER NOT NULL CHECK (amount_paise > 0),
  currency                    TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  gateway                     TEXT NOT NULL,
  gateway_order_id            TEXT NULL,
  status                      public.billing_order_status NOT NULL DEFAULT 'created',
  expected_state_version      INTEGER NOT NULL,
  -- Atomic provider-creation claim (Phase A foundation only — no HTTP call
  -- is ever made by this migration). A caller may only call the external
  -- provider after winning the claim below; see
  -- src/data/billing/order.server.ts for the claim protocol.
  gateway_creation_started_at TIMESTAMPTZ NULL,
  -- Immutable, per-order historical record of what THIS order produced —
  -- never re-derived from beautician_profiles.plan_expires_at, which is
  -- only the profile's CURRENT effective expiry and changes on renewal.
  activated_at                TIMESTAMPTZ NULL,
  access_starts_at            TIMESTAMPTZ NULL,
  access_expires_at           TIMESTAMPTZ NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_orders_plan_not_free CHECK (plan <> 'free'),
  UNIQUE (gateway, gateway_order_id)
);

CREATE INDEX idx_billing_orders_profile ON public.billing_orders (beautician_profile_id);
CREATE INDEX idx_billing_orders_status  ON public.billing_orders (status);

-- One unresolved checkout per profile at a time (not scoped by plan/cycle —
-- simpler and closes the "two simultaneous open checkouts" ambiguity).
CREATE UNIQUE INDEX idx_billing_orders_one_open
  ON public.billing_orders (beautician_profile_id)
  WHERE status = 'created';

-- Reuse the existing canonical updated_at trigger helper (set_updated_at,
-- defined in the original schema migration) — no duplicate utility.
CREATE TRIGGER trg_billing_orders_updated BEFORE UPDATE ON public.billing_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. payments
-- ============================================================
CREATE TABLE public.payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_order_id     UUID NOT NULL REFERENCES public.billing_orders(id),
  gateway              TEXT NOT NULL,
  gateway_payment_id   TEXT NOT NULL,
  amount_paise         INTEGER NOT NULL CHECK (amount_paise > 0),
  currency             TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  status               public.payment_status NOT NULL,
  verified_at          TIMESTAMPTZ NULL,
  raw_gateway_payload  JSONB NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_payment_id)
);

CREATE INDEX idx_payments_order ON public.payments (billing_order_id);

-- DB-enforced (not just trusted insert logic): a payment's gateway must
-- always match its parent order's gateway — provider-neutral correctness
-- backstop, not a defense against an untrusted client (payments has no
-- client-facing grant at all — see §7 below).
CREATE OR REPLACE FUNCTION public.enforce_payment_gateway_matches_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.gateway <> (SELECT gateway FROM public.billing_orders WHERE id = NEW.billing_order_id) THEN
    RAISE EXCEPTION 'payment gateway (%) does not match parent order gateway', NEW.gateway
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_payment_gateway
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_gateway_matches_order();

-- ============================================================
-- 4. billing_events
-- ============================================================
-- Two-stage webhook processing bookkeeping (approved design): the receipt/
-- attempt transaction commits processing_attempts/last_attempted_at BEFORE
-- business processing runs, so a business-transaction rollback can never
-- erase attempt history. last_error is a short, sanitized human-readable
-- reason only — never a raw stack trace, signature, or payload fragment.
-- No separate secrets/signature column: nothing about verifying a webhook
-- signature is ever persisted here or anywhere else.
CREATE TABLE public.billing_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway              TEXT NOT NULL,
  gateway_event_id     TEXT NOT NULL,
  event_type           TEXT NOT NULL,
  payload              JSONB NOT NULL,
  processed_at         TIMESTAMPTZ NULL,
  processing_attempts  INTEGER NOT NULL DEFAULT 0,
  last_error           TEXT NULL,
  last_attempted_at    TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_event_id)
);

-- ============================================================
-- 5. beautician_profiles — exactly 4 new commercial-state columns
-- ============================================================
-- Nullable first: plan_source's correct value depends on each row's
-- existing `plan`, so it cannot be safely backfilled with a single
-- blanket DEFAULT (see backfill block below).
ALTER TABLE public.beautician_profiles
  ADD COLUMN plan_source              public.plan_source NULL,
  ADD COLUMN plan_expires_at          TIMESTAMPTZ NULL,
  ADD COLUMN billing_hold             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN commercial_state_version INTEGER NOT NULL DEFAULT 0;

-- ---------- exact, data-aware backfill ----------
-- Existing Free profiles -> plan_source='free'.
-- Existing non-Free profiles (all manually set by Admin today, e.g.
-- dharti-panchal on Silver) -> plan_source='manual', NEVER 'free'. A
-- blanket DEFAULT 'free' would have silently mislabeled every existing
-- paid profile — this explicit UPDATE is why that is avoided.
UPDATE public.beautician_profiles
  SET plan_source = CASE
    WHEN plan = 'free' THEN 'free'::public.plan_source
    ELSE 'manual'::public.plan_source
  END;
-- plan_expires_at is correctly left NULL for every existing row (no plan
-- was ever purchased with a defined duration) — explicit no-op, no ALTER
-- needed. billing_hold=false and commercial_state_version=0 are already
-- correct for every row via their column defaults above.

ALTER TABLE public.beautician_profiles
  ALTER COLUMN plan_source SET NOT NULL,
  ALTER COLUMN plan_source SET DEFAULT 'free';

-- ---------- commercial-state DB constraints ----------
-- Only invariants with NO legitimate exception are enforced here.
-- Deliberately NOT enforced (remains application/reconciliation
-- semantics): "plan_source='manual' implies non-NULL plan_expires_at" —
-- a permanent Admin/manual complimentary grant is a valid, indefinite
-- non-Free plan with no expiry by design.
--
-- 'paid', however, DOES get that invariant enforced (paid-expiry patch):
-- plan_source='paid' means the entitlement came from a fixed-duration
-- paid purchase, which by definition always has a resulting expiry —
-- there is no legitimate "permanent paid" state, unlike 'manual'. This
-- runs AFTER the backfill above, against data the backfill has already
-- made compliant (every existing non-Free profile was backfilled to
-- plan_source='manual', never 'paid' — see §6 of the report for the
-- exact existing-row verification).
ALTER TABLE public.beautician_profiles
  ADD CONSTRAINT bp_commercial_state_version_nonneg
    CHECK (commercial_state_version >= 0),
  ADD CONSTRAINT bp_plan_source_free_is_free
    CHECK (plan_source <> 'free' OR plan = 'free'),
  ADD CONSTRAINT bp_plan_source_paid_not_free
    CHECK (plan_source <> 'paid' OR plan <> 'free'),
  ADD CONSTRAINT bp_plan_source_paid_has_expiry
    CHECK (plan_source <> 'paid' OR plan_expires_at IS NOT NULL),
  ADD CONSTRAINT bp_billing_hold_implies_free
    CHECK (NOT billing_hold OR plan = 'free');

-- ============================================================
-- 6. Grace period — one canonical helper, never a repeated literal
-- ============================================================
-- Provisional Stage-1 value: 7 days. This is a business decision that
-- still requires explicit owner approval before protected billing launch
-- — see the implementation report. Changing it later is a one-function
-- CREATE OR REPLACE, never a multi-site find-and-replace.
CREATE OR REPLACE FUNCTION public.commercial_grace_period()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $$
  SELECT interval '7 days';
$$;

-- ============================================================
-- 7. Canonical Free-compatibility engine
-- ============================================================
-- Built on the SAME public.get_plan_content_limit() the entitlement
-- triggers already use (20260905220000_plan_entitlements.sql) — never a
-- second, independently-drifting copy of the limit numbers. Mirrors
-- validatePlanDowngrade()'s module coverage exactly (services, packages,
-- gallery_photos via the portfolio_items join, before_after_items,
-- portfolio_videos, faqs, service_areas, reviews) plus the same GTM check
-- — but with the divergence parameterized via _ignore_gtm rather than
-- duplicated as a second implementation.
CREATE OR REPLACE FUNCTION public.check_plan_compatibility(
  _bp_id UUID,
  _target_plan public.portfolio_plan,
  _ignore_gtm BOOLEAN DEFAULT false
)
RETURNS TABLE(module TEXT, current_count INTEGER, limit_count INTEGER, compatible BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _module TEXT;
  _limit INTEGER;
  _count INTEGER;
  _gallery_count INTEGER;
  _gallery_limit INTEGER;
  _gtm_exists BOOLEAN;
BEGIN
  FOREACH _module IN ARRAY ARRAY['services','packages','before_after_items','portfolio_videos','faqs','service_areas','reviews']
  LOOP
    _limit := public.get_plan_content_limit(_target_plan, _module);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE beautician_profile_id = $1', _module)
      INTO _count USING _bp_id;
    module := _module;
    current_count := _count;
    limit_count := _limit;
    compatible := _count <= _limit;
    RETURN NEXT;
  END LOOP;

  -- gallery_photos: two-hop relationship via portfolio_items, same as
  -- enforce_plan_gallery_limit() / validatePlanDowngrade()'s gallery check.
  _gallery_limit := public.get_plan_content_limit(_target_plan, 'gallery_photos');
  SELECT count(*) INTO _gallery_count
    FROM public.portfolio_images pi
    JOIN public.portfolio_items it ON it.id = pi.portfolio_item_id
    WHERE it.beautician_profile_id = _bp_id;
  module := 'gallery_photos';
  current_count := _gallery_count;
  limit_count := _gallery_limit;
  compatible := _gallery_count <= _gallery_limit;
  RETURN NEXT;

  -- GTM: _ignore_gtm=false (Admin manual downgrade) keeps today's strict
  -- rule — a stored GTM configuration blocks the move. _ignore_gtm=true
  -- (automatic expiry-to-Free) never blocks on GTM — dormant configuration
  -- simply stops being publicly injected (planAllowsGtm() read-time gate),
  -- and is never deleted here or anywhere else.
  IF NOT _ignore_gtm AND NOT public.plan_allows_gtm(_target_plan) THEN
    SELECT EXISTS(
      SELECT 1 FROM public.portfolio_tracking_settings WHERE beautician_profile_id = _bp_id
    ) INTO _gtm_exists;
    module := 'gtm_tracking';
    current_count := CASE WHEN _gtm_exists THEN 1 ELSE 0 END;
    limit_count := 0;
    compatible := NOT _gtm_exists;
    RETURN NEXT;
  END IF;
END;
$$;

-- Small mirror of src/lib/plan-limits.ts's planAllowsGtm() / GTM_MIN_PLAN
-- ("silver") — kept as its own tiny named function (not inlined) so the
-- single literal threshold is visible and grep-able in one place, same
-- spirit as commercial_grace_period().
CREATE OR REPLACE FUNCTION public.plan_allows_gtm(_plan public.portfolio_plan)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT _plan IN ('silver','gold','platinum');
$$;

REVOKE ALL ON FUNCTION public.check_plan_compatibility(UUID, public.portfolio_plan, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_plan_compatibility(UUID, public.portfolio_plan, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.check_plan_compatibility(UUID, public.portfolio_plan, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_plan_compatibility(UUID, public.portfolio_plan, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.plan_allows_gtm(public.portfolio_plan) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_allows_gtm(public.portfolio_plan) TO service_role;

-- ============================================================
-- 8. Canonical reconciliation authority
-- ============================================================
-- Idempotent; row-locks the target profile first so concurrent
-- reconciliation attempts for the SAME profile serialize safely without
-- an external lock manager. Increments commercial_state_version only when
-- the stored commercial state actually changes. Never deletes/unpublishes
-- content, never mutates `status` (publication choice stays entirely the
-- professional's own setting).
CREATE OR REPLACE FUNCTION public.reconcile_commercial_state(_bp_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.beautician_profiles%ROWTYPE;
  _compatible BOOLEAN;
BEGIN
  SELECT * INTO _row FROM public.beautician_profiles WHERE id = _bp_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- FREE: nothing to reconcile.
  IF _row.plan = 'free' THEN
    RETURN;
  END IF;

  -- MANUAL, NON-EXPIRING: a permanent Admin/manual grant. Valid, no-op.
  -- (plan_source='manual' is the ONLY source permitted a NULL expiry — see
  -- bp_plan_source_paid_has_expiry below.)
  IF _row.plan_source = 'manual' AND _row.plan_expires_at IS NULL THEN
    RETURN;
  END IF;

  -- Paid-expiry patch: by elimination, reaching here with a NULL expiry
  -- means plan_source='paid' with no expiry recorded — 'free' already
  -- returned above, and 'manual' + NULL expiry was just handled as the
  -- one valid permanent-grant case. plan_source='paid' NEVER has a
  -- legitimate permanent form: a fixed-duration paid purchase always
  -- produces an expiry by definition, and bp_plan_source_paid_has_expiry
  -- now makes this structurally impossible for any row written after
  -- this migration. This branch is therefore defensive-only — it must
  -- never silently invent an expiry, never guess "still active", and
  -- never alter entitlement automatically. It refuses reconciliation with
  -- a controlled exception so the failure is loud and logged (for
  -- support), and the public loader's already-implemented fail-closed
  -- safety path (ensurePublicAccessSafe() / is_commercial_access_current())
  -- takes over from there rather than this function guessing at a policy.
  IF _row.plan_expires_at IS NULL THEN
    RAISE EXCEPTION
      'Inconsistent commercial state for profile %: plan_source=paid with no plan_expires_at recorded — refusing to reconcile automatically.',
      _bp_id
      USING ERRCODE = 'P0001';
  END IF;

  -- PAID/MANUAL ACTIVE: expiry still in the future. No-op.
  IF _row.plan_expires_at > now() THEN
    RETURN;
  END IF;

  -- GRACE: expiry passed but still within the grace window. Retain
  -- current plan and visibility unchanged.
  IF now() <= _row.plan_expires_at + public.commercial_grace_period() THEN
    RETURN;
  END IF;

  -- GRACE ENDED. Evaluate Free-compatibility, ignoring GTM (dormant GTM
  -- must never block automatic expiry-to-Free).
  SELECT bool_and(compatible) INTO _compatible
    FROM public.check_plan_compatibility(_bp_id, 'free', true);

  IF _compatible THEN
    -- FREE-COMPATIBLE: drop to Free cleanly, no hold. Content, media, and
    -- the professional's own publication choice (`status`) are untouched.
    UPDATE public.beautician_profiles
      SET plan = 'free',
          plan_source = 'free',
          plan_expires_at = NULL,
          billing_hold = false,
          commercial_state_version = commercial_state_version + 1
      WHERE id = _bp_id;
  ELSE
    -- FREE-INCOMPATIBLE: `plan` is corrected to 'free' immediately (it is
    -- the live entitlement authority, never a place to keep a stale paid
    -- tier as implicit history — that history lives permanently in
    -- billing_orders/payments instead). billing_hold=true removes public
    -- visibility only; every piece of content, and the professional's own
    -- publication choice, remains exactly as it was.
    UPDATE public.beautician_profiles
      SET plan = 'free',
          plan_source = 'free',
          plan_expires_at = NULL,
          billing_hold = true,
          commercial_state_version = commercial_state_version + 1
      WHERE id = _bp_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_commercial_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_commercial_state(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_commercial_state(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_commercial_state(UUID) TO service_role;

-- ============================================================
-- 8a. Public-safety fallback: is current stored state safe to serve
--     WITHOUT running reconciliation? (final QA-gate patch)
-- ============================================================
-- Narrow, read-only, purely time/hold-based check — deliberately NOT a
-- second Free-compatibility engine. It answers only "would reconciliation,
-- if it ran right now, leave this profile in a publicly-servable state",
-- by mirroring reconcile_commercial_state()'s own branches exactly
-- (including its refusal to treat plan_source='paid' with a NULL expiry
-- as anything other than unsafe) — never an independently invented,
-- stricter, or looser policy. Uses the SAME commercial_grace_period()
-- helper — one authoritative grace definition, never a second 7-day
-- literal.
--
-- Paid-expiry patch: the prior rule "non-Free, non-permanent-manual, NULL
-- expiry = safe" is WITHDRAWN. reconcile_commercial_state() now refuses
-- (raises) on exactly that state rather than treating it as active, so
-- this function must agree: such a row is unsafe, not safe.
--
-- Exists so the public loader can fail CLOSED (never serve stale/expired
-- paid access) when reconcile_commercial_state() itself fails, instead of
-- either (a) blindly trusting whatever is currently stored, or (b)
-- recomputing Free-compatibility independently in TypeScript — both of
-- which this migration's design explicitly forbids.
CREATE OR REPLACE FUNCTION public.is_commercial_access_current(_bp_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.beautician_profiles%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.beautician_profiles WHERE id = _bp_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Already held: never safe, regardless of anything else.
  IF _row.billing_hold THEN
    RETURN false;
  END IF;

  -- FREE: always safe.
  IF _row.plan = 'free' THEN
    RETURN true;
  END IF;

  -- MANUAL, NON-EXPIRING: a permanent Admin/manual grant. Safe. This is
  -- the ONLY plan_source permitted a NULL expiry (bp_plan_source_paid_
  -- has_expiry enforces the same rule for 'paid' at the DB level).
  IF _row.plan_source = 'manual' AND _row.plan_expires_at IS NULL THEN
    RETURN true;
  END IF;

  -- WITHDRAWN (paid-expiry patch): this used to return true here for any
  -- non-Free, non-permanent-manual row with a NULL expiry. That rule is
  -- removed — reaching this point with a NULL expiry now means
  -- plan_source='paid' with no expiry recorded, an inconsistent state
  -- reconcile_commercial_state() refuses to reconcile (raises) rather
  -- than treating as active. This function must agree: unsafe, matching
  -- what reconciliation would actually do (fail), never a policy this
  -- function invents independently.
  IF _row.plan_expires_at IS NULL THEN
    RETURN false;
  END IF;

  -- PAID/MANUAL ACTIVE or within grace: safe. Past grace: unsafe — a
  -- correction to Free (possibly a hold) is due and has not yet run.
  RETURN now() <= _row.plan_expires_at + public.commercial_grace_period();
END;
$$;

REVOKE ALL ON FUNCTION public.is_commercial_access_current(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_commercial_access_current(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.is_commercial_access_current(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_commercial_access_current(UUID) TO service_role;

-- ============================================================
-- 9. Own-billing summary RPC (curated, professional-facing)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_own_billing_summary(_bp_id UUID)
RETURNS TABLE(
  order_id          UUID,
  plan              public.portfolio_plan,
  billing_cycle     public.billing_cycle,
  amount_paise      INTEGER,
  currency          TEXT,
  status            public.billing_order_status,
  created_at        TIMESTAMPTZ,
  activated_at      TIMESTAMPTZ,
  access_starts_at  TIMESTAMPTZ,
  access_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.owns_beautician_profile(_bp_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT o.id, o.plan, o.billing_cycle, o.amount_paise, o.currency, o.status,
         o.created_at, o.activated_at, o.access_starts_at, o.access_expires_at
  FROM public.billing_orders o
  WHERE o.beautician_profile_id = _bp_id
  ORDER BY o.created_at DESC;
END;
$$;

-- Curated by construction: raw_gateway_payload, billing_events.payload,
-- webhook headers/signatures, and last_error never appear in this return
-- shape — there is no column for them to leak through.
REVOKE ALL ON FUNCTION public.get_own_billing_summary(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_own_billing_summary(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_own_billing_summary(UUID) TO authenticated;

-- ============================================================
-- 10. RLS + explicit privileges — zero professional/anon table access
-- ============================================================
ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events  ENABLE ROW LEVEL SECURITY;

-- No CREATE POLICY grants SELECT/INSERT/UPDATE/DELETE to `authenticated`
-- on any of the three tables — RLS enabled with zero matching policies for
-- a role means that role gets zero rows/zero writes by default. Every
-- professional-facing read goes through get_own_billing_summary() above;
-- Admin support access is a future controlled RPC, not a blanket policy.
REVOKE ALL ON public.billing_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payments        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.billing_events  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.billing_orders TO service_role;
GRANT ALL ON public.payments        TO service_role;
GRANT ALL ON public.billing_events  TO service_role;

-- ============================================================
-- 11. Billing-hold -> Free recovery authority (foundation completeness)
-- ============================================================
-- The approved lifecycle never auto-clears billing_hold merely because
-- content becomes Free-compatible again — the professional must
-- explicitly choose "Continue on Free". This is that one trusted
-- authority. Idempotent: already-resolved (billing_hold already false) is
-- a safe no-op, never an error. Ownership/Admin is verified in-function,
-- the same pattern as get_own_billing_summary() — a professional may act
-- only on their own portfolio; Admin may act on any.
CREATE OR REPLACE FUNCTION public.confirm_continue_on_free(_bp_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.beautician_profiles%ROWTYPE;
  _blockers TEXT;
BEGIN
  IF NOT (public.owns_beautician_profile(_bp_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO _row FROM public.beautician_profiles WHERE id = _bp_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- Idempotent: nothing to resolve (never held, or already resolved by an
  -- Admin plan change / a prior successful call) is a safe no-op.
  IF NOT _row.billing_hold THEN
    RETURN;
  END IF;

  -- Should be structurally impossible given bp_billing_hold_implies_free,
  -- but defensive rather than assumed.
  IF _row.plan <> 'free' THEN
    RAISE EXCEPTION 'profile is not currently on the free plan' USING ERRCODE = 'P0001';
  END IF;

  -- Canonical compatibility engine, same call reconcile_commercial_state()
  -- makes at grace end — never a second, independent recomputation.
  SELECT string_agg(
    format('%s (%s of %s allowed)', module, current_count, limit_count), '; '
  ) INTO _blockers
  FROM public.check_plan_compatibility(_bp_id, 'free', true)
  WHERE NOT compatible;

  IF _blockers IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot continue on Free yet — remove excess content first: %', _blockers
      USING ERRCODE = 'P0001';
  END IF;

  -- plan/plan_source/plan_expires_at are already 'free'/'free'/NULL from
  -- the hold-entry write in reconcile_commercial_state() — only
  -- billing_hold and the version change here. `status` (publication
  -- choice) is never touched; no content is ever deleted by this function.
  UPDATE public.beautician_profiles
    SET billing_hold = false,
        commercial_state_version = commercial_state_version + 1
    WHERE id = _bp_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_continue_on_free(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_continue_on_free(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_continue_on_free(UUID) TO authenticated;

COMMIT;


-- <<< END OF: 20260906100000_billing_phase_a_foundation.sql <<<

