import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Search, Building2, ChevronRight } from "lucide-react";

type SchoolRow = { id: string; slug: string; name: string; logo_url: string | null; status: string };

export function SchoolPicker({ onPicked }: { onPicked?: (slug: string) => void }) {
  const { setSchoolSlug } = useTenant();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [filtered, setFiltered] = useState<SchoolRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("schools")
      .select("id,slug,name,logo_url,status")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => {
        const rows = (data ?? []) as SchoolRow[];
        setSchools(rows);
        setFiltered(rows);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const q = query.toLowerCase();
    setFiltered(q ? schools.filter((s) => s.name.toLowerCase().includes(q) || s.slug.includes(q)) : schools);
  }, [query, schools]);

  const pick = async (slug: string) => {
    setSelecting(slug);
    await setSchoolSlug(slug);
    onPicked?.(slug);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold">SmartDev ERP</h1>
          <p className="text-sm text-muted-foreground mt-1">Select your school to continue</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search schools..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Available Schools</CardTitle>
            <CardDescription>{filtered.length} school{filtered.length !== 1 ? "s" : ""} found</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No schools found.</p>
            )}
            <ul className="divide-y max-h-72 overflow-auto">
              {filtered.map((school) => (
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
                    {selecting === school.slug ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
// Add debug logging
console.log("SchoolPicker component mounted");
console.log("Supabase client:", supabase);
