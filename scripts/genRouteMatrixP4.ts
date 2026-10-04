import fs from 'fs';
import path from 'path';

function main() {
  const serverPath = path.resolve('server.ts');
  const phase2MatrixPath = path.resolve('evidence/phase-2/route-matrix.md');
  const outDir = path.resolve('evidence/phase-4');
  const outPath = path.join(outDir, 'route-matrix.md');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const phase2Content = fs.readFileSync(phase2MatrixPath, 'utf8');
  const phase2Lines = phase2Content.split('\n');

  // Parse phase-2 matrix map: key = `${method} ${routePath}`
  const phase2Map = new Map<string, {
    method: string;
    path: string;
    guard: string;
    permission: string;
    sensitivity: string;
    action: string;
    phase: string;
  }>();

  for (const line of phase2Lines) {
    if (!line.startsWith('|') || line.includes(':---') || line.includes('Method | Path')) {
      continue;
    }
    const cols = line.split('|').map((s) => s.trim()).filter(Boolean);
    if (cols.length >= 7) {
      const [method, p, guard, permission, sensitivity, action, phase] = cols;
      phase2Map.set(`${method} ${p}`, {
        method,
        path: p,
        guard,
        permission,
        sensitivity,
        action,
        phase,
      });
    }
  }

  const serverContent = fs.readFileSync(serverPath, 'utf8');
  const serverLines = serverContent.split('\n');

  const p4SpecialPermissions: Record<string, string> = {
    'GET /api/accounting/accounts': 'ENTRY_VIEW',
    'GET /api/accounting/periods': 'ENTRY_VIEW',
    'GET /api/accounting/dimensions': 'ENTRY_VIEW',
    'GET /api/accounting/items': 'ENTRY_VIEW',
    'GET /api/custody/custodies': 'CUSTODY_VIEW',
    'GET /api/custody/custodies/:id': 'CUSTODY_VIEW',
    'GET /api/custody/expenses': 'CUSTODY_VIEW',
    'GET /api/custody/settlements': 'CUSTODY_VIEW',
    'GET /api/custody/hr-clearance/:employeeId': 'CUSTODY_VIEW',
    'GET /api/custody/vouchers': 'CUSTODY_VIEW',
    'GET /api/custody/vouchers/:id': 'CUSTODY_VIEW',
    'GET /api/expenses/requests': 'inline: R-EXP (canViewAll or submitter)',
    'GET /api/expenses/requests/:id': 'inline: R-EXP (canViewAll or submitter)',
    'GET /api/attachments': 'inline: documentType based (EXPENSE_REQUEST->R-EXP, ISSUE/RECEIPT->STOCK_VIEW)',
    'POST /api/attachments': 'inline: documentType based (EXPENSE_REQUEST->EXPENSE_SUBMIT, ISSUE->STOCK_ISSUE, RECEIPT->STOCK_RECEIVE)',
    'GET /api/print/:docType/:docId': 'inline: docType based (journal-entry->ENTRY_VIEW, custody->CUSTODY_VIEW, expense->R-EXP, stock->STOCK_VIEW)',
  };

  const routeRegex = /^\s*app\.(get|post|put|delete|patch)\((['"][^'"]+['"]|\[[^\]]+\])(.*)$/;
  const outRows: string[] = [];
  let unclassifiedCount = 0;

  for (const line of serverLines) {
    const match = line.match(routeRegex);
    if (!match) continue;

    const method = match[1].toUpperCase();
    let rawPath = match[2].trim();
    const rest = match[3];

    let routePath = rawPath;
    if (rawPath.startsWith('[') && rawPath.endsWith(']')) {
      const inner = rawPath.slice(1, -1);
      const paths = inner.split(',').map((p) => p.trim().replace(/^['"]|['"]$/g, ''));
      routePath = paths.join(',');
    } else {
      routePath = rawPath.replace(/^['"]|['"]$/g, '');
    }

    const key = `${method} ${routePath}`;
    const p2Row = phase2Map.get(key);

    let guard = 'None';
    if (rest.includes('requireAuth')) guard = 'requireAuth';
    else if (rest.includes('requirePlatformAdmin')) guard = 'requirePlatformAdmin';
    else if (rest.includes('requireDeveloperOrAuditor')) guard = 'requireDeveloperOrAuditor';

    let permission = 'None';
    const permMatch = rest.match(/requirePermission\(['"]([^'"]+)['"]\)/);
    if (permMatch) {
      permission = permMatch[1];
    }

    let sensitivity = p2Row?.sensitivity || 'Unclassified';
    if (!p2Row) {
      unclassifiedCount++;
    }

    let action = p2Row?.action || 'OK';
    let phase = p2Row?.phase || '2';

    if (key in p4SpecialPermissions) {
      guard = 'requireAuth';
      permission = p4SpecialPermissions[key];
      action = 'CLOSED_P4';
      phase = '4';
    }

    outRows.push(`| ${method} | ${routePath} | ${guard} | ${permission} | ${sensitivity} | ${action} | ${phase} |`);
  }

  const header = `# Phase 4 Route Authorization Matrix\n\n| Method | Path | Guard | Permission | Sensitivity | Action | Phase |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  const output = header + outRows.join('\n') + '\n';
  fs.writeFileSync(outPath, output, 'utf8');

  console.log(`Generated ${outRows.length} rows to ${outPath}`);
  console.log(`Unclassified count: ${unclassifiedCount}`);
}

main();
