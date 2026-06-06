import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  listActivityCoaches,
  assignCoach,
  removeCoach,
  listActivityStudents,
  enrollStudent,
  unenrollStudent,
} from "@/lib/cocurricular.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Loader2, Pencil, Trash2, UserPlus, UserMinus, Users, Trophy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/cocurricular")({
  component: CoCurricularPage,
});

function CoCurricularPage() {
  const { isAdmin, hasRole } = useAuth();
  const canManage =
    isAdmin ||
    hasRole("sports_admin") ||
    hasRole("sports_user") ||
    hasRole("sports");
  const canEdit = isAdmin || hasRole("sports_admin");

  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

  const listFn = useServerFn(listActivities);
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["co-curricular-activities"],
    queryFn: () => listFn(),
  });

  const selectedActivity = (activities as any[]).find(
    (a) => a.id === selectedActivityId
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="w-7 h-7" /> Co-curricular activities
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clubs, sports, and enrichment programmes — coaches and student enrolment
          </p>
        </div>
        {canEdit && (
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> New activity
              </Button>
            </DialogTrigger>
            <CreateActivityDialog
              onDone={() => setOpenCreate(false)}
            />
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity list */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
            Activities ({(activities as any[]).length})
          </p>
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground p-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {!isLoading && (activities as any[]).length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No activities yet. {canEdit && "Create one to get started."}
              </CardContent>
            </Card>
          )}
          {(activities as any[]).map((act) => (
            <ActivityCard
              key={act.id}
              activity={act}
              selected={selectedActivityId === act.id}
              canEdit={canEdit}
              onSelect={() =>
                setSelectedActivityId(act.id === selectedActivityId ? null : act.id)
              }
            />
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {!selectedActivity ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground text-sm">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                Select an activity to view coaches and enrolled students
              </CardContent>
            </Card>
          ) : (
            <ActivityDetail
              activity={selectedActivity}
              canManage={canManage}
              canEdit={canEdit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Activity card ----
function ActivityCard({
  activity,
  selected,
  canEdit,
  onSelect,
}: {
  activity: any;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
}) {
  const qc = useQueryClient();
  const [openEdit, setOpenEdit] = useState(false);

  const deleteFn = useServerFn(deleteActivity);
  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id: activity.id } }),
    onSuccess: () => {
      toast.success("Activity deleted");
      qc.invalidateQueries({ queryKey: ["co-curricular-activities"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card
      className={`cursor-pointer transition-colors ${selected ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}
      onClick={onSelect}
    >
      <CardContent className="py-3 px-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{activity.name}</p>
          {activity.departments?.name && (
            <p className="text-xs text-muted-foreground truncate">
              {activity.departments.name}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Dialog open={openEdit} onOpenChange={setOpenEdit}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Pencil className="w-3 h-3" />
                </Button>
              </DialogTrigger>
              <EditActivityDialog
                activity={activity}
                onDone={() => {
                  setOpenEdit(false);
                  qc.invalidateQueries({ queryKey: ["co-curricular-activities"] });
                }}
              />
            </Dialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{activity.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all coach assignments for this activity. Student enrolments (if any) will also be removed. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMut.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Activity detail tabs ----
function ActivityDetail({
  activity,
  canManage,
  canEdit,
}: {
  activity: any;
  canManage: boolean;
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold">{activity.name}</h2>
            {activity.departments?.name && (
              <p className="text-sm text-muted-foreground">{activity.departments.name}</p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="coaches">
          <TabsList>
            <TabsTrigger value="coaches">Coaches</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
          </TabsList>
          <TabsContent value="coaches" className="mt-4">
            <CoachesTab activity={activity} canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="students" className="mt-4">
            <StudentsTab activity={activity} canManage={canManage} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---- Coaches tab ----
function CoachesTab({ activity, canEdit }: { activity: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const [openAssign, setOpenAssign] = useState(false);

  const listFn = useServerFn(listActivityCoaches);
  const { data: coaches = [], isLoading } = useQuery({
    queryKey: ["activity-coaches", activity.id],
    queryFn: () => listFn({ data: { activity_id: activity.id } }),
  });

  const removeFn = useServerFn(removeCoach);
  const removeMut = useMutation({
    mutationFn: (staff_id: string) =>
      removeFn({ data: { activity_id: activity.id, staff_id } }),
    onSuccess: () => {
      toast.success("Coach removed");
      qc.invalidateQueries({ queryKey: ["activity-coaches", activity.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {canEdit && (
        <Dialog open={openAssign} onOpenChange={setOpenAssign}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <UserPlus className="w-4 h-4 mr-2" /> Assign coach
            </Button>
          </DialogTrigger>
          <AssignCoachDialog
            activityId={activity.id}
            currentCoaches={(coaches as any[]).map((c) => c.staff_id)}
            onDone={() => {
              setOpenAssign(false);
              qc.invalidateQueries({ queryKey: ["activity-coaches", activity.id] });
            }}
          />
        </Dialog>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading coaches…
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Employee No</TableHead>
            <TableHead>Role</TableHead>
            {canEdit && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {!isLoading && (coaches as any[]).length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No coaches assigned.
              </TableCell>
            </TableRow>
          )}
          {(coaches as any[]).map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">
                {c.staff?.first_name} {c.staff?.last_name}
              </TableCell>
              <TableCell className="font-mono text-xs">{c.staff?.employee_no ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="capitalize">{c.role}</Badge>
              </TableCell>
              {canEdit && (
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeMut.mutate(c.staff_id)}
                    disabled={removeMut.isPending}
                  >
                    <UserMinus className="w-3 h-3" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Students tab ----
function StudentsTab({ activity, canManage }: { activity: any; canManage: boolean }) {
  const qc = useQueryClient();
  const [openEnroll, setOpenEnroll] = useState(false);

  const listFn = useServerFn(listActivityStudents);
  const { data: enrolled = [], isLoading, isError } = useQuery({
    queryKey: ["activity-students", activity.id],
    queryFn: () => listFn({ data: { activity_id: activity.id } }),
  });

  const unenrollFn = useServerFn(unenrollStudent);
  const unenrollMut = useMutation({
    mutationFn: (student_id: string) =>
      unenrollFn({ data: { activity_id: activity.id, student_id } }),
    onSuccess: () => {
      toast.success("Student removed");
      qc.invalidateQueries({ queryKey: ["activity-students", activity.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {canManage && (
        <Dialog open={openEnroll} onOpenChange={setOpenEnroll}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <UserPlus className="w-4 h-4 mr-2" /> Enrol student
            </Button>
          </DialogTrigger>
          <EnrolStudentDialog
            activityId={activity.id}
            currentStudents={(enrolled as any[]).map((e) => e.student_id)}
            onDone={() => {
              setOpenEnroll(false);
              qc.invalidateQueries({ queryKey: ["activity-students", activity.id] });
            }}
          />
        </Dialog>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading students…
        </div>
      )}
      {isError && (
        <p className="text-sm text-muted-foreground py-4">
          Student enrolment table not yet set up — run the migration below.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Adm No</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Enrolled on</TableHead>
            {canManage && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {!isLoading && !isError && (enrolled as any[]).length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No students enrolled.
              </TableCell>
            </TableRow>
          )}
          {(enrolled as any[]).map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-medium">
                {e.students?.first_name} {e.students?.last_name}
              </TableCell>
              <TableCell className="font-mono text-xs">{e.students?.admission_no ?? "—"}</TableCell>
              <TableCell>{e.students?.classes?.name ?? "—"}</TableCell>
              <TableCell className="text-xs">{e.enrolled_on ?? "—"}</TableCell>
              {canManage && (
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => unenrollMut.mutate(e.student_id)}
                    disabled={unenrollMut.isPending}
                  >
                    <UserMinus className="w-3 h-3" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Create activity dialog ----
function CreateActivityDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [deptId, setDeptId] = useState("");

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      return data ?? [];
    },
  });

  const createFn = useServerFn(createActivity);
  const mut = useMutation({
    mutationFn: () => createFn({ data: { name, department_id: deptId || undefined } }),
    onSuccess: () => {
      toast.success("Activity created");
      qc.invalidateQueries({ queryKey: ["co-curricular-activities"] });
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New co-curricular activity</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div>
          <Label>Activity name</Label>
          <Input
            required
            placeholder="e.g. Football, Drama Club, Chess…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label>Department (optional)</Label>
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {(departments as any[]).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => mut.mutate()}
          disabled={!name.trim() || mut.isPending}
        >
          {mut.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ---- Edit activity dialog ----
function EditActivityDialog({ activity, onDone }: { activity: any; onDone: () => void }) {
  const [name, setName] = useState(activity.name);
  const [deptId, setDeptId] = useState(activity.department_id ?? "");

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      return data ?? [];
    },
  });

  const updateFn = useServerFn(updateActivity);
  const mut = useMutation({
    mutationFn: () =>
      updateFn({ data: { id: activity.id, name, department_id: deptId || undefined } }),
    onSuccess: () => {
      toast.success("Activity updated");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit activity</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div>
          <Label>Activity name</Label>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label>Department (optional)</Label>
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {(departments as any[]).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => mut.mutate()}
          disabled={!name.trim() || mut.isPending}
        >
          {mut.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ---- Assign coach dialog ----
function AssignCoachDialog({
  activityId,
  currentCoaches,
  onDone,
}: {
  activityId: string;
  currentCoaches: string[];
  onDone: () => void;
}) {
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState("coach");

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name, employee_no, role")
        .order("first_name");
      return data ?? [];
    },
  });

  const available = (staff as any[]).filter((s) => !currentCoaches.includes(s.id));

  const assignFn = useServerFn(assignCoach);
  const mut = useMutation({
    mutationFn: () =>
      assignFn({ data: { activity_id: activityId, staff_id: staffId, role } }),
    onSuccess: () => {
      toast.success("Coach assigned");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Assign coach</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div>
          <Label>Staff member</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger>
              <SelectValue placeholder="Select staff…" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 && (
                <SelectItem value="" disabled>
                  All staff already assigned
                </SelectItem>
              )}
              {available.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}{s.employee_no ? ` (${s.employee_no})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Coach role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="coach">Coach</SelectItem>
              <SelectItem value="head_coach">Head coach</SelectItem>
              <SelectItem value="assistant">Assistant</SelectItem>
              <SelectItem value="patron">Patron</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => mut.mutate()}
          disabled={!staffId || mut.isPending}
        >
          {mut.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
          Assign
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ---- Enrol student dialog ----
function EnrolStudentDialog({
  activityId,
  currentStudents,
  onDone,
}: {
  activityId: string;
  currentStudents: string[];
  onDone: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [search, setSearch] = useState("");

  const { data: students = [] } = useQuery({
    queryKey: ["students-search-cocurr", search],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, first_name, last_name, admission_no, classes(name)")
        .eq("status", "active")
        .order("first_name")
        .limit(50);
      if (search.trim()) {
        q = q.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,admission_no.ilike.%${search}%`
        );
      }
      const { data } = await q;
      return (data ?? []).filter((s: any) => !currentStudents.includes(s.id));
    },
  });

  const enrollFn = useServerFn(enrollStudent);
  const mut = useMutation({
    mutationFn: () =>
      enrollFn({ data: { activity_id: activityId, student_id: studentId } }),
    onSuccess: () => {
      toast.success("Student enrolled");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Enrol student</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div>
          <Label>Search student</Label>
          <Input
            placeholder="Name or admission no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label>Select student</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {(students as any[]).length === 0 && (
                <SelectItem value="" disabled>
                  No students found
                </SelectItem>
              )}
              {(students as any[]).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} — {s.admission_no}
                  {s.classes?.name ? ` (${s.classes.name})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => mut.mutate()}
          disabled={!studentId || mut.isPending}
        >
          {mut.isPending && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
          Enrol
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
