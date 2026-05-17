# Full UI ↔ Backend Audit

Goal: for every page, make sure what's shown, editable, and labeled matches what the database actually stores and what server functions actually do. No new features — only alignment.

## How I'll work

For each page I will:
1. Read the route file + any server function it calls.
2. Read the underlying table(s): columns, defaults, RLS.
3. Fix mismatches:
   - Remove UI fields that don't exist in the schema.
   - Add UI for columns that ARE stored but hidden (e.g. `unique_id`, `synthetic_email`, `lifecycle status`, `verified` flags).
   - Correct labels (e.g. "Email" → "Login ID" where it's actually `synthetic_email`).
   - Hide / disable actions the current role can't perform per RLS, so users don't hit silent failures.
   - Make sure mutations call the right server function (not a raw `supabase.from(...).update()` that RLS will block).

## Pages in scope (grouped)

**People**
- `/students` — admission_no, unique_id, lifecycle status, parent links
- `/staff` — employee_no, unique_id, role(s), credentials
- `/admin/users` — synthetic_email vs real email, role assignment, password reset
- `/admin/links` — parent→student links + pending_parent_links queue
- `/admin/roles`, `/admin/permissions` — match user_roles + field_policies tables

**Academics**
- `/academics/subjects`, `/exams`, `/marks`, `/results`, `/report-cards`
- `/timetable`, `/timetable/generate`

**Operations**
- `/attendance`, `/discipline`, `/library`, `/boarding`, `/kitchen`, `/transport`, `/clinic`, `/security`

**Finance**
- `/finance/fees`, `/invoices`, `/generate`, `/payments`, receipt view

**Digital IDs & portals**
- `/ids/bulk`, `/ids/verify`, `/ids/student/:id`, `/ids/staff/:id`
- `/portal/student`, `/portal/parent`

**Admin / platform**
- `/admin/brain`, `/admin/activity`, `/admin/settings`, `/admin/import`
- `/platform/*` (super-admin)

## Delivery

Because this touches ~40 route files, I'll ship it in batches and report after each:

1. **Batch 1** — People (Students, Staff, Admin Users, Parent Links)
2. **Batch 2** — Academics (Subjects → Report Cards, Timetable)
3. **Batch 3** — Operations (Attendance, Discipline, Library, Boarding, Kitchen, Transport, Clinic, Security)
4. **Batch 4** — Finance + Digital IDs + Portals
5. **Batch 5** — Admin + Platform

Each batch = one chat reply with a short "what was wrong / what I fixed" summary per page.

## Out of scope

- New features / new tables / new columns.
- Visual redesign — only labels and field presence change.
- Schema migrations (only if I find an actual UI relies on a column that doesn't exist; I'll flag and ask first).

Reply **approve** to start with Batch 1 (People), or tell me to reorder.
