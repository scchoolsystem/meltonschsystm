import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
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
  Target, Heart, Star, ArrowRight, MapPin, Menu, X,
  TrendingUp, Award, Layers, Database, Cpu, Cloud, Package, Briefcase,
  Coins,
} from "lucide-react";
import mpesaShot from "@/assets/portals/mpesa.png";
import parentShot from "@/assets/portals/parent.png";
import studentShot from "@/assets/portals/student.png";
import teacherShot from "@/assets/portals/teacher.png";
import financeShot from "@/assets/portals/finance.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartDev ERP | School Management System Kenya" },
      { name: "description", content: "SmartDev ERP is a modern school management system for handling students, exams, attendance, fees, and administration in one platform." },
      { property: "og:title", content: "SmartDev ERP | School Management System Kenya" },
      { property: "og:description", content: "All-in-one school ERP for academics, finance, and administration." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://smartdev.co.ke/" },
    ],
  }),
  component: IndexPage,
});

// Binaries are downloaded through same-origin Worker routes (see
// src/server.ts) rather than linking to github.com/.../releases or a
// third-party storage bucket. The repo is private, so a direct GitHub link
// would 404/redirect to a login page for anonymous visitors; the Worker
// route fetches the latest release asset server-side and streams it back,
// so visitors just get a file download from this domain.
const APK_URL = "/dl/android";
const WINDOWS_EXE_URL = "/dl/windows";

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
  // isNativeApp() reads window.__TAURI__ which Tauri injects after the document
  // is parsed — calling it synchronously at render time can return false on the
  // very first paint before the injection completes.  Use a state initialised
  // after mount so we always read the correct value.
  const [native, setNative] = useState(() => isNativeApp());
  useEffect(() => { setNative(isNativeApp()); }, []);

  // app.smartdev.co.ke is the APP shell (web build of the Android/desktop app),
  // not the marketing site — even when opened in a plain browser. Only the
  // root marketing domains (smartdev.co.ke / www) should ever show Landing.
  const [isAppHost, setIsAppHost] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname.toLowerCase().split(":")[0];
    setIsAppHost(host === "app.smartdev.co.ke");
  }, []);

  useEffect(() => {
    if (loading) return;
    if (slug && slug !== "__platform__") { navigate({ to: "/login" }); return; }
  }, [loading, slug, navigate]);

  // While we are still resolving the slug OR we haven't confirmed whether this
  // is a native app yet, show a spinner so we never flash the marketing page.
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if ((native || isAppHost) && !slug) return <SchoolPicker onPicked={(s) => { if (s) navigate({ to: "/login" }); }} />;
  if (slug && slug !== "__platform__") return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  return <Landing />;
}

