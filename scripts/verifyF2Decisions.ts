/**
 * @file verifyF2Decisions.ts
 * @description Standards Intelligence F2 (RuleEvaluationEngine + AccountingTreatmentEngine + durable decision) — no-database suite.
 * Part 1: shared suite on InMemoryAdapter (proves decision LOGIC and the adapter contract only).
 * Part 2: static checks on the DDL/RLS/adapter text.
 * It does NOT prove SQL syntax, DB CHECKs, unique keys under concurrency or RLS: run scripts/verifyF2DecisionsPg.ts for that.
 * Run:  npx tsx scripts/verifyF2Decisions.ts   (prints the final "Passed: N | Failed: M" line)
 */
import fs from 'fs';
import { InMemoryAdapter } from '../src/core/storage/adapters/InMemoryAdapter';
import { runF2Suite } from './lib/f2DecisionSuite';
import type { Tally } from './lib/f1StandardsSuite';

const tally: Tally = { pass: 0, fail: 0 };
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { tally.pass++; console.log(`[PASS] ${label}`); } else { tally.fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};

async function main() {
  console.log('--- Part 1: shared F2 suite on InMemoryAdapter ---');
  await runF2Suite(new InMemoryAdapter(), `f2-A-${Date.now()}`, `f2-B-${Date.now()}`, tally);

  console.log('--- Part 2: static checks on the real adapter source ---');
  const src = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');
  const mem = fs.readFileSync('src/core/storage/adapters/InMemoryAdapter.ts', 'utf8');
  const smokes = ['MySQLSmokeAdapter', 'MongoDBSmokeAdapter', 'FirebaseSmokeAdapter'].map(n => fs.readFileSync(`src/core/storage/adapters/${n}.ts`, 'utf8'));
  check('S1 an_accounting_decisions is in the FORCE-RLS tenant table list', /tables text\[\] := ARRAY\[[\s\S]*?'an_accounting_decisions'[\s\S]*?\]/.test(src));
  check('S2 DB-level guards: APPLY needs a rule reference; only APPLY may carry a journal link; (tenant, decision_key) is unique', /CHECK \(decision_status <> 'APPLY' OR \(rule_id IS NOT NULL AND rule_version IS NOT NULL AND standard_id IS NOT NULL\)\)/.test(src) && /CHECK \(journal_entry_id IS NULL OR decision_status = 'APPLY'\)/.test(src) && /UNIQUE \(tenant_id, decision_key\)/.test(src));
  check('S3 decision insert is ON CONFLICT DO NOTHING and the stored row is read back (replay returns the original)', /INSERT INTO an_accounting_decisions[\s\S]*ON CONFLICT \(tenant_id, decision_key\) DO NOTHING/.test(src) && /WHERE tenant_id=\$1 AND decision_key=\$2/.test(src));
  check('S4 journal link UPDATE only fills an empty link on an APPLY decision', /UPDATE an_accounting_decisions SET journal_entry_id=\$3 WHERE tenant_id=\$1 AND id=\$2 AND journal_entry_id IS NULL AND decision_status='APPLY'/.test(src));
  const names = ['saveAccountingDecision', 'getAccountingDecision', 'listAccountingDecisions', 'linkDecisionToJournal'];
  check('S5 adapter parity: all 4 decision methods exist on Postgres, InMemory and the 3 Smoke adapters (smokeOnlyError)', names.every(nm => new RegExp(`${nm}\\(`).test(src) && new RegExp(`${nm}\\(`).test(mem) && smokes.every(s => new RegExp(`${nm}\\([^)]*\\)\\s*\\{\\s*return this\\.smokeOnlyError`).test(s))));
  const eng = fs.readFileSync('src/core/standards/RuleEvaluationEngine.ts', 'utf8') + fs.readFileSync('src/core/standards/AccountingTreatmentEngine.ts', 'utf8') + fs.readFileSync('src/core/standards/StandardsDecisionService.ts', 'utf8');
  const code = eng.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('S6 the decision layer never posts: no PostingEngine / postEntry / draftEntry / journal write in the code (comments excluded)', !/PostingEngine|postEntry|draftEntry|saveJournal|postJournal|appendJournal/.test(code));

  console.log(`\nPassed: ${tally.pass} | Failed: ${tally.fail}`);
  process.exit(tally.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
