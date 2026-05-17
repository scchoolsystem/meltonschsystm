import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GraduationCap, Users, BookOpen, BarChart3, ShieldCheck,
  ArrowRight, Building2, CreditCard, Bell, Mail, Phone,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartDev ERP — One platform to run your entire school" },
      { name: "description", content: "Cloud school management for primary and secondary schools: admissions, academics, fees, boarding, library and more. Each school gets its own secure portal." },
      { property: "og:title", content: "SmartDev ERP — School management, simplified" },
      { property: "og:description", content: "Admissions, academics, fees, boarding, library — all in one secure portal per school." },
    ],
  }),
  component: Landing,
});

const ROOT = "smartdev.co.ke";

function Landing() {
  const { session, loading } = useAuth();
  const { isPlatformHost } = useTenant();
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  // Hidden platform-admin trigger: 5 clicks on the logo
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    if (isPlatformHost) {
      navigate({ to: session ? "/platform/dashboard" : "/platform/login" });
      return;
    }
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
      <header className="border-b">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setClicks((c) => c + 1)}
            className="flex items-center gap-2 cursor-default"
            aria-label="SmartDev"
          >
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="font-bold">SMART DEV</span>
          </button>
          <nav className="flex items-center gap-2 text-sm">
            <a href="#features" className="hidden sm:inline text-muted-foreground hover:text-foreground px-3">Features</a>
            <a href="#access" className="hidden sm:inline text-muted-foreground hover:text-foreground px-3">School portals</a>
            <a href="#contact" className="hidden sm:inline text-muted-foreground hover:text-foreground px-3">Contact</a>
            <a href="#access"><Button size="sm">Open my school portal</Button></a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 py-20 md:py-28 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-secondary text-secondary-foreground px-4 py-1.5 text-xs font-medium mb-6">
          <ShieldCheck className="w-3.5 h-3.5" /> Cloud school ERP for Kenya & East Africa
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto">
          One platform to run your <span className="text-accent">entire school</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Admissions, academics, exams, fees, boarding, library, clinic, transport — secure, role-based,
          and built for primary and secondary schools.
        </p>
        <div className="mt-10 flex justify-center">
          <a href="#access">
            <Button size="lg" className="gap-2">Open my school portal <ArrowRight className="w-4 h-4" /></Button>
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {[
            { icon: Users, title: "Students & Staff", desc: "Admissions, unique IDs, profiles, lifecycle." },
            { icon: BookOpen, title: "Academics", desc: "Classes, subjects, exams, marks, report cards." },
            { icon: CreditCard, title: "Finance", desc: "Fee structures, invoices, payments, receipts." },
            { icon: Building2, title: "Boarding & Ops", desc: "Dorms, kitchen, library, clinic, transport." },
            { icon: BarChart3, title: "Analytics", desc: "Performance, attendance and finance dashboards." },
            { icon: ShieldCheck, title: "RBAC Security", desc: "Granular roles, audit trail, field-level locks." },
            { icon: Bell, title: "Announcements", desc: "In-app and email alerts to parents and staff." },
            { icon: GraduationCap, title: "Parent & Student", desc: "Portals for results, fees and notices." },
          ].map((f) => (
            <div key={f.title} className="p-6 rounded-xl border bg-card text-left">
              <f.icon className="w-6 h-6 text-accent mb-3" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Access — every school has its own subdomain */}
      <section id="access" className="bg-muted/40 border-y py-16">
        <div className="container mx-auto px-6 max-w-3xl text-center">
          <h2 className="text-3xl font-bold">Every school gets its own portal</h2>
          <p className="mt-3 text-muted-foreground">
            Your school has a dedicated address like <code className="px-1.5 py-0.5 rounded bg-background border">yourschool.{ROOT}</code>.
            Staff, students and parents sign in there using the Unique ID issued by the school.
          </p>
          <form onSubmit={goToSchool} className="mt-8 flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
            <div className="flex-1 flex items-stretch rounded-md border bg-background overflow-hidden">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="yourschool"
                className="border-0 focus-visible:ring-0"
                aria-label="School slug"
              />
              <span className="px-3 flex items-center text-sm text-muted-foreground border-l">.{ROOT}</span>
            </div>
            <Button type="submit" className="gap-2">Go to portal <ArrowRight className="w-4 h-4" /></Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Don't know your school's address? Ask your school administrator.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="container mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold">Want SmartDev for your school?</h2>
        <p className="mt-2 text-muted-foreground">Get in touch — we'll set up your portal and onboard your team.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
          <a href="mailto:hello@smartdev.co.ke" className="inline-flex items-center gap-2 hover:text-accent">
            <Mail className="w-4 h-4" /> hello@smartdev.co.ke
          </a>
          <a href="tel:+254700000000" className="inline-flex items-center gap-2 hover:text-accent">
            <Phone className="w-4 h-4" /> +254 700 000 000
          </a>
        </div>
      </section>

      <footer className="border-t py-6">
        <div className="container mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} SmartDev ERP</span>
          <span className="flex items-center gap-3">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#access" className="hover:text-foreground">School portals</a>
            <a href="#contact" className="hover:text-foreground">Contact</a>
            {clicks >= 5 && (
              <a href="https://admin.smartdev.co.ke" className="text-primary hover:underline">Platform admin</a>
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}
