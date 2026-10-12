/**
 * @file verifyFixC.ts
 * @description FIX-C: type-safe fuzz parser, stale RepairBatch1 assertion removed, custody test arity, and the gate
 * classifier used by `npm test` (a database that cannot be reached is SKIP, never a code FAIL; a skipped critical gate
 * caps the verdict). Pure logic, no database. Prints the final "Passed: N | Failed: M" line.
 * Run:  npx tsx scripts/verifyFixC.ts
 */
import fs from 'fs';
import { parseFuzzIterations, FUZZ_MAX_ITERATIONS } from '../src/core/security/runtimeSecurity';
import { classifyGate, decideVerdict, failsOnlyOnDb } from './lib/gateClassify';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => { if (cond) { pass++; console.log(`[PASS] ${label}`); } else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); } };
const rd = (p: string) => fs.readFileSync(p, 'utf8');

const AUTH = '[FAIL] P1 PG probe failed | password authentication failed for user "postgres"\nPassed: 13 | Failed: 1';
const base = { code: 1, passed: null as number | null, failed: null as number | null };

const ok1 = parseFuzzIterations(250), bad1 = parseFuzzIterations(99999);
check('1 parseFuzzIterations has ONE flat shape: ok/value/max are always readable (valid and invalid)', ok1.ok === true && ok1.value === 250 && ok1.max === FUZZ_MAX_ITERATIONS && bad1.ok === false && bad1.value === 0 && bad1.max === FUZZ_MAX_ITERATIONS);
const rs = rd('src/core/security/runtimeSecurity.ts'), srv = rd('server.ts');
check('2 the type is not a discriminated union (it does not narrow without `strict`) and server.ts uses fz.max / fz.value', !/\{ ok: true; value: number \} \| \{ ok: false; max: number \}/.test(rs) && srv.includes('fz.max') && srv.includes('fz.value'));
check('3 a gate that fails ONLY on "password authentication failed" is SKIP (not run), not a code failure', classifyGate({ ...base, out: AUTH, passed: 13, failed: 1, expected: 14 }) === 'SKIP' && failsOnlyOnDb(AUTH));
const mixed = '[FAIL] P1 PG probe failed | password authentication failed for user "postgres"\n[FAIL] S4 real assertion broke | expected 1 got 2\nPassed: 12 | Failed: 2';
check('4 a real failure next to a DB failure stays FAIL (the DB message must not hide it)', classifyGate({ ...base, out: mixed, passed: 12, failed: 2, expected: 14 }) === 'FAIL' && !failsOnlyOnDb(mixed));
check('5 a plain failing check is FAIL', classifyGate({ ...base, out: '[FAIL] x | boom\nPassed: 3 | Failed: 1', passed: 3, failed: 1 }) === 'FAIL');
check('6 all passed => PASS; a changed passed-count (silently lost tests) => FAIL', classifyGate({ code: 0, out: 'Passed: 27 | Failed: 0', passed: 27, failed: 0, expected: 27 }) === 'PASS' && classifyGate({ code: 0, out: 'Passed: 26 | Failed: 0', passed: 26, failed: 0, expected: 27 }) === 'FAIL');
check('7 PG_NOT_RUN / missing script => SKIP; no summary: exit 0 => PASS, exit != 0 => ERROR', classifyGate({ ...base, code: 3, out: 'PG_NOT_RUN: no connection' }) === 'SKIP' && classifyGate({ ...base, code: 127, out: 'SKIP missing-or-empty x' }) === 'SKIP' && classifyGate({ code: 0, out: 'done', passed: null, failed: null }) === 'PASS' && classifyGate({ code: 1, out: 'crash', passed: null, failed: null }) === 'ERROR');
check('8 verdict: critical failure or open P1 => NO_GO; open P2/config or a SKIPPED critical gate => CONDITIONAL_GO; nothing => GO',
  decideVerdict({ criticalFail: true, openP1: 0, openOther: 0, skippedCritical: 0 }) === 'NO_GO' && decideVerdict({ criticalFail: false, openP1: 1, openOther: 0, skippedCritical: 0 }) === 'NO_GO'
  && decideVerdict({ criticalFail: false, openP1: 0, openOther: 0, skippedCritical: 1 }) === 'CONDITIONAL_GO' && decideVerdict({ criticalFail: false, openP1: 0, openOther: 2, skippedCritical: 0 }) === 'CONDITIONAL_GO'
  && decideVerdict({ criticalFail: false, openP1: 0, openOther: 0, skippedCritical: 0 }) === 'GO');
check('9 DB-unreachable detection: connection refused / unknown database count; a missing relation (a real schema bug) does not', failsOnlyOnDb('[FAIL] a | connect ECONNREFUSED 127.0.0.1:5432') && failsOnlyOnDb('[FAIL] a | database "an_test" does not exist') && !failsOnlyOnDb('[FAIL] a | relation "an_x" does not exist') && !failsOnlyOnDb('Passed: 1 | Failed: 0'));
const runner = rd('scripts/runReconcileAuditB.ts');
check('10 the runner uses the tested classifier and verdict (no inline status logic left)', runner.includes("classifyGate({") && runner.includes('decideVerdict({') && !/status = 'FAIL'/.test(runner) && runner.includes('skippedCritical'));
check('11 verifyRepairBatch1 no longer asserts the old double-refund (updateCashCustody === 1)', !/calls\['updateCashCustody'\] === 1/.test(rd('scripts/verifyRepairBatch1.ts')) && rd('scripts/verifyRepairBatch1.ts').includes("!calls['updateCashCustody'] && calls['reverseCustodyExpenseVoucher'] === 1"));
const fx = rd('scripts/verifyFixP1Custody.ts');
check('12 verifyFixP1Custody builds CashCustodyService with its real 2 constructor arguments', fx.includes('new CashCustodyService(st, pe)') && !fx.includes('new CashCustodyService(st, pe, ne)'));
const reg = JSON.parse(rd('docs/STATE_REGISTER.json'));
check('13 state register: the hardening package is no longer mislabelled "PH9"; FIX-C and its 3 fixed items are recorded', !reg.packages.some((p: any) => p.id === 'PH9') && reg.packages.some((p: any) => p.id === 'P9-HARDENING') && reg.packages.some((p: any) => p.id === 'FIX-C') && ['FIXC-TYPECHECK', 'FIXC-STALE-ASSERTION', 'FIXC-PG-GATES'].every(id => reg.defects.some((d: any) => d.id === id && d.status === 'FIXED')));
check('14 `npm test` runs this gate (expected 14) and the custody gate (expected 9)', /name: 'FixC', script: 'scripts\/verifyFixC\.ts', expected: 14/.test(runner) && /name: 'FixP1Custody', script: 'scripts\/verifyFixP1Custody\.ts', expected: 9/.test(runner));

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
