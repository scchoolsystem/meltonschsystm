import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTenant, isNativeApp } from "@/hooks/use-tenant";
import { SchoolPicker } from "@/components/SchoolPicker";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, ShieldCheck, Phone, Mail, Smartphone, Monitor, Download, BookOpen, CreditCard, Bell, BarChart3, Calendar, Shield, Utensils, Bus, FlaskConical, Dumbbell, FileText, Lock, IdCard, MessageSquare, ClipboardList, Settings, Globe, Zap, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/")({ component: IndexPage });

const APK_URL = "https://github.com/scchoolsystem/meltonschsystm/releases/latest/download/app-release.apk";
const WINDOWS_URL = "https://github.com/scchoolsystem/meltonschsystm/releases/latest";

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
  useEffect(() => {
    if (loading) return;
    if (slug && slug !== "__platform__") { navigate({ to: "/login" }); return; }
  }, [loading, slug, navigate]);
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (native && !slug) return <SchoolPicker onPicked={(s) => { if (s) navigate({ to: "/login" }); }} />;
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
    <a href={WINDOWS_URL} target="_blank" rel="noreferrer"><Button size={size} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Monitor className="w-5 h-5" /> Download for Windows</Button></a>
  );
  if (os === "ios") return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-muted-foreground">iOS coming soon — download on another device:</p>
      <div className="flex gap-3">
        <a href={APK_URL}><Button variant="outline" className="gap-2"><Smartphone className="w-4 h-4" /> Android</Button></a>
        <a href={WINDOWS_URL} target="_blank" rel="noreferrer"><Button variant="outline" className="gap-2"><Monitor className="w-4 h-4" /> Windows</Button></a>
      </div>
    </div>
  );
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <a href={APK_URL}><Button size={size} className="gap-2 bg-green-600 hover:bg-green-700 text-white"><Smartphone className="w-5 h-5" /> Android APK</Button></a>
      <a href={WINDOWS_URL} target="_blank" rel="noreferrer"><Button size={size} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Monitor className="w-5 h-5" /> Windows Desktop</Button></a>
    </div>
  );
}

