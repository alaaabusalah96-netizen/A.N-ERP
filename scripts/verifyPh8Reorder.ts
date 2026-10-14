/**
 * @file verifyPh8Reorder.ts
 * PH8-REORDER — auto PR from reorder point (InMemory + static).
 * Run: npx tsx scripts/verifyPh8Reorder.ts
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PurchasingService } from '../src/core/purchasing/PurchasingService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';
import { DomainEventBus } from '../src/core/events/DomainEventBus';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function setup() {
  const st = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const inv = new InventoryService(st, pe, ne);
  const appr = new ApprovalEngine(st);
  const svc = new PurchasingService(st, appr, ne, inv);
  const T = `tro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  for (const c of [
    { code: '1105', type: 'ASSET' }, { code: '5101', type: 'EXPENSE' },
  ] as const) {
    await st.saveAccount(T, { code: c.code, tenantId: T, nameAr: c.code, type: c.type as any, isActive: true, debitBalance: 0, creditBalance: 0, balance: 0 }, `a-${c.code}-${T}`);
  }
  await inv.saveStockAccountingConfig(T, { autoPostEnabled: false }, 'u', `cfg-${T}`);
  const wh = await st.saveWarehouse(T, {
    id: `W-${T}`.slice(0, 60), tenantId: T, companyId: T, code: 'W1', nameAr: 'رئيسي', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString(),
  } as any, `wh-${T}`);
  const item = await inv.saveStockItem(T, {
    id: `IT-${T}`.slice(0, 60), itemCode: `SKU-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE',
    inventoryAccountCode: '1105', cogsAccountCode: '5101', reorderPoint: 20, maxStockLevel: 50, minStockLevel: 5,
  } as any, `it-${T}`);
  return { st, inv, svc, T, wh: wh.data!, item: item.data! };
}

async function main() {
  const ui = fs.readFileSync('src/components/PurchasingWorkspaceView.tsx', 'utf8');
  const server = fs.readFileSync('server.ts', 'utf8');
  const svcSrc = fs.readFileSync('src/core/purchasing/PurchasingService.ts', 'utf8');
  const invSrc = fs.readFileSync('src/core/inventory/InventoryService.ts', 'utf8');

  check('S1 generatePurchaseRequestsFromReorder in service', /generatePurchaseRequestsFromReorder/.test(svcSrc));
  check('S2 POST /api/purchasing/reorder/generate', /app\.post\('\/api\/purchasing\/reorder\/generate'/.test(server));
  check('S3 UI button توليد من إعادة الطلب', /توليد من إعادة الطلب/.test(ui) && /generateFromReorder/.test(ui));
  check('S4 Inventory publishes REORDER_POINT_REACHED', /REORDER_POINT_REACHED/.test(invSrc) && /DomainEventBus\.publish/.test(invSrc));
  check('S5 PURCHASE_MANAGE on generate route', /reorder\/generate'[\s\S]{0,120}PURCHASE_MANAGE/.test(server));

  {
    const { inv, svc, T, wh, item } = await setup();
    // receive some stock below reorder (15 <= 20)
    const recv = await inv.receiveStock(T, {
      warehouseId: wh.id,
      lines: [{ itemId: item.id, quantity: 15, unitCost: 10 }],
      performedBy: 'u',
      performedByName: 'u',
      idempotencyKey: `recv-${T}`,
    } as any);
    check('R1 seed stock 15', recv.success === true, JSON.stringify(recv.error || {}));

    const dry = await svc.generatePurchaseRequestsFromReorder(T, {
      requestedBy: 'buyer', idempotencyKey: `dry-${T}`, dryRun: true,
    });
    check('R2 dryRun candidates >=1', dry.success === true && (dry.data?.candidates.length || 0) >= 1);
    check('R3 dryRun creates nothing', (dry.data?.created.length || 0) === 0);

    const gen = await svc.generatePurchaseRequestsFromReorder(T, {
      requestedBy: 'buyer', idempotencyKey: `gen-${T}`,
    });
    check('R4 generate creates PR', gen.success === true && (gen.data?.created.length || 0) >= 1, JSON.stringify(gen.error || gen.data || {}));
    const qty = gen.data?.created[0]?.quantity;
    check('R5 suggested qty toward maxStock (50-15=35)', qty === 35, `qty=${qty}`);

    const gen2 = await svc.generatePurchaseRequestsFromReorder(T, {
      requestedBy: 'buyer', idempotencyKey: `gen2-${T}`,
    });
    check('R6 second run skips open PR', gen2.success === true && (gen2.data?.skipped || []).some((x) => x.reason === 'open-pr-exists'));
  }

  {
    // event on issue when crossing reorder
    const { inv, T, wh, item } = await setup();
    await inv.receiveStock(T, {
      warehouseId: wh.id,
      lines: [{ itemId: item.id, quantity: 25, unitCost: 5 }],
      performedBy: 'u', performedByName: 'u', idempotencyKey: `r0-${T}`,
    } as any);
    let saw: boolean = false;
    const unsub = DomainEventBus.subscribe('REORDER_POINT_REACHED', () => { saw = true; });
    const iss = await inv.issueStock(T, {
      warehouseId: wh.id,
      lines: [{ itemId: item.id, quantity: 10 }],
      performedBy: 'u', performedByName: 'u', idempotencyKey: `iss-${T}`,
    } as any);
    unsub();
    // 25-10=15 <= reorder 20 → event
    check('R7 issue below reorder publishes event', iss.success === true && saw, `success=${iss.success} saw=${saw}`);
  }

  const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
  const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
  check('R8 package PH8-REORDER DONE', byId['PH8-REORDER']?.status === 'DONE');
  check('R9 PH8-REMAINDER CLOSED or DONE', byId['PH8-REMAINDER']?.status === 'DONE' || byId['PH8-REMAINDER']?.status === 'CLOSED');

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
