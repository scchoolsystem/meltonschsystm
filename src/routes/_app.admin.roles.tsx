import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";

export const Route = createFileRoute("/_app/admin/roles")({
  component: RolesPage,
});

const ALL_ROLES = [
  "super_admin","school_admin","principal","deputy_principal","academic_master",
  "class_teacher","subject_teacher","teacher","hod","staff",
  "exams_admin","exams_user",
  "finance_admin","finance_user","bursar",
  "boarding_admin","boarding_user","boarding","matron",
  "kitchen_admin","kitchen_user",
  "security_admin","security_user",
  "library_admin","library_user","librarian",
  "clinic_admin","clinic_user","nurse",
  "sports_admin","sports_user","sports",
  "store_admin","store_user",
  "transport_admin","transport_officer",
  "guidance_admin","ict_admin","discipline_admin",
  "admission_officer","parent","student",
];

function RolesPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { school } = useTenant();
  const schoolId = school?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["users-with-roles", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      // Only fetch profiles that have a role in THIS school
      // profiles table has all users; user_roles is scoped by RLS to current school
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name"),
        // RLS on user_roles now scopes this to current school only
        supabase.from("user_roles").select("id, user_id, role, school_id"),
      ]);

      // Only show users who have at least one role in this school,
      // OR show all profiles but tag which have no school role
      const schoolRoles = (roles ?? []).filter((r) => r.school_id === schoolId);
      const userIdsWithRole = new Set(schoolRoles.map((r) => r.user_id));

      return (profiles ?? [])
        .filter((p) => userIdsWithRole.has(p.id))
        .map((p) => ({
          ...p,
          roles: schoolRoles.filter((r) => r.user_id === p.id),
        }));
    },
  });

  const addRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: string }) => {
      if (!schoolId) throw new Error("No school context");
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id, role: role as any, school_id: schoolId }); // ← school_id now included
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role added");
      qc.invalidateQueries({ queryKey: ["users-with-roles", schoolId] });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      if (/duplicate key|unique constraint|user_roles_user_id_role_key/i.test(msg)) {
        toast.error("This role is already assigned to this user in this school.");
      } else {
        toast.error(msg || "Failed to add role");
      }
    },
  });

  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removed");
      qc.invalidateQueries({ queryKey: ["users-with-roles", schoolId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Admins only.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">User Roles</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Assign permissions across the school
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 grid place-items-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="w-64">Add Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      onAdd={(role) => addRole.mutate({ user_id: u.id, role })}
                      onRemove={(id) => removeRole.mutate(id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({
  user, onAdd, onRemove,
}: {
  user: any;
  onAdd: (role: string) => void;
  onRemove: (id: string) => void;
}) {
  const [pick, setPick] = useState("");
  return (
    <TableRow>
      <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {user.roles.length === 0 && (
            <span className="text-xs text-muted-foreground">none</span>
          )}
          {user.roles.map((r: any) => (
            <Badge key={r.id} variant="secondary" className="gap-1 pr-1">
              {r.role.replace(/_/g, " ")}
              <button
                onClick={() => onRemove(r.id)}
                className="hover:text-destructive ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Choose role" />
            </SelectTrigger>
            <SelectContent>
              {ALL_ROLES.filter(
                (r) => !user.roles.some((ur: any) => ur.role === r)
              ).map((r) => (
                <SelectItem key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!pick}
            onClick={() => { onAdd(pick); setPick(""); }}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
