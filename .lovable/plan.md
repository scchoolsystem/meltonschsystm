## Phase 1 — Auth & Unique IDs (foundation for everything else)

This phase delivers the strict identification system. Existing users keep working during the rollout; we layer the new login on top without breaking anything.

### What you get

1. **System-generated Unique IDs** for every account: `STU-2026-000245`, `STF-2026-000045`, `LIB-2026-0002`, `SEC-2026-0004`, `EXM-2026-0001`, etc.
2. **System-generated strong passwords** (14 chars, mixed case + digits + symbols) at account creation. Never user-chosen.
3. **Hybrid credential delivery**:
   - Always shown ONCE in a secure admin popup with a Copy button.
   - Also queued for email (rendered later when email infra is set up — won't block creation now).
   - Per-school setting: `on_screen` | `email` | `hybrid` (default).
4. **Login modes**:
   - Default tab: **Unique ID + password** (works for everyone).
   - Super admin tab: **email + password** (only super_admin/principal can use this).
5. **Password reset by super admin only** — regenerates and shows once. Self-reset by email is disabled until email infra is wired.
6. **Role expansion** — adds the 30+ enterprise roles you listed (school_admin, academic_master, exams_admin/user, finance_admin/user, boarding_admin/user, kitchen_admin/user, security_admin/user, library_admin/user, clinic_admin/user, sports_admin/user, store_admin/user, transport_admin, guidance_admin, ict_admin, discipline_admin) to the existing `app_role` enum. Existing roles stay.
7. **Revoke flow** — admin can deactivate a user: marks `is_active=false`, login is blocked at the server function, profile + audit trail preserved.
8. **Migration of existing users** — every existing auth user gets a unique_id backfilled based on their current role (super_admin → `SUP-2026-xxxx`, staff → `STF-…`, etc.). Their current email/password keeps working so nobody is locked out; the new unique-ID login starts working immediately alongside it.

### Technical layout

```text
DB
├── ALTER TYPE app_role ADD VALUE ...        (30+ new roles)
├── school_settings                          (singleton: name, email_domain, delivery_mode)
├── user_credentials                          (user_id, unique_id, category, synthetic_email,
│                                              is_active, last_reset_at)
├── students.unique_id                        (column added, backfilled)
├── staff.unique_id                           (column added, backfilled)
├── RLS: super_admin manages credentials; users read their own
└── trigger: on new staff/student row → enqueue unique_id assignment

Server fns  (src/lib/auth-admin.functions.ts)
├── createAccount({ role, full_name, email?, link_to_staff_id?, link_to_student_id? })
│       → generates uniqueId + password, supabaseAdmin.auth.admin.createUser,
│         inserts user_credentials, returns { uniqueId, password } ONCE
├── resetPassword({ user_id })  super_admin only
├── revokeAccount({ user_id })  super_admin only
└── loginWithUniqueId({ uniqueId, password })
        → looks up synthetic_email, checks is_active, returns email for client
          to complete signInWithPassword

UI
├── /login              tabs: "Unique ID" (default) | "Super Admin Email"
├── /_app/admin/users   new page: create account → modal with copy-able credentials
└── /_app/admin/roles   already exists; extended with new role list
```

### Out of scope for Phase 1 (explicitly deferred)

- Email delivery of credentials (needs domain + email infra — separate phase).
- Auto-generated `student001@school.erp` mailboxes (rendered as synthetic logins only; no real inbox yet).
- Student/parent portals, finance, timetable, exam engine, IDs/QR — Phases 2–6.

### Safety guarantees

- No existing data deleted.
- No existing user locked out — old email login continues working in parallel.
- All new RLS policies are additive and role-scoped.
- Backfill is idempotent (re-running won't duplicate IDs).

Approve and I'll execute the migration, then wire the server functions and login UI in one pass.