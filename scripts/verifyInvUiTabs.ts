/**
 * @file verifyInvUiTabs.ts
 * INV-UI-TABS — dedicated items tab always visible + open item card without stock.
 * Run: npx tsx scripts/verifyInvUiTabs.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

const ui = fs.readFileSync('src/components/InventoryWorkspaceView.tsx', 'utf8');
const reg = JSON.parse(fs.readFileSync('docs/STATE_REGISTER.json', 'utf8'));
const byId = Object.fromEntries((reg.packages || []).map((p: any) => [p.id, p]));

check('S1 activeTab includes items', /useState<'items' \|/.test(ui) || /'items' \| 'stock'/.test(ui));
check('S2 default tab is items', /\('items'\)/.test(ui));
check('S3 tab button الأصناف', /الأصناف \(\{items\.length\}\)/.test(ui) || /الأصناف \(/.test(ui));
check('S4 items panel activeTab === items', /activeTab === 'items'/.test(ui));
check('S5 empty state without items', /لا توجد أصناف معرفة بعد/.test(ui));
check('S6 open card from items list setCardItemId', /setCardItemId\(it\.id\)/.test(ui));
check('S7 itemsSearch filter', /itemsSearch/.test(ui));
check('S8 ItemCardPanel still wired', /ItemCardPanel/.test(ui) && /cardItemId/.test(ui));
check('S9 stock and movements tabs remain', /activeTab === 'stock'/.test(ui) && /activeTab === 'movements'/.test(ui));
check('S10 Package icon used for items tab', /<Package /.test(ui));
check('R1 package INV-UI-TABS DONE', byId['INV-UI-TABS']?.status === 'DONE');
check('R2 INV-ITEM-CARD still DONE', byId['INV-ITEM-CARD']?.status === 'DONE');

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
