/**
 * @file verifyBatteryCoverage.ts
 * @description PH8-CLOSE-1: keeps `npm test` honest. Every scripts/verify*.ts (except the *Pg.ts PostgreSQL gates) must be wired into BATTERIES
 * (scripts/runReconcileAuditB.ts) OR be listed in scripts/lib/batteryExemptions.json with a reason, so a new test can never silently stay outside the audit.
 * Static check only (reads files); it does not run the batteries.   Run: npx tsx scripts/verifyBatteryCoverage.ts
 */
import fs from 'fs';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => { ok ? pass++ : fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${!ok && extra ? ' | ' + extra : ''}`); };

const runner = fs.readFileSync('scripts/runReconcileAuditB.ts', 'utf8');
const entryRe = /\{\s*name:\s*'(\w+)',\s*script:\s*'scripts\/(verify\w+)\.ts'(?:,\s*expected:\s*([^}]+?))?\s*\}/g;
const wired: Array<{ name: string; script: string; expected: string | undefined }> = [];
for (let m = entryRe.exec(runner); m; m = entryRe.exec(runner)) wired.push({ name: m[1], script: m[2], expected: m[3]?.trim() });
const wiredScripts = new Set(wired.map(w => w.script));

let exemptions: Record<string, string> = {};
let exemptionsOk = false;
try { exemptions = JSON.parse(fs.readFileSync('scripts/lib/batteryExemptions.json', 'utf8')).exemptions || {}; exemptionsOk = true; } catch { /* reported below */ }

const all = fs.readdirSync('scripts').filter(f => /^verify\w*\.ts$/.test(f)).map(f => f.replace(/\.ts$/, ''));
const needsCover = all.filter(v => !/Pg$/.test(v));
const uncovered = needsCover.filter(v => !wiredScripts.has(v) && !(v in exemptions));

check('C1 the exemptions file exists and parses', exemptionsOk);
check('C2 every non-PG verify script is wired into BATTERIES or exempted with a reason', uncovered.length === 0, `uncovered (${uncovered.length}): ${uncovered.join(', ')}`);
check('C3 no exemption points at a missing script', Object.keys(exemptions).every(v => all.includes(v)), Object.keys(exemptions).filter(v => !all.includes(v)).join(', '));
check('C4 no script is both wired and exempted', Object.keys(exemptions).every(v => !wiredScripts.has(v)), Object.keys(exemptions).filter(v => wiredScripts.has(v)).join(', '));
check('C5 every exemption has a real reason (>= 20 characters)', Object.values(exemptions).every(r => typeof r === 'string' && r.trim().length >= 20));
check('C6 every wired script file exists and is not empty', wired.every(w => fs.existsSync(`scripts/${w.script}.ts`) && fs.statSync(`scripts/${w.script}.ts`).size > 0), wired.filter(w => !fs.existsSync(`scripts/${w.script}.ts`)).map(w => w.script).join(', '));
check('C7 battery names are unique', new Set(wired.map(w => w.name)).size === wired.length);
check('C8 no wired battery declares an expected count of 0', wired.every(w => !w.expected || !/(^|[^\d])0$/.test(w.expected)));
check('C9 the BATTERIES array was parsed (sanity: at least 30 entries)', wired.length >= 30, `parsed ${wired.length}`);
for (const must of ['verifyFixP1P2pAutopost', 'verifyPh8InvTab', 'verifyPh8Return', 'verifyPh8Reorder', 'verifyInvItemCard', 'verifyInvItemCreate', 'verifyInvMovementsFilter', 'verifyDb1', 'verifyOps1', 'verifyDocSyncFull', 'verifyBatteryCoverage']) {
  const w = wired.find(x => x.script === must);
  check(`C10 ${must} is wired with an expected count`, !!w && !!w.expected, w ? `expected=${w.expected}` : 'not wired');
}

console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
