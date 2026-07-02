import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, Download, CheckCircle2, AlertCircle, KeyRound, Users, Loader2, Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { admitStudent, createStaff } from "@/lib/admissions.functions";
import {
  parseCsvRows, findDuplicateKeys, isValidDate, isValidEmail, isValidPhone,
  isGenderValid, normalizeGender, classifyProvisioningError,
  type RowError,
} from "@/lib/csv-import-validation";

// Roles that a CSV import is allowed to grant. Deliberately excludes
// super_admin / platform_owner / platform_support so a spreadsheet can never
// escalate a bulk-imported staff member to platform-level access.
const IMPORTABLE_STAFF_ROLES = [
  "teacher", "class_teacher", "subject_teacher", "hod", "principal",
  "deputy_principal", "bursar", "librarian", "nurse", "matron", "sports",
  "boarding", "admission_officer", "school_admin", "academic_master",
  "exams_admin", "exams_user", "finance_admin", "finance_user",
  "boarding_admin", "boarding_user", "kitchen_admin", "kitchen_user",
  "security_admin", "security_user", "library_admin", "library_user",
  "clinic_admin", "clinic_user", "sports_admin", "sports_user",
  "store_admin", "store_user", "transport_admin", "transport_officer",
  "guidance_admin", "ict_admin", "discipline_admin", "staff",
];

const STUDENT_HEADERS = [
  "admission_no", "first_name", "last_name", "gender", "date_of_birth",
  "class_name", "stream", "parent_name", "parent_phone", "parent_email",
  "address", "national_id",
];
const STUDENT_REQUIRED = ["first_name", "last_name", "class_name"];
const STUDENT_EXAMPLE =
  `${STUDENT_HEADERS.join(",")}\n` +
  `,Jane,Doe,F,2010-04-12,Form 1A,,Mary Doe,+254700000000,mary@example.com,Nairobi,\n`;

const STAFF_HEADERS = [
  "employee_no", "first_name", "last_name", "role", "department",
  "gender", "date_of_birth", "hire_date", "email", "phone", "national_id",
];
const STAFF_REQUIRED = ["first_name", "last_name", "role"];
const STAFF_EXAMPLE =
  `${STAFF_HEADERS.join(",")}\n` +
  `,John,Smith,teacher,Mathematics,M,1985-06-20,2020-01-15,john.smith@school.ac.ke,+254711000001,\n`;

interface GeneratedCredential {
  identifier: string; // admission_no / employee_no
  fullName: string;
  uniqueId: string;
  syntheticEmail: string;
  password: string;
}

interface ImportSummary {
  totalRows: number;
  imported: number;
  failed: number;
  duplicateRecords: number;
  validationErrors: number;
  generatedAccounts: number;
  generatedCredentials: GeneratedCredential[];
  rowErrors: RowError[];
}

