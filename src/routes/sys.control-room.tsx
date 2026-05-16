import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Hidden super-admin portal. NOT linked from the public site. Reachable only
// by typing the URL directly or after 5 clicks on the logo on /login.
export const Route = createFileRoute("/sys/control-room")({ component: ControlRoom });

function ControlRoom() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPw, setSignupPw] = useState("");

  // Discourage indexing/share previews
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Authenticated");
    navigate({ to: "/dashboard" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPw,
      options: {
        data: { full_name: signupName },
        emailRedirectTo: `${window.location.origin}/sys/control-room`,
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    // Auto-confirm is enabled — sign in immediately
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: signupEmail, password: signupPw });
    if (signInErr) return toast.error(signInErr.message);
    toast.success("Super admin account created. Signed in.");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-600/20 border border-red-600/40 text-red-400 mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Control Room</h1>
          <p className="text-xs text-zinc-500 mt-1">Restricted · Authorised personnel only</p>
        </div>

        <Card className="shadow-2xl bg-zinc-900 border-zinc-800 text-zinc-100">
          <CardHeader>
            <CardTitle className="text-base">Super admin access</CardTitle>
            <CardDescription className="text-zinc-500">
              This portal is not advertised in the application. All access is audited.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-zinc-800">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="bootstrap">Bootstrap</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-3">
                  <div>
                    <Label htmlFor="adm-email">Admin email</Label>
                    <Input id="adm-email" type="email" required className="bg-zinc-800 border-zinc-700"
                      value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="adm-pw">Password</Label>
                    <Input id="adm-pw" type="password" required className="bg-zinc-800 border-zinc-700"
                      value={pw} onChange={(e) => setPw(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full bg-red-600 hover:bg-red-500" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Authenticate
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="bootstrap">
                <form onSubmit={handleSignUp} className="space-y-3">
                  <p className="text-[11px] text-zinc-500">
                    Only works once — the very first account becomes super_admin.
                    Subsequent accounts default to staff.
                  </p>
                  <div>
                    <Label htmlFor="adm-fn">Full name</Label>
                    <Input id="adm-fn" required className="bg-zinc-800 border-zinc-700"
                      value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="adm-se">Email</Label>
                    <Input id="adm-se" type="email" required className="bg-zinc-800 border-zinc-700"
                      value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="adm-sp">Password</Label>
                    <Input id="adm-sp" type="password" minLength={8} required className="bg-zinc-800 border-zinc-700"
                      value={signupPw} onChange={(e) => setSignupPw(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-zinc-600 mt-6">
          <Link to="/login" className="hover:underline">← Return to public sign-in</Link>
        </p>
      </div>
    </div>
  );
}
