import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTenant, isNativeApp } from "@/hooks/use-tenant";
import { SchoolPicker } from "@/components/SchoolPicker";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, Users, ShieldCheck, Phone, Mail, Smartphone, Monitor,
  Download, BookOpen, CreditCard, Bell, BarChart3, Calendar, Shield, Utensils,
  Bus, FlaskConical, Dumbbell, FileText, Lock, IdCard, MessageSquare,
  ClipboardList, Settings, Globe, Zap, CheckCircle, ChevronDown, ChevronUp,
  Target, Heart, Star, ArrowRight, MapPin, ExternalLink, Menu, X,
  TrendingUp, Award, Layers, Database, Cpu, Cloud, Package, Briefcase,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: IndexPage });

const GITHUB_REPO = "scchoolsystem/meltonschsystm";
const APK_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/app-release.apk`;
const WINDOWS_RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

// Defaults used until the editable site content loads (and as a safety net
// if any field is left blank in the admin panel). The platform owner edits
// the live values from Platform Admin → Website Content.
const SITE_DEFAULTS = {
  brand_name: "SMART DEV",
  tagline: "Cloud school ERP for Kenya & East Africa",
  footer_credit: "Developed by Melton Konchella · Founder & Developer · Nairobi, Kenya",
  email_hello: "hello@smartdev.co.ke",
  email_support: "support@smartdev.co.ke",
  email_sales: "sales@smartdev.co.ke",
  email_legal: "admin@smartdev.co.ke",
  email_admin: "admin@smartdev.co.ke",
  phone_primary: "+254 792 991 222",
  phone_support: "+254 792 991 222",
  location: "Nairobi, Kenya",
};

// ─────────────────────────────────────────────────────────────────────────────
// Site-wide editable content (read from Supabase, falls back to SITE_DEFAULTS)
// ─────────────────────────────────────────────────────────────────────────────

function useSiteMeta() {
  const { data } = useQuery({
    queryKey: ["landing-content", "site_meta"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_content")
        .select("content")
        .eq("section", "site_meta")
        .maybeSingle();
      if (error) return SITE_DEFAULTS;
      return { ...SITE_DEFAULTS, ...(data?.content ?? {}) };
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ?? SITE_DEFAULTS;
}

function useLandingContent<T>(section: string, fallback: T): T {
  const { data } = useQuery({
    queryKey: ["landing-content", section],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_content")
        .select("content")
        .eq("section", section)
        .maybeSingle();
      if (error) return fallback;
      return { ...fallback, ...(data?.content ?? {}) };
    },
    staleTime: 5 * 60 * 1000,
  });
  return (data as T) ?? fallback;
}

function useGalleryPhotos(placement: string, fallback: { src: string; caption?: string }[]) {
  const { data } = useQuery({
    queryKey: ["landing-gallery-public", placement],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_gallery")
        .select("image_url,caption,alt_text")
        .eq("placement", placement)
        .eq("is_active", true)
        .order("sort_order");
      if (error || !data || data.length === 0) return null;
      return data
        .filter((d: any) => d.image_url)
        .map((d: any) => ({ src: d.image_url as string, caption: d.caption ?? d.alt_text ?? "" }));
    },
    staleTime: 5 * 60 * 1000,
  });
  return data && data.length > 0 ? data : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct Windows desktop download — resolves the real installer asset from
// the GitHub Releases API so the button downloads the .exe immediately
// instead of sending people to the releases page to click around.
// ─────────────────────────────────────────────────────────────────────────────

function useWindowsDownloadUrl() {
  const { data } = useQuery({
    queryKey: ["github-latest-release", GITHUB_REPO],
    queryFn: async () => {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
      if (!res.ok) return null;
      const json = await res.json();
      const assets: { name: string; browser_download_url: string }[] = json?.assets ?? [];
      const exe = assets.find((a) => /\.exe$/i.test(a.name) || /setup\.exe$/i.test(a.name));
      const msi = assets.find((a) => /\.msi$/i.test(a.name));
      return (exe ?? msi)?.browser_download_url ?? null;
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  return data ?? null;
}

function getOS() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/windows/i.test(ua)) return "windows";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

function IndexPage() {
  const { slug, loading } = useTenant();
  const navigate = useNavigate();
  const native = isNativeApp();
  const isAppSubdomain = typeof window !== "undefined" && window.location.hostname === "app.smartdev.co.ke";

  useEffect(() => {
    if (loading) return;
    if (slug && slug !== "__platform__") { navigate({ to: "/login" }); return; }
  }, [loading, slug, navigate]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if ((native || isAppSubdomain) && !slug) return <SchoolPicker onPicked={(s) => { if (s) navigate({ to: "/login" }); }} />;
  if (slug && slug !== "__platform__") return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  return <Landing />;
}

function DownloadButton({ size = "lg" }: { size?: "sm" | "lg" }) {
  const [os, setOs] = useState("other");
  useEffect(() => { setOs(getOS()); }, []);
  const windowsDirectUrl = useWindowsDownloadUrl();
  const windowsHref = windowsDirectUrl ?? WINDOWS_RELEASES_PAGE;
  const windowsIsDirect = Boolean(windowsDirectUrl);

  if (os === "android") return (
    <a href={APK_URL}><Button size={size} className="gap-2 bg-green-600 hover:bg-green-700 text-white"><Smartphone className="w-5 h-5" /> Download for Android</Button></a>
  );
  if (os === "windows") return (
    <a href={windowsHref} target={windowsIsDirect ? undefined : "_blank"} rel={windowsIsDirect ? undefined : "noreferrer"}>
      <Button size={size} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Monitor className="w-5 h-5" /> Download for Windows</Button>
    </a>
  );
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <a href={APK_URL}><Button size={size} className="gap-2 bg-green-600 hover:bg-green-700 text-white"><Smartphone className="w-5 h-5" /> Android APK</Button></a>
      <a href={windowsHref} target={windowsIsDirect ? undefined : "_blank"} rel={windowsIsDirect ? undefined : "noreferrer"}>
        <Button size={size} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Monitor className="w-5 h-5" /> Windows Desktop</Button>
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────

const MODULE_CATEGORIES = [
  {
    category: "Student & Academic",
    color: "bg-blue-50 border-blue-200",
    iconColor: "bg-blue-100 text-blue-700",
    modules: [
      { icon: GraduationCap, title: "Admissions", desc: "Online applications, enrollment workflows, class placement and full student onboarding from enquiry to first day.", tags: ["Forms", "Workflow", "Onboarding"] },
      { icon: Users, title: "Student Management", desc: "Comprehensive student profiles, guardian contacts, medical info, transfers between schools and official leaving certificates.", tags: ["Profiles", "Guardians", "Transfers"] },
      { icon: BookOpen, title: "Academics", desc: "Subjects, classes, lesson plans, timetables, curriculum mapping and syllabus tracking per term and year.", tags: ["Curriculum", "Timetable", "Syllabus"] },
      { icon: ClipboardList, title: "Attendance", desc: "Daily and period-by-period attendance for students and staff with automated SMS alerts and monthly reports.", tags: ["Daily", "Period", "SMS Alerts"] },
      { icon: FileText, title: "Exams & Marks", desc: "End-to-end exam management — scheduling, marks entry, grade computation, position ranking and official report cards.", tags: ["Exams", "Marks", "Report Cards"] },
      { icon: BarChart3, title: "Results & Reports", desc: "Detailed performance analytics, subject trend analysis, class comparison, student progress tracking and downloadable reports.", tags: ["Analytics", "Ranking", "Progress"] },
      { icon: Calendar, title: "Timetable", desc: "Automated and manual timetable creation, room allocation, teacher assignment and conflict detection.", tags: ["Auto-gen", "Rooms", "Teachers"] },
      { icon: Monitor, title: "Live Classes", desc: "Schedule and run live online sessions, record attendance, share materials and manage virtual classrooms.", tags: ["Online", "Attendance", "Resources"] },
      { icon: BookOpen, title: "Library", desc: "Full book catalogue, borrowing and return records, fine calculation, overdue notifications and reservations.", tags: ["Catalogue", "Borrowing", "Fines"] },
      { icon: FileText, title: "Student Documents", desc: "Securely upload and manage student certificates, birth certificates, recommendation letters and official documents.", tags: ["Uploads", "Certificates", "Storage"] },
      { icon: FileText, title: "Leaving Certificates", desc: "Generate official leaving certificates with school branding, stamp positions, and complete academic history.", tags: ["Official", "Printable", "Stamped"] },
    ],
  },
  {
    category: "Finance & Payments",
    color: "bg-green-50 border-green-200",
    iconColor: "bg-green-100 text-green-700",
    modules: [
      { icon: CreditCard, title: "Fee Management", desc: "Flexible fee structures by class, term and category. Invoice generation, payment tracking, balance statements and arrears management.", tags: ["Structures", "Invoices", "Balances"] },
      { icon: Zap, title: "M-Pesa Integration", desc: "Accept fee payments directly via M-Pesa STK Push. Automatic reconciliation, instant receipts and payment confirmation SMS.", tags: ["STK Push", "Auto-reconcile", "Receipts"] },
      { icon: FileText, title: "Invoices & Receipts", desc: "Automated invoice generation with school branding, printable receipts, payment history and statement downloads.", tags: ["Branded", "Printable", "History"] },
      { icon: BarChart3, title: "Billing & Subscription", desc: "School subscription management, billing history, plan upgrades and payment records for the platform.", tags: ["Plans", "Upgrades", "History"] },
    ],
  },
  {
    category: "Staff & HR",
    color: "bg-purple-50 border-purple-200",
    iconColor: "bg-purple-100 text-purple-700",
    modules: [
      { icon: Users, title: "Staff Management", desc: "Complete staff profiles, employment records, departments, roles, payroll references, contracts and performance notes.", tags: ["Profiles", "HR", "Payroll"] },
      { icon: Settings, title: "Roles & Permissions", desc: "Over 20 built-in user roles with granular, module-level permission controls. Custom roles for any institutional structure.", tags: ["20+ Roles", "Granular", "Custom"] },
      { icon: Settings, title: "Departments", desc: "Academic and administrative department management, head of department assignments and departmental reporting.", tags: ["Academic", "Admin", "HOD"] },
    ],
  },
  {
    category: "Boarding & Welfare",
    color: "bg-orange-50 border-orange-200",
    iconColor: "bg-orange-100 text-orange-700",
    modules: [
      { icon: Shield, title: "Boarding", desc: "Dormitory management, bed and room allocation, duty roster scheduling, boarding fee tracking and matron/warden reports.", tags: ["Dorms", "Allocation", "Duty Rosters"] },
      { icon: FlaskConical, title: "Clinic", desc: "Student health records, sick bay visit logs, medication administration records, referral letters and health trend reports.", tags: ["Health Records", "Sick Bay", "Medications"] },
      { icon: Utensils, title: "Kitchen & Catering", desc: "Weekly meal planning, kitchen stock management, catering records, special diet tracking and nutrition reports.", tags: ["Meal Plans", "Stock", "Nutrition"] },
      { icon: Bus, title: "Transport", desc: "Bus route management, student allocation per route, transport fee billing, driver records and route attendance.", tags: ["Routes", "Allocation", "Drivers"] },
      { icon: Shield, title: "Insurance", desc: "Student insurance policy tracking, coverage records, claim management and premium payment monitoring.", tags: ["Policies", "Claims", "Premiums"] },
    ],
  },
  {
    category: "Co-curricular & Discipline",
    color: "bg-red-50 border-red-200",
    iconColor: "bg-red-100 text-red-700",
    modules: [
      { icon: Dumbbell, title: "Co-curricular", desc: "Clubs, societies, sports teams, academic competitions and co-curricular achievement records for certificates and portfolios.", tags: ["Clubs", "Sports", "Achievements"] },
      { icon: Shield, title: "Discipline", desc: "Incident recording, disciplinary action tracking, warnings, suspension logs, counselling notes and behaviour trends.", tags: ["Incidents", "Actions", "Counselling"] },
    ],
  },
  {
    category: "Communication & Portals",
    color: "bg-teal-50 border-teal-200",
    iconColor: "bg-teal-100 text-teal-700",
    modules: [
      { icon: Bell, title: "Communications", desc: "SMS and in-app push notifications to parents, staff and students. Bulk messaging, targeted groups and delivery tracking.", tags: ["SMS", "Push", "Bulk"] },
      { icon: MessageSquare, title: "Announcements", desc: "School-wide and class-specific announcements with file attachments, read receipts and scheduled publishing.", tags: ["School-wide", "Class", "Scheduled"] },
      { icon: Globe, title: "Parent Portal", desc: "Parents access real-time fee balances, results, attendance records, communicate with teachers and receive school notifications.", tags: ["Real-time", "Results", "Fees"] },
      { icon: GraduationCap, title: "Student Portal", desc: "Students view timetables, exam results, assignments, download resources and access class announcements.", tags: ["Timetable", "Results", "Resources"] },
    ],
  },
  {
    category: "Administration & Security",
    color: "bg-gray-50 border-gray-200",
    iconColor: "bg-gray-100 text-gray-700",
    modules: [
      { icon: IdCard, title: "ID Cards", desc: "Generate and print student and staff photo ID cards with embedded QR codes for instant identity verification.", tags: ["Photo IDs", "QR Code", "Print"] },
      { icon: Lock, title: "Security & Audit", desc: "Complete activity logs, login history, suspicious access detection, data access controls and compliance audit trails.", tags: ["Audit Logs", "Login History", "Compliance"] },
      { icon: BarChart3, title: "Analytics Dashboard", desc: "Real-time executive dashboards for enrollment trends, fee collection, attendance rates, results and platform health.", tags: ["Real-time", "Executive", "Trends"] },
      { icon: Settings, title: "School Settings", desc: "Academic terms, grading scales, school branding, custom fields, system configuration and integration settings.", tags: ["Terms", "Grading", "Branding"] },
      { icon: Settings, title: "Data Import", desc: "Bulk import students, staff and historical data from Excel and CSV files. Data validation and error reporting.", tags: ["Bulk Import", "Excel", "Validation"] },
      { icon: Globe, title: "Multi-school Platform", desc: "Manage multiple schools from a single super-admin dashboard. School isolation, cross-school reporting and platform billing.", tags: ["Multi-tenant", "Isolation", "Reporting"] },
    ],
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "KES 2,500",
    period: "/month",
    desc: "Perfect for small primary schools just getting started.",
    color: "border-gray-200",
    badge: "",
    features: ["Up to 200 students", "Academics & Attendance", "Fee Management", "M-Pesa Payments", "Parent Portal", "SMS Notifications", "Android & Windows App", "Email support"],
  },
  {
    name: "Standard",
    price: "KES 5,000",
    period: "/month",
    desc: "For growing schools that need the full management suite.",
    color: "border-primary",
    badge: "Most Popular",
    features: ["Up to 800 students", "Everything in Starter", "Timetable & Live Classes", "Library & Transport", "Boarding & Clinic", "Discipline & Co-curricular", "ID Card Generation", "Staff Management", "Priority support"],
  },
  {
    name: "Enterprise",
    price: "KES 9,500",
    period: "/month",
    desc: "For large schools and institutions needing everything.",
    color: "border-gray-200",
    badge: "",
    features: ["Unlimited students", "Everything in Standard", "Kitchen & Catering", "Insurance Management", "Advanced Analytics", "Custom Roles & Permissions", "Data Import Tools", "Audit Logs & Security", "Dedicated support"],
  },
];

const TEAM = [
  {
    name: "On Point Systems",
    role: "Development & Engineering",
    photo: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&h=300&fit=crop&crop=face",
    bio: "Our engineering team builds and maintains the SmartDev platform, with deep experience in cloud infrastructure, mobile apps and school administration workflows.",
  },
  {
    name: "Customer Success",
    role: "Onboarding & Support",
    photo: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=300&h=300&fit=crop&crop=face",
    bio: "Dedicated team ensuring every school gets fully onboarded, staff trained and questions answered — from setup day through the entire school year.",
  },
  {
    name: "Product Team",
    role: "Research & Design",
    photo: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=300&h=300&fit=crop&crop=face",
    bio: "We visit schools, talk to teachers and administrators, and translate real operational pain points into features that actually solve problems.",
  },
];

const STORY_MILESTONES = [
  { year: "2020", title: "The Problem", desc: "We visited dozens of Kenyan schools still running on paper registers, WhatsApp groups and Excel sheets. We knew there was a better way." },
  { year: "2021", title: "First Build", desc: "SmartDev v1 launched with a small pilot group — three schools in Nairobi County testing the core academics and fee modules." },
  { year: "2022", title: "M-Pesa Goes Live", desc: "The M-Pesa integration launched, letting parents pay fees directly from their phones. Collections improved dramatically for pilot schools." },
  { year: "2023", title: "Full Platform", desc: "35+ modules now cover every school department — boarding, clinic, transport, library, kitchen and more. Android app released." },
  { year: "2024", title: "East Africa Expansion", desc: "Schools in Uganda and Tanzania joined the platform. Multi-currency and multi-country billing introduced." },
  { year: "2025", title: "Desktop App", desc: "Windows desktop software released for schools with limited internet, working offline and syncing when connected." },
  { year: "2026", title: "Growing Strong", desc: "Hundreds of schools on the platform. Continuous development driven by real feedback from administrators, teachers and parents." },
];

const HERO_PHOTOS = [
  "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1400&h=700&fit=crop",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1400&h=700&fit=crop",
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1400&h=700&fit=crop",
];

const GALLERY_PHOTOS = [
  { src: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=600&h=400&fit=crop", caption: "Students in class" },
  { src: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&h=400&fit=crop", caption: "School administration" },
  { src: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&h=400&fit=crop", caption: "Teacher and student" },
  { src: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=400&fit=crop", caption: "Modern classroom" },
  { src: "https://images.unsplash.com/photo-1560785496-3c9d27877182?w=600&h=400&fit=crop", caption: "School library" },
  { src: "https://images.unsplash.com/photo-1571260899304-425eee4c7efc?w=600&h=400&fit=crop", caption: "Sports and co-curricular" },
];

type Page = "home" | "modules" | "story" | "pricing" | "download" | "contact" | "legal";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LANDING COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function Landing() {
  const { session, loading } = useAuth();
  const { isPlatformHost } = useTenant();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page>("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const site = useSiteMeta();

  useEffect(() => {
    if (isPlatformHost) { navigate({ to: session ? "/platform/dashboard" : "/platform/login" }); return; }
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, isPlatformHost, navigate]);

  // Handle hash-based routing for deep links
  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as Page;
    if (hash && ["home","modules","story","pricing","download","contact","legal"].includes(hash)) {
      setPage(hash);
    }
  }, []);

  const goTo = (p: Page) => {
    setPage(p);
    setMobileMenuOpen(false);
    window.history.replaceState(null, "", `#${p}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navItems: { label: string; page: Page }[] = [
    { label: "Home", page: "home" },
    { label: "Modules", page: "modules" },
    { label: "Our Story", page: "story" },
    { label: "Pricing", page: "pricing" },
    { label: "Download", page: "download" },
    { label: "Contact", page: "contact" },
    { label: "Legal", page: "legal" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ── NAVBAR ── */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <button type="button" onClick={() => goTo("home")} className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">{site.brand_name}</span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {navItems.map(({ label, page: p }) => (
              <button
                key={p}
                type="button"
                onClick={() => goTo(p)}
                className={`px-3 py-2 rounded-md transition-colors ${page === p ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={() => goTo("download")} className="ml-2">
              <Button size="sm"><Download className="w-3.5 h-3.5 mr-1.5" />Get the App</Button>
            </button>
          </nav>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden p-2 rounded-md hover:bg-muted"
            onClick={() => setMobileMenuOpen(v => !v)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 flex flex-col gap-1">
            {navItems.map(({ label, page: p }) => (
              <button
                key={p}
                type="button"
                onClick={() => goTo(p)}
                className={`text-left px-3 py-2 rounded-md text-sm transition-colors ${page === p ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── PAGE CONTENT ── */}
      <main>
        {page === "home" && <HomePage goTo={goTo} site={site} />}
        {page === "modules" && <ModulesPage />}
        {page === "story" && <StoryPage />}
        {page === "pricing" && <PricingPage goTo={goTo} site={site} />}
        {page === "download" && <DownloadPage site={site} />}
        {page === "contact" && <ContactPage site={site} />}
        {page === "legal" && <LegalPage site={site} />}
      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t py-10 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <span className="font-bold tracking-tight">{site.brand_name}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{site.tagline}</p>
              <div className="mt-3 flex flex-col gap-1.5">
                <a href={`mailto:${site.email_hello}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5">
                  <Mail className="w-3 h-3" />{site.email_hello}
                </a>
                <a href={`tel:${site.phone_primary.replace(/\s/g,"")}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5">
                  <Phone className="w-3 h-3" />{site.phone_primary}
                </a>
              </div>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">Platform</div>
              <div className="flex flex-col gap-2">
                {(["home","modules","pricing","download"] as Page[]).map(p => (
                  <button key={p} type="button" onClick={() => goTo(p)} className="text-xs text-muted-foreground hover:text-foreground text-left capitalize">{p}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">Company</div>
              <div className="flex flex-col gap-2">
                {(["story","contact"] as Page[]).map(p => (
                  <button key={p} type="button" onClick={() => goTo(p)} className="text-xs text-muted-foreground hover:text-foreground text-left">{p === "story" ? "Our Story" : "Contact Us"}</button>
                ))}
                <button type="button" onClick={() => goTo("legal")} className="text-xs text-muted-foreground hover:text-foreground text-left">Legal & Compliance</button>
              </div>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">Contact</div>
              <div className="flex flex-col gap-2">
                <a href={`mailto:${site.email_sales}`} className="text-xs text-muted-foreground hover:text-primary">{site.email_sales}</a>
                <a href={`mailto:${site.email_support}`} className="text-xs text-muted-foreground hover:text-primary">{site.email_support}</a>
                <a href={`mailto:${site.email_admin}`} className="text-xs text-muted-foreground hover:text-primary">{site.email_admin}</a>
                <a href={`tel:${site.phone_primary.replace(/\s/g,"")}`} className="text-xs text-muted-foreground hover:text-primary">{site.phone_primary}</a>
              </div>
            </div>
          </div>
          <div className="border-t pt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} SmartDev ERP · {site.footer_credit}</span>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => goTo("legal")} className="hover:text-foreground">Privacy Policy</button>
              <button type="button" onClick={() => goTo("legal")} className="hover:text-foreground">Terms of Use</button>
              <button type="button" onClick={() => goTo("legal")} className="hover:text-foreground">Legal</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME PAGE
// ─────────────────────────────────────────────────────────────────────────────

function HomePage({ goTo, site }: { goTo: (p: Page) => void; site: typeof SITE_DEFAULTS }) {
  const [heroImg, setHeroImg] = useState(0);
  const hero = useLandingContent("hero", {
    badge: "Cloud school ERP for Kenya & East Africa",
    heading_line1: "One platform to run your",
    heading_highlight: "entire school",
    subheading: "From admissions to graduation — 35+ modules covering every department. Built for Kenyan schools, available as Android app and Windows desktop.",
    stats: [{ value: "35+", label: "Modules" }, { value: "20+", label: "User roles" }, { value: "M-Pesa", label: "Payments" }, { value: "100%", label: "Cloud-based" }],
  });
  const heroPhotos = useGalleryPhotos("hero", HERO_PHOTOS.map((src) => ({ src })));
  const galleryPhotos = useGalleryPhotos("gallery", GALLERY_PHOTOS);

  useEffect(() => {
    const t = setInterval(() => setHeroImg(i => (i + 1) % heroPhotos.length), 5000);
    return () => clearInterval(t);
  }, [heroPhotos.length]);

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          {heroPhotos.map((p, i) => (
            <img
              key={p.src}
              src={p.src}
              alt={p.caption || "Kenyan school"}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === heroImg ? "opacity-100" : "opacity-0"}`}
            />
          ))}
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative container mx-auto px-6 py-20 text-center text-white">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur px-4 py-1.5 text-xs font-medium mb-6">
            <ShieldCheck className="w-3.5 h-3.5" /> {hero.badge}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-tight">
            {hero.heading_line1} <span className="text-primary">{hero.heading_highlight}</span>
          </h1>
          <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
            {hero.subheading}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <DownloadButton />
            <button type="button" onClick={() => goTo("modules")}>
              <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 bg-transparent gap-2">
                <Layers className="w-4 h-4" /> Explore Modules
              </Button>
            </button>
          </div>
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {hero.stats.map((s: any) => (
              <div key={s.label} className="rounded-xl border border-white/20 bg-white/10 backdrop-blur p-4 text-center">
                <div className="text-2xl font-bold text-primary">{s.value}</div>
                <div className="text-xs text-white/70 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick module preview */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold">Everything your school needs</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">35+ modules, one login. Admin, teachers, parents and students each see their own tailored portal.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {[
              { icon: GraduationCap, title: "Academics", desc: "Classes, exams, report cards & timetables", color: "text-blue-600 bg-blue-50" },
              { icon: CreditCard, title: "Finance", desc: "Fees, M-Pesa, invoices & receipts", color: "text-green-600 bg-green-50" },
              { icon: Shield, title: "Boarding & Welfare", desc: "Dorms, clinic, kitchen & transport", color: "text-orange-600 bg-orange-50" },
              { icon: Globe, title: "Portals", desc: "Parents, students & staff get their own view", color: "text-purple-600 bg-purple-50" },
            ].map(f => (
              <div key={f.title} className="rounded-xl border bg-card p-5 flex flex-col gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${f.color}`}><f.icon className="w-5 h-5" /></div>
                <div>
                  <div className="font-semibold">{f.title}</div>
                  <p className="text-sm text-muted-foreground mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <button type="button" onClick={() => goTo("modules")}>
              <Button variant="outline" className="gap-2">View all 35+ modules <ArrowRight className="w-4 h-4" /></Button>
            </button>
          </div>
        </div>
      </section>

      {/* Photo gallery */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-10">Built for schools like yours</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-5xl mx-auto">
            {galleryPhotos.map((p, i) => (
              <div key={`${p.src}-${i}`} className="relative rounded-xl overflow-hidden aspect-video">
                <img src={p.src} alt={p.caption || "Kenyan school"} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                {p.caption && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                    <span className="text-white text-xs">{p.caption}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission teaser */}
      <MissionTeaser goTo={goTo} />

      {/* Pricing teaser */}
      <section className="py-16">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold">{site.brand_name} pricing made simple</h2>
          <p className="mt-3 text-muted-foreground">Transparent pricing, no hidden fees. Android app, Windows desktop and free setup included.</p>
          <button type="button" onClick={() => goTo("pricing")} className="mt-6 inline-block">
            <Button className="gap-2">See all plans <ArrowRight className="w-4 h-4" /></Button>
          </button>
        </div>
      </section>
    </div>
  );
}

function MissionTeaser({ goTo }: { goTo: (p: Page) => void }) {
  const mission = useLandingContent("mission_teaser", {
    heading: "Our mission: make every Kenyan school paperless by 2030",
    body: "We believe schools should spend less time on administration and more time on education. SmartDev exists to make that possible for every school — regardless of size or budget.",
  });
  return (
    <section className="py-16 bg-primary text-primary-foreground">
      <div className="container mx-auto px-6 text-center">
        <Target className="w-10 h-10 mx-auto mb-4 opacity-80" />
        <h2 className="text-3xl font-bold max-w-2xl mx-auto">{mission.heading}</h2>
        <p className="mt-4 text-primary-foreground/80 max-w-xl mx-auto">{mission.body}</p>
        <button type="button" onClick={() => goTo("story")} className="mt-8 inline-block">
          <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent gap-2">
            Read our story <ArrowRight className="w-4 h-4" />
          </Button>
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULES PAGE (toggleable cards with "View More")
// ─────────────────────────────────────────────────────────────────────────────

function ModulesPage() {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const PREVIEW_COUNT = 4;

  const toggleCategory = (cat: string) => setExpandedCategories(e => ({ ...e, [cat]: !e[cat] }));
  const toggleModule = (key: string) => setExpandedModules(e => ({ ...e, [key]: !e[key] }));

  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-4 py-1.5 text-xs font-medium mb-4">
            <Layers className="w-3.5 h-3.5" /> 35+ Modules
          </div>
          <h1 className="text-4xl font-bold">Every module your school needs</h1>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">Click any module to expand details. Click a category header to show or hide all modules in that group.</p>
        </div>

        <div className="space-y-8">
          {MODULE_CATEGORIES.map(cat => {
            const isExpanded = expandedCategories[cat.category];
            const modules = isExpanded ? cat.modules : cat.modules.slice(0, PREVIEW_COUNT);
            const hasMore = cat.modules.length > PREVIEW_COUNT;

            return (
              <div key={cat.category} className={`rounded-2xl border-2 ${cat.color} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.category)}
                  className="w-full flex items-center justify-between p-5 hover:bg-black/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg">{cat.category}</span>
                    <span className="text-sm text-muted-foreground">{cat.modules.length} modules</span>
                  </div>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </button>

                <div className="px-5 pb-5">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {modules.map(mod => {
                      const key = `${cat.category}-${mod.title}`;
                      const open = expandedModules[key];
                      return (
                        <div key={mod.title} className="rounded-xl border bg-white/80 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleModule(key)}
                            className="w-full text-left p-4 flex gap-3 hover:bg-gray-50 transition-colors"
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cat.iconColor}`}>
                              <mod.icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm">{mod.title}</div>
                              {!open && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{mod.desc}</p>}
                            </div>
                            <div className="shrink-0 mt-0.5">
                              {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                            </div>
                          </button>
                          {open && (
                            <div className="px-4 pb-4 pt-0 border-t bg-white/60">
                              <p className="text-sm text-muted-foreground leading-relaxed mt-3">{mod.desc}</p>
                              <div className="flex flex-wrap gap-1.5 mt-3">
                                {mod.tags.map(tag => (
                                  <span key={tag} className={`text-xs px-2 py-0.5 rounded-full border ${cat.color}`}>{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {hasMore && !isExpanded && (
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat.category)}
                      className="mt-4 w-full py-2.5 rounded-lg border-2 border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <ChevronDown className="w-4 h-4" />
                      View {cat.modules.length - PREVIEW_COUNT} more modules in {cat.category}
                    </button>
                  )}
                  {isExpanded && hasMore && (
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat.category)}
                      className="mt-4 w-full py-2.5 rounded-lg border-2 border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <ChevronUp className="w-4 h-4" /> Collapse {cat.category}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border bg-primary/5 p-8 text-center">
          <Award className="w-10 h-10 text-primary mx-auto mb-3" />
          <h2 className="text-2xl font-bold">All modules included in your plan</h2>
          <p className="text-muted-foreground mt-2 max-w-lg mx-auto">No module add-ons. Every module unlocked based on your plan tier — Starter, Standard or Enterprise.</p>
          <a href="#pricing">
            <Button className="mt-6 gap-2">See pricing plans <ArrowRight className="w-4 h-4" /></Button>
          </a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STORY PAGE
// ─────────────────────────────────────────────────────────────────────────────

function StoryPage() {
  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-5xl">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-4 py-1.5 text-xs font-medium mb-4">
            <Heart className="w-3.5 h-3.5" /> Our Story
          </div>
          <h1 className="text-4xl font-bold">We built the system we wished existed</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">SmartDev started from frustration — watching school administrators drown in paperwork while teachers spent more time on registers than on teaching.</p>
        </div>

        {/* Hero image */}
        <div className="rounded-2xl overflow-hidden mb-16 aspect-[16/6]">
          <img src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&h=450&fit=crop" alt="School campus" className="w-full h-full object-cover" />
        </div>

        {/* Mission & Vision */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-8">
            <Target className="w-10 h-10 text-primary mb-4" />
            <h2 className="text-2xl font-bold mb-3">Our Mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              To give every school in Kenya and East Africa — regardless of size — access to the same quality of administrative technology that was previously only available to large, well-funded institutions. We believe digital tools should reduce the burden on educators, not add to it.
            </p>
          </div>
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-8">
            <Star className="w-10 h-10 text-blue-600 mb-4" />
            <h2 className="text-2xl font-bold mb-3">Our Vision</h2>
            <p className="text-muted-foreground leading-relaxed">
              A future where every teacher focuses entirely on teaching, every parent is always informed, and every administrator has the data they need to make decisions. We're working toward a paperless, data-driven school system across East Africa.
            </p>
          </div>
        </div>

        {/* Values */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">What we stand for</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: Heart, title: "Schools first", desc: "Every decision starts with: does this actually help a school administrator, teacher or parent?" },
              { icon: Shield, title: "Data privacy", desc: "Student data belongs to the school. We never sell it, never mine it, and always protect it." },
              { icon: Zap, title: "Reliability", desc: "Schools can't afford downtime. We build for 99.9% uptime and test every release." },
              { icon: TrendingUp, title: "Affordability", desc: "World-class software shouldn't be out of reach for budget-conscious Kenyan schools." },
              { icon: Users, title: "Local first", desc: "We understand the Kenyan school system — CBC, KCPE, boarding, M-Pesa, SMS — because we live it." },
              { icon: Globe, title: "Open to grow", desc: "Features come from real school feedback. Our roadmap is shaped by administrators and teachers." },
            ].map(v => (
              <div key={v.title} className="rounded-xl border bg-card p-5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3"><v.icon className="w-4 h-4 text-primary" /></div>
                <div className="font-semibold mb-1">{v.title}</div>
                <p className="text-sm text-muted-foreground">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">How we got here</h2>
          <div className="relative">
            <div className="absolute left-16 md:left-1/2 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-8">
              {STORY_MILESTONES.map((m, i) => (
                <div key={m.year} className={`relative flex gap-6 ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"}`}>
                  <div className={`hidden md:block w-1/2 ${i % 2 === 0 ? "text-right pr-8" : "text-left pl-8"}`}>
                    <div className="inline-block rounded-xl border bg-card p-4 text-left">
                      <div className="font-bold text-primary text-lg mb-1">{m.year}</div>
                      <div className="font-semibold mb-1">{m.title}</div>
                      <p className="text-sm text-muted-foreground">{m.desc}</p>
                    </div>
                  </div>
                  <div className="hidden md:flex absolute left-1/2 top-4 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-4 border-background" />
                  {/* Mobile layout */}
                  <div className="md:hidden flex gap-4 pl-4">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">{m.year.slice(2)}</div>
                      <div className="absolute left-1/2 top-8 bottom-0 w-px bg-border -translate-x-1/2" />
                    </div>
                    <div className="rounded-xl border bg-card p-4 mb-2 flex-1">
                      <div className="font-bold text-primary text-sm mb-0.5">{m.year} · {m.title}</div>
                      <p className="text-sm text-muted-foreground">{m.desc}</p>
                    </div>
                  </div>
                  <div className="hidden md:block w-1/2" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Team */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">Our team</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {TEAM.map(t => (
              <div key={t.name} className="rounded-xl border bg-card overflow-hidden">
                <img src={t.photo} alt={t.name} className="w-full aspect-square object-cover" />
                <div className="p-5">
                  <div className="font-bold">{t.name}</div>
                  <div className="text-sm text-primary mb-2">{t.role}</div>
                  <p className="text-sm text-muted-foreground">{t.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="rounded-2xl border bg-card p-8 flex flex-col md:flex-row gap-6 items-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="w-7 h-7 text-primary" />
          </div>
          <div>
            <div className="font-bold text-lg">Based in Nairobi, Kenya</div>
            <p className="text-muted-foreground mt-1">We're a Kenyan company, built by Kenyans, for Kenyan schools. We understand the local curriculum, the M-Pesa ecosystem, boarding school culture and what teachers actually need.</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <a href={`mailto:${EMAIL_HELLO}`} className="text-primary hover:underline flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{EMAIL_HELLO}</a>
              <a href={`tel:${PHONE_PRIMARY.replace(/\s/g,"")}`} className="text-primary hover:underline flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{PHONE_PRIMARY}</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING PAGE
// ─────────────────────────────────────────────────────────────────────────────

function PricingPage({ goTo }: { goTo: (p: Page) => void }) {
  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">Simple, transparent pricing</h1>
          <p className="mt-3 text-muted-foreground">All plans include the Android app, Windows desktop software and free setup. No hidden fees.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {PLANS.map(p => (
            <div key={p.name} className={`rounded-xl border-2 ${p.color} bg-card p-6 flex flex-col relative`}>
              {p.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">{p.badge}</span>}
              <div className="mb-4">
                <div className="font-bold text-xl">{p.name}</div>
                <div className="mt-1"><span className="text-3xl font-bold">{p.price}</span><span className="text-muted-foreground text-sm">{p.period}</span></div>
                <p className="text-xs text-muted-foreground mt-2">{p.desc}</p>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />{f}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => goTo("contact")}>
                <Button className="w-full" variant={p.badge ? "default" : "outline"}>Get started</Button>
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mb-12">All prices in KES. Annual plans available at 2 months free. Contact us for custom pricing for very large institutions.</p>

        <div className="rounded-2xl border bg-card p-8 mb-8">
          <h2 className="text-xl font-bold mb-6">What's included in every plan</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {["Free setup & onboarding", "Android app (APK)", "Windows desktop software", "Free staff training session", "SMS notification credits", "M-Pesa payment integration", "Cloud data backup", "Email & phone support", "Free data migration help"].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />{f}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-8 text-center">
          <Briefcase className="w-10 h-10 text-primary mx-auto mb-3" />
          <h2 className="text-2xl font-bold">Need a custom quote?</h2>
          <p className="text-muted-foreground mt-2 max-w-lg mx-auto">Large institutions, county governments, NGOs and school networks get custom pricing. Talk to us.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href={`mailto:${EMAIL_SALES}`}>
              <Button className="gap-2"><Mail className="w-4 h-4" /> Email Sales</Button>
            </a>
            <a href={`tel:${PHONE_PRIMARY.replace(/\s/g,"")}`}>
              <Button variant="outline" className="gap-2"><Phone className="w-4 h-4" />{PHONE_PRIMARY}</Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD PAGE
// ─────────────────────────────────────────────────────────────────────────────

function DownloadPage() {
  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">Download SmartDev</h1>
          <p className="mt-3 text-muted-foreground">Install on Android or Windows. Log in with your school credentials to get started immediately.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="rounded-2xl border bg-card p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-20 h-20 rounded-2xl bg-green-100 flex items-center justify-center">
              <Smartphone className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <div className="font-bold text-2xl">Android App</div>
              <div className="text-sm text-muted-foreground mt-1">Android 8.0 and above</div>
            </div>
            <ul className="text-sm text-left w-full space-y-2">
              {["Works on all Android phones & tablets","Native push notifications","Offline mode for limited internet areas","Optimised for small screens","Auto-updates from GitHub releases"].map(f => (
                <li key={f} className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600 shrink-0" />{f}</li>
              ))}
            </ul>
            <a href={APK_URL} className="w-full">
              <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white text-base py-6">
                <Download className="w-5 h-5" /> Download APK
              </Button>
            </a>
            <p className="text-xs text-muted-foreground">When prompted, enable "Install from unknown sources" in Android settings.</p>
          </div>

          <div className="rounded-2xl border bg-card p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center">
              <Monitor className="w-10 h-10 text-blue-600" />
            </div>
            <div>
              <div className="font-bold text-2xl">Windows Desktop</div>
              <div className="text-sm text-muted-foreground mt-1">Windows 10 and Windows 11</div>
            </div>
            <ul className="text-sm text-left w-full space-y-2">
              {["Full desktop experience on a large screen","Works with Windows keyboard shortcuts","System tray notifications","Offline capability with sync","Available as .msi and .exe installer"].map(f => (
                <li key={f} className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-600 shrink-0" />{f}</li>
              ))}
            </ul>
            <a href={WINDOWS_URL} target="_blank" rel="noreferrer" className="w-full">
              <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white text-base py-6">
                <Download className="w-5 h-5" /> Download for Windows
              </Button>
            </a>
            <p className="text-xs text-muted-foreground">Run the .msi or .exe installer and follow the setup wizard.</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 mb-8">
          <h2 className="font-bold text-lg mb-4">Also available as a web app</h2>
          <p className="text-muted-foreground text-sm mb-4">SmartDev runs fully in any modern browser — no installation required. Perfect for school computers and tablets.</p>
          <a href="https://app.smartdev.co.ke" target="_blank" rel="noreferrer">
            <Button variant="outline" className="gap-2"><Globe className="w-4 h-4" /> Open Web App <ExternalLink className="w-3.5 h-3.5" /></Button>
          </a>
        </div>

        <div className="rounded-2xl border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">Need help with installation? Call <a href={`tel:${PHONE_SUPPORT.replace(/\s/g,"")}`} className="text-primary hover:underline font-medium">{PHONE_SUPPORT}</a> or email <a href={`mailto:${EMAIL_SUPPORT}`} className="text-primary hover:underline">{EMAIL_SUPPORT}</a></p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT PAGE
// ─────────────────────────────────────────────────────────────────────────────

function ContactPage() {
  const CONTACTS = [
    { icon: Mail, label: "General Enquiries", value: EMAIL_HELLO, href: `mailto:${EMAIL_HELLO}`, color: "bg-blue-100 text-blue-700" },
    { icon: Mail, label: "Sales & Pricing", value: EMAIL_SALES, href: `mailto:${EMAIL_SALES}`, color: "bg-green-100 text-green-700" },
    { icon: Mail, label: "Technical Support", value: EMAIL_SUPPORT, href: `mailto:${EMAIL_SUPPORT}`, color: "bg-orange-100 text-orange-700" },
    { icon: Mail, label: "Legal & Compliance", value: EMAIL_LEGAL, href: `mailto:${EMAIL_LEGAL}`, color: "bg-purple-100 text-purple-700" },
    { icon: Phone, label: "Primary Line", value: PHONE_PRIMARY, href: `tel:${PHONE_PRIMARY.replace(/\s/g,"")}`, color: "bg-teal-100 text-teal-700" },
    { icon: Phone, label: "Support Line", value: PHONE_SUPPORT, href: `tel:${PHONE_SUPPORT.replace(/\s/g,"")}`, color: "bg-red-100 text-red-700" },
  ];

  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">Get in touch</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">We'd love to set up SmartDev for your school. Reach out and we'll get back to you same day.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div>
            <h2 className="font-bold text-xl mb-5">Contact us directly</h2>
            <div className="space-y-3">
              {CONTACTS.map(c => (
                <a
                  key={c.value}
                  href={c.href}
                  className="flex items-center gap-4 rounded-xl border bg-card p-4 hover:border-primary/50 hover:bg-primary/5 transition-colors group"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.color}`}>
                    <c.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className="font-medium text-sm group-hover:text-primary transition-colors">{c.value}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-bold text-xl mb-5">What happens next?</h2>
            <div className="space-y-4">
              {[
                { step: "1", title: "You contact us", desc: "Send an email or give us a call. Tell us your school name, location and approximate student count." },
                { step: "2", title: "We set up your portal", desc: "Within 24 hours, your school's SmartDev portal is created with your branding and initial configuration." },
                { step: "3", title: "Free training session", desc: "We walk your admin team through the system — live session via video call or in person if you're in Nairobi." },
                { step: "4", title: "Go live", desc: "Your school starts using SmartDev. We're available by phone and email throughout your first term." },
              ].map(s => (
                <div key={s.step} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">{s.step}</div>
                  <div>
                    <div className="font-semibold text-sm">{s.title}</div>
                    <p className="text-sm text-muted-foreground mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-xl border bg-card p-5">
              <div className="font-semibold mb-1 flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Our location</div>
              <p className="text-sm text-muted-foreground">Nairobi, Kenya<br />We also travel to schools across Kenya for onboarding and training.</p>
            </div>

            <div className="mt-4 rounded-xl border bg-card p-5">
              <div className="font-semibold mb-1">Business hours</div>
              <p className="text-sm text-muted-foreground">Monday – Friday: 8:00am – 6:00pm EAT<br />Saturday: 9:00am – 2:00pm EAT<br />Support available by email 24/7</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden">
          <img src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=300&fit=crop" alt="Office" className="w-full h-56 object-cover" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL PAGE (links to the full legal.html document)
// ─────────────────────────────────────────────────────────────────────────────

function LegalPage() {
  const DOCS = [
    { title: "Terms of Use", desc: "Acceptance, user commitments, prohibited actions, suspension mechanisms and liability limitations.", section: "terms" },
    { title: "Privacy Policy", desc: "What data we collect, how we use it, who we share it with and your rights under Kenyan data protection law.", section: "privacy" },
    { title: "Data Processing Agreement", desc: "GDPR and DPA 2019 compliant data processing terms for school institutions.", section: "dpa" },
    { title: "Service Level Agreement", desc: "Uptime commitments, maintenance windows, incident response times and remedy provisions.", section: "sla" },
    { title: "Acceptable Use Policy", desc: "Permitted and prohibited uses of the SmartDev platform by schools, staff and students.", section: "aup" },
    { title: "Refund & Cancellation Policy", desc: "Subscription cancellation procedures, refund eligibility and billing dispute resolution.", section: "refund" },
    { title: "Cookie Policy", desc: "How we use cookies, local storage and tracking technologies on the platform.", section: "cookies" },
    { title: "Security Policy", desc: "Our security architecture, encryption standards, access controls and breach notification procedures.", section: "security" },
    { title: "GDPR Compliance Statement", desc: "Our commitments to EU/UK data subjects and cross-border transfer safeguards.", section: "gdpr" },
    { title: "Kenya DPA 2019 Compliance", desc: "Compliance with the Kenya Data Protection Act 2019 and ODPC registration.", section: "kdpa" },
    { title: "Children's Data Policy", desc: "Special provisions for processing personal data of students under 18.", section: "children" },
    { title: "Third-Party Sub-processors", desc: "List of sub-processors we use, their purposes and data locations.", section: "subprocessors" },
  ];

  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-4 py-1.5 text-xs font-medium mb-4">
            <Shield className="w-3.5 h-3.5" /> Legal & Compliance
          </div>
          <h1 className="text-4xl font-bold">Legal documentation</h1>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">Our full legal documentation, terms, policies and compliance statements. The complete 50-page legal document is available as a downloadable PDF.</p>
        </div>

        {/* Download PDF CTA */}
        <div className="rounded-2xl border-2 border-primary bg-primary/5 p-8 text-center mb-10">
          <FileText className="w-12 h-12 text-primary mx-auto mb-3" />
          <h2 className="text-2xl font-bold">Full Legal Document — 50+ Pages</h2>
          <p className="text-muted-foreground mt-2 max-w-lg mx-auto">Download the complete SmartDev legal and compliance suite as a single formatted PDF — all policies, terms, data processing agreements and compliance statements.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="/legal.html" target="_blank" rel="noreferrer">
              <Button className="gap-2 text-base py-5 px-6"><FileText className="w-5 h-5" /> View Full Legal Document</Button>
            </a>
            <a href="/legal.html" target="_blank" rel="noreferrer">
              <Button variant="outline" className="gap-2 text-base py-5 px-6"><Download className="w-5 h-5" /> Download as PDF</Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Last updated: June 2026 · Version 3.0 · Governed by the laws of Kenya</p>
        </div>

        {/* Document list */}
        <h2 className="text-xl font-bold mb-5">Individual policy documents</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-10">
          {DOCS.map(d => (
            <a
              key={d.title}
              href={`/legal.html#${d.section}`}
              target="_blank"
              rel="noreferrer"
              className="flex gap-4 rounded-xl border bg-card p-4 hover:border-primary/50 hover:bg-primary/5 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm group-hover:text-primary transition-colors">{d.title}</div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{d.desc}</p>
              </div>
            </a>
          ))}
        </div>

        {/* Contact for legal */}
        <div className="rounded-2xl border bg-card p-6 flex flex-col md:flex-row gap-5 items-center">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <Mail className="w-6 h-6 text-purple-700" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="font-bold">Legal enquiries</div>
            <p className="text-sm text-muted-foreground mt-0.5">For DPA requests, compliance questions, data subject access requests or legal notices, contact our legal team directly.</p>
          </div>
          <a href={`mailto:${EMAIL_LEGAL}`} className="shrink-0">
            <Button variant="outline" className="gap-2"><Mail className="w-4 h-4" />{EMAIL_LEGAL}</Button>
          </a>
        </div>
      </div>
    </div>
  );
}

export default Landing;
