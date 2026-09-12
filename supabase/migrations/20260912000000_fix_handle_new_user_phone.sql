-- Fix handle_new_user() to also store phone from raw_user_meta_data.
-- Our signup flow passes phone in options.data, so it lands in
-- raw_user_meta_data->>'phone'. The original trigger only stored
-- display_name + email — phone was silently dropped.
--
-- ON CONFLICT DO UPDATE ensures existing rows also get phone patched
-- if they were created before this fix (e.g. users who signed up
-- earlier and have phone in metadata but not in profiles.phone).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, display_name, email, phone)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (auth_user_id) DO UPDATE
    SET
      display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
      phone        = COALESCE(EXCLUDED.phone,        public.profiles.phone);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'beautician')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;
