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
  joined_at: string;
  staff?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    photo_url: string | null;
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

/** All departments — used by admin/owner tier who can see everything */
export async function getDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from("departments")
    .select("*, sub_departments(id, name, department_id)")
    .order("kind")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** Create a new department. school_id defaults server-side via current_user_school(). */
export async function createDepartment(
  name: string,
  kind: "academics" | "administration" | "co_curricular" | "support"
): Promise<Department> {
  const { data, error } = await supabase
    .from("departments")
    .insert({ name: name.trim(), kind })
    .select("*, sub_departments(id, name, department_id)")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Departments scoped to the current user:
 *  - Admin/owner tier → all departments (passed in via `isAdminTier` flag)
 *  - HOD/coordinator  → their department_members rows
 *  - Regular teacher  → their staff.department_id
 *
 * The caller resolves isAdminTier from their role list before calling this.
 */
export async function getMyDepartments(
  userId: string,
  isAdminTier: boolean
): Promise<Department[]> {
  if (isAdminTier) return getDepartments();

  // 1. Find this user's staff row
  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, department_id")
    .eq("user_id", userId)
    .maybeSingle();

  const staffId = staffRow?.id ?? null;

  const deptIds = new Set<string>();

  // 2. Departments from department_members (covers HOD / coordinator roles)
  if (staffId) {
    const { data: memberships } = await supabase
      .from("department_members")
      .select("department_id")
      .eq("staff_id", staffId);
    (memberships ?? []).forEach((m) => deptIds.add(m.department_id));
  }

  // 3. Department from staff.department_id (regular teacher assignment)
  if (staffRow?.department_id) {
    deptIds.add(staffRow.department_id);
  }

  if (deptIds.size === 0) return [];

  const { data, error } = await supabase
    .from("departments")
    .select("*, sub_departments(id, name, department_id)")
    .in("id", Array.from(deptIds))
    .order("kind")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getDepartmentMembers(departmentId: string): Promise<DepartmentMember[]> {
  const { data, error } = await supabase
    .from("department_members")
    .select("*, staff(id, first_name, last_name, email, photo_url, department_id)")
    .eq("department_id", departmentId)
    .order("role");
  if (error) throw error;
  return (data ?? []) as DepartmentMember[];
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

/** Add/update a department_member row. Upserts on (department_id, staff_id). */
export async function upsertDepartmentMember(
  departmentId: string,
  staffId: string,
  role: DeptRole
): Promise<void> {
  const { error } = await supabase
    .from("department_members")
    .upsert({ department_id: departmentId, staff_id: staffId, role }, { onConflict: "department_id,staff_id" });
  if (error) throw error;
}

/** Remove a member from a department */
export async function removeDepartmentMember(memberId: string): Promise<void> {
  const { error } = await supabase.from("department_members").delete().eq("id", memberId);
  if (error) throw error;
}