function Landing() {
  const { session, loading } = useAuth();
  const { isPlatformHost } = useTenant();
  const navigate = useNavigate();
  const [clicks, setClicks] = useState(0);
  useEffect(() => {
    if (isPlatformHost) { navigate({ to: session ? "/platform/dashboard" : "/platform/login" }); return; }
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, isPlatformHost, navigate]);

  const features = [
    { icon: GraduationCap, title: "Admissions", desc: "Online applications, enrollment, class placement and student onboarding." },
    { icon: Users, title: "Student Management", desc: "Full student profiles, guardian contacts, transfers and leaving certificates." },
    { icon: BookOpen, title: "Academics", desc: "Subjects, classes, lesson plans, timetables and curriculum management." },
    { icon: ClipboardList, title: "Attendance", desc: "Daily and period attendance for students and staff with automated reports." },
    { icon: FileText, title: "Exams & Marks", desc: "Exam scheduling, marks entry, grade computation and report cards." },
    { icon: BarChart3, title: "Results & Reports", desc: "Performance analytics, ranking, subject analysis and progress tracking." },
    { icon: CreditCard, title: "Fee Management", desc: "Fee structures, invoice generation, payment tracking and balance statements." },
    { icon: Zap, title: "M-Pesa Integration", desc: "Accept fee payments via M-Pesa directly. Auto-reconciliation and receipts." },
    { icon: FileText, title: "Invoices & Receipts", desc: "Automated invoice generation, printable receipts and payment history." },
    { icon: Bell, title: "Communications", desc: "SMS and in-app notifications to parents, staff and students." },
    { icon: MessageSquare, title: "Announcements", desc: "School-wide and class-specific announcements with read receipts." },
    { icon: Calendar, title: "Timetable", desc: "Automated timetable generation, room allocation and teacher assignment." },
    { icon: Monitor, title: "Live Classes", desc: "Schedule and run live online sessions with attendance tracking." },
    { icon: Shield, title: "Boarding", desc: "Dormitory management, room allocation, duty rosters and boarding fees." },
    { icon: FlaskConical, title: "Clinic", desc: "Student health records, sick bay visits, medication logs and referrals." },
    { icon: Utensils, title: "Kitchen & Catering", desc: "Meal planning, kitchen stock management and catering records." },
    { icon: BookOpen, title: "Library", desc: "Book catalogue, borrowing records, fines and overdue notifications." },
    { icon: Bus, title: "Transport", desc: "Bus routes, student allocation, transport fees and driver management." },
    { icon: Dumbbell, title: "Co-curricular", desc: "Clubs, sports, activities and co-curricular achievement records." },
    { icon: Shield, title: "Discipline", desc: "Incident recording, disciplinary actions, warnings and suspension logs." },
    { icon: IdCard, title: "ID Cards", desc: "Generate and print student and staff ID cards with QR verification." },
    { icon: Users, title: "Staff Management", desc: "Staff profiles, roles, departments, payroll records and contracts." },
    { icon: Settings, title: "Roles & Permissions", desc: "Over 20 user roles with granular permission controls per module." },
    { icon: FileText, title: "Student Documents", desc: "Upload and manage student certificates, birth certificates and documents." },
    { icon: BarChart3, title: "Analytics Dashboard", desc: "Real-time dashboards for enrollment, fees, attendance and performance." },
    { icon: Globe, title: "Parent Portal", desc: "Parents view fees, results, attendance and communicate with teachers." },
    { icon: GraduationCap, title: "Student Portal", desc: "Students access timetables, results, assignments and class resources." },
    { icon: Lock, title: "Security & Audit", desc: "Activity logs, login history, data access controls and audit trails." },
    { icon: Settings, title: "School Settings", desc: "Terms, academic years, grading scales, branding and configuration." },
    { icon: FileText, title: "Leaving Certificates", desc: "Generate official leaving certificates with school stamp and details." },
    { icon: Settings, title: "Departments", desc: "Academic and administrative department management and reporting." },
    { icon: Shield, title: "Insurance", desc: "Student insurance records, policy tracking and claim management." },
    { icon: BarChart3, title: "Billing & Subscription", desc: "School subscription management, billing history and plan upgrades." },
    { icon: Settings, title: "Data Import", desc: "Bulk import students, staff and data from Excel and CSV files." },
    { icon: Globe, title: "Multi-school Platform", desc: "Manage multiple schools from a single platform owner dashboard." },
  ];

  const plans = [
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <button type="button" onClick={() => setClicks(c => c + 1)} className="flex items-center gap-2 cursor-default">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><GraduationCap className="w-5 h-5" /></div>
            <span className="font-bold text-lg">SMART DEV</span>
          </button>
          <nav className="flex items-center gap-2 text-sm">
            <a href="#features" className="hidden md:inline text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">Features</a>
            <a href="#plans" className="hidden md:inline text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">Pricing</a>
            <a href="#download" className="hidden md:inline text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">Download</a>
            <a href="#contact" className="hidden md:inline text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">Contact</a>
            <a href="#download"><Button size="sm"><Download className="w-3.5 h-3.5 mr-1.5" />Get the App</Button></a>
          </nav>
        </div>
      </header>

      <section className="container mx-auto px-6 py-24 md:py-32 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-secondary text-secondary-foreground px-4 py-1.5 text-xs font-medium mb-6">
          <ShieldCheck className="w-3.5 h-3.5" /> Cloud school ERP for Kenya &amp; East Africa
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
          One platform to run your <span className="text-primary">entire school</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          From admissions to graduation — 35+ modules covering every department. Available as an Android app and Windows desktop software.
        </p>
        <div className="mt-10"><DownloadButton /></div>
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {[{ value: "35+", label: "Modules" }, { value: "20+", label: "User roles" }, { value: "M-Pesa", label: "Payments" }, { value: "100%", label: "Cloud-based" }].map(s => (
            <div key={s.label} className="rounded-xl border bg-card p-4 text-center">
              <div className="text-2xl font-bold text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="py-16 bg-muted/30 border-y">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">All 35+ Modules</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">Every department covered — one login for admin, teachers, parents and students.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-7xl mx-auto">
            {features.map(f => (
              <div key={f.title} className="rounded-xl border bg-card p-4 flex gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><f.icon className="w-4 h-4 text-primary" /></div>
                <div><div className="font-semibold text-sm mb-0.5">{f.title}</div><p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="py-16">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="mt-3 text-muted-foreground">All plans include the Android app, Windows desktop software and free setup.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map(p => (
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
                <a href="#contact"><Button className="w-full" variant={p.badge ? "default" : "outline"}>Get started</Button></a>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-8">All prices in KES. Annual plans available at 2 months free. Contact us for custom pricing for very large institutions.</p>
        </div>
      </section>

      <section id="download" className="py-16 bg-muted/30 border-y">
        <div className="container mx-auto px-6 max-w-3xl text-center">
          <h2 className="text-3xl font-bold">Download SmartDev</h2>
          <p className="mt-3 text-muted-foreground">Install on Android or Windows. Log in with your school credentials to get started.</p>
          <div className="mt-10 grid sm:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card p-6 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center"><Smartphone className="w-7 h-7 text-green-600" /></div>
              <div><div className="font-bold text-lg">Android App</div><div className="text-sm text-muted-foreground mt-1">Android 8+ phones and tablets</div></div>
              <a href={APK_URL} className="w-full"><Button className="w-full gap-2 bg-green-600 hover:bg-green-700"><Download className="w-4 h-4" /> Download APK</Button></a>
              <p className="text-xs text-muted-foreground">Allow "Install from unknown sources" when prompted.</p>
            </div>
            <div className="rounded-xl border bg-card p-6 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center"><Monitor className="w-7 h-7 text-blue-600" /></div>
              <div><div className="font-bold text-lg">Windows Desktop</div><div className="text-sm text-muted-foreground mt-1">Windows 10 and Windows 11</div></div>
              <a href={WINDOWS_URL} target="_blank" rel="noreferrer" className="w-full"><Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700"><Download className="w-4 h-4" /> Download for Windows</Button></a>
              <p className="text-xs text-muted-foreground">Run the .exe installer and follow setup steps.</p>
            </div>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">Need help? Call <a href="tel:+254792991222" className="text-primary hover:underline">+254 792 991 222</a></p>
        </div>
      </section>

      <section id="contact" className="py-16">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold">Want SmartDev for your school?</h2>
          <p className="mt-2 text-muted-foreground">Get in touch — we'll set up your portal, migrate your data and onboard your team.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
            <a href="mailto:hello@smartdev.co.ke" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted transition-colors"><Mail className="w-4 h-4 text-primary" /><span>hello@smartdev.co.ke</span></a>
            <a href="tel:+254792991222" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted transition-colors"><Phone className="w-4 h-4 text-primary" /><span>+254 792 991 222</span></a>
          </div>
        </div>
      </section>

      <footer className="border-t py-6">
        <div className="container mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} SmartDev ERP · School management for East Africa</span>
          <span className="flex items-center gap-3">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#plans" className="hover:text-foreground">Pricing</a>
            <a href="#download" className="hover:text-foreground">Download</a>
            <a href="#contact" className="hover:text-foreground">Contact</a>
            {clicks >= 5 && <a href="https://admin.smartdev.co.ke" className="text-primary hover:underline">Platform admin</a>}
          </span>
        </div>
      </footer>
    </div>
  );
}
