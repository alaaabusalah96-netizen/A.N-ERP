/**
 * @file verifyF4StockShadow.ts
 * @description F4 — stock receipt SHADOW integration. InMemory = LOGIC only; PostgreSQL behaviour needs verifyF4StockShadowPg.ts.
 * Run: npx tsx scripts/verifyF4StockShadow.ts | tail -1   (prints "Passed: N | Failed: M")
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { runF4Suite } from './lib/f4StockShadowSuite';
import type { Tally } from './lib/f1StandardsSuite';

const tally: Tally = { pass: 0, fail: 0 };
const check = (label: string, cond: boolean, extra = '') => { if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); } };
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

async function main() {
  console.log('--- Part 1: F4 suite on InMemoryAdapter ---');
  await runF4Suite(new InMemoryAdapter(), `f4-A-${Date.now()}`, `f4-B-${Date.now()}`, tally);
  console.log('--- Part 2: static checks ---');
  const sa = strip(fs.readFileSync('src/core/inventory/StockAccountingService.ts', 'utf8'));
  const hooks = sa.match(/new StockStandardsShadow\(/g) || [];
  check('S1 exactly one hook in StockAccountingService, inside a try/catch, only for mode RECEIPT, after the legacy posting is complete', hooks.length === 1 && /if \(mode === 'RECEIPT'\) \{ try \{ await new StockStandardsShadow/.test(sa) && sa.indexOf("setStockDocumentJournal(tenantId, doc.id, posted.data.id, 'POSTED')") < sa.indexOf('new StockStandardsShadow('));
  const sh = strip(fs.readFileSync('src/core/standards/StockStandardsShadow.ts', 'utf8'));
  check('S2 the shadow class never posts or writes journals (no PostingEngine/draftEntry/postEntry/saveJournal/postJournal/createJournalEntry/setStockDocumentJournal) and its whole body is guarded by try/catch', !/PostingEngine|draftEntry|postEntry|saveJournal|postJournal|createJournalEntry|setStockDocumentJournal/.test(sh) && /\} catch \(e: any\) \{\s*return \{ observed: false, reason: 'ERROR'/.test(sh));
  const inv = strip(fs.readFileSync('src/core/inventory/InventoryService.ts', 'utf8'));
  check('S3 InventoryService is untouched by F4 (no reference to the standards layer)', !/standards\//.test(inv));
  console.log(`\nPassed: ${tally.pass} | Failed: ${tally.fail}`);
  process.exit(tally.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
