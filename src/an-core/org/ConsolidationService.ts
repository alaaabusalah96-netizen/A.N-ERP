/**
 * @file ConsolidationService.ts
 * @description CONSOL-1 — pure merge of per-tenant trial balance rows for a group.
 * Note: intercompany eliminations are flagged only (no auto-elimination journal in this package).
 */
export interface TenantTbRow {
  code: string;
  nameAr?: string;
  type?: string;
  debitBalance: number;
  creditBalance: number;
  netBalance?: number;
  nature?: string;
}

export interface ConsolLine {
  accountCode: string;
  nameAr?: string;
  type?: string;
  debitBalance: number;
  creditBalance: number;
  netBalance: number;
  byTenant: Record<string, { debitBalance: number; creditBalance: number; netBalance: number }>;
}

export interface ConsolTrialBalance {
  groupId: string;
  asOfDate: string;
  lines: ConsolLine[];
  totals: { debitBalance: number; creditBalance: number; netBalance: number };
  memberTenantIds: string[];
  eliminationNotes: string[];
  generatedAt: string;
}

export function mergeTrialBalances(input: {
  groupId: string;
  asOfDate: string;
  memberTenantIds: string[];
  byTenant: Record<string, TenantTbRow[]>;
  openXcompanyCount?: number;
}): ConsolTrialBalance {
  const map = new Map<string, ConsolLine>();
  for (const tenantId of input.memberTenantIds) {
    const rows = input.byTenant[tenantId] || [];
    for (const r of rows) {
      const code = String(r.code || '').trim();
      if (!code) continue;
      let line = map.get(code);
      if (!line) {
        line = {
          accountCode: code,
          nameAr: r.nameAr,
          type: r.type,
          debitBalance: 0,
          creditBalance: 0,
          netBalance: 0,
          byTenant: {},
        };
        map.set(code, line);
      }
      if (!line.nameAr && r.nameAr) line.nameAr = r.nameAr;
      if (!line.type && r.type) line.type = r.type;
      const d = Number(r.debitBalance) || 0;
      const c = Number(r.creditBalance) || 0;
      const n = r.netBalance != null ? Number(r.netBalance) : d - c;
      line.debitBalance += d;
      line.creditBalance += c;
      line.netBalance += n;
      line.byTenant[tenantId] = { debitBalance: d, creditBalance: c, netBalance: n };
    }
  }
  const lines = Array.from(map.values()).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  const totals = lines.reduce(
    (acc, l) => {
      acc.debitBalance += l.debitBalance;
      acc.creditBalance += l.creditBalance;
      acc.netBalance += l.netBalance;
      return acc;
    },
    { debitBalance: 0, creditBalance: 0, netBalance: 0 },
  );
  const eliminationNotes: string[] = [
    'CONSOL-1: دمج أرصدة الحسابات حسب الكود عبر أعضاء المجموعة دون قيود إلغاء تلقائية.',
  ];
  if ((input.openXcompanyCount || 0) > 0) {
    eliminationNotes.push(
      `يوجد ${input.openXcompanyCount} تحويلًا بين الشركات مفتوحًا — يُفضّل إتمامها أو إلغاؤها محاسبيًا قبل الاعتماد الرسمي.`,
    );
  }
  return {
    groupId: input.groupId,
    asOfDate: input.asOfDate,
    lines,
    totals: {
      debitBalance: Math.round(totals.debitBalance * 100) / 100,
      creditBalance: Math.round(totals.creditBalance * 100) / 100,
      netBalance: Math.round(totals.netBalance * 100) / 100,
    },
    memberTenantIds: [...input.memberTenantIds],
    eliminationNotes,
    generatedAt: new Date().toISOString(),
  };
}
