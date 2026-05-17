# Final Hardening Plan — Phased

The scope you listed is ~3 weeks of work. Shipping it as one mega-commit would destabilize a 95%-ready system. I'll split into **5 phases**, smallest blast radius first. Each phase is independently shippable and testable.

---

## Phase A — Security-Critical (ship first, ~1 session)

Cross-tenant data leaks are the only real production blockers. Everything else is polish.

**A1. Tenant-scoped login lookup**
- Rewrite `lookup_login_email(_unique_id)` → `lookup_login_email(_unique_id, _school_slug)`. Join `user_credentials` → `school_members` → `schools`, filter by slug.
- Update `src/lib/auth-admin.functions.ts` validator + handler.
- Update `src/routes/login.tsx` to pass `useTenant().slug` (fallback `school-1`).
- Super-admin override path preserved (email login).

**A2. Tenant-scoped finance generation**
- `src/lib/finance.functions.ts`: in `bulkGenerateInvoices`, resolve caller's `school_id` from `school_members` and add `.eq('school_id', schoolId)` to every `supabaseAdmin` query (students, existing invoices, inserts).
- Same audit for `src/lib/class-fees.functions.ts` `assign_class_fees` (DB function already uses `current_user_school()` — verify), `src/lib/admissions.functions.ts`, `src/lib/parent-link.functions.ts`, `src/lib/timetable.functions.ts`, `src/lib/lifecycle.functions.ts`.
- Rule: any `supabaseAdmin` call MUST filter or stamp `school_id`.

**A3. Remove `school_settings` reads from tenant-facing UI**
- Replace `supabase.from("school_settings").select(...)` with `useTenant().school` in:
  - `src/routes/login.tsx`
  - `src/routes/_app.ids.student.$id.tsx`, `_app.ids.staff.$id.tsx`, `_app.ids.bulk.tsx`
  - `src/routes/_app.academics.report-card.$studentId.$examId.tsx`
  - `src/routes/_app.finance.receipt.$id.tsx`
  - `src/components/AppSidebar.tsx`
- Keep `school_settings` table for now (legacy data); just stop reading it from tenant routes.

---

## Phase B — Performance (next session)

**B1. Cursor pagination** on `students`, `staff`, `invoices`, `payments`, `attendance_records` list routes. Use React Query `useInfiniteQuery` + `.range(from, to).order('created_at', { ascending: false })`.

**B2. Analytics SQL views** — move dashboard aggregates from frontend reduce-loops into Postgres views (`v_finance_summary`, `v_attendance_daily`, `v_results_by_class`). Frontend just selects.

**B3. Drop `.limit(2000)`** in exam_results queries (your earlier 400s) — replace with paginated/aggregated SQL.

---

## Phase C — Upload + Session Security

**C1. Storage**: tighten `profile-photos` policies, add per-school path prefix (`{school_id}/{user_id}/...`), enforce MIME via client validation + RLS path check.
**C2. Sessions**: enable Supabase JWT short expiry + refresh rotation in `configure_auth`; add `last_login_at` tracking + multi-device logout UI in `_app.admin.users.tsx`.

---

## Phase D — UX Polish

**D1.** First-school setup wizard (only shown when no `schools` row exists for super-admin).
**D2.** Empty states across list routes.
**D3.** Mobile table → card collapse breakpoints.
**D4.** Notifications: email via Lovable transactional email skill; in-app via existing `smart_alerts`; SMS/push deferred (needs paid providers — out of scope unless you confirm budget).

---

## Phase E — Infra & Ops (out of build scope, doc-only)

CI/CD, Sentry, backups, PITR, monitoring all live **outside the Lovable app codebase** — they're configured in GitHub, Sentry dashboard, and Supabase project settings. I can produce a `DEPLOYMENT.md` checklist with exact steps, but I can't actually wire GitHub Actions or Sentry from here without you providing tokens.

---

## What I need from you

Reply with **one** of:

1. **"Start Phase A"** — I implement A1+A2+A3 now (security fixes only, ~1 migration + ~8 file edits). Safest, highest ROI.
2. **"A + B"** — security + performance in one go (larger, riskier).
3. **"Custom"** — tell me which specific items from A–E to do first.

I strongly recommend **option 1**. Phases B–E build on a verified-secure Phase A.
