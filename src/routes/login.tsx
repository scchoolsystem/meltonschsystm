import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";

import { lookupLoginEmail } from "@/lib/auth-admin.functions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const lookup = useServerFn(lookupLoginEmail);
  const { school, slug, isPlatformHost } = useTenant();

  const [uniqueId, setUniqueId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  // Hidden trigger: 5 clicks on the logo unlocks admin link
  const [clicks, setClicks] = useState(0);
  const settings = school
    ? { school_name: school.name, motto: school.motto, logo_url: school.logo_url }
    : null;

  useEffect(() => {
    if (isPlatformHost) {
      navigate({ to: session ? "/platform/dashboard" : "/platform/login" });
      return;
    }
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, navigate, isPlatformHost]);

  async function handleUniqueIdSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { email: loginEmail } = await lookup({ data: { uniqueId: uniqueId.trim(), schoolSlug: slug ?? "school-1" } });
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: pw });
      if (error) throw error;
      toast.success("Welcome back");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <button
            type="button"
            onClick={() => setClicks((c) => c + 1)}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg cursor-default overflow-hidden"
            aria-label="School logo"
          >
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="School logo" className="w-full h-full object-cover" />
            ) : (
              <GraduationCap className="w-8 h-8" />
            )}
          </button>
          <h1 className="text-3xl font-bold">{settings?.school_name ?? "School ERP"}</h1>
          <p className="text-sm text-muted-foreground mt-1">{settings?.motto ?? "School Management System"}</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Sign in</CardTitle>
            <CardDescription>Use the Unique ID issued by your school.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUniqueIdSignIn} className="space-y-4">
              <div>
                <Label htmlFor="uid">Unique ID</Label>
                <Input id="uid" placeholder="e.g. STU-2026-000245" required autoComplete="username"
                  value={uniqueId} onChange={(e) => setUniqueId(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pw">Password</Label>
                <Input id="pw" type="password" required autoComplete="current-password"
                  value={pw} onChange={(e) => setPw(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Lost your password? Contact your school admin to reset it.
              </p>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/" className="hover:underline">← Back home</Link>
          {" · "}
          <Link to="/platform/login" className="hover:underline text-primary">Platform admin sign-in</Link>
          {clicks >= 5 && (
            <>
              {" · "}
              <Link to="/sys/control-room" className="hover:underline text-primary">Control room</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
