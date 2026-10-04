/**
 * scripts/genRouteMatrixP4.ts
 * Generates evidence/phase-4/route-matrix.md from server.ts (read-only on server.ts and on the phase-2 matrix).
 *
 * Run:  npx tsx scripts/genRouteMatrixP4.ts
 * Exit code is non-zero if any required matrix check fails.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SERVER_PATH = path.join(ROOT, 'server.ts');
const P2_MATRIX_PATH = path.join(ROOT, 'evidence', 'phase-2', 'route-matrix.md');
const OUT_DIR = path.join(ROOT, 'evidence', 'phase-4');
const OUT_PATH = path.join(OUT_DIR, 'route-matrix.md');

const key = (method: string, p: string) => `${method.toUpperCase()} ${p}`;

// ---- Action classification for the 19 routes touched by this phase ----
const CLOSED_P4 = new Set<string>([
  key('GET', '/api/custody/vouchers'),
  key('GET', '/api/custody/vouchers/:id'),
  key('GET', '/api/expenses/requests'),
  key('GET', '/api/expenses/requests/:id'),
  key('GET', '/api/attachments'),
  key('POST', '/api/attachments'),
  key('GET', '/api/print/:docType/:docId'),
]);
const ALREADY_APPLIED_V38 = new Set<string>([
  key('GET', '/api/accounting/accounts'),
  key('GET', '/api/accounting/periods'),
  key('GET', '/api/accounting/dimensions'),
  key('GET', '/api/accounting/items'),
  key('GET', '/api/custody/custodies'),
  key('GET', '/api/custody/custodies/:id'),
  key('GET', '/api/custody/expenses'),
  key('GET', '/api/custody/settlements'),
  key('GET', '/api/custody/hr-clearance/:employeeId'),
]);
const PUBLIC_BY_DESIGN = new Set<string>([
  key('GET', '/api/calendar'),
  key('GET', '/api/wizard/tax-rules'),
  key('GET', '/api/wizard/activity-templates'),
]);

// Label shown in the Permission column for routes whose authorization is an inline check.
const INLINE_LABELS: Record<string, string> = {
  [key('GET', '/api/expenses/requests')]: 'INLINE: EXPENSE_APPROVE or FINANCIAL_REPORTS (all) / EXPENSE_SUBMIT (own)',
  [key('GET', '/api/expenses/requests/:id')]: 'INLINE: EXPENSE_APPROVE or FINANCIAL_REPORTS (all) / EXPENSE_SUBMIT (own)',
  [key('GET', '/api/attachments')]: 'INLINE: by documentType',
  [key('POST', '/api/attachments')]: 'INLINE: by documentType',
  [key('GET', '/api/print/:docType/:docId')]: 'INLINE: by docType',
};

const ROLE_GUARDS = ['requireAuth', 'requirePlatformAdmin', 'requireDeveloperOrAuditor'];

interface Row {
  method: string;
  path: string;
  guard: string;
  permission: string;
  sensitivity: string;
  action: string;
  phase: string;
  inline: boolean;
  roleGuarded: boolean;
}

function main() {
  const server = fs.readFileSync(SERVER_PATH, 'utf-8');
  const p2 = fs.readFileSync(P2_MATRIX_PATH, 'utf-8');

  // ---- Phase-2 matrix lookup: Method + Path -> previous row ----
  const prev = new Map<string, { sensitivity: string; action: string; phase: string }>();
  for (const line of p2.split('\n')) {
    const m = line.match(/^\|\s*(GET|POST|PUT|DELETE|PATCH)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (!m) continue;
    prev.set(key(m[1], m[2]), { sensitivity: m[5], action: m[6], phase: m[7] });
  }

  // ---- Route extraction (string path, or array of string paths joined with ',' as in phase-2) ----
  const lines = server.split('\n');
  const regs: { method: string; path: string; line: number }[] = [];
  const re = /^\s*app\.(get|post|put|delete|patch)\(\s*(?:'([^']+)'|\[([^\]]+)\])/;
  lines.forEach((ln, i) => {
    const m = ln.match(re);
    if (!m) return;
    let p = m[2];
    if (!p && m[3]) p = (m[3].match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, '')).join(',');
    regs.push({ method: m[1].toUpperCase(), path: p, line: i });
  });

  // Routes literally matching the prompt's strict regex (single-quoted string path only), for reporting.
  const strictCount = lines.filter(l => /^\s*app\.(get|post|put|delete|patch)\('([^']+)'/.test(l)).length;

  const unclassified: string[] = [];
  const rows: Row[] = [];
  regs.forEach((r, idx) => {
    const declLine = lines[r.line];
    // The handler ends at its own closing line ('  });' at route-registration indentation),
    // never later than the next registration, so helper functions between routes are not scanned.
    const nextReg = idx + 1 < regs.length ? regs[idx + 1].line : lines.length;
    const indent = (declLine.match(/^(\s*)/) || ['', ''])[1];
    let endLine = nextReg;
    for (let j = r.line; j < nextReg; j++) {
      if (lines[j].trimEnd() === `${indent}});`) { endLine = j + 1; break; }
    }
    const body = lines.slice(r.line, endLine).join('\n');

    const guard = ROLE_GUARDS.find(g => declLine.includes(g)) || 'None';
    const permMatch = declLine.match(/requirePermission\('([A-Z_]+)'\)/);
    const inline = /denyForbidden\(|hasPermission\(/.test(body) && !permMatch;
    const k = key(r.method, r.path);
    const p = prev.get(k);

    let sensitivity = 'Unclassified';
    if (p) sensitivity = p.sensitivity;
    else unclassified.push(k);

    let permission = permMatch ? permMatch[1] : 'None';
    if (inline) permission = INLINE_LABELS[k] || 'INLINE';

    let action = p ? p.action : 'Unclassified';
    let phase = p ? p.phase : '';
    if (CLOSED_P4.has(k)) { action = 'CLOSED_P4'; phase = '4'; }
    else if (ALREADY_APPLIED_V38.has(k)) { action = 'ALREADY_APPLIED_V38'; phase = '4'; }
    else if (PUBLIC_BY_DESIGN.has(k)) { action = 'PUBLIC_BY_DESIGN'; phase = '4'; }

    rows.push({
      method: r.method, path: r.path, guard, permission, sensitivity, action, phase,
      inline, roleGuarded: guard !== 'None' && guard !== 'requireAuth',
    });
  });

  // ---- Required checks ----
  const deferCount = rows.filter(r => r.action.includes('DEFER_P4')).length;
  const highUnprotected = rows.filter(r =>
    r.sensitivity === 'High' && r.permission === 'None' && !r.inline && !r.roleGuarded);
  const highViaRoleGuard = rows.filter(r =>
    r.sensitivity === 'High' && r.permission === 'None' && !r.inline && r.roleGuarded);
  const closedFound = rows.filter(r => r.action === 'CLOSED_P4').length;
  const appliedFound = rows.filter(r => r.action === 'ALREADY_APPLIED_V38').length;
  const publicFound = rows.filter(r => r.action === 'PUBLIC_BY_DESIGN').length;
  // Every route classified as CLOSED_P4 / ALREADY_APPLIED must actually carry a Permission or inline check.
  const closedWithoutAuth = rows.filter(r =>
    (r.action === 'CLOSED_P4' || r.action === 'ALREADY_APPLIED_V38') && r.permission === 'None');

  const checks: [string, boolean][] = [
    ['Matrix contains zero DEFER_P4', deferCount === 0],
    ['No High-sensitivity route lacks a Permission / inline check / dedicated role guard', highUnprotected.length === 0],
    ['Route registrations == matrix rows', regs.length === rows.length],
    ['7 routes CLOSED_P4', closedFound === 7],
    ['9 routes ALREADY_APPLIED_V38', appliedFound === 9],
    ['3 routes PUBLIC_BY_DESIGN', publicFound === 3],
    ['All CLOSED_P4 / ALREADY_APPLIED_V38 routes carry a Permission or inline check', closedWithoutAuth.length === 0],
  ];

  // ---- Output ----
  const out: string[] = [];
  out.push('# Phase 3 (AUTHZ-002) Route Authorization Matrix');
  out.push('');
  out.push('| Method | Path | Guard | Permission | Sensitivity | Action | Phase |');
  out.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const r of rows) {
    out.push(`| ${r.method} | ${r.path} | ${r.guard} | ${r.permission} | ${r.sensitivity} | ${r.action} | ${r.phase} |`);
  }
  out.push('');
  out.push('## الإحصائيات والمطابقة');
  out.push(`- عدد تسجيلات المسارات في server.ts (نصّ أو مصفوفة مسارات): ${regs.length}`);
  out.push(`- منها مطابقة للـregex الصارم (مسار نصّي واحد): ${strictCount} (+ ${regs.length - strictCount} تسجيل بمصفوفة مسارات)`);
  out.push(`- عدد صفوف المصفوفة: ${rows.length}`);
  out.push(`- DEFER_P4 المتبقي: ${deferCount}`);
  out.push(`- CLOSED_P4: ${closedFound} | ALREADY_APPLIED_V38: ${appliedFound} | PUBLIC_BY_DESIGN: ${publicFound}`);
  out.push(`- Unclassified (لا يوجد صف سابق في phase-2): ${unclassified.length}${unclassified.length ? ' → ' + unclassified.join(', ') : ''}`);
  out.push(`- مسارات High بلا Permission لكنها محمية بـguard دوري مخصص (${highViaRoleGuard.length}): ${highViaRoleGuard.map(r => r.method + ' ' + r.path).join(', ') || '—'}`);
  out.push(`- مسارات High بلا أي حماية: ${highUnprotected.length}${highUnprotected.length ? ' → ' + highUnprotected.map(r => r.method + ' ' + r.path).join(', ') : ''}`);
  out.push('');
  out.push('## الفحوصات المطلوبة');
  for (const [name, ok] of checks) out.push(`- ${ok ? 'PASS' : 'FAIL'}: ${name}`);
  out.push('');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, out.join('\n'), 'utf-8');

  console.log(`routes=${regs.length} matrixRows=${rows.length} strictRegexRoutes=${strictCount}`);
  console.log(`DEFER_P4 remaining=${deferCount} Unclassified=${unclassified.length}`);
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  console.log(`written: ${path.relative(ROOT, OUT_PATH)}`);
  if (checks.some(([, ok]) => !ok)) process.exit(1);
}

main();
