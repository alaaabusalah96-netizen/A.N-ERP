/**
 * @file verifyP12ApprovalsMem.ts
 * @description Phase 12 (APR-001) — ApprovalEngine + InMemoryAdapter logic checks. NO database needed.
 * Run:  npx tsx scripts/verifyP12ApprovalsMem.ts
 * Proves the engine rules and the InMemory contract. It does NOT prove the PostgreSQL SQL / row lock / HTTP routes.
 */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';
import { ROLE_PERMISSION_MATRIX, hasPermission } from '../src/core/auth/PermissionMatrix';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' | ' + detail : ''}`); };
const T = 'tenant-p12';
const now = () => new Date().toISOString();
const st = (e: any) => e?.error?.status;
const ty = (e: any) => String(e?.error?.type || '').split('/').pop();

async function setup() {
  const store: any = new InMemoryAdapter();
  const engine = new ApprovalEngine(store);
  const mkUser = (id: string, tenantId = T, status = 'ACTIVE', role = 'accountant') => store.saveUser({ id, tenantId, username: id, fullName: id, email: `${id}@x.local`, role, roleTitleAr: role, branchName: 'b', status,
    encryptedPii: '', passwordHash: 'x', twoFactorEnabled: false, requiresPasswordChange: false, createdAt: now() }, `u-${tenantId}-${id}`, true);
  return { store, engine, mkUser };
}
const policy = (steps: any[], extra: any = {}) => ({ id: 'apol-1', tenantId: T, documentType: 'STOCK_ISSUE' as const, mode: 'STEPS' as const, steps, enforceDistinctApprovers: true, isActive: true, version: 1, updatedBy: 'admin', updatedAt: now(), ...extra });
const twoSteps = [
  { label: 'تأكيد الوصول', approverType: 'ROLE', approverRef: 'warehouse_manager', stepKind: 'ARRIVAL_CONFIRM' },
  { label: 'الاعتماد النهائي', approverType: 'USER', approverRef: 'u-final', stepKind: 'FINAL_CONFIRM' },
];
const submit = (engine: any, key: string, docId = 'doc-1') => engine.submitWithPolicy(T, { documentType: 'STOCK_ISSUE', documentId: docId, documentCode: 'ISS-1', initiatorId: 'u-init' }, key);

async function main() {
  // (a) two steps in order
  {
    const { store, engine } = await setup(); await store.saveApprovalPolicy(T, policy(twoSteps), 'p1');
    const s = await submit(engine, 's1'); const id = s.data.request.id;
    const r1 = await engine.approve(T, id, 'u-wm', 'warehouse_manager', 'a1');
    check('(a) first approval keeps the request PENDING and moves to step 2', r1.success && r1.data.status === 'PENDING' && r1.data.currentStep === 2, JSON.stringify(r1.data?.status));
    const r2 = await engine.approve(T, id, 'u-final', 'accountant', 'a2');
    check('(a) second approval completes the request', r2.success && r2.data.status === 'APPROVED' && r2.data.steps.every((x: any) => x.status === 'APPROVED'));
  }
  // (b) wrong role / missing role / wrong user
  {
    const { store, engine } = await setup(); await store.saveApprovalPolicy(T, policy(twoSteps), 'p1');
    const id = (await submit(engine, 's1')).data.request.id;
    const w = await engine.approve(T, id, 'u-acc', 'accountant', 'b1');
    check('(b) wrong role -> 403 role-not-allowed', !w.success && st(w) === 403 && ty(w) === 'role-not-allowed');
    const n = await engine.approve(T, id, 'u-acc', undefined as any, 'b2');
    check('(b) missing role is rejected', !n.success && st(n) === 403);
    await engine.approve(T, id, 'u-wm', 'WAREHOUSE_MANAGER', 'b3');           // case-insensitive role match
    const u = await engine.approve(T, id, 'u-other', 'financial_approver', 'b4');
    check('(b) user other than the assigned one at a USER step -> 403 not-assigned-approver', !u.success && st(u) === 403 && ty(u) === 'not-assigned-approver');
  }
  // (c) separation of duties + distinct approvers
  {
    const { store, engine } = await setup(); await store.saveApprovalPolicy(T, policy(twoSteps), 'p1');
    const id = (await submit(engine, 's1')).data.request.id;
    const own = await engine.approve(T, id, 'u-init', 'warehouse_manager', 'c1');
    check('(c) initiator approving own request -> 403 sod-violation', !own.success && st(own) === 403 && ty(own) === 'sod-violation');
    const twoRoles = [{ label: 'أ', approverType: 'ROLE', approverRef: 'warehouse_manager', stepKind: 'REVIEW' }, { label: 'ب', approverType: 'ROLE', approverRef: 'warehouse_manager', stepKind: 'FINAL_CONFIRM' }];
    await store.saveApprovalPolicy(T, policy(twoRoles, { documentType: 'STOCK_ISSUE' }), 'p2');
    const d1 = (await submit(engine, 's2', 'doc-2')).data.request.id;
    await engine.approve(T, d1, 'u-wm', 'warehouse_manager', 'c2');
    const dup = await engine.approve(T, d1, 'u-wm', 'warehouse_manager', 'c3');
    check('(c) same person on two steps with enforceDistinct -> 403 duplicate-approver', !dup.success && st(dup) === 403 && ty(dup) === 'duplicate-approver');
    await store.saveApprovalPolicy(T, policy(twoRoles, { enforceDistinctApprovers: false }), 'p3');
    const d2 = (await submit(engine, 's3', 'doc-3')).data.request.id;
    await engine.approve(T, d2, 'u-wm', 'warehouse_manager', 'c4');
    const ok2 = await engine.approve(T, d2, 'u-wm', 'warehouse_manager', 'c5');
    check('(c) same person on two steps with enforceDistinct=false -> allowed', ok2.success && ok2.data.status === 'APPROVED');
  }
  // (d) reject
  {
    const { store, engine } = await setup(); await store.saveApprovalPolicy(T, policy(twoSteps), 'p1');
    const id = (await submit(engine, 's1')).data.request.id;
    const noReason = await engine.reject(T, id, 'u-wm', 'warehouse_manager', '  ', 'd1');
    check('(d) reject without a reason -> 400', !noReason.success && st(noReason) === 400);
    const rj = await engine.reject(T, id, 'u-wm', 'warehouse_manager', 'الكمية غير مطابقة', 'd2');
    check('(d) reject with reason -> REJECTED with rejectReason and rejectedStep=1', rj.success && rj.data.status === 'REJECTED' && rj.data.rejectReason === 'الكمية غير مطابقة' && rj.data.rejectedStep === 1);
    const after = await engine.approve(T, id, 'u-final', 'accountant', 'd3');
    check('(d) later steps cannot run after a reject -> 409 request-not-pending', !after.success && st(after) === 409 && ty(after) === 'request-not-pending');
    check('(d) the second step stayed PENDING (not executed)', (await store.getApprovalRequest(T, id)).data.steps[1].status === 'PENDING');
  }
  // (e) concurrent approvals of the same step, different keys
  {
    let ok = true; let detail = '';
    for (let round = 0; round < 20; round++) {
      const { store, engine } = await setup(); await store.saveApprovalPolicy(T, policy(twoSteps, { enforceDistinctApprovers: false }), 'p1');
      const id = (await submit(engine, 's1')).data.request.id;
      const [x, y] = await Promise.all([engine.approve(T, id, 'u-wm1', 'warehouse_manager', `e1-${round}`), engine.approve(T, id, 'u-wm2', 'warehouse_manager', `e2-${round}`)]);
      const wins = [x, y].filter(r => r.success).length;
      const done = (await store.getApprovalRequest(T, id)).data.steps.filter((s: any) => s.status === 'APPROVED').length;
      if (wins !== 1 || done !== 1) { ok = false; detail = `round ${round}: wins=${wins} approvedSteps=${done}`; break; }
    }
    check('(e) two concurrent approvals of the same step (20 rounds): exactly one succeeds, one step advances', ok, detail);
  }
  // (f) DIRECT / no policy / inactive
  {
    const { store, engine } = await setup();
    const none = await submit(engine, 'f0');
    check('(f) no policy -> DIRECT and no request created', none.success && none.data.mode === 'DIRECT' && (await store.listApprovalRequests(T)).data.length === 0);
    await store.saveApprovalPolicy(T, policy([], { mode: 'DIRECT' }), 'p1');
    const dir = await submit(engine, 'f1');
    check('(f) DIRECT policy -> DIRECT, no request', dir.data.mode === 'DIRECT' && (await store.listApprovalRequests(T)).data.length === 0);
    await store.saveApprovalPolicy(T, policy(twoSteps, { isActive: false }), 'p2');
    const inact = await submit(engine, 'f2');
    check('(f) inactive STEPS policy -> DIRECT', inact.data.mode === 'DIRECT');
  }
  // (g) snapshot + one open request per document
  {
    const { store, engine } = await setup(); await store.saveApprovalPolicy(T, policy(twoSteps), 'p1');
    const s1 = await submit(engine, 'g1'); const id = s1.data.request.id;
    await store.saveApprovalPolicy(T, policy([{ label: 'واحدة', approverType: 'ROLE', approverRef: 'auditor', stepKind: 'REVIEW' }]), 'p2');
    const pol = (await store.getApprovalPolicy(T, 'STOCK_ISSUE')).data;
    const cur = (await store.getApprovalRequest(T, id)).data;
    check('(g) editing the policy does not change a running request (2 steps kept) and the policy version increased', cur.steps.length === 2 && pol.version === 2, `steps=${cur.steps.length} version=${pol.version}`);
    const again = await submit(engine, 'g2');
    check('(g) submitting the same document again returns the same open request', again.data.mode === 'STEPS' && again.data.request.id === id);
  }
  // (h) policy validation
  {
    const { store, engine, mkUser } = await setup();
    await mkUser('u-active'); await mkUser('u-susp', T, 'SUSPENDED'); await mkUser('u-foreign', 'tenant-other');
    const v = (over: any) => engine.validatePolicy({ tenantId: T, documentType: 'STOCK_ISSUE', mode: 'STEPS', steps: [{ label: 'خطوة', approverType: 'ROLE', approverRef: 'auditor', stepKind: 'REVIEW' }], enforceDistinctApprovers: true, isActive: true, ...over }, store);
    const step = (over: any) => ({ label: 'خطوة', approverType: 'ROLE', approverRef: 'auditor', stepKind: 'REVIEW', ...over });
    check('(h) valid role policy accepted', (await v({})).success);
    check('(h) valid ACTIVE-user policy accepted', (await v({ steps: [step({ approverType: 'USER', approverRef: 'u-active' })] })).success);
    check('(h) unknown role -> 400', st(await v({ steps: [step({ approverRef: 'no_such_role' })] })) === 400);
    check('(h) user from another tenant -> 400', st(await v({ steps: [step({ approverType: 'USER', approverRef: 'u-foreign' })] })) === 400);
    check('(h) suspended user -> 400', st(await v({ steps: [step({ approverType: 'USER', approverRef: 'u-susp' })] })) === 400);
    check('(h) 11 steps -> 400', st(await v({ steps: Array.from({ length: 11 }, () => step({})) })) === 400);
    check('(h) DIRECT with steps -> 400', st(await v({ mode: 'DIRECT' })) === 400);
    check('(h) STEPS without steps -> 400', st(await v({ steps: [] })) === 400);
    check('(h) bad document type / label too long / bad kind -> 400', st(await v({ documentType: 'X' })) === 400 && st(await v({ steps: [step({ label: 'x'.repeat(81) })] })) === 400 && st(await v({ steps: [step({ stepKind: 'NOPE' })] })) === 400);
  }
  // (i) legacy requests (no approverType) keep the lenient role behavior
  {
    const { store, engine } = await setup();
    const legacy = (id: string, n: number) => ({ id, tenantId: T, documentId: id, documentCode: id, documentType: 'EXPENSE_REQUEST', initiatorId: 'u-init', currentStep: 1,
      steps: Array.from({ length: n }, (_, i) => ({ stepNumber: i + 1, roleRequired: i === 0 ? 'direct_manager' : 'cfo', status: 'PENDING' as const })), status: 'PENDING' as const, createdAt: now() });
    await store.createApprovalRequest(T, legacy('L1', 1), 'l1');
    const a = await engine.executeApproval(T, 'L1', 'u-any', 'li1');
    check('(i) legacy single-step request approved by any non-initiator (no role passed)', a.success && a.data.status === 'APPROVED');
    await store.createApprovalRequest(T, legacy('L2', 2), 'l2');
    const b1 = await engine.executeApproval(T, 'L2', 'u-any', 'li2');
    const b2 = await engine.executeApproval(T, 'L2', 'u-any', 'li3');
    check('(i) legacy two-step request now needs both steps (the bug fix): PENDING then APPROVED', b1.data.status === 'PENDING' && b1.data.currentStep === 2 && b2.data.status === 'APPROVED');
    const own = await engine.executeApproval(T, 'L1b', 'u-init', 'li4');
    check('(i) unknown request -> 404', !own.success && st(own) === 404);
  }
  // (j) inbox
  {
    const { store, engine } = await setup(); await store.saveApprovalPolicy(T, policy(twoSteps), 'p1');
    const id = (await submit(engine, 's1')).data.request.id;
    const wm = (await engine.listInbox(T, 'u-wm', 'warehouse_manager')).data!;
    const init = (await engine.listInbox(T, 'u-init', 'warehouse_manager')).data!;
    const fin = (await engine.listInbox(T, 'u-final', 'accountant')).data!;
    check('(j) step 1 is in the inbox of the role holder only (not the creator, not the step-2 user yet)', wm.length === 1 && wm[0].id === id && init.length === 0 && fin.length === 0);
    await engine.approve(T, id, 'u-wm', 'warehouse_manager', 'j1');
    check('(j) after step 1 the request moves to the step-2 user and leaves the role holder inbox',
      (await engine.listInbox(T, 'u-final', 'accountant')).data!.length === 1 && (await engine.listInbox(T, 'u-wm', 'warehouse_manager')).data!.length === 0);
  }
  // (k) idempotent replay
  {
    const { store, engine } = await setup(); await store.saveApprovalPolicy(T, policy(twoSteps), 'p1');
    const id = (await submit(engine, 's1')).data.request.id;
    const r1 = await engine.approve(T, id, 'u-wm', 'warehouse_manager', 'same');
    const r2 = await engine.approve(T, id, 'u-wm', 'warehouse_manager', 'same');
    const done = (await store.getApprovalRequest(T, id)).data.steps.filter((s: any) => s.status === 'APPROVED').length;
    check('(k) replay of the same key returns the same result and does not advance again', r1.success && r2.success && done === 1 && r2.data.currentStep === r1.data.currentStep);
  }
  // (l) cross-tenant isolation + permission
  {
    const { store, engine } = await setup(); await store.saveApprovalPolicy(T, policy(twoSteps), 'p1');
    const id = (await submit(engine, 's1')).data.request.id;
    const other = await engine.approve('tenant-other', id, 'u-wm', 'warehouse_manager', 'x1');
    check('(l) another tenant cannot touch the request (404)', !other.success && st(other) === 404);
    const holders = Object.keys(ROLE_PERMISSION_MATRIX).filter(r => hasPermission(r, 'APPROVAL_POLICY_MANAGE')).sort().join(',');
    check('(l) APPROVAL_POLICY_MANAGE is held by exactly super_admin, admin, platform_admin, system_admin', holders === 'admin,platform_admin,super_admin,system_admin', holders);
  }
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
