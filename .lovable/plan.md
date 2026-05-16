# Multi-Tenant ERP — erp.smartdev.co.ke

Convert the current single-tenant ERP into a multi-tenant SaaS where each of your 20 schools lives at its own subdomain (e.g. `greenfield.erp.smartdev.co.ke`), shares the same codebase, but has fully isolated data.

Existing data is **never wiped** — it is migrated into a default "School 1" derived from current `school_settings`.

---

## Phase 1 — Tenancy foundation (this batch)

### 1.1 Schema
- New `schools` table: `id, slug (unique), name, motto, primary_color, logo_url, email, phone, address, academic_year, current_term, status (active/suspended), created_at`.
- New `school_members` table: `(user_id, school_id, default)` — lets one super-admin belong to many schools; everyone else belongs to one.
- Add nullable `school_id uuid` to every tenant table (~30): `students, staff, classes, subjects, exams, exam_results, attendance_records, invoices, payments, fee_structures, class_fee_components, announcements, books, book_loans, dormitories, dorm_assignments, clinic_visits, discipline_records, gate_passes, incident_reports, kitchen_stock, meal_plans, transport_routes, transport_assignments, timetable_slots, smart_alerts, lifecycle_events, field_edit_audit, override_log, activity_logs, user_credentials, parent_student_links, student_user_links, pending_parent_links, profiles, user_roles, unique_id_counters`.
- Backfill: create one row in `schools` from current `school_settings` (slug = `school-1`); set every existing row's `school_id` to that id.
- Make `school_id` `NOT NULL` after backfill. Add indexes `(school_id)` and composite `(school_id, ...)` where useful.
- `unique_id_counters` keyed by `(school_id, category, year)` so STU/STF codes restart per school.

### 1.2 Helpers (SECURITY DEFINER)
- `current_user_school()` → uuid of the user's active school (from `school_members` + subdomain claim in JWT).
- `belongs_to_school(_school uuid)` → boolean.
- Super-admin keeps cross-school access.

### 1.3 RLS rewrite
Every existing policy gets an additional `AND school_id = current_user_school()` clause. Super-admin bypass preserved. No table loses RLS.

### 1.4 Triggers
- `BEFORE INSERT` stamp trigger on every tenant table sets `school_id = current_user_school()` if null.
- `BEFORE UPDATE` guard prevents changing `school_id` (anti-tenant-jumping).

---

## Phase 2 — App wiring

### 2.1 Tenant resolver
- New `src/lib/tenant.ts`: parses `window.location.hostname`, extracts subdomain, resolves to a `schools` row (cached in React Query).
- New `TenantProvider` in `__root.tsx` wraps the app; exposes `useSchool()`.
- Login flow: after sign-in, verify the user has a `school_members` row matching the current subdomain — else sign out and show "Wrong school portal" page.
- Apply the school's branding (`primary_color`, `logo_url`, name) at the layout level.

### 2.2 Server functions
- Audit every `createServerFn` that touches tenant data; insert/update calls rely on the BEFORE-INSERT trigger, but explicit `.eq('school_id', school.id)` is added to admin queries for clarity.
- `lookup_login_email` becomes school-scoped (unique-ID + subdomain → synthetic_email).
- `assign_class_fees`, `next_unique_id`, `find_parent_match` updated for tenancy.

### 2.3 Super-admin console
- New `/admin/schools` route (super-admin only): list schools, create new school (slug + name), suspend, switch active school.

---

## Phase 3 — Governance reinforcement (3-tier edits)

The infrastructure already exists (`field_policies`, `field_edit_audit`, `override_log`, `role_level()`, `can_edit()`, `LockedFieldGate`). Phase 3 ensures it is applied consistently:

- Default policies seeded per school for sensitive fields (grades, fees, lifecycle, identity).
- Tier mapping:
  - **Normal users** (teacher/staff, level < 50): read + own-scope edits only.
  - **HOD/Admin** (level 50–80): department-scoped edits, restricted fields require justification.
  - **Super Admin** (level ≥ 90): full override with mandatory reason → `override_log`.
- All edits flow through `field_edit_audit` (already wired); add missing trigger wrappers on `students`, `staff`, `invoices`, `exam_results`.

---

## Phase 4 — DNS & domain

You handle DNS at your registrar:
- Wildcard A record: `*.erp.smartdev.co.ke` → `185.158.133.1`
- Root A record: `erp.smartdev.co.ke` → `185.158.133.1`

Then in Lovable → Project Settings → Domains, add each subdomain you want to activate (`greenfield.erp.smartdev.co.ke`, `school2.erp.smartdev.co.ke`, …). Lovable issues a separate cert per subdomain — wildcard SSL is not auto-provisioned, so each school must be added individually (one-time, ~1 min each).

---

## Technical notes

- **Migration order matters**: add nullable column → backfill → set NOT NULL → enable trigger → rewrite RLS. Done in one transaction per table group to avoid downtime.
- **No data loss**: all current rows go to `school-1`; you (current super_admin) become `school_members` for school-1 plus a global super-admin row.
- **Tenant isolation is enforced at the DB layer (RLS)** — even a bug in the frontend cannot leak School A data to School B.
- **Performance**: indexes on `school_id` keep queries fast; existing FK-less design stays.
- **Rollback**: each phase is reversible until Phase 1.4 triggers go live.

## What this plan does NOT include

- Per-school billing/subscription (can add later).
- Cross-school reporting dashboard for you as SaaS owner (can add later).
- Per-school email sender domains.
- Auto-onboarding wizard for new schools (after Phase 1, you create schools via SQL or the super-admin console in Phase 2).

---

## Order of execution

1. **Phase 1** migration (single supabase--migration call, large) → I'll ask you to approve it.
2. **Phase 2** code wiring (TenantProvider, server-fn updates, super-admin console).
3. **Phase 3** governance polish.
4. **Phase 4** you add the DNS records and subdomains.

Approve this plan and I'll begin with the Phase 1 migration.
