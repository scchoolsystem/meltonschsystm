import { supabase } from "@/integrations/supabase/client";

export type DeptRole = "hod" | "deputy_hod" | "secretary" | "member";

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
  dept_role: DeptRole;
  created_at: string;
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
  const { data, error } = await supabase
    .from("department_members")
    .select("*, staff(id, first_name, last_name, email, photo_url, department_id)")
    .eq("department_id", departmentId)
    .order("dept_role");
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
