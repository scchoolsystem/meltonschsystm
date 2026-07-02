// Shared CSV parsing + validation helpers for the Student and Staff CSV import
// workflows. These run entirely client-side, BEFORE any row is sent to the
// existing provisioning server functions (admitStudent / createStaff), so a
// bad file never triggers partial auth-account creation.
//
// Nothing here talks to Supabase Auth or creates accounts — it only checks
// shape, required fields, formats, and (via the lookups passed in) that
// referenced Classes / Departments / Streams / School context already exist.

// ─── CSV parsing (RFC4180-ish: supports quoted fields with commas) ───────────
export function parseCsvRows(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 1) return { headers: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
  return { headers, rows };
}

// ─── Row-level error type used throughout the import pipeline ────────────────
export interface RowError {
  row: number; // 1-based, matches the row's position in the uploaded CSV (excluding header)
  identifier: string; // admission_no / employee_no / name — whatever best identifies the row
  error: string;
  cause: string;
  suggestedFix: string;
  isDuplicate?: boolean;
}

export function makeRowError(
  row: number,
  identifier: string,
  error: string,
  cause: string,
  suggestedFix: string,
  isDuplicate = false,
): RowError {
  return { row, identifier, error, cause, suggestedFix, isDuplicate };
}

// ─── Generic field validators ─────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9()\-\s]{7,20}$/;

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  // Reject obviously bogus years (before 1900 or > current year + 1)
  const year = Number(value.slice(0, 4));
  const maxYear = new Date().getFullYear() + 1;
  return year >= 1900 && year <= maxYear;
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(value.trim());
}

export function normalizeGender(raw: string): "male" | "female" | "other" | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (["m", "male", "boy"].includes(v)) return "male";
  if (["f", "female", "girl"].includes(v)) return "female";
  if (["o", "other"].includes(v)) return "other";
  return undefined as unknown as null; // signals "present but invalid" — caller distinguishes via isGenderColumnValid
}

export function isGenderValid(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return true; // gender is optional — blank is fine
  return ["m", "male", "boy", "f", "female", "girl", "o", "other"].includes(v);
}

// ─── Duplicate detection (within the uploaded file) ───────────────────────────
export function findDuplicateKeys(rows: Record<string, string>[], key: string): Set<string> {
  const seen = new Map<string, number>();
  const dupes = new Set<string>();
  rows.forEach((r) => {
    const v = r[key]?.trim();
    if (!v) return;
    seen.set(v, (seen.get(v) ?? 0) + 1);
    if ((seen.get(v) ?? 0) > 1) dupes.add(v);
  });
  return dupes;
}

// ─── Cause/fix classification for server-side (provisioning) failures ────────
// Keeps the row-level error report meaningful even when the failure came back
// from the shared provisioning pipeline (admitStudent / createStaff) rather
// than from client-side validation.
export function classifyProvisioningError(message: string): { cause: string; suggestedFix: string } {
  const m = message.toLowerCase();
  if (m.includes("duplicate") || m.includes("already exists") || m.includes("unique")) {
    return {
      cause: "A record with this identifier or email already exists",
      suggestedFix: "Check for a pre-existing account, or remove the duplicate row and re-import.",
    };
  }
  if (m.includes("no school context") || m.includes("school")) {
    return {
      cause: "The signed-in administrator has no resolvable school context",
      suggestedFix: "Confirm the admin account is linked to a school before importing.",
    };
  }
  if (m.includes("not authorized")) {
    return {
      cause: "The signed-in user lacks permission to provision this record",
      suggestedFix: "Import as a super admin, principal, admission officer, or deputy principal.",
    };
  }
  if (m.includes("class not found") || m.includes("class_id")) {
    return {
      cause: "The referenced class could not be resolved to an existing class",
      suggestedFix: "Import Classes first, or fix the class name/stream spelling in the CSV.",
    };
  }
  return {
    cause: "The provisioning pipeline rejected this row",
    suggestedFix: "Review the error message and correct the row, then re-upload just the failed rows.",
  };
}
