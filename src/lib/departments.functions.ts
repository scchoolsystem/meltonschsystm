import { supabase } from "@/integrations/supabase/client";

export type DeptRole = "head" | "coordinator" | "member";

export interface Department {
  id: string;
  name: string;
  kind: string;
  created_at: string;
  sub_departments?: SubDepartment[];
}

export interface SubDepartment {
  id: string;
  department_id: string;
  name: string;
}

export interface DepartmentMember {
  id: string;
  department_id: string;
  staff_id: string;
  role: DeptRole;
  created_at: string;
  staff?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    photo_url: string | null;
    position_title: string | null;
    department_id: string | null;
  };
}

export interface DepartmentCommunication {
  id: string;
  department_id: string;
  sender_id: string;
  title: string;
  content: string;
  created_at: string;
  staff?: {
    first_name: string;
    last_name: string;
    photo_url: string | null;
  };
}

export async function getDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from("departments")
    .select("*, sub_departments(id, name, department_id)")
    .order("kind")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getDepartmentMembers(departmentId: string): Promise<DepartmentMember[]> {
  // Source of truth: staff who have this department set on their profile
  // (this is the "Department" field shown/edited on the Staff page).
  const { data: staffRows, error: staffError } = await supabase
    .from("staff")
    .select("id, first_name, last_name, email, photo_url, position_title, department_id")
    .eq("department_id", departmentId)
    .order("first_name");
  if (staffError) throw staffError;

  // Overlay any explicit head/coordinator designation recorded for this department.
  const { data: roleRows, error: roleError } = await supabase
    .from("department_members")
    .select("id, department_id, staff_id, role, joined_at")
    .eq("department_id", departmentId);
  if (roleError) throw roleError;

  const roleByStaffId = new Map((roleRows ?? []).map((r) => [r.staff_id, r]));

  return (staffRows ?? []).map((s) => {
    const explicit = roleByStaffId.get(s.id);
    return {
      id: explicit?.id ?? s.id,
      department_id: departmentId,
      staff_id: s.id,
      role: (explicit?.role as DeptRole) ?? "member",
      created_at: explicit?.joined_at ?? "",
      staff: s,
    } satisfies DepartmentMember;
  });
}

export async function getDepartmentCommunications(departmentId: string): Promise<DepartmentCommunication[]> {
  const { data, error } = await supabase
    .from("department_communications")
    .select("*, staff(first_name, last_name, photo_url)")
    .eq("department_id", departmentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DepartmentCommunication[];
}
