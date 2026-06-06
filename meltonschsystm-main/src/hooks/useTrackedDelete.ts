import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

interface DeleteOptions {
  id: string;
  schoolId: string;
  table: string;
  entity: string;
  label: string;
  invalidateKeys: string[];
  metadata?: Record<string, unknown>;
}

export function useTrackedDelete() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ table, entity, id, schoolId, label, invalidateKeys, metadata }: DeleteOptions) => {
      const { error } = await supabase.from(table as any).delete().eq("id", id);
      if (error) throw error;
      await supabase.from("activity_logs").insert({
        action: `DELETE_${entity.toUpperCase()}`,
        entity, entity_id: id, school_id: schoolId,
        user_id: user?.id ?? null,
        metadata: { label, ...metadata },
      });
    },
    onSuccess: (_, vars) => {
      toast.success(`${vars.label} deleted`);
      vars.invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });
}
