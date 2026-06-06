# RBAC + Multi-Tenant Hardening — Phased Plan

This is a large, production-sensitive upgrade. To honor "do not break production", I'll deliver it in **6 phases**, each independently shippable and reversible. Below is the full plan; I'll only implement **Phase 1** after you approve, then return for the next.

## Architecture findings (current state)

Inspected the existing system. Good news: most foundations already exist.

- **Auth context** (`src/hooks/use-auth.tsx`): loads `roles[]` from `user_roles`, exposes `hasRole`, `isAdmin`. Multi-role already supported.
- **Tenant context** (`src/hooks/use-tenant.tsx`): resolves school by subdomain → `school_id`. Platform host short-circuit works.
- **DB-side RBAC primitives already present**:
  - `has_role(uid, role)`, `is_admin(uid)`, `is_platform_admin(uid)`, `role_level(uid)`, `can_edit(uid, resource, field)`
  - `current_user_school()`, `my_school_id()`, `stamp_school_id()`, `guard_school_id()` (tenant scoping)
  - `is_parent_of(student_id)`, `is_student(student_id)`, `my_children_ids()`, `current_student_id()` (scope helpers)
- **Field-level policy table** (`field_policies`) + `can_edit` already drive locked/restricted fields.
- **Server fn auth middleware** (`requireSupabaseAuth`) + global `attachSupabaseAuth` already wired.
- **Sidebar** (`AppSidebar.tsx`) — needs role-aware filtering audit.
- **Feature gate** (`FeatureGate.tsx` + `useFeatureGate`) — per-school feature flags exist, separate from role gates.

**What's missing / scattered:**
1. No centralized **permission map** (module → required roles). Role checks are scattered across route files (`isAdmin`, `roles.includes(...)`).
2. No `<RoleGuard>` / `<PermissionGuard>` components — routes either use `_app` layout or do ad-hoc checks.
3. No `canAccess(module)` / `canView(resource)` / `mergeUserPermissions()` helpers.
4. No role-aware dashboard builder — `_app.dashboard.tsx` shows the same widgets to everyone.
5. Sidebar shows links by role but logic is inline, not driven by the permission map.
6. RLS coverage on per-class / per-subject filtering for teachers is uneven (needs audit).

## Phase plan

### Phase 1 — RBAC core (this turn, on approval)
**Goal:** centralized, additive permission layer. Zero behavior change for existing users.

New files (pure additions, nothing replaced):
- `src/core/rbac/permissions.ts` — module map: `{ module: { roles: AppRole[], minLevel?: number } }` covering all 41 roles & modules.
- `src/core/rbac/index.ts` — `canAccess(roles, module)`, `canAccessRoute(roles, path)`, `hasAnyRole`, `mergeUserPermissions(user)`, `getNavigationFor(roles)`.
- `src/hooks/usePermissions.ts` — thin hook over `useAuth()` exposing the helpers above.
- `src/components/security/RoleGuard.tsx` — `<RoleGuard roles={[...]}>` and `<RoleGuard module="finance">`.
- `src/components/security/PermissionGuard.tsx` — fine-grained, wraps children or returns fallback.

**No existing file is rewritten.** Existing inline checks keep working; new code can opt in.

### Phase 2 — Adopt guards in sidebar + routes (non-breaking)
- Refactor `AppSidebar` to derive items from `getNavigationFor(roles)` (same items, same icons — just sourced from the map).
- Wrap each `_app.*.tsx` route in `<RoleGuard module="...">` so unauthorized direct-URL visits redirect to `/dashboard` instead of crashing on RLS.
- Keep existing `beforeLoad` session check.

### Phase 3 — Role-aware dashboard
- `src/core/rbac/dashboard.ts` → `buildDashboard(roles, scope)` returning widget list.
- Refactor `_app.dashboard.tsx` to render widgets from the builder. Default (admin/principal) widgets unchanged; new widget sets for student/parent/teacher/finance/nurse/discipline/security.
- Reuse existing `_app.portal.student.tsx` / `_app.portal.parent.tsx` data hooks.

### Phase 4 — Query scope filtering helpers
- `src/lib/scope.functions.ts` — server fns: `getMyClassStudents`, `getMySubjectStudents`, `getMyChildren`, `getMyClinicVisits`, etc., each using `requireSupabaseAuth` + role-derived filters.
- Audit existing list pages; swap broad `supabase.from(...).select()` for the scoped fns where the page is role-specific (teacher attendance, parent fees, etc.). Admin pages untouched.

### Phase 5 — RLS hardening (migration)
- Audit every `public.*` table; ensure SELECT policy is role-scoped (not `USING (true)`).
- Add per-class / per-subject teacher policies using new helpers `is_class_teacher_of(class_id)`, `teaches_subject(subject_id)`.
- Keep all existing helper functions (per Core memory: do not flag).
- Single migration file, all additive (CREATE POLICY IF NOT EXISTS pattern; never drops a working policy without replacement).

### Phase 6 — AI assistant context enforcement
- `src/lib/brain.functions.ts` already exists; inject `{ user_id, tenant_id, roles, assigned_classes, assigned_subjects, linked_students }` into the system prompt and constrain tool/data access to those scopes.

## Phase 1 — concrete deliverable (this turn)

Files to create:
```
src/core/rbac/permissions.ts        ~120 lines, module→roles map
src/core/rbac/index.ts              ~90 lines, helpers
src/hooks/usePermissions.ts         ~25 lines
src/components/security/RoleGuard.tsx       ~35 lines
src/components/security/PermissionGuard.tsx ~30 lines
```

Files modified: **none**. Phase 1 is purely additive scaffolding — nothing in production changes until Phase 2 adopts the guards.

## Compatibility notes
- All existing `useAuth().hasRole(...)` calls keep working.
- All existing routes keep working unchanged.
- DB layer untouched in Phase 1.
- No env changes.
- No new dependencies.

## Regression risk: **zero in Phase 1** (no existing code paths altered).

---

**Approve to proceed with Phase 1.** I will then return for Phase 2 approval before touching the sidebar / route guards.
