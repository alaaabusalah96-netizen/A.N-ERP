import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}
const root = process.cwd();
const read = (p: string) => (fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), 'utf8') : '');

async function main() {
  const lib = read('src/lib/anInventoryPilot.ts');
  const route = read('src/lib/anInventoryPilotRoute.ts');
  const server = read('server.ts');
  const envEx = read('.env.example');
  const doc = read('docs/ops/AN-INV-PILOT-1.md');

  check('P1 anInventoryPilot.ts + route module exist', !!lib && !!route);
  check('P2 exports postPilotMovement + isPilotWritesEnabled', lib.includes('export async function postPilotMovement') && lib.includes('export function isPilotWritesEnabled'));
  check('P3 flag AN_INV_PILOT_WRITES gated in lib', lib.includes('AN_INV_PILOT_WRITES'));
  check('P4 .env.example has AN_INV_PILOT_WRITES=0', /^AN_INV_PILOT_WRITES=0\s*$/m.test(envEx));
  check('P5 route POST /api/an/inventory/pilot/movement', route.includes("app.post('/api/an/inventory/pilot/movement'"));
  check(
    'P6 route security chain (operator, scope, fail-closed, requireLoaded, idempotency)',
    route.includes('requireOperator') &&
      route.includes('assertCompanyScope') &&
      route.includes('adapter_company_load_failed') &&
      route.includes('requireLoaded: true') &&
      route.includes('requireIdempotencyKey')
  );
  check('P7 server.ts mounts anInventoryPilotRoute', server.includes('anInventoryPilotRoute') && server.includes('mountAnInventoryPilotRoute'));
  check('P8 atomic post with allowNegative false', lib.includes('postStockDocumentAtomic') && lib.includes('allowNegative: false'));
  check('P9 no getPrimaryAdapter in pilot files', !lib.includes('getPrimaryAdapter') && !route.includes('getPrimaryAdapter'));
  check('P10 doc AN-INV-PILOT-1.md present with MERGE row text', doc.includes('INV-PILOT1'));
  check('P11 existing gates intact (requireAnMigrateOperator, AN_MIGRATE_WRITES, idempotency_key_required)', server.includes('requireAnMigrateOperator') && read('src/lib/anMigrateInventoryWrite.ts').includes('AN_MIGRATE_WRITES') && read('src/lib/anMigrateIdempotency.ts').includes('idempotency_key_required'));

  const mod: any = await import(path.join(root, 'src/lib/anInventoryPilot.ts'));
  const boom: any = new Proxy({}, { get: () => { throw new Error('adapter must not be touched'); } });
  let touched = false;
  try {
    const r = await mod.postPilotMovement(boom, { input: { companyId: 'c1', warehouseId: 'w', itemId: 'i', movementType: 'RECEIPT', quantity: 1 }, batchIdempotencyKey: 'k1', env: {} });
    check('P12 flag off => 403 pilot_writes_disabled, adapter untouched', r.httpStatus === 403 && r.code === 'pilot_writes_disabled' && r.writesPerformed === false);
  } catch {
    touched = true;
    check('P12 flag off => 403 pilot_writes_disabled, adapter untouched', false, 'adapter was touched');
  }
  const on = { AN_INV_PILOT_WRITES: '1' } as any;
  const bad1 = await mod.postPilotMovement(boom, { input: { companyId: 'c1', warehouseId: 'w', itemId: 'i', movementType: 'RECEIPT', quantity: -2 }, batchIdempotencyKey: 'k2', env: on });
  const bad2 = await mod.postPilotMovement(boom, { input: { companyId: 'c1', warehouseId: 'w', itemId: 'i', movementType: 'TRANSFER_IN', quantity: 2 }, batchIdempotencyKey: 'k3', env: on });
  check('P13 invalid quantity / movementType => 400 before any adapter call', bad1.httpStatus === 400 && bad1.code === 'invalid_quantity' && bad2.httpStatus === 400 && bad2.code === 'invalid_movement_type' && !touched);

  // in-memory adapter: RECEIPT, replay, ISSUE ok, ISSUE insufficient
  const docs = new Map<string, any>();
  let qty = 0;
  const fake: any = {
    getStockDocument: async (_t: string, id: string) => ({ success: true, data: docs.get(id) || null }),
    getWarehouse: async () => ({ success: true, data: { id: 'w', nameAr: 'مخزن', isActive: true } }),
    getStockItem: async () => ({ success: true, data: { id: 'i', itemCode: 'I1', nameAr: 'صنف', uom: 'pc', averageCost: 5, isActive: true } }),
    getWarehouseStock: async () => ({ success: true, data: { currentQty: qty, availableQty: qty, averageCost: 5 } }),
    postStockDocumentAtomic: async (_t: string, input: any) => {
      const d = input.doc;
      qty += d.documentType === 'RECEIPT' ? d.totalQuantity : -d.totalQuantity;
      docs.set(d.id, d);
      return { success: true, data: d };
    },
  };
  const mk = (type: string, q: number, key: string) => mod.postPilotMovement(fake, { input: { companyId: 'c1', warehouseId: 'w', itemId: 'i', movementType: type, quantity: q, unitCost: 5 }, batchIdempotencyKey: key, env: on });
  const r1 = await mk('RECEIPT', 10, 'ka');
  const r1b = await mk('RECEIPT', 10, 'ka');
  const r2 = await mk('ISSUE', 4, 'kb');
  const r3 = await mk('ISSUE', 99, 'kc');
  check(
    'P14 RECEIPT posts once, replay is idempotent, ISSUE ok, over-issue 422',
    r1.ok && r1.writesPerformed && r1.balanceAfterQty === 10 && r1b.ok && r1b.code === 'idempotent_replay' && !r1b.writesPerformed && qty === 6 && r2.ok && r2.balanceAfterQty === 6 && r3.httpStatus === 422 && r3.code === 'insufficient_stock'
  );

  console.log(`Passed: ${passed} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => {
  console.log('[FAIL] verify crashed —', e?.message || e);
  process.exit(1);
});
