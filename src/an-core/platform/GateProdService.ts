/**
 * @file GateProdService.ts
 * @description GATE-PROD-1 — pure production-readiness checklist evaluation.
 */
export type GateStatus = 'PASS' | 'FAIL' | 'WARN';

export interface GateCheck {
  id: string;
  labelAr: string;
  status: GateStatus;
  detail?: string;
}

export interface GateProdReport {
  verdict: 'GO' | 'CONDITIONAL_GO' | 'NO_GO';
  checks: GateCheck[];
  passCount: number;
  failCount: number;
  warnCount: number;
  generatedAt: string;
  notes: string[];
}

export function evaluateGateProd(input: {
  packagesDone: string[];
  requiredPackages: string[];
  openP1Count: number;
  configDefectIds: string[];
  hasHealthRoute: boolean;
  hasConsolRoute: boolean;
  hasGroupReportRoute: boolean;
  hasXcompanyRoutes: boolean;
  hasEntityCloseRoutes: boolean;
}): GateProdReport {
  const checks: GateCheck[] = [];
  const done = new Set(input.packagesDone);

  for (const id of input.requiredPackages) {
    checks.push({
      id: `PKG-${id}`,
      labelAr: `حزمة ${id} مكتملة`,
      status: done.has(id) ? 'PASS' : 'FAIL',
      detail: done.has(id) ? 'DONE' : 'MISSING',
    });
  }

  checks.push({
    id: 'P1-OPEN',
    labelAr: 'لا عيوب حرجة مفتوحة (P1)',
    status: input.openP1Count === 0 ? 'PASS' : 'FAIL',
    detail: `openP1=${input.openP1Count}`,
  });

  checks.push({
    id: 'HEALTH',
    labelAr: 'مسار صحة النظام موجود',
    status: input.hasHealthRoute ? 'PASS' : 'FAIL',
  });

  checks.push({
    id: 'CONSOL',
    labelAr: 'تقرير التجميع (CONSOL) متاح',
    status: input.hasConsolRoute ? 'PASS' : 'FAIL',
  });

  checks.push({
    id: 'RPT-GROUP',
    labelAr: 'ملخص KPI المجموعة متاح',
    status: input.hasGroupReportRoute ? 'PASS' : 'FAIL',
  });

  checks.push({
    id: 'XCOMPANY',
    labelAr: 'مسارات التحويل بين الشركات',
    status: input.hasXcompanyRoutes ? 'PASS' : 'FAIL',
  });

  checks.push({
    id: 'ENTITY-CLOSE',
    labelAr: 'إقفال دفاتر الكيان',
    status: input.hasEntityCloseRoutes ? 'PASS' : 'FAIL',
  });

  if (input.configDefectIds.length > 0) {
    checks.push({
      id: 'CONFIG-DEFECTS',
      labelAr: 'عيوب إعدادات معروفة (غير حاجبة إن وُثّقت)',
      status: 'WARN',
      detail: input.configDefectIds.join(', '),
    });
  }

  const passCount = checks.filter((c) => c.status === 'PASS').length;
  const failCount = checks.filter((c) => c.status === 'FAIL').length;
  const warnCount = checks.filter((c) => c.status === 'WARN').length;

  let verdict: GateProdReport['verdict'] = 'GO';
  if (failCount > 0) verdict = 'NO_GO';
  else if (warnCount > 0) verdict = 'CONDITIONAL_GO';

  const notes = [
    'GATE-PROD-1 لا يستبدل النسخ الاحتياطي التشغيلي ولا مراجعة الصلاحيات اليدوية قبل الإطلاق.',
    'عيوب CONFIG الموثقة تُعالج في بيئة الإنتاج (مثل دور PostgreSQL بدون BYPASSRLS).',
  ];

  return {
    verdict,
    checks,
    passCount,
    failCount,
    warnCount,
    generatedAt: new Date().toISOString(),
    notes,
  };
}

/** Core wave packages required for production gate. */
export const GATE_REQUIRED_PACKAGES = [
  'ORG-GROUP-1',
  'MASTER-ITEM-GROUP-1',
  'STK-XCOMPANY-1',
  'ACC-ENTITY-CLOSE-1',
  'RPT-GROUP-1',
  'CONSOL-1',
  'INV-ITEM-CREATE',
  'ORG-MEMBERSHIP-1',
];
