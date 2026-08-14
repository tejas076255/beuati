
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
