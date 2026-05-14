import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, BookOpen, BarChart3, ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="font-bold">Greenfield Academy</span>
          </div>
          <Link to="/login"><Button>Sign in</Button></Link>
        </div>
      </header>

      <section className="container mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-secondary text-secondary-foreground px-4 py-1.5 text-xs font-medium mb-6">
          <ShieldCheck className="w-3.5 h-3.5" /> Enterprise School ERP
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto">
          One platform to run your <span className="text-accent">entire school</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Students, staff, classes, exams, fees, attendance, library, boarding — secure, role-based, and built for primary and secondary schools.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link to="/login">
            <Button size="lg" className="gap-2">Get started <ArrowRight className="w-4 h-4" /></Button>
          </Link>
        </div>

        <div className="mt-20 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {[
            { icon: Users, title: "Students & Staff", desc: "Admissions, IDs, profiles" },
            { icon: BookOpen, title: "Academics", desc: "Classes, subjects, exams" },
            { icon: BarChart3, title: "Analytics", desc: "Performance, attendance, fees" },
            { icon: ShieldCheck, title: "RBAC Security", desc: "14 roles, audit trail" },
          ].map((f) => (
            <div key={f.title} className="p-6 rounded-xl border bg-card text-left">
              <f.icon className="w-6 h-6 text-accent mb-3" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
