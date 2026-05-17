# Platform Admin Portal — Architecture Split

Today, `super_admin` is a school role that can also create schools. We're separating those two concerns:

- **Platform admin** (you, your support team) — lives at `admin.smartdev.co.ke`. Creates schools, sets which features each school can use, manages plans & invoices, handles support.
- **School super_admin** — lives at `<school>.erp.smartdev.co.ke`. Manages only their own school. **Cannot create new schools anymore.**

---

## 1. New roles (DB)

Add to `app_role` enum:
- `platform_owner` — full access to platform portal (you).
- `platform_support` — read-only on schools + manage support tickets, no billing edits.

Helper functions:
- `is_platform_admin(uid)` → true for owner or support
- `is_platform_owner(uid)` → owner only

## 2. New tables

- **`subscription_plans`** — `slug`, `name`, `monthly_fee`, `description`, `is_active`. Seeded with `free`, `basic`, `pro`.
- **`school_subscriptions`** — `school_id`, `plan_id`, `status` (trial/active/past_due/suspended), `started_at`, `current_period_end`.
- **`school_features`** — `school_id`, `feature_key`, `enabled`. Feature keys: `academics`, `finance`, `boarding`, `kitchen`, `library`, `clinic`, `transport`, `security`, `discipline`, `portals`. Core (students/staff/classes/attendance/announcements) is always on.
- **`platform_invoices`** — `school_id`, `invoice_no`, `period_start`, `period_end`, `amount`, `status` (unpaid/paid/void), `due_date`, `notes`.
- **`platform_payments`** — `invoice_id`, `amount`, `method`, `reference`, `paid_on`, `recorded_by`.
- **`support_tickets`** — `school_id`, `opened_by` (school user), `subject`, `body`, `priority`, `status` (open/in_progress/resolved/closed), `assigned_to` (platform user).
- **`support_messages`** — `ticket_id`, `author_id`, `body`, threaded replies.

Platform tables are **not** tenant-isolated by `current_user_school()` — they're cross-tenant by design, gated by `is_platform_admin()`.

## 3. RLS shifts

- `schools` INSERT/UPDATE: restrict to `is_platform_owner(auth.uid())`. Today any super_admin can insert.
- `school_members` writes: platform_owner only.
- New tables: platform_owner full, platform_support read + ticket write.
- `school_features`: school members can SELECT their own row to know what's enabled; only platform_owner can UPDATE.

## 4. Subdomain routing

Update `getSubdomainSlug()`:
- `admin.smartdev.co.ke` → returns special value `__platform__` → mount platform shell, skip school lookup.
- Everything else unchanged.

`TenantProvider` short-circuits on platform host: no school load, no school branding.

## 5. New routes

```
src/routes/
  platform.tsx                    # layout: guards is_platform_admin, own sidebar
  platform.login.tsx              # email+password only, no unique ID
  platform.dashboard.tsx          # # schools, MRR, unpaid invoices, open tickets
  platform.schools.tsx            # list + create + suspend
  platform.schools.$id.tsx        # detail: features, subscription, billing
  platform.invoices.tsx           # all invoices across schools
  platform.support.tsx            # ticket inbox
  platform.support.$id.tsx        # ticket thread
  platform.plans.tsx              # manage subscription plans
```

The existing root `/` and `/login` continue to serve school portals on `*.erp.smartdev.co.ke`. On `admin.smartdev.co.ke`, `/` redirects to `/platform/login` or `/platform/dashboard`.

## 6. Remove from school super_admin UI

- Delete (or hide behind `is_platform_owner`) the "New school" button on `/admin/schools`.
- Convert `_app/admin/schools.tsx` into a read-only "Your school" settings page (name, motto, logo upload) — single-school view, no list.

## 7. Sidebar feature-gating

`AppSidebar` reads `school_features` for the current school and hides nav items whose feature is off. Routes themselves stay reachable (so a direct URL still works for super_admins) but get a "This module is disabled — contact your platform admin" empty state.

## 8. DNS / Domains

User adds in Lovable: `admin.smartdev.co.ke` as a custom domain. DNS already wildcarded (`*.erp` covers `*.erp.smartdev.co.ke` but NOT `admin.smartdev.co.ke`), so add one more A record: `admin → 185.158.133.1`.

## 9. Out of scope (this phase)

- Auto-billing via M-Pesa/Stripe — manual invoicing only for now.
- Support email ingestion — tickets created in-app only.
- Per-school SMS/email sender domain config — later.

---

## Build order

1. **Migration**: roles, tables, RLS, seed plans, backfill: every existing school gets a `free` subscription and all features enabled.
2. **Routing**: `getSubdomainSlug` + tenant short-circuit + platform layout + login.
3. **Platform pages**: dashboard, schools (move create flow here), school detail (features + billing), invoices, plans, support.
4. **School-side cleanup**: remove "New school" from `_app/admin/schools`, gate sidebar by `school_features`.
5. **Verify**: invoke platform dashboard fn, test feature toggle hides sidebar item, confirm non-platform user gets 403 on `/platform/*`.

---

## Technical notes

- Platform users have NO `school_members` row. `current_user_school()` returns null for them; that's fine — they don't use school-scoped tables.
- `lookup_login_email` already supports nullable school slug — platform login passes null.
- Feature gating is **UX-only**, not security. RLS still controls data access. A toggled-off module just hides nav; the table is still readable by staff with the right role. (Acceptable for v1; can harden later.)
- Existing `meltongraymond1@gmail.com` super_admin will be granted `platform_owner` in the migration so you keep access to everything.
