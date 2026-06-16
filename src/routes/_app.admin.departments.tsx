import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { getDepartments } from "@/lib/departments.functions";

export const Route = createFileRoute("/_app/admin/departments")({ component: AdminDepartmentsPage });

function AdminDepartmentsPage() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("academics");

  // Sub-department dialog state
  const [subOpen, setSubOpen] = useState(false);
  const [subDeptId, setSubDeptId] = useState<string | null>(null);
  const [subName, setSubName] = useState("");

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["admin-departments"],
    queryFn: getDepartments,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("departments").insert([{ name, kind }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Department created successfully");
      setIsCreateOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["admin-departments"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to create department"),
  });

  const subMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sub_departments").insert([{ name: subName, department_id: subDeptId }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sub-department added");
      setSubOpen(false);
      setSubName("");
      setSubDeptId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-departments"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to add sub-department"),
  });

  function openSubDialog(deptId: string) {
    setSubDeptId(deptId);
    setSubName("");
    setSubOpen(true);
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Departments Admin</h1>
          <p className="text-muted-foreground">Manage organization units, departments, and sub-departments.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Department
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <Card key={dept.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-bold">{dept.name}</CardTitle>
                <Badge variant={dept.kind === "academics" ? "default" : "secondary"}>{dept.kind}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Created {new Date(dept.created_at).toLocaleDateString()}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" /> Sub-departments
                    </h4>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => openSubDialog(dept.id)}>
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                  {dept.sub_departments && dept.sub_departments.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {dept.sub_departments.map((sub: any) => (
                        <Badge key={sub.id} variant="outline">{sub.name}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No sub-departments defined.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Department Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Department</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Department Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Science" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kind">Type</Label>
              <select
                id="kind" value={kind} onChange={(e) => setKind(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="academics">Academic</option>
                <option value="administration">Administration</option>
                <option value="co_curricular">Co-Curricular</option>
                <option value="support">Support</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !name}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Sub-department Dialog */}
      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Sub-department</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Sub-department Name</Label>
              <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="e.g. Pure Mathematics" autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubOpen(false)}>Cancel</Button>
            <Button onClick={() => subMutation.mutate()} disabled={subMutation.isPending || !subName}>
              {subMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
