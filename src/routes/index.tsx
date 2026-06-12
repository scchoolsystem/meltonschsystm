import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTenant, isNativeApp } from "@/hooks/use-tenant";
import { SchoolPicker } from "@/components/SchoolPicker";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, ShieldCheck, Phone, Mail, Smartphone, Monitor, Download, BookOpen, CreditCard, Bell, BarChart3, Calendar, Shield } from "lucide-react";

export const Route = createFileRoute("/")({ component: IndexPage });

const APK_URL = "https://github.com/scchoolsystem/meltonschsystm/releases/latest/download/app-release.apk";
const WINDOWS_URL = "https://github.com/scchoolsystem/meltonschsystm/releases/latest";

function getOS() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/windows/i.test(ua)) return "windows";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/mac/i.test(ua)) return "mac";
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

function DownloadButton() {
  const [os, setOs] = useState<string>("other");
  const [showBoth, setShowBoth] = useState(false);
  useEffect(() => { setOs(getOS()); }, []);

  if (os === "android") {
    return (
      <a href={APK_URL}>
        <Button size="lg" className="gap-2 bg-green-600 hover:bg-green-700 text-white">
          <Smartphone className="w-5 h-5" /> Download for Android
        </Button>
      </a>
    );
  }
  if (os === "windows") {
    return (
      <a href={WINDOWS_URL} target="_blank" rel="noreferrer">
        <Button size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          <Monitor className="w-5 h-5" /> Download for Windows
        </Button>
      </a>
    );
  }
  if (os === "ios") {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">iOS coming soon — download on another device:</p>
        <div className="flex gap-3">
          <a href={APK_URL}><Button variant="outline" className="gap-2"><Smartphone className="w-4 h-4" /> Android APK</Button></a>
          <a href={WINDOWS_URL} target="_blank" rel="noreferrer"><Button variant="outline" className="gap-2"><Monitor className="w-4 h-4" /> Windows</Button></a>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <a href={APK_URL}><Button size="lg" className="gap-2 bg-green-600 hover:bg-green-700 text-white"><Smartphone className="w-5 h-5" /> Download for Android</Button></a>
      <a href={WINDOWS_URL} target="_blank" rel="noreferrer"><Button size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Monitor className="w-5 h-5" /> Download for Windows</Button></a>
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
    { icon: BookOpen, title: "Academics", desc: "Timetables, lesson plans, exam results, report cards and class attendance all in one place." },
    { icon: CreditCard, title: "Fee Management", desc: "Invoice parents, track payments, M-Pesa integration and automated fee reminders." },
    { icon: Users, title: "Student Records", desc: "Full student profiles, admissions, transfers, ID cards and parent contact management." },
    { icon: Bell, title: "Communications", desc: "SMS and in-app notifications to parents, staff and students instantly." },
    { icon: BarChart3, title: "Reports & Analytics", desc: "Performance dashboards, financial summaries and compliance reports." },
    { icon: Calendar, title: "Events & Calendar", desc: "School events, exams, holidays and staff schedules in a shared calendar." },
    { icon: Shield, title: "Boarding & Clinic", desc: "Dormitory management, student health records and clinic visit logs." },
    { icon: GraduationCap, title: "Library", desc: "Book inventory, borrowing records and overdue tracking." },
    { icon: Monitor, title: "Transport", desc: "Bus routes, student allocation and transport fee tracking." },
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
            <a href="#features" className="hidden sm:inline text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">Features</a>
            <a href="#download" className="hidden sm:inline text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">Download</a>
            <a href="#contact" className="hidden sm:inline text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">Contact</a>
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
          From admissions to graduation — academics, fees, boarding, library, clinic, transport, communications and more. Available as an Android app and Windows desktop software.
        </p>
        <div className="mt-10">
          <DownloadButton />
        </div>
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {[{ value: "60+", label: "Features & modules" }, { value: "20+", label: "User roles" }, { value: "100%", label: "Cloud-based" }, { value: "M-Pesa", label: "Payments" }].map(s => (
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
            <h2 className="text-3xl font-bold">Everything your school needs</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">SmartDev covers every department — one login for admin, teachers, parents and students.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map(f => (
              <div key={f.title} className="rounded-xl border bg-card p-5 flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><f.icon className="w-5 h-5 text-primary" /></div>
                <div><div className="font-semibold text-sm mb-1">{f.title}</div><p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="download" className="py-16">
        <div className="container mx-auto px-6 max-w-3xl text-center">
          <h2 className="text-3xl font-bold">Download SmartDev</h2>
          <p className="mt-3 text-muted-foreground">Install on your Android phone or Windows computer. Log in with your school credentials to get started.</p>
          <div className="mt-10 grid sm:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card p-6 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center"><Smartphone className="w-7 h-7 text-green-600" /></div>
              <div><div className="font-bold text-lg">Android App</div><div className="text-sm text-muted-foreground mt-1">For phones and tablets running Android 8+</div></div>
              <a href={APK_URL} className="w-full"><Button className="w-full gap-2 bg-green-600 hover:bg-green-700"><Download className="w-4 h-4" /> Download APK</Button></a>
              <p className="text-xs text-muted-foreground">When prompted, allow "Install from unknown sources" in your settings.</p>
            </div>
            <div className="rounded-xl border bg-card p-6 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center"><Monitor className="w-7 h-7 text-blue-600" /></div>
              <div><div className="font-bold text-lg">Windows Desktop</div><div className="text-sm text-muted-foreground mt-1">For Windows 10 and Windows 11 computers</div></div>
              <a href={WINDOWS_URL} target="_blank" rel="noreferrer" className="w-full"><Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700"><Download className="w-4 h-4" /> Download for Windows</Button></a>
              <p className="text-xs text-muted-foreground">Download the .exe installer, run it and follow the setup steps.</p>
            </div>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">Need help installing? Call <a href="tel:+254792991222" className="text-primary hover:underline">+254 792 991 222</a></p>
        </div>
      </section>

      <section id="contact" className="py-16 bg-muted/30 border-t">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold">Want SmartDev for your school?</h2>
          <p className="mt-2 text-muted-foreground">Get in touch — we'll set up your portal and onboard your team.</p>
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
            <a href="#download" className="hover:text-foreground">Download</a>
            <a href="#contact" className="hover:text-foreground">Contact</a>
            {clicks >= 5 && <a href="https://admin.smartdev.co.ke" className="text-primary hover:underline">Platform admin</a>}
          </span>
        </div>
      </footer>
    </div>
  );
}
