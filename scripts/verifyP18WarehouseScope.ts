/** Phase 18 SCOPE-001 — warehouse access storage + scope semantics (InMemory). */
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function setup() {
  const st = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const inv = new InventoryService(st, pe, ne);
  const T = `t18-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  // users
  const ahmed = { id: `u-ahmed-${T}`.slice(0, 60), tenantId: T, username: 'ahmed', fullName: 'أحمد', email: 'a@t.com', role: 'warehouse_keeper', status: 'ACTIVE' as const };
  const salem = { id: `u-salem-${T}`.slice(0, 60), tenantId: T, username: 'salem', fullName: 'سالم', email: 's@t.com', role: 'warehouse_keeper', status: 'ACTIVE' as const };
  const admin = { id: `u-admin-${T}`.slice(0, 60), tenantId: T, username: 'admin', fullName: 'مدير', email: 'm@t.com', role: 'admin', status: 'ACTIVE' as const };
  try { await (st as any).saveUser?.(T, ahmed); } catch {}
  // try common saveUser signatures
  try { await (st as any).saveUser(T, ahmed, `su-a-${T}`); } catch { try { await (st as any).createUser?.(ahmed); } catch {} }
  try { await (st as any).saveUser(T, salem, `su-s-${T}`); } catch {}
  try { await (st as any).saveUser(T, admin, `su-m-${T}`); } catch {}
  // if getUser still fails, seed via internal map if accessible
  for (const u of [ahmed, salem, admin]) {
    const g = await st.getUser(T, u.id);
    if (!g.success || !g.data) {
      // force into adapter map
      const map = (st as any).users as Map<string, any> | undefined;
      if (map) map.set(`${T}:${u.id}`, u);
      else if ((st as any).usersById) (st as any).usersById.set(u.id, u);
    }
  }
  const cairo = (await st.saveWarehouse(T, {
    id: `W-CAI-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'CAI', nameAr: 'القاهرة',
    isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString(),
  } as any, `w-cai-${T}`)).data!;
  const giza = (await st.saveWarehouse(T, {
    id: `W-GIZ-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'GIZ', nameAr: 'الجيزة',
    isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString(),
  } as any, `w-giz-${T}`)).data!;
  const item = (await inv.saveStockItem(T, {
    id: `IT-${T}`.slice(0, 60), itemCode: `SKU-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X',
    valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101',
  } as any, `it-${T}`)).data!;
  await inv.receiveStock(T, { warehouseId: cairo.id, idempotencyKey: `r-cai-${T}`, lines: [{ itemId: item.id, quantity: 50, unitCost: 10 }] } as any);
  await inv.receiveStock(T, { warehouseId: giza.id, idempotencyKey: `r-giz-${T}`, lines: [{ itemId: item.id, quantity: 30, unitCost: 10 }] } as any);
  return { st, inv, T, ahmed, salem, admin, cairo, giza, item };
}

/** Simulate getAllowedWarehouseIds semantics */
async function allowedIds(st: InMemoryAdapter, role: string, tenantId: string, userId: string): Promise<Set<string> | null> {
  const exempt = new Set(['super_admin', 'admin', 'platform_admin', 'system_admin', 'auditor']);
  if (exempt.has(role.toLowerCase())) return null;
  const res = await st.listUserWarehouseAccess(tenantId, userId);
  const ids = res.data || [];
  return ids.length === 0 ? null : new Set(ids);
}

