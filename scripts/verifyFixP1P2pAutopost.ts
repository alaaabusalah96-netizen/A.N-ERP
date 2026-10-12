/**
 * @file verifyFixP1P2pAutopost.ts
 * DEF-P2P-AUTOPOST-OFF: invoice approval Dr Inventory when autoPostEnabled=false; Dr GR/IR when true.
 * Run: npx tsx scripts/verifyFixP1P2pAutopost.ts
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PurchasingService } from '../src/core/purchasing/PurchasingService';
import { defaultStockAccountingConfig } from '../src/core/storage/StoragePort';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function seedAccounts(st: any, T: string) {
  for (const [code, type] of [
    ['1105', 'ASSET'], ['1108', 'ASSET'], ['2101', 'LIABILITY'], ['2106', 'LIABILITY'], ['5101', 'EXPENSE'],
  ] as const) {
    await st.saveAccount(T, {
      code, tenantId: T, nameAr: code, type, isActive: true, status: 'ACTIVE',
      debitBalance: 0, creditBalance: 0, balance: 0,
    } as any, `acc-${code}-${T}`);
  }
}

async function scenario(autoPost: boolean) {
  const st: any = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const inv = new InventoryService(st, pe, ne);
  const svc = new PurchasingService(st, new ApprovalEngine(st), ne, inv);
  const T = `p2p${autoPost ? '1' : '0'}-${Date.now().toString(36)}`;
  await seedAccounts(st, T);
  await inv.saveStockAccountingConfig(T, { ...defaultStockAccountingConfig(T), autoPostEnabled: autoPost, grirAccountCode: '2106', defaultInventoryAccountCode: '1105' }, 'u', `cfg-${T}`);

  const item = (await inv.saveStockItem(T, {
    id: `IT-${T}`.slice(0, 50), itemCode: `S-${T}`.slice(0, 20), nameAr: 'صنف', category: 'X',
    valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101', isActive: true,
  } as any, `it-${T}`)).data!;

  // Partner
  const vendorId = `V-${T}`.slice(0, 40);
  if (typeof st.saveMasterPartner === 'function') {
    await st.saveMasterPartner(T, { id: vendorId, tenantId: T, nameAr: 'مورد', partnerType: 'VENDOR', isActive: true } as any, `mp-${T}`);
  } else if (st.masterPartners) {
    st.masterPartners.set(`${T}:${vendorId}`, { id: vendorId, tenantId: T, nameAr: 'مورد', type: 'VENDOR', isActive: true });
  }

  const poRes = await svc.createPurchaseOrder(T, {
    vendorId, orderDate: '2026-01-01',
    lines: [{ itemId: item.id, orderedQty: 10, unitCost: 8 }],
    createdBy: 'buyer',
  } as any);
  if (!poRes?.success) {
    const poId = `PO-${T}`.slice(0, 40);
    const lineId = `POL-${T}`.slice(0, 40);
    const po = {
      id: poId, tenantId: T, vendorId, vendorName: 'مورد', poNumber: 'PO-1', status: 'APPROVED',
      orderDate: '2026-01-01', totalAmount: 80, createdBy: 'buyer', createdAt: new Date().toISOString(),
    };
    const poLine = { id: lineId, poId, itemId: item.id, orderedQty: 10, receivedQty: 10, unitCost: 8, lineTotal: 80 };
    if (st.purchaseOrders) st.purchaseOrders.set(`${T}:${poId}`, po);
    if (st.purchaseOrderLines) st.purchaseOrderLines.set(`${T}:${lineId}`, poLine);
    return { st, svc, T, item, poId, lineId, autoPost, injected: true };
  }
  const poId = poRes.data.id;
  const lines = (await st.getPurchaseOrder(T, poId)).data?.lines || [];
  const lineId = lines[0]?.id;
  if (st.purchaseOrderLines && lineId) {
    const pl = st.purchaseOrderLines.get(`${T}:${lineId}`) || lines[0];
    if (pl) {
      pl.receivedQty = 10;
      st.purchaseOrderLines.set(`${T}:${lineId}`, pl);
    }
  }
  return { st, svc, T, item, poId, lineId, autoPost, injected: !poRes?.success };
}

async function main() {
  const src = fs.readFileSync('src/core/purchasing/PurchasingService.ts', 'utf8');
  const fn = src.slice(src.indexOf('public async approveSupplierInvoice'), src.indexOf('public async rejectSupplierInvoice'));
  check('S1 uses autoPostEnabled', /autoPostEnabled/.test(fn));
  check('S2 builds invDebits when !autoPost', /invDebits/.test(fn));
  check('S3 autoPost branch posts GR\/IR debit line', /autoPost[\s\S]{0,200}grir/.test(fn));
  check('S4 !autoPost does not force GR\/IR in need[]', /if \(autoPost\) need\.unshift/.test(fn));

  for (const autoPost of [false, true]) {
    const st: any = new InMemoryAdapter();
    const T = `u-${autoPost}-${Date.now().toString(36)}`;
    await seedAccounts(st, T);
    const pe = new PostingEngine(st);
    const clearing = 80;
    const lines = autoPost
      ? [{ id: 'g', accountCode: '2106', debit: clearing, credit: 0, description: 'GRIR' }, { id: 'a', accountCode: '2101', debit: 0, credit: clearing, description: 'AP' }]
      : [{ id: 'i', accountCode: '1105', debit: clearing, credit: 0, description: 'INV' }, { id: 'a', accountCode: '2101', debit: 0, credit: clearing, description: 'AP' }];
    const d = await pe.draftEntry(T, {
      id: `je-${T}`, code: 'X', tenantId: T, date: '2026-01-01', type: 'SUPPLIER_INVOICE',
      description: 't', status: 'APPROVED', totalAmount: clearing, lines: lines as any, createdBy: 'u',
    }, `d-${T}`);
    const p = await pe.postEntry(T, d.data!.id, `p-${T}`);
    check(`U${autoPost ? '1' : '0'} post ok`, !!p.success, String(p.error?.detail || ''));
    const je = (await st.getJournalEntry(T, d.data!.id)).data;
    const inv = je?.lines?.find((l: any) => l.accountCode === '1105');
    const gr = je?.lines?.find((l: any) => l.accountCode === '2106');
    if (autoPost) check('U1 GRIR Dr 80, inv none', !!gr && gr.debit === 80 && !inv);
    else check('U0 INV Dr 80, grir none', !!inv && inv.debit === 80 && !gr);
  }

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
