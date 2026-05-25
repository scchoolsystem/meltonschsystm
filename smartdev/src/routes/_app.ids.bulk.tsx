import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer } from "lucide-react";
import { IdCard } from "@/components/IdCard";
import { useTenant } from "@/hooks/use-tenant";

export const Route = createFileRoute("/_app/ids/bulk")({ component: Page });

function Page() {
  const [classId, setClassId] = useState<string>("all");
  const { school } = useTenant();

  const { data: classes } = useQuery({
    queryKey: ["classes-bulk-id"],
    queryFn: async () => (await supabase.from("classes").select("id,name").order("name")).data || [],
  });
  const { data: students = [] } = useQuery({
    queryKey: ["students-bulk-id", classId],
    queryFn: async () => {
      let q = supabase.from("students")
        .select("id,first_name,last_name,unique_id,admission_no,photo_url,gender,class_id,classes(name)")
        .eq("status", "active").order("last_name");
      if (classId !== "all") q = q.eq("class_id", classId);
      return (await q).data || [];
    },
  });

  return (
    <div className="p-6 space-y-4 print:p-0">
      <Card className="print:hidden">
        <CardHeader><CardTitle>Bulk Student ID Cards</CardTitle></CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {(classes || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print ({students.length})</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-2 print:gap-2">
        {students.map((s: any) => (
          <IdCard
            key={s.id}
            schoolName={school?.name || "School"}
            kind="STUDENT"
            uniqueId={s.unique_id || s.admission_no}
            fullName={`${s.first_name} ${s.last_name}`}
            subtitle={s.classes?.name || null}
            photoUrl={s.photo_url}
            meta={[{ label: "Adm No", value: s.admission_no }]}
          />
        ))}
      </div>
    </div>
  );
}