async function main() {
  // (ح) storage set/list
  {
    const { st, T, ahmed, cairo, giza } = await setup();
    const empty = await st.listUserWarehouseAccess(T, ahmed.id);
    check('(ح) empty list = no restriction rows', empty.success && (empty.data || []).length === 0);
    const set = await st.setUserWarehouseAccess(T, ahmed.id, [cairo.id], 'admin1', `set-a-${T}`);
    check('(ح) set cairo only', set.success && set.data?.length === 1 && set.data[0] === cairo.id, set.error?.detail || '');
    const listed = await st.listUserWarehouseAccess(T, ahmed.id);
    check('(ح) list returns cairo', listed.success && listed.data?.includes(cairo.id) && !listed.data?.includes(giza.id));
    const badWh = await st.setUserWarehouseAccess(T, ahmed.id, ['NO-WH'], 'admin1', `set-bad-${T}`);
    check('(ح) unknown warehouse 404', !badWh.success && badWh.error?.status === 404);
    const clear = await st.setUserWarehouseAccess(T, ahmed.id, [], 'admin1', `set-clr-${T}`);
    check('(ح) empty array clears restriction', clear.success && (clear.data || []).length === 0);
  }

  // (أ) Ahmed restricted sees only cairo stock
  {
    const { st, inv, T, ahmed, cairo, giza, item } = await setup();
    await st.setUserWarehouseAccess(T, ahmed.id, [cairo.id], 'admin', `set2-${T}`);
    const allowed = await allowedIds(st, 'warehouse_keeper', T, ahmed.id);
    check('(أ) restricted set', allowed !== null && allowed!.has(cairo.id) && !allowed!.has(giza.id));
    const stock = await inv.listWarehouseStock?.(T) ?? await st.listWarehouseStock(T);
    const all = stock.success ? stock.data || [] : [];
    const filtered = allowed === null ? all : all.filter((r: any) => allowed.has(r.warehouseId));
    check('(أ) filtered stock only cairo', filtered.length >= 1 && filtered.every((r: any) => r.warehouseId === cairo.id));
    check('(أ) giza stock excluded', !filtered.some((r: any) => r.warehouseId === giza.id));
  }

  // (ب) query warehouseId=giza while restricted → would 403
  {
    const { st, T, ahmed, cairo, giza } = await setup();
    await st.setUserWarehouseAccess(T, ahmed.id, [cairo.id], 'admin', `set3-${T}`);
    const allowed = await allowedIds(st, 'warehouse_keeper', T, ahmed.id);
    check('(ب) giza query blocked', allowed !== null && !allowed!.has(giza.id));
  }

  // (ج) write to giza blocked; cairo allowed
  {
    const { st, inv, T, ahmed, cairo, giza, item } = await setup();
    await st.setUserWarehouseAccess(T, ahmed.id, [cairo.id], 'admin', `set4-${T}`);
    const allowed = await allowedIds(st, 'warehouse_keeper', T, ahmed.id);
    const canGiza = allowed === null || allowed.has(giza.id);
    const canCairo = allowed === null || allowed.has(cairo.id);
    check('(ج) cannot write giza', !canGiza);
    check('(ج) can write cairo', canCairo);
    // actual receive on cairo still works via service (scope is server-layer)
    const r = await inv.receiveStock(T, { warehouseId: cairo.id, idempotencyKey: `r2-${T}`, lines: [{ itemId: item.id, quantity: 5, unitCost: 10 }] } as any);
    check('(ج) receive cairo succeeds', r.success, r.error?.detail || '');
  }

  // (هـ) salem unrestricted + admin exempt
  {
    const { st, T, salem, admin, cairo, giza } = await setup();
    // salem: no rows
    const aSalem = await allowedIds(st, 'warehouse_keeper', T, salem.id);
    check('(هـ) salem unrestricted (null)', aSalem === null);
    // even if admin has rows, role exempt
    await st.setUserWarehouseAccess(T, admin.id, [cairo.id], 'admin', `set-adm-${T}`);
    const aAdmin = await allowedIds(st, 'admin', T, admin.id);
    check('(هـ) admin exempt despite rows', aAdmin === null);
  }

  // (د) transfer: source restricted vs target allowed
  {
    const { st, T, ahmed, cairo, giza } = await setup();
    await st.setUserWarehouseAccess(T, ahmed.id, [cairo.id], 'admin', `set5-${T}`);
    const allowed = await allowedIds(st, 'warehouse_keeper', T, ahmed.id)!;
    // create from giza → blocked for source
    check('(د) create from giza blocked', !allowed!.has(giza.id));
    // receive at cairo (target) allowed
    check('(د) receive at cairo allowed', allowed!.has(cairo.id));
    // transfer visible if source OR target allowed
    const tr = { sourceWarehouseId: giza.id, targetWarehouseId: cairo.id };
    const visible = allowed!.has(tr.sourceWarehouseId) || allowed!.has(tr.targetWarehouseId);
    check('(د) transfer giz→cai visible to ahmed', visible);
  }

  // (ز) cross-tenant warehouse rejected
  {
    const a = await setup();
    const b = await setup();
    const cross = await a.st.setUserWarehouseAccess(a.T, a.ahmed.id, [b.cairo.id], 'admin', `cross-${a.T}`);
    check('(ز) foreign warehouse 404', !cross.success && cross.error?.status === 404);
  }

  // (ط) no rows → behavior unchanged (unrestricted)
  {
    const { st, T, ahmed, cairo, giza } = await setup();
    const allowed = await allowedIds(st, 'warehouse_keeper', T, ahmed.id);
    check('(ط) no rows = unrestricted', allowed === null);
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
