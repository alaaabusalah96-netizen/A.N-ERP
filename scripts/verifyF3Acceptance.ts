/**
 * @file verifyF3Acceptance.ts
 * @description Standards Intelligence F3b — acceptance suite on InMemory (LOGIC + static checks only) for Foundation §23.
 * It does NOT prove PostgreSQL SQL, atomic links under real transactions or RLS: run scripts/verifyF3AcceptancePg.ts for that.
 * All rules are ZZ-F3B-* test fixtures, not official accounting content.
 * Run:  npx tsx scripts/verifyF3Acceptance.ts | tail -1   (prints "Passed: N | Failed: M")
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { runF3Suite } from './lib/f3AcceptanceSuite';
import type { Tally } from './lib/f1StandardsSuite';

const tally: Tally = { pass: 0, fail: 0 };
const check = (label: string, cond: boolean, extra = '') => { if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); } };
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

async function main() {
  console.log('--- Part 1: acceptance suite (Foundation §23) on InMemoryAdapter ---');
  await runF3Suite(new InMemoryAdapter(), `f3-A-${Date.now()}`, `f3-B-${Date.now()}`, tally);

  console.log('--- Part 2: static checks ---');
  const dec = ['RuleEvaluationEngine', 'AccountingTreatmentEngine', 'StandardsDecisionService', 'RuleExplanationService'].map(n => strip(fs.readFileSync(`src/core/standards/${n}.ts`, 'utf8'))).join('\n');
  check('S1 the decision + explanation layers never post or write journals (no PostingEngine/postEntry/draftEntry/journal write in code, comments excluded)', !/PostingEngine|postEntry|draftEntry|saveJournal|postJournal|createJournalEntry/.test(dec));
  const br = strip(fs.readFileSync('src/core/standards/DecisionPostingBridge.ts', 'utf8'));
  check('S2 the bridge posts ONLY through PostingEngine.draftEntry/postEntry (no direct storage journal write)', /posting\.draftEntry/.test(br) && /posting\.postEntry/.test(br) && !/st\.(createJournalEntry|postJournalEntry|saveJournal)/.test(br));
  const pe = fs.readFileSync('src/core/engines/PostingEngine.ts', 'utf8');
  check('S3 PostingEngine does not import anything from the standards layer (the layer decides, PostingEngine posts)', !/standards/.test(pe));
  const srv = fs.readFileSync('server.ts', 'utf8');
  const routes = (srv.match(/app\.(get|post|put|delete)\('\/api\/standards[^']*'[^)]*\)/g) || []) as string[];
  check('S4 every /api/standards route is GET-only and sits behind requireAuth + requirePermission', routes.length === 3 && routes.every(r => /^app\.get/.test(r) && /requireAuth/.test(r) && /requirePermission/.test(r)), routes.join(' ; '));
  const ex = fs.readFileSync('src/core/standards/RuleExplanationService.ts', 'utf8');
  check('S5 explanation reads only through StoragePort getters with the caller tenantId (no raw SQL / no cross-tenant read)', !/\bpool\b|SELECT |INSERT /.test(strip(ex)) && /getAccountingDecision\(tenantId/.test(ex) && /listAccountingDecisions\(tenantId/.test(ex) && /getJournalEntry\(tenantId/.test(ex));

  console.log(`\nPassed: ${tally.pass} | Failed: ${tally.fail}`);
  process.exit(tally.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
