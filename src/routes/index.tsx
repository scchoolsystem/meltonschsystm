import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTenant, isNativeApp } from "@/hooks/use-tenant";
import { SchoolPicker } from "@/components/SchoolPicker";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, ShieldCheck, Phone, Mail, Smartphone, Monitor, Download } from "lucide-react";

export const Route = createFileRoute("/")({ component: IndexPage });

const ROOT = "smartdev.co.ke";
const APK_URL = "https://github.com/scchoolsystem/meltonschsystm/releases/latest/download/app-release.apk";
const WINDOWS_URL = "https://github.com/scchoolsystem/meltonschsystm/releases/latest";

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

function Landing() {
  const { session, loading } = useAuth();
  const { isPlatformHost } = useTenant();
  const navigate = useNavigate();
  const [clicks, setClicks] = useState(0);
  useEffect(() => {
    if (isPlatformHost) { navigate({ to: session ? "/platform/dashboard" : "/platform/login" }); return; }
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, isPlatformHost, navigate]);
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
            <a href="#download"><Button size="sm"><Download className="w-3.5 h-3.5 mr-1" />Download App</Button></a>
          </nav>
        </div>
      </header>
      <section className="container mx-auto px-6 py-20 md:py-28 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-secondary text-secondary-foreground px-4 py-1.5 text-xs font-medium mb-6">
          <ShieldCheck className="w-3.5 h-3.5" /> Cloud school ERP for Kenya &amp; East Africa
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
          One platform to run your <span className="text-primary">entire school</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">From admissions to graduation — academics, fees, boarding, library, clinic, transport, communications and more.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href="#download"><Button size="lg" className="gap-2"><Download className="w-4 h-4" /> Download the App</Button></a>
          <a href="#contact"><Button size="lg" variant="outline" className="gap-2"><Phone className="w-4 h-4" /> Get in touch</Button></a>
        </div>
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {[{ value: "60+", label: "Features & modules" }, { value: "20+", label: "User roles supported" }, { value: "100%", label: "Cloud-based" }, { value: "M-Pesa", label: "Payments integrated" }].map(s => (
            <div key={s.label} className="rounded-xl border bg-card p-4 text-center">
              <div className="text-2xl font-bold text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>
      <section id="download" className="py-16 bg-primary/5 border-y">
        <div className="container mx-auto px-6 max-w-3xl text-center">
          <h2 className="text-3xl font-bold">Download SmartDev</h2>
          <p className="mt-3 text-muted-foreground">Available on Android and Windows. Install and log in with your school credentials.</p>
          <div className="mt-10 grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="rounded-xl border bg-card p-6 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center"><Smartphone className="w-7 h-7 text-green-600" /></div>
              <div><div className="font-bold text-lg">Android App</div><div className="text-sm text-muted-foreground mt-1">For phones and tablets</div></div>
              <a href={APK_URL} className="w-full"><Button className="w-full gap-2 bg-green-600 hover:bg-green-700"><Download className="w-4 h-4" /> Download APK</Button></a>
              <p className="text-xs text-muted-foreground">Allow "Install from unknown sources" when prompted.</p>
            </div>
            <div className="rounded-xl border bg-card p-6 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center"><Monitor className="w-7 h-7 text-blue-600" /></div>
              <div><div className="font-bold text-lg">Windows Desktop</div><div className="text-sm text-muted-foreground mt-1">For computers and laptops</div></div>
              <a href={WINDOWS_URL} target="_blank" rel="noreferrer" className="w-full"><Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700"><Download className="w-4 h-4" /> Download for Windows</Button></a>
              <p className="text-xs text-muted-foreground">Run the .exe installer on your Windows PC.</p>
            </div>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">Need help? Call <a href="tel:+254792991222" className="text-primary hover:underline">+254 792 991 222</a></p>
        </div>
      </section>
      <section id="features" className="py-16">
        <div className="container mx-auto px-6 max-w-3xl text-center">
          <h2 className="text-3xl font-bold">Everything your school needs</h2>
          <div className="mt-10 grid sm:grid-cols-3 gap-4 text-left">
            {[{ icon: GraduationCap, title: "Students", desc: "View results, timetable, attendance, fees and join live classes." }, { icon: Users, title: "Parents", desc: "Track your child's performance, fees, discipline and communications." }, { icon: ShieldCheck, title: "Staff & Admin", desc: "Full management tools based on your role." }].map(r => (
              <div key={r.title} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-2 mb-2"><r.icon className="w-4 h-4 text-primary" /><span className="font-semibold text-sm">{r.title}</span></div>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="contact" className="container mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold">Want SmartDev for your school?</h2>
        <p className="mt-2 text-muted-foreground">Get in touch — we'll set up your portal and onboard your team.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
          <a href="mailto:hello@smartdev.co.ke" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted transition-colors"><Mail className="w-4 h-4 text-primary" /><span>hello@smartdev.co.ke</span></a>
          <a href="tel:+254792991222" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted transition-colors"><Phone className="w-4 h-4 text-primary" /><span>+254 792 991 222</span></a>
        </div>
      </section>
      <footer className="border-t py-6">
        <div className="container mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} SmartDev ERP · School management for East Africa</span>
          <span className="flex items-center gap-3">
            <a href="#download" className="hover:text-foreground">Download</a>
            <a href="#contact" className="hover:text-foreground">Contact</a>
            {clicks >= 5 && <a href="https://admin.smartdev.co.ke" className="text-primary hover:underline">Platform admin</a>}
          </span>
        </div>
      </footer>
    </div>
  );
}
