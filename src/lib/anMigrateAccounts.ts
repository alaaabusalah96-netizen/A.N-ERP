/**
 * AN-MIGRATE-WRITE-F5 — gated chart-of-accounts upsert into A.N storage.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import type { Account } from '../an-core/storage/StoragePort';
import { probeDefaultProcessPlane } from './anDataPlane';

export interface KemitAccountRaw {
  id?: string;
  code?: string;
  account_code?: string;
  company_id?: string;
  name?: string;
  nameAr?: string;
  name_ar?: string;
  nameEn?: string;
  type?: string;
  account_type?: string;
  nature?: string;
  isActive?: boolean;
  is_active?: boolean;
  [key: string]: unknown;
}

function mapType(raw: string | undefined): Account['type'] {
  const t = String(raw || '').toUpperCase();
  if (t.includes('LIAB') || t === 'L') return 'LIABILITY';
  if (t.includes('EQUITY') || t.includes('CAPITAL')) return 'EQUITY';
  if (t.includes('REV') || t.includes('INCOME')) return 'REVENUE';
  if (t.includes('EXP')) return 'EXPENSE';
  if (t.includes('ASSET') || t === 'A') return 'ASSET';
  // digit heuristics: 1 asset, 2 liability, 3 equity, 4 revenue, 5 expense
  if (t.startsWith('2')) return 'LIABILITY';
  if (t.startsWith('3')) return 'EQUITY';
  if (t.startsWith('4')) return 'REVENUE';
  if (t.startsWith('5') || t.startsWith('6')) return 'EXPENSE';
  return 'ASSET';
}

export function mapKemitAccountToAn(raw: KemitAccountRaw, companyId: string): Account {
  const code = String(raw.code || raw.account_code || raw.id || '').trim();
  const nameAr = String(raw.nameAr || raw.name_ar || raw.name || code).trim() || code;
  return {
    code,
    tenantId: companyId,
    nameAr,
    nameEn: raw.nameEn ? String(raw.nameEn) : undefined,
    type: mapType(raw.type || raw.account_type || code),
    nature:
      String(raw.nature || '').toUpperCase() === 'CREDIT' ? 'CREDIT' : 'DEBIT',
    isActive: raw.isActive !== false && raw.is_active !== false,
    status: 'ACTIVE',
  };
}

export interface AccountMigrateResult {
  ok: boolean;
  plane: 'an-migrate-write-f5';
  writesEnabled: boolean;
  writesPerformed: boolean;
  cutoverApproved: false;
  companyId: string;
  attempted: number;
  inserted: number;
  skippedExisting: number;
  failed: number;
  errors: string[];
  detail: string;
  detailAr: string;
}

export async function migrateAccountsToAn(
  router: StorageRouter,
  opts: { companyId: string; rows: KemitAccountRaw[]; env?: NodeJS.ProcessEnv }
): Promise<AccountMigrateResult> {
  const env = opts.env || process.env;
  const companyId = opts.companyId.trim() || 'default';
  const writesEnabled = env.AN_MIGRATE_WRITES === '1' || env.AN_MIGRATE_WRITES === 'true';
  const base = {
    plane: 'an-migrate-write-f5' as const,
    writesEnabled,
    cutoverApproved: false as const,
    companyId,
  };

  if (!writesEnabled) {
    return {
      ...base,
      ok: false,
      writesPerformed: false,
      attempted: 0,
      inserted: 0,
      skippedExisting: 0,
      failed: 0,
      errors: ['AN_MIGRATE_WRITES not enabled'],
      detail: 'writes_disabled',
      detailAr: 'الكتابة معطّلة',
    };
  }

  const plane = probeDefaultProcessPlane(env);
  if (!(plane.adapterType === 'postgresql' && plane.ok && plane.envRefPresent)) {
    return {
      ...base,
      ok: false,
      writesPerformed: false,
      attempted: 0,
      inserted: 0,
      skippedExisting: 0,
      failed: 0,
      errors: ['postgresql env not ready'],
      detail: plane.certifiedNote,
      detailAr: plane.errorAr || 'PostgreSQL غير جاهز',
    };
  }

  const adapter = router.getPrimaryAdapter();
  let existingCodes = new Set<string>();
  if (typeof adapter.listAccounts === 'function') {
    const listed = await adapter.listAccounts(companyId);
    if (listed.success && Array.isArray(listed.data)) {
      existingCodes = new Set(listed.data.map((a) => a.code));
    }
  }

  let inserted = 0;
  let skippedExisting = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const raw of opts.rows) {
    const mapped = mapKemitAccountToAn(raw, companyId);
    if (!mapped.code) {
      failed++;
      errors.push('missing_code');
      continue;
    }
    if (existingCodes.has(mapped.code)) {
      skippedExisting++;
      continue;
    }
    try {
      const res = await adapter.saveAccount(
        companyId,
        mapped,
        `migrate-acc-${mapped.code}`
      );
      if (res.success) {
        inserted++;
        existingCodes.add(mapped.code);
      } else {
        failed++;
        errors.push(`${mapped.code}:${res.error || 'save_failed'}`);
      }
    } catch (e: any) {
      failed++;
      errors.push(`${mapped.code}:${(e?.message || String(e)).slice(0, 120)}`);
    }
  }

  return {
    ...base,
    ok: failed === 0,
    writesPerformed: inserted > 0,
    attempted: opts.rows.length,
    inserted,
    skippedExisting,
    failed,
    errors: errors.slice(0, 20),
    detail: 'accounts_migrate_done',
    detailAr: 'انتهى ترحيل دليل الحسابات (إن وُجد)',
  };
}
