import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { lookupLoginEmail } from "@/lib/auth-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GraduationCap, Loader2, KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const lookup = useServerFn(lookupLoginEmail);

  const [uniqueId, setUniqueId] = useState("");
  const [pw, setPw] = useState("");
  const [email, setEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPw, setSignupPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, navigate]);

  async function handleUniqueIdSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { email: loginEmail } = await lookup({ data: { uniqueId: uniqueId.trim() } });
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: pw,
      });
      if (error) throw error;
      toast.success("Welcome back");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: emailPw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
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
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Check email to confirm, then sign in.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold">Greenfield Academy</h1>
          <p className="text-sm text-muted-foreground mt-1">School Management System</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your unique ID — or super admin email</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="unique">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="unique"><KeyRound className="w-3.5 h-3.5 mr-1" />ID</TabsTrigger>
                <TabsTrigger value="email"><Mail className="w-3.5 h-3.5 mr-1" />Admin</TabsTrigger>
                <TabsTrigger value="signup">Setup</TabsTrigger>
              </TabsList>

              <TabsContent value="unique">
                <form onSubmit={handleUniqueIdSignIn} className="space-y-4">
                  <div>
                    <Label htmlFor="uid">Unique ID</Label>
                    <Input
                      id="uid"
                      placeholder="e.g. STU-2026-000245"
                      required
                      autoComplete="username"
                      value={uniqueId}
                      onChange={(e) => setUniqueId(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pw">Password</Label>
                    <Input
                      id="pw"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign in
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Lost your password? Contact your school admin to reset it.
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="email">
                <form onSubmit={handleEmailSignIn} className="space-y-4">
                  <div>
                    <Label htmlFor="email">Super admin email</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="epw">Password</Label>
                    <Input id="epw" type="password" required value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign in
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Email login is only for super admin. All other users must use Unique ID.
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div>
                    <Label htmlFor="fn">Full name</Label>
                    <Input id="fn" required value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="se">Email</Label>
                    <Input id="se" type="email" required value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="sp">Password</Label>
                    <Input id="sp" type="password" required minLength={6} value={signupPw} onChange={(e) => setSignupPw(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create super admin
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    First account becomes super admin. After that, all users are created from Admin → Users.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/" className="hover:underline">← Back home</Link>
        </p>
      </div>
    </div>
  );
}
