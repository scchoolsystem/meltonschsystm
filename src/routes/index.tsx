import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GraduationCap, Users, BookOpen, BarChart3, ShieldCheck, ArrowRight, Building2, CreditCard, Mail, Phone, Lock, IdCard, CalendarDays, Video, MessageSquare, Globe, CheckCircle, Star } from "lucide-react";

export const Route = createFileRoute("/")({ component: Landing });

const ROOT = "smartdev.co.ke";

function Landing() {
  const { session, loading } = useAuth();
  const { isPlatformHost } = useTenant();
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    if (isPlatformHost) { navigate({ to: session ? "/platform/dashboard" : "/platform/login" }); return; }
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, isPlatformHost, navigate]);

  function goToSchool(e: React.FormEvent) {
    e.preventDefault();
    const s = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!s) return;
    window.location.href = `https://${s}.${ROOT}/login`;
  }

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
            <a href="#portals" className="hidden sm:inline text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">School portals</a>
            <a href="#contact" className="hidden sm:inline text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">Contact</a>
            <a href="#portals"><Button size="sm">Open my school portal</Button></a>
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
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          From admissions to graduation — academics, fees, boarding, library, clinic, transport, communications and more.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href="#portals"><Button size="lg" className="gap-2">Open my school portal <ArrowRight className="w-4 h-4" /></Button></a>
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

      <section id="portals" className="py-16">
        <div className="container mx-auto px-6 max-w-3xl text-center">
          <h2 className="text-3xl font-bold">Find your school portal</h2>
          <p className="mt-3 text-muted-foreground">Your school has a dedicated address like <code className="px-1.5 py-0.5 rounded bg-muted border text-sm">yourschool.{ROOT}</code>.</p>
          <form onSubmit={goToSchool} className="mt-8 flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
            <div className="flex-1 flex items-stretch rounded-md border bg-background overflow-hidden">
              <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="yourschool" className="border-0 focus-visible:ring-0" />
              <span className="px-3 flex items-center text-sm text-muted-foreground border-l bg-muted">.{ROOT}</span>
            </div>
            <Button type="submit" className="gap-2">Go to portal <ArrowRight className="w-4 h-4" /></Button>
          </form>
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
            <a href="#portals" className="hover:text-foreground">School portals</a>
            <a href="#contact" className="hover:text-foreground">Contact</a>
            {clicks >= 5 && <a href="https://admin.smartdev.co.ke" className="text-primary hover:underline">Platform admin</a>}
          </span>
        </div>
      </footer>
    </div>
  );
}
