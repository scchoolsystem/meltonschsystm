import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { IdCard } from "@/components/IdCard";

export const Route = createFileRoute("/_app/ids/staff/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["id-staff", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id,first_name,last_name,employee_no,unique_id,role,department,phone")
        .eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });
  const { data: school } = useQuery({
    queryKey: ["school-settings-id-staff"],
    queryFn: async () => (await supabase.from("school_settings").select("school_name").maybeSingle()).data,
  });

  if (isLoading) return <div className="h-64 grid place-items-center"><Loader2 className="animate-spin" /></div>;
  if (!data) return <div className="p-8">Staff not found.</div>;

  return (
    <div className="p-6 print:p-0">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Staff Digital ID</h1>
        <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Print</Button>
      </div>
      <div className="flex justify-center">
        <IdCard
          schoolName={school?.school_name || "School"}
          kind="STAFF"
          uniqueId={data.unique_id || data.employee_no}
          fullName={`${data.first_name} ${data.last_name}`}
          subtitle={data.role?.replace(/_/g, " ").toUpperCase()}
          meta={[
            { label: "Emp No", value: data.employee_no },
            ...(data.department ? [{ label: "Dept", value: data.department }] : []),
          ]}
        />
      </div>
    </div>
  );
}