function downloadTemplate(headers: string[], example: string, filename: string) {
  const blob = new Blob([example], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadCredentialsCsv(rows: GeneratedCredential[], filename: string) {
  const header = "identifier,full_name,unique_id,login_email,temporary_password\n";
  const body = rows.map((r) =>
    [r.identifier, r.fullName, r.uniqueId, r.syntheticEmail, r.password]
      .map((v) => `"${(v ?? "").replace(/"/g, '""')}"`).join(","),
  ).join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Full cache refresh after a bulk import ───────────────────────────────────
// A CSV import touches many parts of the app at once (dashboard KPIs, the
// student/staff directories, class rosters + statistics, users & credentials,
// search, reports). Rather than hand-maintain a list of query keys that will
// drift out of date as new widgets are added, we invalidate the whole
// TanStack Query cache — the same mechanism every other page in this app
// already uses via `qc.invalidateQueries({ queryKey: [...] })`, just applied
// broadly for this cross-cutting operation — and also invalidate the router's
// route-loader cache for good measure.
function useRefreshAllCaches() {
  const qc = useQueryClient();
  const router = useRouter();
  return () => {
    qc.invalidateQueries();
    router.invalidate();
  };
}

// ════════════════════════════════════════════════════════════════════════════
// STUDENT IMPORT
// ════════════════════════════════════════════════════════════════════════════
export function StudentImportPanel() {
  const admitFn = useServerFn(admitStudent);
  const refreshCaches = useRefreshAllCaches();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [preValidationErrors, setPreValidationErrors] = useState<RowError[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const onFile = async (f: File) => {
    const t = await f.text();
    setText(t);
    parseAndValidate(t);
  };
  const onPaste = () => parseAndValidate(text);

  const parseAndValidate = (t: string) => {
    const { rows: parsed } = parseCsvRows(t);
    setRows(parsed);
    setSummary(null);
    setPreValidationErrors([]);
  };

  const runImport = async () => {
    if (!rows.length) return;
    setBusy(true);
    setSummary(null);
    setProgress(0);

    const errors: RowError[] = [];
    let duplicateCount = 0;

    // ── Step: Validate School ──────────────────────────────────────────────
    const { data: schoolId, error: schoolErr } = await supabase.rpc("my_school_id");
    if (!schoolId || schoolErr) {
      toast.error("Cannot import: no school context found for your account.");
      setBusy(false);
      return;
    }

    // ── Step: Validate required columns ────────────────────────────────────
    const detectedHeaders = rows.length ? Object.keys(rows[0]) : [];
    const missingCols = STUDENT_REQUIRED.filter((c) => !detectedHeaders.includes(c));
    if (missingCols.length) {
      toast.error(`Missing required columns: ${missingCols.join(", ")}`);
      setBusy(false);
      return;
    }

    // ── Step: Validate duplicate admission numbers (within file) ───────────
    const dupAdmissionNos = findDuplicateKeys(rows, "admission_no");

    // ── Step: Validate duplicate admission numbers (against DB) ────────────
    const providedNos = rows.map((r) => r.admission_no?.trim()).filter(Boolean) as string[];
    const existingNos = new Set<string>();
    if (providedNos.length) {
      const { data } = await supabase.from("students").select("admission_no").in("admission_no", providedNos);
      (data ?? []).forEach((d: any) => existingNos.add(d.admission_no));
    }

    // ── Step: Validate that every referenced Class (+ Stream) exists ───────
    const { data: allClasses } = await supabase.from("classes").select("id, name, stream").eq("school_id", schoolId);
    const classByNameStream = new Map<string, { id: string; stream: string | null }[]>();
    (allClasses ?? []).forEach((c: any) => {
      const key = String(c.name).trim().toLowerCase();
      const list = classByNameStream.get(key) ?? [];
      list.push({ id: c.id, stream: c.stream ? String(c.stream).trim().toLowerCase() : null });
      classByNameStream.set(key, list);
    });

    // ── Per-row validation: required fields, gender, dates, parent info ────
    const resolvedClassIds: (string | null)[] = [];
    rows.forEach((r, i) => {
      const rowNum = i + 1;
      const identifier = r.admission_no?.trim() || `${r.first_name || ""} ${r.last_name || ""}`.trim() || `row ${rowNum}`;

      // Required fields
      const missingRequired = STUDENT_REQUIRED.filter((c) => !r[c]?.trim());
      if (missingRequired.length) {
        errors.push({
          row: rowNum, identifier,
          error: `Missing required field(s): ${missingRequired.join(", ")}`,
          cause: "One or more required columns were left blank",
          suggestedFix: `Fill in ${missingRequired.join(", ")} for this row and re-import.`,
        });
        resolvedClassIds.push(null);
        return;
      }

      // Duplicate admission number (in-file or DB)
      const admNo = r.admission_no?.trim();
      if (admNo && dupAdmissionNos.has(admNo)) {
        duplicateCount++;
        errors.push({
          row: rowNum, identifier, error: `Duplicate admission number "${admNo}" appears more than once in this file`,
          cause: "Duplicate admission number within the uploaded CSV", isDuplicate: true,
          suggestedFix: "Keep only one row per admission number, or leave it blank to auto-generate.",
        });
        resolvedClassIds.push(null);
        return;
      }
      if (admNo && existingNos.has(admNo)) {
        duplicateCount++;
        errors.push({
          row: rowNum, identifier, error: `Admission number "${admNo}" already exists`,
          cause: "Duplicate admission number against existing records", isDuplicate: true,
          suggestedFix: "Use a different admission number, or leave it blank to auto-generate.",
        });
        resolvedClassIds.push(null);
        return;
      }

      // Gender
      if (!isGenderValid(r.gender || "")) {
        errors.push({
          row: rowNum, identifier, error: `Invalid gender value "${r.gender}"`,
          cause: "Gender must be male/female/other (or M/F/O)",
          suggestedFix: "Set gender to Male, Female, or Other (M/F/O also accepted).",
        });
        resolvedClassIds.push(null);
        return;
      }

      // Date of birth
      if (r.date_of_birth?.trim() && !isValidDate(r.date_of_birth.trim())) {
        errors.push({
          row: rowNum, identifier, error: `Invalid date_of_birth "${r.date_of_birth}"`,
          cause: "Dates must be in YYYY-MM-DD format and a plausible year",
          suggestedFix: "Reformat the date as YYYY-MM-DD, e.g. 2012-03-05.",
        });
        resolvedClassIds.push(null);
        return;
      }

      // Parent information
      if (r.parent_email?.trim() && !isValidEmail(r.parent_email.trim())) {
        errors.push({
          row: rowNum, identifier, error: `Invalid parent_email "${r.parent_email}"`,
          cause: "Parent email is not a valid email address",
          suggestedFix: "Fix the parent email format, or leave it blank.",
        });
        resolvedClassIds.push(null);
        return;
      }
      if (r.parent_phone?.trim() && !isValidPhone(r.parent_phone.trim())) {
        errors.push({
          row: rowNum, identifier, error: `Invalid parent_phone "${r.parent_phone}"`,
          cause: "Parent phone contains invalid characters or is the wrong length",
          suggestedFix: "Use digits, spaces, +, -, or () only, e.g. +254700000000.",
        });
        resolvedClassIds.push(null);
        return;
      }

      // Class (+ stream) existence
      const className = r.class_name?.trim().toLowerCase() ?? "";
      const candidates = classByNameStream.get(className);
      if (!candidates || !candidates.length) {
        errors.push({
          row: rowNum, identifier, error: `Class not found: "${r.class_name}"`,
          cause: "No class with this name exists yet",
          suggestedFix: "Import Classes first, or correct the class_name spelling.",
        });
        resolvedClassIds.push(null);
        return;
      }
      const streamRaw = r.stream?.trim().toLowerCase() ?? "";
      let match: { id: string; stream: string | null } | undefined;
      if (streamRaw) {
        match = candidates.find((c) => c.stream === streamRaw);
        if (!match) {
          errors.push({
            row: rowNum, identifier, error: `Stream "${r.stream}" not found for class "${r.class_name}"`,
            cause: "Streams are enabled for this class but the given stream doesn't match any of them",
            suggestedFix: "Check the stream name matches exactly, or leave it blank if the class has no streams.",
          });
          resolvedClassIds.push(null);
          return;
        }
      } else if (candidates.length > 1) {
        errors.push({
          row: rowNum, identifier, error: `Class "${r.class_name}" has multiple streams — a stream is required`,
          cause: "Streams are enabled for this class name",
          suggestedFix: `Specify one of: ${candidates.map((c) => c.stream ?? "(none)").join(", ")}.`,
        });
        resolvedClassIds.push(null);
        return;
      } else {
        match = candidates[0];
      }
      resolvedClassIds.push(match!.id);
    });

    setPreValidationErrors(errors);
    const validationErrorCount = errors.length;

    // Only rows that passed every validation step get provisioned.
    const importable = rows
      .map((r, i) => ({ r, i, classId: resolvedClassIds[i] }))
      .filter(({ i, classId }) => classId && !errors.some((e) => e.row === i + 1));

    let imported = 0;
    const generatedCredentials: GeneratedCredential[] = [];

    // ── Provision each valid row through the EXISTING admitStudent pipeline ─
    // (unique ID, login, synthetic email, temp password, Supabase Auth user,
    // profile, user_roles, user_credentials, school_member, linking — all
    // handled inside admitStudent exactly as for a manually admitted student.)
    for (let idx = 0; idx < importable.length; idx++) {
      const { r, i: rowIndex, classId } = importable[idx];
      const rowNum = rowIndex + 1;
      const identifier = r.admission_no?.trim() || `${r.first_name} ${r.last_name}`.trim();
      try {
        const gender = normalizeGender(r.gender || "");
        const result = await admitFn({
          data: {
            first_name: r.first_name.trim(),
            last_name: r.last_name.trim(),
            gender: gender ?? undefined,
            date_of_birth: r.date_of_birth?.trim() || undefined,
            class_id: classId!,
            parent_name: r.parent_name?.trim() || undefined,
            parent_phone: r.parent_phone?.trim() || undefined,
            parent_email: r.parent_email?.trim() || undefined,
            address: r.address?.trim() || undefined,
            national_id: r.national_id?.trim() || undefined,
            admission_no: r.admission_no?.trim() || undefined,
          },
        });
        imported++;
        generatedCredentials.push({
          identifier: result.student.admission_no ?? identifier,
          fullName: `${r.first_name} ${r.last_name}`.trim(),
          uniqueId: result.uniqueId,
          syntheticEmail: result.syntheticEmail,
          password: result.password,
        });
      } catch (e: any) {
        const message = e?.message ?? "Provisioning failed";
        const { cause, suggestedFix } = classifyProvisioningError(message);
        const isDup = /duplicate|already exists|unique/i.test(message);
        if (isDup) duplicateCount++;
        errors.push({ row: rowNum, identifier, error: message, cause, suggestedFix, isDuplicate: isDup });
      }
      setProgress(Math.round(((idx + 1) / importable.length) * 100));
    }

    const finalSummary: ImportSummary = {
      totalRows: rows.length,
      imported,
      failed: rows.length - imported,
      duplicateRecords: duplicateCount,
      validationErrors: validationErrorCount,
      generatedAccounts: imported,
      generatedCredentials,
      rowErrors: errors.sort((a, b) => a.row - b.row),
    };
    setSummary(finalSummary);
    setBusy(false);

    if (imported > 0) refreshCaches();
    toast[imported > 0 ? "success" : "error"](
      `Imported ${imported}/${rows.length} students${finalSummary.failed ? `, ${finalSummary.failed} failed` : ""}.`,
    );
  };

  const detectedHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
  const missingHeaders = STUDENT_REQUIRED.filter((h) => !detectedHeaders.includes(h));

  return (
    <ImportShell
      kind="students"
      icon={<Users className="w-4 h-4" />}
      headers={STUDENT_HEADERS}
      requiredCols={STUDENT_REQUIRED}
      text={text}
      setText={setText}
      rows={rows}
      missingHeaders={missingHeaders}
      busy={busy}
      progress={progress}
      onFile={onFile}
      onPaste={onPaste}
      onDownloadTemplate={() => downloadTemplate(STUDENT_HEADERS, STUDENT_EXAMPLE, "students-template.csv")}
      onImport={runImport}
      summary={summary}
      preValidationErrors={preValidationErrors}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STAFF IMPORT
// ════════════════════════════════════════════════════════════════════════════
export function StaffImportPanel() {
  const createFn = useServerFn(createStaff);
  const refreshCaches = useRefreshAllCaches();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [preValidationErrors, setPreValidationErrors] = useState<RowError[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const onFile = async (f: File) => {
    const t = await f.text();
    setText(t);
    const { rows: parsed } = parseCsvRows(t);
    setRows(parsed);
    setSummary(null);
    setPreValidationErrors([]);
  };
  const onPaste = () => {
    const { rows: parsed } = parseCsvRows(text);
    setRows(parsed);
    setSummary(null);
    setPreValidationErrors([]);
  };

  const runImport = async () => {
    if (!rows.length) return;
    setBusy(true);
    setSummary(null);
    setProgress(0);

    const errors: RowError[] = [];
    let duplicateCount = 0;

    // ── Step: Validate School ──────────────────────────────────────────────
    const { data: schoolId, error: schoolErr } = await supabase.rpc("my_school_id");
    if (!schoolId || schoolErr) {
      toast.error("Cannot import: no school context found for your account.");
      setBusy(false);
      return;
    }

    // ── Step: Validate required columns ────────────────────────────────────
    const detectedHeaders = rows.length ? Object.keys(rows[0]) : [];
    const missingCols = STAFF_REQUIRED.filter((c) => !detectedHeaders.includes(c));
    if (missingCols.length) {
      toast.error(`Missing required columns: ${missingCols.join(", ")}`);
      setBusy(false);
      return;
    }

    // ── Step: Validate duplicate employee numbers (within file + DB) ───────
    const dupEmployeeNos = findDuplicateKeys(rows, "employee_no");
    const providedNos = rows.map((r) => r.employee_no?.trim()).filter(Boolean) as string[];
    const existingNos = new Set<string>();
    if (providedNos.length) {
      const { data } = await supabase.from("staff").select("employee_no").in("employee_no", providedNos);
      (data ?? []).forEach((d: any) => existingNos.add(d.employee_no));
    }

    // ── Step: Validate Departments ──────────────────────────────────────────
    const { data: depts } = await supabase.from("departments").select("id, name");
    const deptByName = new Map<string, string>();
    (depts ?? []).forEach((d: any) => deptByName.set(String(d.name).trim().toLowerCase(), d.id));

    const resolvedDeptIds: (string | null | undefined)[] = [];
    rows.forEach((r, i) => {
      const rowNum = i + 1;
      const identifier = r.employee_no?.trim() || `${r.first_name || ""} ${r.last_name || ""}`.trim() || `row ${rowNum}`;

      // Required fields
      const missingRequired = STAFF_REQUIRED.filter((c) => !r[c]?.trim());
      if (missingRequired.length) {
        errors.push({
          row: rowNum, identifier, error: `Missing required field(s): ${missingRequired.join(", ")}`,
          cause: "One or more required columns were left blank",
          suggestedFix: `Fill in ${missingRequired.join(", ")} for this row and re-import.`,
        });
        resolvedDeptIds.push(undefined);
        return;
      }

      // Employee number duplicates
      const empNo = r.employee_no?.trim();
      if (empNo && dupEmployeeNos.has(empNo)) {
        duplicateCount++;
        errors.push({
          row: rowNum, identifier, error: `Duplicate employee number "${empNo}" appears more than once in this file`,
          cause: "Duplicate employee number within the uploaded CSV", isDuplicate: true,
          suggestedFix: "Keep only one row per employee number, or leave it blank to auto-generate.",
        });
        resolvedDeptIds.push(undefined);
        return;
      }
      if (empNo && existingNos.has(empNo)) {
        duplicateCount++;
        errors.push({
          row: rowNum, identifier, error: `Employee number "${empNo}" already exists`,
          cause: "Duplicate employee number against existing records", isDuplicate: true,
          suggestedFix: "Use a different employee number, or leave it blank to auto-generate.",
        });
        resolvedDeptIds.push(undefined);
        return;
      }

      // Department
      let deptId: string | null = null;
      if (r.department?.trim()) {
        const found = deptByName.get(r.department.trim().toLowerCase());
        if (!found) {
          errors.push({
            row: rowNum, identifier, error: `Department not found: "${r.department}"`,
            cause: "No department with this name exists yet",
            suggestedFix: "Create the department first, or correct the spelling.",
          });
          resolvedDeptIds.push(undefined);
          return;
        }
        deptId = found;
      }

      // Role
      const role = r.role?.trim().toLowerCase().replace(/\s+/g, "_") ?? "";
      if (!IMPORTABLE_STAFF_ROLES.includes(role)) {
        errors.push({
          row: rowNum, identifier, error: `Invalid or disallowed role "${r.role}"`,
          cause: "Role is not a recognized, importable staff role",
          suggestedFix: `Use one of: ${IMPORTABLE_STAFF_ROLES.slice(0, 8).join(", ")}, …`,
        });
        resolvedDeptIds.push(undefined);
        return;
      }

      // Gender
      if (!isGenderValid(r.gender || "")) {
        errors.push({
          row: rowNum, identifier, error: `Invalid gender value "${r.gender}"`,
          cause: "Gender must be male/female/other (or M/F/O)",
          suggestedFix: "Set gender to Male, Female, or Other (M/F/O also accepted).",
        });
        resolvedDeptIds.push(undefined);
        return;
      }

      // Dates
      if (r.date_of_birth?.trim() && !isValidDate(r.date_of_birth.trim())) {
        errors.push({
          row: rowNum, identifier, error: `Invalid date_of_birth "${r.date_of_birth}"`,
          cause: "Dates must be in YYYY-MM-DD format and a plausible year",
          suggestedFix: "Reformat the date as YYYY-MM-DD.",
        });
        resolvedDeptIds.push(undefined);
        return;
      }
      if (r.hire_date?.trim() && !isValidDate(r.hire_date.trim())) {
        errors.push({
          row: rowNum, identifier, error: `Invalid hire_date "${r.hire_date}"`,
          cause: "Dates must be in YYYY-MM-DD format and a plausible year",
          suggestedFix: "Reformat the date as YYYY-MM-DD.",
        });
        resolvedDeptIds.push(undefined);
        return;
      }

      // Phone
      if (r.phone?.trim() && !isValidPhone(r.phone.trim())) {
        errors.push({
          row: rowNum, identifier, error: `Invalid phone "${r.phone}"`,
          cause: "Phone contains invalid characters or is the wrong length",
          suggestedFix: "Use digits, spaces, +, -, or () only, e.g. +254711000001.",
        });
        resolvedDeptIds.push(undefined);
        return;
      }

      // Email
      if (r.email?.trim() && !isValidEmail(r.email.trim())) {
        errors.push({
          row: rowNum, identifier, error: `Invalid email "${r.email}"`,
          cause: "Email is not a valid email address",
          suggestedFix: "Fix the email format, or leave it blank.",
        });
        resolvedDeptIds.push(undefined);
        return;
      }

      resolvedDeptIds.push(deptId);
    });

    setPreValidationErrors(errors);
    const validationErrorCount = errors.length;

    const importable = rows
      .map((r, i) => ({ r, i, deptId: resolvedDeptIds[i] }))
      .filter(({ i, deptId }) => deptId !== undefined && !errors.some((e) => e.row === i + 1));

    let imported = 0;
    const generatedCredentials: GeneratedCredential[] = [];

    // ── Provision each valid row through the EXISTING createStaff pipeline ──
    for (let idx = 0; idx < importable.length; idx++) {
      const { r, i: rowIndex, deptId } = importable[idx];
      const rowNum = rowIndex + 1;
      const identifier = r.employee_no?.trim() || `${r.first_name} ${r.last_name}`.trim();
      try {
        const result = await createFn({
          data: {
            first_name: r.first_name.trim(),
            last_name: r.last_name.trim(),
            email: r.email?.trim() || undefined,
            phone: r.phone?.trim() || undefined,
            role: r.role.trim().toLowerCase().replace(/\s+/g, "_"),
            department_id: deptId || undefined,
            department: r.department?.trim() || undefined,
            hire_date: r.hire_date?.trim() || undefined,
            employee_no: r.employee_no?.trim() || undefined,
          },
        });
        imported++;
        generatedCredentials.push({
          identifier: result.staff.employee_no ?? identifier,
          fullName: `${r.first_name} ${r.last_name}`.trim(),
          uniqueId: result.uniqueId,
          syntheticEmail: result.syntheticEmail,
          password: result.password,
        });
      } catch (e: any) {
        const message = e?.message ?? "Provisioning failed";
        const { cause, suggestedFix } = classifyProvisioningError(message);
        const isDup = /duplicate|already exists|unique/i.test(message);
        if (isDup) duplicateCount++;
        errors.push({ row: rowNum, identifier, error: message, cause, suggestedFix, isDuplicate: isDup });
      }
      setProgress(Math.round(((idx + 1) / importable.length) * 100));
    }

    const finalSummary: ImportSummary = {
      totalRows: rows.length,
      imported,
      failed: rows.length - imported,
      duplicateRecords: duplicateCount,
      validationErrors: validationErrorCount,
      generatedAccounts: imported,
      generatedCredentials,
      rowErrors: errors.sort((a, b) => a.row - b.row),
    };
    setSummary(finalSummary);
    setBusy(false);

    if (imported > 0) refreshCaches();
    toast[imported > 0 ? "success" : "error"](
      `Imported ${imported}/${rows.length} staff${finalSummary.failed ? `, ${finalSummary.failed} failed` : ""}.`,
    );
  };

  const detectedHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
  const missingHeaders = STAFF_REQUIRED.filter((h) => !detectedHeaders.includes(h));

  return (
    <ImportShell
      kind="staff"
      icon={<Users className="w-4 h-4" />}
      headers={STAFF_HEADERS}
      requiredCols={STAFF_REQUIRED}
      text={text}
      setText={setText}
      rows={rows}
      missingHeaders={missingHeaders}
      busy={busy}
      progress={progress}
      onFile={onFile}
      onPaste={onPaste}
      onDownloadTemplate={() => downloadTemplate(STAFF_HEADERS, STAFF_EXAMPLE, "staff-template.csv")}
      onImport={runImport}
      summary={summary}
      preValidationErrors={preValidationErrors}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Shared shell UI (upload, preview, progress, summary, credential + error report)
// ════════════════════════════════════════════════════════════════════════════
function ImportShell({
  kind, icon, headers, requiredCols, text, setText, rows, missingHeaders,
  busy, progress, onFile, onPaste, onDownloadTemplate, onImport, summary, preValidationErrors,
}: {
  kind: string;
  icon: React.ReactNode;
  headers: string[];
  requiredCols: string[];
  text: string;
  setText: (v: string) => void;
  rows: Record<string, string>[];
  missingHeaders: string[];
  busy: boolean;
  progress: number;
  onFile: (f: File) => void;
  onPaste: () => void;
  onDownloadTemplate: () => void;
  onImport: () => void;
  summary: ImportSummary | null;
  preValidationErrors: RowError[];
}) {
  const displayErrors = summary?.rowErrors ?? preValidationErrors;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">{icon} 1. Download template</CardTitle>
          <Button variant="outline" size="sm" onClick={onDownloadTemplate}>
            <Download className="w-4 h-4 mr-2" /> Template CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground mb-2">
            Required columns (marked *): <span className="font-semibold">{requiredCols.join(", ")}</span>. Leave the
            id column blank to auto-generate — or set it explicitly and it will be validated for duplicates.
          </div>
          <div className="flex flex-wrap gap-1">
            {headers.map((h) => (
              <Badge key={h} variant={requiredCols.includes(h) ? "default" : "outline"} className="text-[10px] font-mono">
                {h}{requiredCols.includes(h) ? " *" : ""}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. Upload or paste CSV</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Upload .csv file</Label>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
          <div>
            <Label>Or paste CSV text</Label>
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={`${headers.join(",")}\n…`} />
            <Button size="sm" variant="outline" className="mt-2" onClick={onPaste}>Parse</Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && missingHeaders.length > 0 && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 flex gap-2 items-start text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Required columns missing in your file: <strong>{missingHeaders.join(", ")}</strong>. Fix before importing.</span>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">3. Preview ({rows.length} rows)</CardTitle>
            <Button onClick={onImport} disabled={busy || missingHeaders.length > 0}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {busy ? "Provisioning…" : `Import ${kind}`}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {busy && <Progress value={progress} />}
            <div className="overflow-x-auto border rounded">
              <table className="text-xs w-full">
                <thead className="bg-muted">
                  <tr>{Object.keys(rows[0]).map((h) => (
                    <th key={h} className={`px-2 py-1 text-left ${requiredCols.includes(h) ? "font-bold" : ""}`}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t">
                      {Object.keys(rows[0]).map((h) => <td key={h} className="px-2 py-1">{r[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && <div className="text-xs text-muted-foreground p-2">…and {rows.length - 10} more</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              Import Summary
              <Badge variant="outline">{summary.totalRows} total rows</Badge>
              <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />{summary.imported} imported</Badge>
              {summary.failed > 0 && <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" />{summary.failed} failed</Badge>}
              {summary.duplicateRecords > 0 && <Badge variant="secondary">{summary.duplicateRecords} duplicate</Badge>}
              {summary.validationErrors > 0 && <Badge variant="secondary">{summary.validationErrors} validation errors</Badge>}
              <Badge variant="outline" className="gap-1"><KeyRound className="w-3 h-3" />{summary.generatedAccounts} accounts + credentials generated</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.generatedCredentials.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Generated login credentials (shown once — save now)</div>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => downloadCredentialsCsv(summary.generatedCredentials, `${kind}-credentials.csv`)}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" /> Download CSV
                  </Button>
                </div>
                <div className="max-h-72 overflow-auto border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Unique ID</TableHead>
                        <TableHead>Login email</TableHead>
                        <TableHead>Temp password</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.generatedCredentials.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell>{c.fullName}</TableCell>
                          <TableCell className="font-mono text-xs">{c.identifier}</TableCell>
                          <TableCell className="font-mono text-xs">{c.uniqueId}</TableCell>
                          <TableCell className="font-mono text-xs">{c.syntheticEmail}</TableCell>
                          <TableCell className="font-mono text-xs">{c.password}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {displayErrors.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Row-level report ({displayErrors.length})</div>
                <div className="max-h-72 overflow-auto border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Row</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Cause</TableHead>
                        <TableHead>Suggested fix</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayErrors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell>{e.row}</TableCell>
                          <TableCell className="font-mono text-xs">{e.identifier}</TableCell>
                          <TableCell className="text-destructive text-xs">{e.error}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{e.cause}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{e.suggestedFix}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!summary && preValidationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{preValidationErrors.length} row(s) will be skipped</AlertTitle>
          <AlertDescription>
            Fix these before importing, or proceed and only the valid rows will be provisioned.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
