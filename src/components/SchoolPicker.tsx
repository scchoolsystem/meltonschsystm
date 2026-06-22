import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, Search, Building2, ChevronRight,
  GraduationCap, Shield, BarChart3, Bell, ArrowRight, X,
} from "lucide-react";

type SchoolRow = { id: string; slug: string; name: string; logo_url: string | null };

export function SchoolPicker({ onPicked }: { onPicked?: (slug: string) => void }) {
  const { setSchoolSlug } = useTenant();
  const [open, setOpen] = useState(false);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [filtered, setFiltered] = useState<SchoolRow[]>([]);
  const [query, setQuery] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

const openPicker = async () => {
    setOpen(true);
    if (schools.length) return;
    setLoadingList(true);
    setDebugError(null);
    try {
    
      const { data, error } = await supabase.rpc("list_active_schools");
      if (error) {
        setDebugError(JSON.stringify(error));
      } else {
        const rows = (data ?? []) as SchoolRow[];
        setSchools(rows);
        setFiltered(rows);
      }
    } catch (e: any) {
      setDebugError(e?.message ?? "Network request failed (no response from server).");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    const q = query.toLowerCase();
    setFiltered(q ? schools.filter(s => s.name.toLowerCase().includes(q) || s.slug.includes(q)) : schools);
  }, [query, schools]);

  const pick = async (slug: string) => {
    setSelecting(slug);
    await setSchoolSlug(slug);
    onPicked?.(slug);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-lg">
          <GraduationCap className="w-6 h-6 text-primary" />
          SmartDev ERP
        </div>
        <Button onClick={openPicker} size="sm">
          <Search className="w-4 h-4 mr-2" /> Search School
        </Button>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary text-primary-foreground shadow-xl mb-2">
          <GraduationCap className="w-10 h-10" />
        </div>
        <h1 className="text-4xl font-extrabold leading-tight">
          Cloud School Management<br />for Kenya &amp; East Africa
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-lg">
          One platform for admin, teachers, parents and students. Works on Android, Windows and the web.
        </p>
        <Button size="lg" onClick={openPicker} className="gap-2 px-8">
          <Search className="w-5 h-5" /> Search Your School
          <ArrowRight className="w-4 h-4" />
        </Button>
        <p className="text-xs text-muted-foreground">
          Already know your school portal?{" "}
          <span className="font-medium">smartdev.co.ke</span>
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-24 grid sm:grid-cols-3 gap-4">
        {[
          { icon: Shield, title: "Secure & Compliant", desc: "Role-based access, audit logs and data encryption keep your school data safe." },
          { icon: BarChart3, title: "Real-time Analytics", desc: "Live attendance, fees collection and academic performance dashboards." },
          { icon: Bell, title: "Instant Notifications", desc: "SMS and push alerts to parents and staff the moment something happens." },
        ].map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6 space-y-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 grid place-items-center mb-3">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} SmartDev ERP · Nairobi, Kenya ·{" "}
        <a href="mailto:support@smartdev.co.ke" className="hover:underline">support@smartdev.co.ke</a>
      </footer>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2 font-semibold">
                <Building2 className="w-5 h-5 text-primary" /> Select Your School
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-3 border-b relative">
              <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input autoFocus placeholder="Search schools..." value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
            </div>

            {debugError && (
              <div className="px-4 py-3 bg-red-50 text-red-700 text-xs break-all border-b">
                Error: {debugError}
              </div>
            )}

            <ul className="max-h-72 overflow-auto divide-y">
              {loadingList && (
                <li className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </li>
              )}
              {!loadingList && filtered.length === 0 && !debugError && (
                <li className="py-8 text-center text-sm text-muted-foreground">No schools found.</li>
              )}
              {filtered.map(school => (
                <li key={school.id}>
                  <button
                    onClick={() => pick(school.slug)}
                    disabled={!!selecting}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
                  >
                    {school.logo_url ? (
                      <img src={school.logo_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-primary/10 grid place-items-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <span className="flex-1 text-sm font-medium truncate">{school.name}</span>
                    {selecting === school.slug
                      ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>

            <div className="px-4 py-3 border-t text-xs text-muted-foreground text-center">
              {filtered.length} school{filtered.length !== 1 ? "s" : ""} available
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
