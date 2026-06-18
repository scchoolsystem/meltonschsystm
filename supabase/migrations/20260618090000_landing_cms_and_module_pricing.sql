-- ============================================================================
-- Landing page CMS + module-based add-on pricing
-- Lets the platform owner (admin@smartdev.co.ke) edit every piece of the
-- public marketing site (text, images, story, gallery, pricing) without a
-- code deploy, and prices plans as "base fee + price per extra module".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. landing_content — one row per editable section, content stored as JSON.
--    section examples: 'hero', 'mission', 'story_intro', 'founder',
--    'story_milestones', 'team', 'contact_info', 'site_meta'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.landing_content (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section     text NOT NULL UNIQUE,
  content     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

-- Public (anon) can read — this powers the public marketing site.
CREATE POLICY "public read landing content" ON public.landing_content
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "platform owner manage landing content" ON public.landing_content
  FOR ALL TO authenticated
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

CREATE TRIGGER trg_landing_content_touch BEFORE UPDATE ON public.landing_content
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. landing_gallery — ordered, editable image slots (hero rotator, photo
--    gallery, story page images). Each row is one image slot the admin can
--    replace; deleting just empties the slot rather than breaking layout.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.landing_gallery (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement   text NOT NULL,              -- 'hero' | 'gallery' | 'story_hero' | 'contact'
  sort_order  int NOT NULL DEFAULT 0,
  image_url   text,
  caption     text,
  alt_text    text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read landing gallery" ON public.landing_gallery
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY "platform owner manage landing gallery" ON public.landing_gallery
  FOR ALL TO authenticated
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

CREATE TRIGGER trg_landing_gallery_touch BEFORE UPDATE ON public.landing_gallery
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. module_addon_pricing — drives "base plan + price per extra module".
--    feature_key matches the keys already used in school_features /
--    the admin Features page, so pricing always lines up with real modules.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.module_addon_pricing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key     text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  category        text NOT NULL DEFAULT 'general',
  monthly_price   numeric(12,2) NOT NULL DEFAULT 0,
  included_in_starter   boolean NOT NULL DEFAULT false,
  included_in_standard  boolean NOT NULL DEFAULT false,
  included_in_enterprise boolean NOT NULL DEFAULT true,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.module_addon_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read module pricing" ON public.module_addon_pricing
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY "platform owner manage module pricing" ON public.module_addon_pricing
  FOR ALL TO authenticated
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

CREATE TRIGGER trg_module_pricing_touch BEFORE UPDATE ON public.module_addon_pricing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed with the real module list (prices default to 0 — set in admin panel).
INSERT INTO public.module_addon_pricing (feature_key, display_name, category, sort_order, included_in_starter, included_in_standard, included_in_enterprise) VALUES
  ('timetable',      'Timetable',                'Core Academic',   1, true,  true,  true),
  ('attendance',     'Attendance',               'Core Academic',   2, true,  true,  true),
  ('academics',      'Academics & Exams',        'Core Academic',   3, true,  true,  true),
  ('discipline',     'Discipline',                'Core Academic',   4, false, true,  true),
  ('announcements',  'Announcements',            'Core Academic',   5, true,  true,  true),
  ('portals',        'Parent / Student Portals', 'Core Academic',   6, true,  true,  true),
  ('finance',        'Finance & Billing',        'Finance & Admin', 7, true,  true,  true),
  ('ids',            'Digital IDs',               'Finance & Admin', 8, false, true,  true),
  ('leaving_certs',  'Leaving Certificates',     'Finance & Admin', 9, false, true,  true),
  ('boarding',       'Boarding',                  'Facilities',      10, false, true,  true),
  ('kitchen',        'Kitchen',                    'Facilities',      11, false, true,  true),
  ('library',        'Library',                    'Facilities',      12, false, true,  true),
  ('clinic',         'Clinic',                     'Facilities',      13, false, true,  true),
  ('transport',      'Transport',                  'Facilities',      14, false, true,  true),
  ('security',       'Security',                   'Facilities',      15, false, false, true),
  ('classroom',      'Classroom',                  'Digital',         16, false, true,  true),
  ('live_classes',   'Live Classes',              'Digital',         17, false, true,  true),
  ('communications', 'Communications',           'Digital',         18, false, false, true),
  ('analytics',      'Analytics',                  'Digital',         19, false, false, true)
ON CONFLICT (feature_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Base plan fee on subscription_plans (the "base" in base + add-ons).
--    monthly_fee already exists and becomes the base fee; we just document
--    intent with a comment plus add an is_base_plan-style description field.
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS student_limit int,
  ADD COLUMN IF NOT EXISTS badge text,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscription_plans.monthly_fee IS
  'Base monthly fee in KES. Extra modules not included in this plan are billed via module_addon_pricing.';

-- ---------------------------------------------------------------------------
-- 5. school_subscription_addons — tracks which extra (non-included) modules
--    a specific school has purchased on top of their base plan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_subscription_addons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.module_addon_pricing(feature_key),
  monthly_price_at_purchase numeric(12,2) NOT NULL DEFAULT 0,
  added_at    timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, feature_key)
);
ALTER TABLE public.school_subscription_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform admin view addons" ON public.school_subscription_addons
  FOR SELECT TO authenticated USING (public.is_platform_owner());

CREATE POLICY "platform owner manage addons" ON public.school_subscription_addons
  FOR ALL TO authenticated
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

CREATE POLICY "school view own addons" ON public.school_subscription_addons
  FOR SELECT TO authenticated USING (school_id = public.current_user_school());

CREATE TRIGGER trg_school_addons_touch BEFORE UPDATE ON public.school_subscription_addons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Storage bucket for landing page images (hero, gallery, story, etc).
--    Public bucket — these are marketing images, not student/school data.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-media', 'landing-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read landing media" ON storage.objects;
CREATE POLICY "Public read landing media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing-media');

DROP POLICY IF EXISTS "Platform owner upload landing media" ON storage.objects;
CREATE POLICY "Platform owner upload landing media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'landing-media' AND public.is_platform_owner());

DROP POLICY IF EXISTS "Platform owner update landing media" ON storage.objects;
CREATE POLICY "Platform owner update landing media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'landing-media' AND public.is_platform_owner());

DROP POLICY IF EXISTS "Platform owner delete landing media" ON storage.objects;
CREATE POLICY "Platform owner delete landing media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'landing-media' AND public.is_platform_owner());

-- ---------------------------------------------------------------------------
-- 7. Seed landing_content with the current copy so the page keeps working
--    immediately after this migration, before anyone edits anything.
--    Founder identity corrected here: Melton Konchella, founder & developer.
-- ---------------------------------------------------------------------------
INSERT INTO public.landing_content (section, content) VALUES
('site_meta', '{
  "brand_name": "SMART DEV",
  "tagline": "Cloud school ERP for Kenya & East Africa",
  "footer_credit": "Developed by Melton Konchella · Founder & Developer · Nairobi, Kenya",
  "email_hello": "hello@smartdev.co.ke",
  "email_support": "support@smartdev.co.ke",
  "email_sales": "sales@smartdev.co.ke",
  "email_legal": "admin@smartdev.co.ke",
  "email_admin": "admin@smartdev.co.ke",
  "phone_primary": "+254 792 991 222",
  "phone_support": "+254 792 991 222",
  "location": "Nairobi, Kenya"
}'::jsonb),
('hero', '{
  "badge": "Cloud school ERP for Kenya & East Africa",
  "heading_line1": "One platform to run your",
  "heading_highlight": "entire school",
  "subheading": "From admissions to graduation — 35+ modules covering every department. Built for Kenyan schools, available as Android app and Windows desktop.",
  "stats": [
    { "value": "35+", "label": "Modules" },
    { "value": "20+", "label": "User roles" },
    { "value": "M-Pesa", "label": "Payments" },
    { "value": "100%", "label": "Cloud-based" }
  ]
}'::jsonb),
('mission_teaser', '{
  "heading": "Our mission: make every Kenyan school paperless by 2030",
  "body": "We believe schools should spend less time on administration and more time on education. SmartDev exists to make that possible for every school — regardless of size or budget."
}'::jsonb),
('founder', '{
  "name": "Melton Konchella",
  "role": "Founder & Developer",
  "photo_url": null,
  "bio": "Melton Konchella founded and personally built SmartDev ERP — designing, developing and maintaining every module of the platform, from the academic and finance systems to the Android and Windows apps."
}'::jsonb),
('story_intro', '{
  "badge": "Our Story",
  "heading": "We built the system we wished existed",
  "subheading": "SmartDev started from frustration — watching school administrators drown in paperwork while teachers spent more time on registers than on teaching.",
  "hero_image_url": null,
  "mission_title": "Our Mission",
  "mission_body": "To give every school in Kenya and East Africa — regardless of size — access to the same quality of administrative technology that was previously only available to large, well-funded institutions. We believe digital tools should reduce the burden on educators, not add to it.",
  "vision_title": "Our Vision",
  "vision_body": "A future where every teacher focuses entirely on teaching, every parent is always informed, and every administrator has the data they need to make decisions. We are working toward a paperless, data-driven school system across East Africa."
}'::jsonb),
('story_milestones', '{
  "items": [
    { "year": "2020", "title": "The Problem", "desc": "We visited dozens of Kenyan schools still running on paper registers, WhatsApp groups and Excel sheets. We knew there was a better way." },
    { "year": "2021", "title": "First Build", "desc": "SmartDev v1 launched with a small pilot group — three schools in Nairobi County testing the core academics and fee modules." },
    { "year": "2022", "title": "M-Pesa Goes Live", "desc": "The M-Pesa integration launched, letting parents pay fees directly from their phones. Collections improved dramatically for pilot schools." },
    { "year": "2023", "title": "Full Platform", "desc": "35+ modules now cover every school department — boarding, clinic, transport, library, kitchen and more. Android app released." },
    { "year": "2024", "title": "East Africa Expansion", "desc": "Schools in Uganda and Tanzania joined the platform. Multi-currency and multi-country billing introduced." },
    { "year": "2025", "title": "Desktop App", "desc": "Windows desktop software released for schools with limited internet, working offline and syncing when connected." },
    { "year": "2026", "title": "Growing Strong", "desc": "Hundreds of schools on the platform. Continuous development driven by real feedback from administrators, teachers and parents." }
  ]
}'::jsonb),
('contact_page', '{
  "heading": "Get in touch",
  "subheading": "We would love to set up SmartDev for your school. Reach out and we will get back to you same day.",
  "office_image_url": null,
  "business_hours": "Monday – Friday: 8:00am – 6:00pm EAT\nSaturday: 9:00am – 2:00pm EAT\nSupport available by email 24/7"
}'::jsonb),
('download_page', '{
  "heading": "Download SmartDev",
  "subheading": "Install on Android or Windows. Log in with your school credentials to get started immediately."
}'::jsonb)
ON CONFLICT (section) DO NOTHING;

-- Seed gallery placeholders (Kenyan school imagery — admin can swap any time).
-- Guarded with NOT EXISTS so re-running this migration is harmless.
INSERT INTO public.landing_gallery (placement, sort_order, image_url, caption, alt_text)
SELECT v.placement, v.sort_order, v.image_url, v.caption, v.alt_text
FROM (VALUES
  ('hero', 1, 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1400&h=700&fit=crop', NULL, 'Kenyan secondary school classroom'),
  ('hero', 2, 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1400&h=700&fit=crop', NULL, 'Students in a Kenyan school compound'),
  ('hero', 3, 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1400&h=700&fit=crop', NULL, 'School administration block'),
  ('gallery', 1, 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=600&h=400&fit=crop', 'Students in class', 'Students in class'),
  ('gallery', 2, 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&h=400&fit=crop', 'School administration', 'School administration'),
  ('gallery', 3, 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&h=400&fit=crop', 'Teacher and student', 'Teacher and student'),
  ('gallery', 4, 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=400&fit=crop', 'Modern classroom', 'Modern classroom'),
  ('gallery', 5, 'https://images.unsplash.com/photo-1560785496-3c9d27877182?w=600&h=400&fit=crop', 'School library', 'School library'),
  ('gallery', 6, 'https://images.unsplash.com/photo-1571260899304-425eee4c7efc?w=600&h=400&fit=crop', 'Sports and co-curricular', 'Sports and co-curricular'),
  ('story_hero', 1, 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&h=450&fit=crop', NULL, 'School campus'),
  ('contact', 1, 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=300&fit=crop', NULL, 'Office')
) AS v(placement, sort_order, image_url, caption, alt_text)
WHERE NOT EXISTS (SELECT 1 FROM public.landing_gallery lg WHERE lg.placement = v.placement AND lg.sort_order = v.sort_order);
