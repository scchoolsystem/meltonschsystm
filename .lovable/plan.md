&nbsp;

SYSTEM STATUS:

This is a FULL ENTERPRISE SCHOOL ERP (Phases 1–6 core + Phase 7 governance + Intelligence Layer upgrade)

DO NOT RESET OR REBUILD EXISTING SYSTEM

ONLY EXTEND AND UPGRADE

========================================================

PART 1 — CORE ERP (PHASES 1–6 CONFIRMED)

========================================================

Includes fully working modules:

- Authentication (Unique ID + Email login + Setup admin)

- User management (students, staff, parents, roles)

- Academics (classes, subjects, exams, results, report cards)

- Timetable system (clash-free scheduling engine)

- Finance system (fees, invoices, payments, receipts, MPESA hooks)

- Attendance + discipline tracking

- Library system

- Boarding system

- Kitchen system

- Clinic system

- Security system

- Transport system

- Digital ID system (QR + printable cards)

- Parent + Student portals

========================================================

PART 2 — UNIVERSAL GOVERNANCE ENGINE (PHASE 7)

========================================================

A. USER LIFECYCLE SYSTEM

Statuses:

- active

- suspended

- expelled

- transferred

- archived (soft delete only)

Rules:

- NO hard deletes anywhere

- All changes logged in lifecycle_events

- Suspended users cannot log in

- Expelled users are read-only (admin/principal only)

---

B. UNIVERSAL PERMISSION ENGINE

Replace ALL edit logic with:

can_edit(user, resource, field, record)

Role hierarchy:

- super_admin (100)

- principal (90)

- deputy_principal (80)

- academic_master (75)

- exams_admin / bursar (70)

- hod (60)

- senior_teacher (55)

- class_teacher (50)

- subject_teacher (40)

- staff (30)

- student (10)

- parent (5)

Field types:

- editable

- restricted

- locked

Rules:

- locked fields require override ONLY

- no direct bypass anywhere

---

C. OVERRIDE SYSTEM

- Super admin: full override

- Principal: academic + discipline + general override

- Department heads: module-scoped override only

All overrides require:

- reason

- audit log entry (override_log + field_edit_audit)

---

D. AUTO USER CREATION ENGINE

On ANY user creation:

Automatically:

- Generate Unique ID (STU/STF/PAR/ADM/etc.)

- Generate strong password

- Assign role + department/class

- Auto-link parent ↔ student via email/phone match

- If no match → generate Parent Auth Code (PRN-YYYY-XXXXX)

---

E. EMAIL AUTOMATION (FALLBACK SAFE)

- If email system enabled + domain configured:

  send credentials, invoices, receipts automatically

- Else:

  show secure admin popup (fallback mode)

System must NOT depend on email being active.

---

F. PARENT LINKING SYSTEM

Priority:

1. email match

2. phone match

3. parent auth code

4. admin override

---

G. FEES SYSTEM (CLASS-BASED)

- Fees assigned per CLASS, not per student

- Auto-generate invoices on:

  - admission

  - term start

Components:

- tuition

- boarding

- transport

- meals

---

H. PAYMENT AUTOMATION

On payment:

- update invoice status

- generate receipt

- update finance dashboard

- send receipt (if email enabled)

---

I. AUDIT SYSTEM (GLOBAL)

Log ALL:

- edits

- overrides

- payments

- transfers

- suspensions

- role changes

Fields:

user_id, role, action, before, after, timestamp, reason

---

J. SUPER ADMIN RULE

Super admin can:

- see ALL data

- override EVERYTHING

- access ALL logs

- bypass restrictions

========================================================

PART 3 — NEXT BRAIN LAYER (INTELLIGENCE ENGINE)

========================================================

THIS IS THE NEW UPGRADE LAYER ON TOP OF ERP

---

A. SCHOOL INTELLIGENCE CORE

System becomes predictive, not just record-based:

- predicts student performance trends

- detects failing students early

- flags attendance risks

- predicts fee default risk

- detects discipline escalation patterns

---

B. SMART ALERT ENGINE

Auto-generate alerts for:

- declining grades

- unpaid fees risk

- absenteeism spikes

- teacher workload imbalance

- timetable overload conflicts

Alerts go to:

- class teacher

- HOD

- principal

- super admin

---

C. AUTO-DECISION SUPPORT SYSTEM

System suggests:

- class reshuffling for balance

- exam intervention groups

- fee reminder timing optimization

- teacher workload redistribution

Human approves, system suggests.

---

D. ANALYTICS BRAIN DASHBOARD

New super dashboard:

Shows:

- school health score

- academic performance index

- financial stability index

- attendance stability index

- discipline risk index

---

E. ANOMALY DETECTION ENGINE

Flags:

- fake attendance patterns

- suspicious fee edits

- abnormal grade changes

- repeated overrides by same user

- irregular timetable usage

---

F. SMART AUTOMATION TRIGGERS

System auto-runs:

- fee reminders

- report card generation alerts

- performance summaries

- parent notifications

- weekly school report to principal

---

END OF SYSTEM