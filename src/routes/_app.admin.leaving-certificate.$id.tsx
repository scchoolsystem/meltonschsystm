import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";

export const Route = createFileRoute("/_app/admin/leaving-certificate/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const { school } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["lc", id],
    queryFn: async () => (await supabase.from("leaving_certificates").select("*, students(first_name, last_name, admission_no, unique_id, date_of_birth, gender, admitted_on, classes(name, level))").eq("id", id).maybeSingle()).data,
  });

  if (isLoading) return <div className="h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;
  if (!data) return <div className="p-6">Certificate not found.</div>;
  const s: any = data.students;

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-4 print:px-0">
        <div className="flex justify-end mb-4 print:hidden">
          <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print</Button>
        </div>
        <div className="bg-card text-card-foreground border rounded-lg p-10 print:border-0">
          <div className="text-center border-b pb-4 mb-6">
            <h1 className="text-2xl font-bold">{school?.name ?? "School"}</h1>
            <div className="text-xs text-muted-foreground">{school?.address ?? ""}</div>
            <div className="text-lg font-semibold mt-2 tracking-widest uppercase">Leaving Certificate</div>
            <div className="text-xs text-muted-foreground">Serial No: <span className="font-mono">{data.serial_no}</span></div>
          </div>
          <p className="text-sm leading-relaxed">
            This is to certify that <span className="font-bold">{s.first_name} {s.last_name}</span>,
            admission number <span className="font-mono">{s.admission_no}</span>
            {s.date_of_birth ? <> born on <span className="font-semibold">{s.date_of_birth}</span></> : null},
            was a bona fide student of this school
            {s.admitted_on ? <> from <span className="font-semibold">{s.admitted_on}</span></> : null}
            {" "}until <span className="font-semibold">{data.leaving_date}</span>.
            The student was in <span className="font-semibold">{s.classes?.name ?? "—"}</span> at the time of leaving.
          </p>
          <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
            <div><span className="text-muted-foreground">Reason for leaving:</span> <span className="font-semibold capitalize">{data.reason}</span></div>
            <div><span className="text-muted-foreground">Conduct:</span> <span className="font-semibold capitalize">{data.conduct}</span></div>
          </div>
          {data.achievements && (
            <div className="mt-4 text-sm">
              <div className="text-muted-foreground mb-1">Achievements & remarks</div>
              <div className="whitespace-pre-wrap">{data.achievements}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-8 mt-16 text-sm">
            <div>
              <div className="border-t pt-1">{data.signed_by_name || "________________________"}</div>
              <div className="text-xs text-muted-foreground">{data.signed_by_title || "Principal"}</div>
            </div>
            <div>
              <div className="border-t pt-1">Date: {data.leaving_date}</div>
              <div className="text-xs text-muted-foreground">Issued: {new Date(data.issued_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
