-- Cleanup of placeholder chunk-1 objects so original migrations apply cleanly
DROP FUNCTION IF EXISTS public.is_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- Roles enum
CREATE TYPE public.app_role AS ENUM (
  'super_admin','principal','deputy_principal','class_teacher','subject_teacher',
  'hod','admission_officer','bursar','librarian','sports','boarding','parent','student','staff'
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','principal'))
$$;

-- Classes
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('primary','secondary')),
  stream TEXT,
  year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  capacity INT NOT NULL DEFAULT 40,
  class_teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Students
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_no TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male','female','other')),
  photo_url TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  parent_name TEXT,
  parent_phone TEXT,
  parent_email TEXT,
  address TEXT,
  medical_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','transferred','graduated')),
  admitted_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_students_class ON public.students(class_id);
CREATE INDEX idx_students_status ON public.students(status);

-- Staff
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_no TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role app_role NOT NULL DEFAULT 'staff',
  department TEXT,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_leave','terminated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Activity logs
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at DESC);

-- RLS Policies
CREATE POLICY "users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "admins view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users see own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admins see all roles" ON public.user_roles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "auth view classes" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage classes" ON public.classes FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "staff view students" ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "admission staff manage students" ON public.students FOR ALL USING (
  public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'admission_officer') OR public.has_role(auth.uid(),'deputy_principal')
) WITH CHECK (
  public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'admission_officer') OR public.has_role(auth.uid(),'deputy_principal')
);

CREATE POLICY "auth view staff" ON public.staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage staff" ON public.staff FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins view logs" ON public.activity_logs FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "auth insert logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto profile + first-user-becomes-admin trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-generate admission number
CREATE OR REPLACE FUNCTION public.gen_admission_no()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  yr TEXT := to_char(now(), 'YYYY');
  next_num INT;
BEGIN
  IF NEW.admission_no IS NULL OR NEW.admission_no = '' THEN
    SELECT COALESCE(MAX(CAST(split_part(admission_no,'-',2) AS INT)), 0) + 1
    INTO next_num
    FROM public.students
    WHERE admission_no LIKE yr || '-%';
    NEW.admission_no := yr || '-' || lpad(next_num::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_admission_no
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.gen_admission_no();

-- Auto employee number
CREATE OR REPLACE FUNCTION public.gen_employee_no()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  next_num INT;
BEGIN
  IF NEW.employee_no IS NULL OR NEW.employee_no = '' THEN
    SELECT COALESCE(MAX(CAST(substring(employee_no FROM 4) AS INT)), 1000) + 1
    INTO next_num FROM public.staff WHERE employee_no LIKE 'EMP%';
    NEW.employee_no := 'EMP' || next_num::TEXT;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_employee_no
  BEFORE INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.gen_employee_no();

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- Add extended roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bursar';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'librarian';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'nurse';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'matron';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'transport_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teacher';
