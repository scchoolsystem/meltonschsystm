import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { lookupLoginEmail } from "@/lib/auth-admin.functions";
import { useTenant, isNativeApp } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { GraduationCap, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const lookup = useServerFn(lookupLoginEmail);
  const { school, slug, isPlatformHost, error: tenantError, loading: tenantLoading } = useTenant();
  const [uniqueId, setUniqueId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [showSupport, setShowSupport] = useState(false);
  const [supportName, setSupportName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportMsg, setSupportMsg] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const settings = school ? { school_name: school.name, motto: school.motto, logo_url: school.logo_url } : null;

  // Only treat as root host AFTER tenant has finished loading
  const isRootHost = !tenantLoading && !isPlatformHost && !slug && !isNativeApp();

  useEffect(() => {
    if (tenantLoading) return; // wait for tenant before any redirect
    if (isPlatformHost) { navigate({ to: session ? "/platform/dashboard" : "/platform/login" }); return; }
    if (isRootHost) { navigate({ to: "/" }); return; }
    if (isNativeApp() && !isPlatformHost && !slug) { navigate({ to: "/" }); return; }
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, navigate, isPlatformHost, isRootHost, tenantLoading, slug]);

  // Still loading tenant — show spinner, don't flash anything
  if (tenantLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformHost && slug && (tenantError || !school)) {
    return (<div className="min-h-screen grid place-items-center p-6 text-center"><div className="max-w-md space-y-4"><GraduationCap className="w-10 h-10 mx-auto text-destructive" /><h1 className="text-2xl font-bold">School portal not found</h1><p className="text-sm text-muted-foreground">The school portal <code className="px-1 py-0.5 rounded bg-muted">{slug}.smartdev.co.ke</code> does not exist.</p></div></div>);
  }

  if (isRootHost) {
    return (<div className="min-h-screen grid place-items-center p-6 text-center"><div className="max-w-md space-y-4"><GraduationCap className="w-10 h-10 mx-auto text-primary" /><h1 className="text-2xl font-bold">Sign in from your school portal</h1><p className="text-sm text-muted-foreground">Each school has its own address, e.g. <code className="px-1 py-0.5 rounded bg-muted">yourschool.smartdev.co.ke</code>.</p><Link to="/"><Button>Back to home</Button></Link></div></div>);
  }

  async function handleUniqueIdSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let loginEmail: string;
      const input = uniqueId.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
      if (isEmail) {
        loginEmail = input;
      } else {
        if (!slug) throw new Error("No school selected. Please sign in from your school's portal.");
        try {
          const r = await lookup({ data: { uniqueId: input, schoolSlug: slug } });
          loginEmail = r.email;
        } catch (lookupErr: any) {
          const msg = String(lookupErr?.message ?? "");
          if (/not found/i.test(msg)) throw new Error("Your account is not linked to this school. Contact your school administrator.");
          throw lookupErr;
        }
      }
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: pw });
      if (error) { if (/invalid login|invalid credentials/i.test(error.message)) throw new Error("Invalid Unique ID or password."); throw error; }
      if (school?.id) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("school_members").update({ is_default: false }).eq("user_id", user.id);
          await supabase.from("school_members").update({ is_default: true }).eq("user_id", user.id).eq("school_id", school.id);
        }
      }
      toast.success("Welcome back");
      navigate({ to: "/dashboard" });
    } catch (err: any) { toast.error(err.message ?? "Login failed"); } finally { setBusy(false); }
  }


  async function handleSupportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supportName || !supportEmail || !supportMsg) return;
    setSupportBusy(true);
    try {
      const { error } = await supabase.from("support_tickets").insert({
        subject: `Login help from ${supportName} (${supportEmail})`,
        status: "open",
        school_id: school?.id ?? null,  // routes to the school's admin; falls back to platform if no school context
      } as any);
      if (error) throw error;
      toast.success("Request sent. We will be in touch shortly.");
      setShowSupport(false);
      setSupportName(""); setSupportEmail(""); setSupportMsg("");
    } catch {
      toast.error("Failed to send. Please email support@smartdev.co.ke directly.");
    } finally { setSupportBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <button type="button" onClick={() => setClicks((c) => c + 1)} className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg cursor-default overflow-hidden" aria-label="School logo">
            {settings?.logo_url ? <img src={settings.logo_url} alt="School logo" className="w-full h-full object-cover" /> : <GraduationCap className="w-8 h-8" />}
          </button>
          <h1 className="text-3xl font-bold">{settings?.school_name ?? "School ERP"}</h1>
          <p className="text-sm text-muted-foreground mt-1">{settings?.motto ?? "School Management System"}</p>
        </div>
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Sign in</CardTitle>
            <CardDescription>Use the Unique ID issued by your school — or your email if you're a school admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUniqueIdSignIn} className="space-y-4">
              <div><Label htmlFor="uid">Unique ID or email</Label><Input id="uid" placeholder="e.g. STU-2026-000245 or you@example.com" required autoComplete="username" value={uniqueId} onChange={(e) => setUniqueId(e.target.value)} /></div>
              <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
              <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in</Button>
              <p className="text-xs text-muted-foreground text-center">Lost your password? Contact your school admin to reset it.</p>
              <p className="text-xs text-muted-foreground text-center mt-1">Having trouble? <button type="button" onClick={() => setShowSupport(true)} className="text-primary underline">Submit a support request</button></p>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/" className="hover:underline">← Back home</Link>
          {clicks >= 5 && (<>{" · "}<a href="https://admin.smartdev.co.ke" className="hover:underline text-primary">Platform admin</a>{" · "}<Link to="/sys/control-room" className="hover:underline text-primary">Control room</Link></>)}
        </p>
      </div>

      <Dialog open={showSupport} onOpenChange={setShowSupport}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit a Support Request</DialogTitle></DialogHeader>
          <form onSubmit={handleSupportSubmit} className="space-y-3 mt-2">
            <div><Label htmlFor="sn">Your name</Label><Input id="sn" required value={supportName} onChange={e => setSupportName(e.target.value)} placeholder="e.g. John Mwangi" /></div>
            <div><Label htmlFor="se">Your email</Label><Input id="se" type="email" required value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="your@email.com" /></div>
            <div><Label htmlFor="sm">Describe your issue</Label><Textarea id="sm" required rows={4} value={supportMsg} onChange={e => setSupportMsg(e.target.value)} placeholder="What do you need help with?" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSupport(false)}>Cancel</Button>
              <Button type="submit" disabled={supportBusy}>{supportBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Send</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