function DownloadButton({ size = "lg" }: { size?: "sm" | "lg" }) {
  const [os, setOs] = useState("other");
  useEffect(() => { setOs(getOS()); }, []);

  if (os === "android") return (
    <a href={APK_URL}><Button size={size} className="gap-2 bg-green-600 hover:bg-green-700 text-white"><Smartphone className="w-5 h-5" /> Download for Android</Button></a>
  );
  if (os === "windows") return (
    <a href={WINDOWS_EXE_URL}>
      <Button size={size} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Monitor className="w-5 h-5" /> Download for Windows</Button>
    </a>
  );
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <a href={APK_URL}><Button size={size} className="gap-2 bg-green-600 hover:bg-green-700 text-white"><Smartphone className="w-5 h-5" /> Android APK</Button></a>
      <a href={WINDOWS_EXE_URL}>
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

// A confirmed plan + add-on selection, carried from the pricing page to the
// contact page so a customer's picks aren't lost when they hit "Get started".
type PlanSelection = {
  planName: string;
  baseFee: number;
  modules: { name: string; price: number }[];
  total: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LANDING COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function Landing() {
  const { session, loading } = useAuth();
  const { isPlatformHost } = useTenant();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page>("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [planSelection, setPlanSelection] = useState<PlanSelection | null>(null);
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
        {page === "pricing" && <PricingPage goTo={goTo} site={site} onProceed={setPlanSelection} />}
        {page === "download" && <DownloadPage site={site} />}
        {page === "contact" && <ContactPage site={site} planSelection={planSelection} />}
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
// CINEMATIC SCROLL ENGINE
// Rebuilt against the "cinematic scroll-driven world" scroll architecture:
// a chain of pinned (position: sticky) full-viewport scenes, each owning a
// 0→1 scroll progress value that is spring-smoothed (the buttery Lenis-style
// feel), alternating between horizontal camera pans and vertical descents,
// with a shared vignette layer that darkens scene edges as one scene hands
// off to the next ("cave passage" transitions in the original prompt).
// Reskinned for a school ERP: instead of dragons/treasure/NFTs, each scene
// dramatizes a real product moment — the platform tour, fee collection,
// the campus, the portals, the mission, the trust numbers, the CTA.
// ─────────────────────────────────────────────────────────────────────────────

function useReducedMotionPref() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// Standard, battle-tested "fade up once it scrolls into view" reveal.
// Deliberately NOT scroll-scrubbed (no useScroll/useTransform tied to pin
// height) — that approach kept breaking (washed-out text, broken images,
// re-tuned breakpoints every time a section changed) and is expensive on
// the budget Android devices this platform actually ships to. This is
// cheaper, cannot desync, and still feels smooth and premium.
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotionPref();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Counts up from 0 to `value` once the element scrolls into view.
function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf: number;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return <span ref={ref}>{display.toLocaleString()}{suffix}</span>;
}

// A simple browser-window frame around a real screenshot — used for the
// M-Pesa dashboard image. No motion, no pinning, just a clean static card.
function BrowserFrame({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden ${className}`}>
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 border-b border-white/10">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
      </div>
      <img src={src} alt={alt} loading="lazy" className="w-full h-auto" />
    </div>
  );
}

// ── Section 1: Hero ──────────────────────────────────────────────────────
function HeroScene({
  goTo,
  hero,
  heroPhotos,
}: {
  goTo: (p: Page) => void;
  hero: any;
  heroPhotos: { src: string; caption?: string }[];
}) {
  const [heroImg, setHeroImg] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setHeroImg((i) => (i + 1) % heroPhotos.length), 5000);
    return () => clearInterval(t);
  }, [heroPhotos.length]);

  return (
    <section className="relative min-h-[85vh] flex items-center overflow-hidden bg-slate-950">
      <div className="absolute inset-0">
        {heroPhotos.map((p, i) => (
          <img
            key={p.src}
            src={p.src}
            alt={p.caption || "Kenyan school"}
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === heroImg ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        <div className="absolute inset-0 bg-black/70" />
      </div>
      <div className="relative container mx-auto px-6 py-16 sm:py-24 text-center text-white">
        <Reveal>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur px-4 py-1.5 text-[11px] sm:text-xs font-medium mb-4 sm:mb-6">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> {hero.badge}
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight max-w-4xl mx-auto leading-tight">
            {hero.heading_line1} <span className="text-primary">{hero.heading_highlight}</span>
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg text-white/80 max-w-2xl mx-auto">
            {hero.subheading}
          </p>
          <div className="mt-6 sm:mt-10 flex flex-wrap justify-center gap-3 sm:gap-4">
            <DownloadButton />
            <button type="button" onClick={() => goTo("modules")}>
              <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 bg-transparent gap-2">
                <Layers className="w-4 h-4" /> Explore Modules
              </Button>
            </button>
          </div>
          <div className="mt-8 sm:mt-16 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-3xl mx-auto">
            {hero.stats.map((s: any) => (
              <div key={s.label} className="rounded-xl border border-white/20 bg-white/10 backdrop-blur p-3 sm:p-4 text-center">
                <div className="text-xl sm:text-2xl font-bold text-primary">{s.value}</div>
                <div className="text-[11px] sm:text-xs text-white/70 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Section 2: Modules ───────────────────────────────────────────────────
function ModulesScene({ goTo, categories }: { goTo: (p: Page) => void; categories: any[] }) {
  return (
    <section className="relative bg-slate-950 py-20 sm:py-28">
      <div className="container mx-auto px-6">
        <Reveal className="mb-10 sm:mb-12 text-white">
          <div className="text-xs uppercase tracking-widest text-primary mb-2">Platform tour</div>
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-semibold max-w-xl">Everything your school needs, in one place</h2>
          <p className="mt-3 text-sm sm:text-base text-white/60 max-w-md">35+ modules, one login. Admin, teachers, parents and students each see their own tailored portal.</p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {categories.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.08}>
              <div className="group relative h-[280px] sm:h-[320px] rounded-2xl overflow-hidden border border-white/10 transition-transform duration-300 hover:-translate-y-1 hover:shadow-2xl">
                {c.img && (
                  <img
                    src={c.img}
                    alt={c.title}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                <div className={`absolute inset-0 bg-gradient-to-t ${c.gradient}`} />
                <div className="relative h-full flex flex-col justify-end p-5 text-white">
                  <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center mb-3">
                    <c.icon className="w-5 h-5" />
                  </div>
                  <div className="font-semibold text-lg">{c.title}</div>
                  <p className="text-sm text-white/80 mt-1">{c.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal delay={categories.length * 0.08}>
            <button
              type="button"
              onClick={() => goTo("modules")}
              className="h-[280px] sm:h-[320px] w-full rounded-2xl border border-white/15 flex flex-col items-center justify-center gap-4 text-white hover:bg-white/5 transition-colors"
            >
              <div className="text-lg font-semibold">See all 35+ modules</div>
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm">
                View all modules <ArrowRight className="w-4 h-4" />
              </span>
            </button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ── Section 3: Finance & M-Pesa ──────────────────────────────────────────
function FinanceScene({ goTo }: { goTo: (p: Page) => void }) {
  return (
    <section className="relative bg-gradient-to-b from-emerald-950 via-emerald-950 to-slate-950 py-20 sm:py-28 overflow-hidden">
      <div className="container mx-auto px-6 grid md:grid-cols-2 gap-10 items-center text-white">
        <Reveal>
          <div className="text-xs uppercase tracking-widest text-emerald-300 mb-2 flex items-center gap-2">
            <Coins className="w-3.5 h-3.5" /> Finance & Payments
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-semibold max-w-lg">Fee collection, reimagined</h2>
          <p className="mt-4 text-sm sm:text-base text-white/70 max-w-md">
            Parents pay fees straight from their phone with M-Pesa STK Push. Every payment reconciles automatically,
            prints a branded receipt, and updates the school's ledger in real time — no more chasing paper slips.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-white/80">
            {["Instant STK Push prompts", "Automatic reconciliation", "Live arrears & balance tracking"].map((f) => (
              <li key={f} className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />{f}</li>
            ))}
          </ul>
          <button type="button" onClick={() => goTo("pricing")} className="mt-6 inline-block">
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">See pricing <ArrowRight className="w-4 h-4" /></Button>
          </button>
        </Reveal>
        <Reveal delay={0.15}>
          <BrowserFrame
            src={mpesaShot}
            alt="SmartDev ERP M-Pesa dashboard showing today's collections, transaction status, and recent M-Pesa payments"
            className="max-w-md mx-auto"
          />
        </Reveal>
      </div>
    </section>
  );
}

// ── Section 4: Campus life ───────────────────────────────────────────────
function CampusScene({ photos }: { photos: { src: string; caption?: string }[] }) {
  return (
    <section className="relative bg-background py-20 sm:py-28">
      <div className="container mx-auto px-6">
        <Reveal className="mb-10 sm:mb-12 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl font-semibold">Built for schools like yours</h2>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
          {photos.map((p, i) => (
            <Reveal key={p.src} delay={i * 0.06} className={i === 0 ? "col-span-2 sm:col-span-1" : ""}>
              <div className="group relative rounded-2xl overflow-hidden aspect-[4/3]">
                <img
                  src={p.src}
                  alt={p.caption || "SmartDev ERP in a Kenyan school"}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {p.caption && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <span className="text-white text-xs sm:text-sm font-medium">{p.caption}</span>
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section 5: Portals ───────────────────────────────────────────────────
function PortalsScene() {
  const portals = [
    { icon: Globe, title: "Parent Portal", desc: "Fee balances, results, attendance and direct messaging with teachers.", gradient: "from-purple-950/95 via-purple-950/50 to-purple-950/10", img: parentShot },
    { icon: GraduationCap, title: "Student Portal", desc: "Timetables, exam results, assignments and class resources.", gradient: "from-blue-950/95 via-blue-950/50 to-blue-950/10", img: studentShot },
    { icon: Users, title: "Staff Portal", desc: "Marks entry, attendance registers, timetables and departmental tools.", gradient: "from-teal-950/95 via-teal-950/50 to-teal-950/10", img: teacherShot },
    { icon: ShieldCheck, title: "Admin Dashboard", desc: "Real-time enrollment, finance and attendance intelligence across the school.", gradient: "from-gray-950/95 via-gray-950/50 to-gray-950/10", img: financeShot },
  ];

  return (
    <section className="relative bg-slate-950 py-20 sm:py-28">
      <div className="container mx-auto px-6">
        <Reveal className="mb-10 sm:mb-12 text-white">
          <div className="text-xs uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
            <ArrowRight className="w-3 h-3" /> A view for everyone
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-semibold max-w-xl">One platform, four tailored experiences</h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {portals.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08}>
              <div className="group relative h-[300px] sm:h-[340px] rounded-2xl overflow-hidden border border-white/10 transition-transform duration-300 hover:-translate-y-1 hover:shadow-2xl">
                <img
                  src={p.img}
                  alt={`${p.title} in SmartDev ERP`}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${p.gradient}`} />
                <div className="relative h-full flex flex-col justify-end p-5 sm:p-6 text-white">
                  <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center mb-4">
                    <p.icon className="w-5 h-5" />
                  </div>
                  <div className="font-semibold text-lg sm:text-xl">{p.title}</div>
                  <p className="text-sm text-white/80 mt-1">{p.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section 6: Mission ───────────────────────────────────────────────────
function MissionScene({ goTo, mission }: { goTo: (p: Page) => void; mission: any }) {
  return (
    <section className="relative bg-[#0f1c30] py-20 sm:py-28">
      <div className="container mx-auto px-6 text-center text-primary-foreground">
        <Reveal>
          <Target className="w-9 h-9 sm:w-10 sm:h-10 mx-auto mb-4 opacity-80" />
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-semibold max-w-2xl mx-auto">{mission.heading}</h2>
          <p className="mt-4 text-sm sm:text-base text-primary-foreground/80 max-w-xl mx-auto">{mission.body}</p>
          <button type="button" onClick={() => goTo("story")} className="mt-6 sm:mt-8 inline-block">
            <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent gap-2">
              Read our story <ArrowRight className="w-4 h-4" />
            </Button>
          </button>
          <div className="mt-10 sm:mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-2xl mx-auto">
            {[
              { icon: GraduationCap, value: 300, suffix: "+", label: "Schools onboarded" },
              { icon: Users, value: 120000, suffix: "+", label: "Students managed" },
              { icon: Cloud, value: 99, suffix: "%", label: "Platform uptime" },
              { icon: Zap, value: 3, suffix: "s", label: "Avg. M-Pesa confirmation" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 backdrop-blur-md p-4">
                <s.icon className="w-5 h-5 mx-auto mb-1.5 text-primary-foreground/90" />
                <div className="text-xl sm:text-2xl font-bold">
                  <AnimatedCounter value={s.value} suffix={s.suffix} />
                </div>
                <div className="text-[10px] sm:text-xs text-primary-foreground/70 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Section 7: Final CTA ─────────────────────────────────────────────────
function FinalScene({ goTo, site }: { goTo: (p: Page) => void; site: typeof SITE_DEFAULTS }) {
  return (
    <section className="relative bg-slate-950 py-20 sm:py-28">
      <div className="container mx-auto px-6 text-center text-white">
        <Reveal>
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-semibold">{site.brand_name} pricing made simple</h2>
          <p className="mt-3 text-sm sm:text-base text-white/70 max-w-lg mx-auto">
            Transparent pricing, no hidden fees. Android app, Windows desktop and free setup included.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 sm:gap-4">
            <button type="button" onClick={() => goTo("pricing")}>
              <Button size="lg" className="gap-2">See all plans <ArrowRight className="w-4 h-4" /></Button>
            </button>
            <DownloadButton />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HomePage({ goTo, site }: { goTo: (p: Page) => void; site: typeof SITE_DEFAULTS }) {
  const hero = useLandingContent("hero", {
    badge: "Cloud school ERP for Kenya & East Africa",
    heading_line1: "One platform to run your",
    heading_highlight: "entire school",
    subheading: "From admissions to graduation — 35+ modules covering every department. Built for Kenyan schools, available as Android app and Windows desktop.",
    stats: [{ value: "35+", label: "Modules" }, { value: "20+", label: "User roles" }, { value: "M-Pesa", label: "Payments" }, { value: "100%", label: "Cloud-based" }],
  });
  const mission = useLandingContent("mission_teaser", {
    heading: "Our mission: make every Kenyan school paperless by 2030",
    body: "We believe schools should spend less time on administration and more time on education. SmartDev exists to make that possible for every school — regardless of size or budget.",
  });
  const heroPhotos = useGalleryPhotos("hero", HERO_PHOTOS.map((src) => ({ src })));
  const galleryPhotos = useGalleryPhotos("gallery", GALLERY_PHOTOS);

  const moduleCategories = [
    { icon: GraduationCap, title: "Academics", desc: "Classes, exams, report cards & timetables", gradient: "from-blue-950/95 via-blue-950/30 to-transparent", img: heroPhotos[0]?.src },
    { icon: CreditCard, title: "Finance", desc: "Fees, M-Pesa, invoices & receipts", gradient: "from-emerald-950/95 via-emerald-950/40 to-emerald-950/10", img: financeShot },
    { icon: Shield, title: "Boarding & Welfare", desc: "Dorms, clinic, kitchen & transport", gradient: "from-orange-950/95 via-orange-950/30 to-transparent", img: galleryPhotos[5]?.src ?? heroPhotos[2]?.src },
    { icon: Globe, title: "Portals", desc: "Parents, students & staff get their own view", gradient: "from-purple-950/95 via-purple-950/30 to-transparent", img: galleryPhotos[2]?.src ?? heroPhotos[0]?.src },
  ];

  return (
    <div className="relative">
      <HeroScene goTo={goTo} hero={hero} heroPhotos={heroPhotos} />
      <ModulesScene goTo={goTo} categories={moduleCategories} />
      <FinanceScene goTo={goTo} />
      <CampusScene photos={galleryPhotos} />
      <PortalsScene />
      <MissionScene goTo={goTo} mission={mission} />
      <FinalScene goTo={goTo} site={site} />
    </div>
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
  const site = useSiteMeta();
  const intro = useLandingContent("story_intro", {
    badge: "Our Story",
    heading: "We built the system we wished existed",
    subheading: "SmartDev started from frustration — watching school administrators drown in paperwork while teachers spent more time on registers than on teaching.",
    hero_image_url: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&h=450&fit=crop",
    mission_title: "Our Mission",
    mission_body: "To give every school in Kenya and East Africa — regardless of size — access to the same quality of administrative technology that was previously only available to large, well-funded institutions. We believe digital tools should reduce the burden on educators, not add to it.",
    vision_title: "Our Vision",
    vision_body: "A future where every teacher focuses entirely on teaching, every parent is always informed, and every administrator has the data they need to make decisions. We are working toward a paperless, data-driven school system across East Africa.",
  });
  const milestonesData = useLandingContent("story_milestones", { items: STORY_MILESTONES });
  const milestoneItems: { year: string; title: string; desc: string }[] = milestonesData.items?.length ? milestonesData.items : STORY_MILESTONES;
  const founder = useLandingContent("founder", {
    name: "Melton Konchella",
    role: "Founder & Developer",
    photo_url: null as string | null,
    bio: "Melton Konchella founded and personally built SmartDev ERP — designing, developing and maintaining every module of the platform, from the academic and finance systems to the Android and Windows apps.",
  });
  const storyHeroPhotos = useGalleryPhotos("story_hero", [{ src: intro.hero_image_url || "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&h=450&fit=crop" }]);

  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-5xl">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-4 py-1.5 text-xs font-medium mb-4">
            <Heart className="w-3.5 h-3.5" /> {intro.badge}
          </div>
          <h1 className="text-4xl font-bold">{intro.heading}</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">{intro.subheading}</p>
        </div>

        {/* Hero image */}
        <div className="rounded-2xl overflow-hidden mb-16 aspect-[16/6]">
          <img src={storyHeroPhotos[0]?.src} alt="School campus" className="w-full h-full object-cover" />
        </div>

        {/* Mission & Vision */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-8">
            <Target className="w-10 h-10 text-primary mb-4" />
            <h2 className="text-2xl font-bold mb-3">{intro.mission_title}</h2>
            <p className="text-muted-foreground leading-relaxed">{intro.mission_body}</p>
          </div>
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-8">
            <Star className="w-10 h-10 text-blue-600 mb-4" />
            <h2 className="text-2xl font-bold mb-3">{intro.vision_title}</h2>
            <p className="text-muted-foreground leading-relaxed">{intro.vision_body}</p>
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
              {milestoneItems.map((m, i) => (
                <div key={`${m.year}-${i}`} className={`relative flex gap-6 ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"}`}>
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

        {/* Founder */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8">Meet the founder</h2>
          <div className="max-w-md mx-auto rounded-xl border bg-card overflow-hidden">
            <div className="w-full aspect-square bg-muted flex items-center justify-center overflow-hidden">
              {founder.photo_url ? (
                <img src={founder.photo_url} alt={founder.name} className="w-full h-full object-cover" />
              ) : (
                <GraduationCap className="w-16 h-16 text-muted-foreground/40" />
              )}
            </div>
            <div className="p-5 text-center">
              <div className="font-bold text-lg">{founder.name}</div>
              <div className="text-sm text-primary mb-2">{founder.role}</div>
              <p className="text-sm text-muted-foreground">{founder.bio}</p>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="rounded-2xl border bg-card p-8 flex flex-col md:flex-row gap-6 items-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="w-7 h-7 text-primary" />
          </div>
          <div>
            <div className="font-bold text-lg">Based in {site.location}</div>
            <p className="text-muted-foreground mt-1">We're a Kenyan company, built by Kenyans, for Kenyan schools. We understand the local curriculum, the M-Pesa ecosystem, boarding school culture and what teachers actually need.</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <a href={`mailto:${site.email_hello}`} className="text-primary hover:underline flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{site.email_hello}</a>
              <a href={`tel:${site.phone_primary.replace(/\s/g,"")}`} className="text-primary hover:underline flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{site.phone_primary}</a>
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

function PricingPage({ goTo, site, onProceed }: { goTo: (p: Page) => void; site: typeof SITE_DEFAULTS; onProceed: (selection: PlanSelection) => void }) {
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: modules, isLoading: modulesLoading } = useQuery({
    queryKey: ["public-module-pricing"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("module_addon_pricing")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Which modules are free-included on which plan. This is the exact same
  // table the admin edits in Platform Admin -> Website -> Pricing & Modules,
  // so the two pages can never drift out of sync again.
  const { data: inclusionRows, isLoading: inclusionLoading } = useQuery({
    queryKey: ["public-plan-module-inclusion"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("plan_module_inclusion").select("*");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [extraModules, setExtraModules] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (plans && plans.length && !selectedPlanId) setSelectedPlanId(plans[Math.min(1, plans.length - 1)].id);
  }, [plans, selectedPlanId]);

  const selectedPlan = plans?.find((p) => p.id === selectedPlanId);

  const isIncluded = (m: any) => {
    if (!selectedPlan) return false;
    return (inclusionRows ?? []).some(
      (r: any) => r.plan_id === selectedPlan.id && r.feature_key === m.feature_key && r.included
    );
  };

  const toggleModule = (key: string) => {
    setExtraModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const pickedAddonModules = (modules ?? []).filter((m) => extraModules.has(m.feature_key) && !isIncluded(m));
  const addonTotal = pickedAddonModules.reduce((sum, m) => sum + Number(m.monthly_price ?? 0), 0);

  const baseFee = Number(selectedPlan?.monthly_fee ?? 0);
  const total = baseFee + addonTotal;

  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">Simple, transparent pricing</h1>
          <p className="mt-3 text-muted-foreground">Pick a base plan, then choose exactly the extra modules your school needs. All plans include the Android app, Windows desktop software and free setup.</p>
        </div>

        {/* Base plan cards */}
        {plansLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {(plans ?? []).map((p: any) => {
              const isSelected = p.id === selectedPlanId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`text-left rounded-xl border-2 ${isSelected ? "border-primary" : "border-border"} bg-card p-6 flex flex-col relative transition-colors`}
                >
                  {p.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">{p.badge}</span>}
                  <div className="mb-4">
                    <div className="font-bold text-xl">{p.name}</div>
                    <div className="mt-1"><span className="text-3xl font-bold">KES {Number(p.monthly_fee ?? 0).toLocaleString()}</span><span className="text-muted-foreground text-sm">/month base</span></div>
                    <p className="text-xs text-muted-foreground mt-2">{p.description || (p.student_limit ? `Up to ${p.student_limit} students` : "Unlimited students")}</p>
                  </div>
                  <div className={`mt-auto text-sm font-medium ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                    {isSelected ? "✓ Selected — customize below" : "Tap to select this plan"}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Module picker */}
        {selectedPlan && (
          <div className="rounded-2xl border bg-card p-6 md:p-8 mb-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
              <h2 className="text-xl font-bold">Choose your modules</h2>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Estimated total</div>
                <div className="text-2xl font-bold text-primary">KES {total.toLocaleString()}<span className="text-sm text-muted-foreground font-normal">/month</span></div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">Modules already included in the {selectedPlan.name} plan are free. Tick any extra module to add it and see the price update live.</p>
            {modulesLoading || inclusionLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(modules ?? []).map((m: any) => {
                  const included = isIncluded(m);
                  const checked = included || extraModules.has(m.feature_key);
                  return (
                    <label
                      key={m.feature_key}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${included ? "bg-primary/5 border-primary/30" : "hover:bg-muted/50"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        disabled={included}
                        onChange={() => toggleModule(m.feature_key)}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium flex items-center justify-between gap-2">
                          {m.display_name}
                          {included ? (
                            <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">Included</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">+KES {Number(m.monthly_price ?? 0).toLocaleString()}/mo</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{m.category}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
              <div className="text-sm text-muted-foreground">
                Base ({selectedPlan.name}): KES {baseFee.toLocaleString()}/mo &nbsp;+&nbsp; Add-ons: KES {addonTotal.toLocaleString()}/mo
              </div>
              <button
                type="button"
                onClick={() => {
                  onProceed({
                    planName: selectedPlan.name,
                    baseFee,
                    modules: pickedAddonModules.map((m) => ({ name: m.display_name, price: Number(m.monthly_price ?? 0) })),
                    total,
                  });
                  goTo("contact");
                }}
              >
                <Button size="lg" className="gap-2">Get started with this plan <ArrowRight className="w-4 h-4" /></Button>
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mb-12">All prices in KES. Annual plans available at 2 months free. Contact us for custom pricing for very large institutions or school networks.</p>

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
            <a href={`mailto:${site.email_sales}`}>
              <Button className="gap-2"><Mail className="w-4 h-4" /> Email Sales</Button>
            </a>
            <a href={`tel:${site.phone_primary.replace(/\s/g,"")}`}>
              <Button variant="outline" className="gap-2"><Phone className="w-4 h-4" />{site.phone_primary}</Button>
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

function DownloadPage({ site }: { site: typeof SITE_DEFAULTS }) {
  const dl = useLandingContent("download_page", {
    heading: "Download SmartDev",
    subheading: "Install on Android or Windows. Log in with your school credentials to get started immediately.",
  });

  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">{dl.heading}</h1>
          <p className="mt-3 text-muted-foreground">{dl.subheading}</p>
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
              {["Works on all Android phones & tablets","Native push notifications","Offline mode for limited internet areas","Optimised for small screens","Regularly updated with new features"].map(f => (
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
            <a href={WINDOWS_EXE_URL} className="w-full">
              <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white text-base py-6">
                <Download className="w-5 h-5" /> Download for Windows
              </Button>
            </a>
            <p className="text-xs text-muted-foreground">Direct download — run the installer and follow the setup wizard.</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">Need help with installation? Call <a href={`tel:${site.phone_support.replace(/\s/g,"")}`} className="text-primary hover:underline font-medium">{site.phone_support}</a> or email <a href={`mailto:${site.email_support}`} className="text-primary hover:underline">{site.email_support}</a></p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT PAGE
// ─────────────────────────────────────────────────────────────────────────────

function ContactPage({ site, planSelection }: { site: typeof SITE_DEFAULTS; planSelection: PlanSelection | null }) {
  const content = useLandingContent("contact_page", {
    heading: "Get in touch",
    subheading: "We would love to set up SmartDev for your school. Reach out and we will get back to you same day.",
    office_image_url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=300&fit=crop",
    business_hours: "Monday – Friday: 8:00am – 6:00pm EAT\nSaturday: 9:00am – 2:00pm EAT\nSupport available by email 24/7",
  });
  const contactPhotos = useGalleryPhotos("contact", [{ src: content.office_image_url || "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=300&fit=crop" }]);

  const selectionSummaryText = planSelection
    ? [
        `Plan: ${planSelection.planName} (KES ${planSelection.baseFee.toLocaleString()}/mo base)`,
        planSelection.modules.length
          ? `Add-on modules: ${planSelection.modules.map((m) => `${m.name} (+KES ${m.price.toLocaleString()}/mo)`).join(", ")}`
          : "Add-on modules: none — base plan modules only",
        `Estimated total: KES ${planSelection.total.toLocaleString()}/mo`,
      ].join("\n")
    : "";

  const salesMailto = planSelection
    ? `mailto:${site.email_sales}?subject=${encodeURIComponent(`New school sign-up — ${planSelection.planName} plan`)}&body=${encodeURIComponent(
        `Hi SmartDev team,\n\nI'd like to get started with the following plan:\n\n${selectionSummaryText}\n\nSchool name:\nLocation:\nApprox. student count:\n\nThanks!`
      )}`
    : `mailto:${site.email_sales}`;

  const CONTACTS = [
    { icon: Mail, label: "General Enquiries", value: site.email_hello, href: `mailto:${site.email_hello}`, color: "bg-blue-100 text-blue-700" },
    { icon: Mail, label: "Sales & Pricing", value: site.email_sales, href: salesMailto, color: "bg-green-100 text-green-700" },
    { icon: Mail, label: "Technical Support", value: site.email_support, href: `mailto:${site.email_support}`, color: "bg-orange-100 text-orange-700" },
    { icon: Mail, label: "Admin & Legal", value: site.email_admin, href: `mailto:${site.email_admin}`, color: "bg-purple-100 text-purple-700" },
    { icon: Phone, label: "Call or WhatsApp", value: site.phone_primary, href: `tel:${site.phone_primary.replace(/\s/g,"")}`, color: "bg-teal-100 text-teal-700" },
  ];

  return (
    <div className="py-12">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">{content.heading}</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">{content.subheading}</p>
        </div>

        {planSelection && (
          <div className="rounded-2xl border-2 border-primary bg-primary/5 p-6 mb-10 max-w-2xl mx-auto">
            <div className="flex items-center gap-2 font-bold text-lg mb-3"><CheckCircle className="w-5 h-5 text-primary" /> Your selection</div>
            <div className="text-sm space-y-1.5">
              <div><span className="text-muted-foreground">Plan:</span> <span className="font-medium">{planSelection.planName}</span> <span className="text-muted-foreground">— KES {planSelection.baseFee.toLocaleString()}/mo base</span></div>
              <div className="text-muted-foreground">
                Add-ons: {planSelection.modules.length ? planSelection.modules.map((m) => m.name).join(", ") : "none — base plan modules only"}
              </div>
              <div className="font-semibold text-primary">Estimated total: KES {planSelection.total.toLocaleString()}/mo</div>
            </div>
            <a href={salesMailto} className="inline-block mt-4">
              <Button className="gap-2">Email us this selection <ArrowRight className="w-4 h-4" /></Button>
            </a>
            <p className="text-xs text-muted-foreground mt-2">This pre-fills an email to our sales team with your plan and modules, so nothing gets lost — just add your school details and hit send.</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div>
            <h2 className="font-bold text-xl mb-5">Contact us directly</h2>
            <div className="space-y-3">
              {CONTACTS.map(c => (
                <a
                  key={c.label}
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
              <p className="text-sm text-muted-foreground">{site.location}<br />We also travel to schools across Kenya for onboarding and training.</p>
            </div>

            <div className="mt-4 rounded-xl border bg-card p-5">
              <div className="font-semibold mb-1">Business hours</div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{content.business_hours}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden">
          <img src={contactPhotos[0]?.src} alt="Office" className="w-full h-56 object-cover" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL PAGE (links to the full legal.html document)
// ─────────────────────────────────────────────────────────────────────────────

function LegalPage({ site }: { site: typeof SITE_DEFAULTS }) {
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
          <a href={`mailto:${site.email_admin}`} className="shrink-0">
            <Button variant="outline" className="gap-2"><Mail className="w-4 h-4" />{site.email_admin}</Button>
          </a>
        </div>
      </div>
    </div>
  );
}

export default Landing;
