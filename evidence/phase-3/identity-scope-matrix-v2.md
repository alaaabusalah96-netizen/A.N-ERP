# Phase 4 (IDENT-001) — Identity Scope Matrix v2

## الجداول الثلاثة وأعمدتها

### an_memberships
- id (character varying)
- tenant_id (character varying)
- user_id (character varying)
- status (character varying)
- created_by (character varying)
- created_at (timestamp with time zone)

### an_role_assignments
- id (character varying)
- tenant_id (character varying)
- membership_id (character varying)
- role (character varying)
- status (character varying)
- created_by (character varying)
- created_at (timestamp with time zone)

### an_membership_scopes
- id (character varying)
- tenant_id (character varying)
- membership_id (character varying)
- scope_type (character varying)
- org_node_id (character varying)
- created_at (timestamp with time zone)

## تدفق requireAuth الجديد

1. فحص JWT وانتهاء الصلاحية، ثم تحميل المنشأة (tenant) — دون تغيير.
2. `tokenService.verifyAccessToken` — دون تغيير.
3. `userCheck = getUser(tenantId, sub)`؛ 403 إن لم يوجد المستخدم أو اختلف المستأجر أو حالته ≠ ACTIVE — دون تغيير.
4. **جديد:** `getMembershipContext(tenantId, userId)`؛ 403 `inactive-membership` إن لم توجد عضوية أو حالتها ≠ ACTIVE أو لا دور نشط.
5. `authContext.role` من جدول الأدوار (وليس من التوكن ولا `an_users.role`) + `authContext.scopes`.

## أرقام ما بعد الترحيل (استعلام فعلي)

- DB role: rolbypassrls=true, rolsuper=false
- المستخدمون: 52704
- العضويات: 52704
- الأدوار: 52704
- النطاقات: 52704
- مستخدمون بلا عضوية: 0

## مخرج الاختبارات

```text
==============================================================
  A.N ERP — PHASE 4 (IDENT-001) MEMBERSHIP / ROLE / SCOPE VERIFICATION
==============================================================
DB role: rolbypassrls=true rolsuper=false
[PASS] the three membership tables exist
Post-migration counts: users=52704 memberships=52704 roles=52704 scopes=52704 usersWithoutMembership=0
[PASS] every existing user has a membership (users without membership = 0)
✓ live server started on PORT=3101

--- (أ) seeded users ---
[PASS] seeded admin: membership + active role + scope rows | m=1 r=1 s=1
[PASS] seeded admin: login + /api/auth/me | status=200
[PASS] seeded accountant: membership + active role + scope rows | m=1 r=1 s=1
[PASS] seeded accountant: login + /api/auth/me | status=200
[PASS] seeded warehouse: membership + active role + scope rows | m=1 r=1 s=1
[PASS] seeded warehouse: login + /api/auth/me | status=200

--- (ب) saveUser auto-membership / inactive membership ---
[PASS] saveUser created membership + role + scope automatically | m=1 r=1 s=1
[PASS] new saveUser user can call /api/auth/me | status=200
[PASS] membership deleted -> 403 inactive-membership (an_users.status still ACTIVE) | status=403 an_users.status=ACTIVE

--- (ج) setMembershipStatus ---
[PASS] SUSPENDED -> 403 | status=403
[PASS] back to ACTIVE -> works | status=200
[PASS] setMembershipStatus for unknown user returns false

--- (د) DB is the role authority ---
[PASS] accountant: ENTRY_VIEW route allowed | status=200
[PASS] role switched to warehouse_keeper in DB -> 403 with the OLD token | status=403
[PASS] role restored -> allowed again | status=200

--- (د2) updateUser role synchronization ---
[PASS] updateUser(role=auditor) succeeded
[PASS] active role assignment is now auditor
[PASS] updateUser with the SAME role leaves the directly-managed assignment untouched
[PASS] no duplicate rows after updateUser | m=1 r=1 s=1

--- (هـ) POST /api/users and CompanyWizard ---
[PASS] POST /api/users created a user | status=200
[PASS] API-created user has membership + role + scope | m=1 r=1 s=1
[PASS] API-created user works right after creation | status=200
[PASS] CompanyWizard first admin has membership + role + scope | m=1 r=1 s=1
[PASS] CompanyWizard first admin works right after creation | status=200

--- (و) restart idempotency ---
[FAIL] table counts unchanged across two server restarts | 54991/54991/54991 -> 55424/55424/55424 -> 55424/55424/55424
[PASS] users without membership = 0 after restarts

--- cleanup ---
✓ removed temporary wizard company tenant-1791190924052-3hhx
[PASS] no temporary users left
[PASS] counts returned to the post-migration snapshot | before=52704/52704/52704/52704 after=52704/52704/52704/52704
```

## خارج النطاق

- تصفية البيانات التشغيلية حسب النطاق (تحتاج أعمدة node في الجداول).
- ربط OrgHierarchyService بالمسارات.
- تغيير الدور عبر API (لا يوجد مسار لذلك اليوم).
