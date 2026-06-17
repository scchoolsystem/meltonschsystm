import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { IdCard } from "@/components/IdCard";
import { useTenant } from "@/hooks/use-tenant";

export const Route = createFileRoute("/_app/ids/student/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const { school } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["id-student", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,first_name,last_name,unique_id,admission_no,photo_url,gender,classes(name)")
        .eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) return <div className="h-64 grid place-items-center"><Loader2 className="animate-spin" /></div>;
  if (!data) return <div className="p-8">Student not found.</div>;

  return (
    <div className="p-6 print:p-0">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Student Digital ID</h1>
        <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print</Button>
      </div>
      <div className="flex justify-center">
        <IdCard
          schoolName={school?.name || "School"}
          kind="STUDENT"
          uniqueId={data.unique_id || data.admission_no}
          fullName={`${data.first_name} ${data.last_name}`}
          subtitle={data.classes?.name || null}
          photoUrl={data.photo_url}
          meta={[
            { label: "Adm No", value: data.admission_no },
            ...(data.gender ? [{ label: "Gender", value: data.gender }] : []),
          ]}
        />
      </div>
    </div>
  );
}
