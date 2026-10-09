/**
 * @file verifyPgDateMapping.ts
 * @description 8c-FIX part 4 — DATE columns from node-postgres (Date at local midnight) must become the right YYYY-MM-DD in every timezone.
 * Also checks that no mapper in the PostgreSQL adapter still uses the broken String(row.<date>).slice(0, 10) pattern.
 * Run: npx tsx scripts/verifyPgDateMapping.ts | tail -1
 */
import fs from 'fs';
import { pgDateToYmd } from '../src/core/storage/pgDate';
let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => { if (cond) { pass++; console.log(`[PASS] ${label}`); } else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); } };
const oldWay = (d: Date) => d.toISOString().slice(0, 10);

for (const tz of ['UTC', 'Africa/Cairo', 'Asia/Riyadh', 'America/Los_Angeles', 'Asia/Tokyo']) {
  process.env.TZ = tz;
  const d = new Date(2026, 9, 9); // what node-postgres builds for DATE '2026-10-09': local midnight
  check(`D1 [${tz}] pgDateToYmd(DATE 2026-10-09) = 2026-10-09`, pgDateToYmd(d) === '2026-10-09', pgDateToYmd(d));
  const e = new Date(2026, 0, 1);
  check(`D2 [${tz}] first day of year / month boundary stays correct (2026-01-01)`, pgDateToYmd(e) === '2026-01-01', pgDateToYmd(e));
}
process.env.TZ = 'Africa/Cairo';
check('D3 the toISOString() reading is WRONG ahead of UTC (proves why local parts are needed): Cairo gives 2026-10-08', oldWay(new Date(2026, 9, 9)) === '2026-10-08', oldWay(new Date(2026, 9, 9)));
check('D4 strings pass through (2026-10-09 and 2026-10-09T00:00:00Z -> 2026-10-09)', pgDateToYmd('2026-10-09') === '2026-10-09' && pgDateToYmd('2026-10-09T00:00:00Z') === '2026-10-09');
const src = fs.readFileSync('src/core/storage/adapters/PostgresPrimaryAdapter.ts', 'utf8');
check('D5 the adapter has no String(row.<date column>).slice(0, 10) left for needed_by / quote_date / valid_until / invoice_date / due_date', !/String\(row\.(needed_by|quote_date|valid_until|invoice_date|due_date)\)\.slice\(0, 10\)/.test(src) && !/row\.(invoice_date|due_date)\.toISOString/.test(src));
check('D6 the adapter imports pgDateToYmd', /import \{ pgDateToYmd \} from '\.\.\/pgDate'/.test(src) && (src.match(/pgDateToYmd\(/g) || []).length >= 6);
console.log(`\nPassed: ${pass} | Failed: ${fail}`);
process.exit(fail ? 1 : 0);
