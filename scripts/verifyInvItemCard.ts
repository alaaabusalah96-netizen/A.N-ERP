/**
 * @file verifyInvItemCard.ts
 * INV-ITEM-CARD — static checks for item card UI + GET item by id.
 * Run: npx tsx scripts/verifyInvItemCard.ts
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  const ui = fs.readFileSync('src/components/InventoryWorkspaceView.tsx', 'utf8');
  const panel = fs.readFileSync('src/components/ItemCardPanel.tsx', 'utf8');
  const server = fs.readFileSync('server.ts', 'utf8');

  check('S1 ItemCardPanel component exists', fs.existsSync('src/components/ItemCardPanel.tsx'));
  check('S2 Workspace imports ItemCardPanel', /ItemCardPanel/.test(ui));
  check('S3 cardItemId state', /cardItemId/.test(ui) && /setCardItemId/.test(ui));
  check('S4 GET /api/inventory/items/:id route', /app\.get\('\/api\/inventory\/items\/:id'/.test(server));
  check('S5 panel tabs info/stock/ledger/prices', /'ledger'/.test(panel) && /'prices'/.test(panel) && /الأرصدة/.test(panel));
  check('S6 panel fetches ledger API', /\/ledger/.test(panel));
  check('S7 panel action صرف واستلام', /صرف/.test(panel) && /استلام/.test(panel));
  check('S8 row opens card setCardItemId', /setCardItemId\(item\.id\)/.test(ui));
  check('S9 shortcuts open issue\/receive modals', /setIsIssueModalOpen\(true\)/.test(ui) && /setIsReceiveModalOpen\(true\)/.test(ui));
  check('S10 Arabic title بطاقة صنف', /بطاقة صنف/.test(panel));

  const st = new InMemoryAdapter();
  const pe = new PostingEngine(st);
  const ne = new NumberingEngine(st);
  const inv = new InventoryService(st, pe, ne);
  const T = `tic-${Date.now()}`;
  const item = await inv.saveStockItem(T, {
    id: `IT-${T}`.slice(0, 40), itemCode: `C-${T}`.slice(0, 16), nameAr: 'صنف بطاقة', category: 'X',
    valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101',
    reorderPoint: 5, minStockLevel: 2, maxStockLevel: 20,
  } as any, `it-${T}`);
  check('R1 saveStockItem works', item.success === true);
  const got = await inv.getStockItem(T, item.data!.id);
  check('R2 getStockItem returns card fields', got.success === true && got.data?.nameAr === 'صنف بطاقة' && Number(got.data?.reorderPoint) === 5);

  const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
  const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));
  check('R3 package INV-ITEM-CARD DONE', byId['INV-ITEM-CARD']?.status === 'DONE');

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
