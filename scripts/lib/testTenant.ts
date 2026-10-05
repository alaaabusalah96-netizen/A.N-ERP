/**
 * @file scripts/lib/testTenant.ts
 * @description Shared helper for integrity / measurement scripts (Phase 8 and later phases — extend, do not duplicate).
 * Creates a throw-away SHARED tenant (`int-<rand>`) on the real PostgresPrimaryAdapter (DATABASE_URL),
 * builds the real services, and removes every row it created in `cleanup()`.
 * It never touches any existing tenant.
 */
import dotenv from 'dotenv';
dotenv.config();
import crypto from 'node:crypto';
import { PostgresPrimaryAdapter } from '../../src/core/storage/adapters/PostgresPrimaryAdapter';
import { PostingEngine } from '../../src/core/engines/PostingEngine';
import { NumberingEngine } from '../../src/core/engines/NumberingEngine';
import { InventoryService } from '../../src/core/inventory/InventoryService';
import { AccountingService } from '../../src/core/accounting/AccountingService';
import type { TenantCompany, Warehouse, StockItem, InventoryValuationMethod } from '../../src/core/storage/StoragePort';

export interface TempTenant {
  tenantId: string;
  storage: PostgresPrimaryAdapter;
  services: {
    posting: PostingEngine;
    numbering: NumberingEngine;
    inventory: InventoryService;
    accounting: AccountingService;
  };
  /** Tenant-scoped raw SQL (sets app.current_tenant_id inside a transaction, so RLS never hides rows). */
  sql(text: string, params?: any[]): Promise<any>;
  /** Idempotency / unique-suffix helper. */
  uid(prefix: string): string;
  /** Rows that cleanup() could not delete (e.g. immutable posted entries). Filled by cleanup(). */
  residue: { table: string; rows: number }[];
  cleanup(): Promise<void>;
}

const rand = () => crypto.randomBytes(4).toString('hex');

export async function createTempTenant(opts: { seedChart?: boolean } = {}): Promise<TempTenant> {
  const seedChart = opts.seedChart !== false;
  const storage = new PostgresPrimaryAdapter();
  const init = await storage.initializeSchema();
  if (!init.success) throw new Error('initializeSchema failed');
  const pool: any = (storage as any).pool;
  if (!pool) throw new Error('no database pool (DATABASE_URL missing?)');

  const suffix = rand();
  const tenantId = `int-${suffix}`;
  const tenant: TenantCompany = {
    id: tenantId,
    code: `INT-${suffix.toUpperCase()}`,
    nameAr: 'منشأة اختبار السلامة (مؤقتة)',
    nameEn: 'Integrity Test Tenant (temporary)',
    crNumber: '1010000000',
    taxNumber: '300000000000003',
    country: 'SA',
    baseCurrency: 'SAR',
    status: 'ACTIVE',
    backendConfig: { adapterType: 'postgresql', connectionRef: 'DATABASE_URL', isolationLevel: 'Shared' },
    createdAt: new Date().toISOString(),
  };
  const saved = await storage.saveTenant(tenant, `seed-tenant-${tenantId}`);
  if (!saved.success) throw new Error('saveTenant failed: ' + JSON.stringify((saved as any).error));

  const inTenant = async (tid: string, fn: (c: any) => Promise<any>): Promise<any> => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tid]);
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      c.release();
    }
  };
  const sql = (text: string, params: any[] = []) => inTenant(tenantId, (c: any) => c.query(text, params));

  const posting = new PostingEngine(storage);
  const numbering = new NumberingEngine(storage);
  const inventory = new InventoryService(storage, posting, numbering);
  const accounting = new AccountingService(storage);

  if (seedChart) {
    await accounting.seedDefaultChartOfAccounts(tenantId);
  }

  const t: TempTenant = {
    tenantId, storage, services: { posting, numbering, inventory, accounting }, sql,
    uid: (p: string) => `${p}-${suffix}-${rand()}`,
    residue: [],
    async cleanup() {
      t.residue = [];
      try {
        const tables: string[] = (await pool.query(
          `SELECT table_name FROM information_schema.columns
            WHERE table_schema = current_schema() AND column_name = 'tenant_id' AND table_name LIKE 'an\\_%'
            ORDER BY table_name`
        )).rows.map((r: any) => r.table_name).filter((n: string) => n !== 'an_tenants');
        // Several passes so that foreign-key order resolves itself; each DELETE is its own transaction.
        let pending = tables.slice();
        for (let pass = 0; pass < 8 && pending.length > 0; pass++) {
          const next: string[] = [];
          for (const tbl of pending) {
            try { await inTenant(tenantId, (c: any) => c.query(`DELETE FROM ${tbl} WHERE tenant_id = $1`, [tenantId])); }
            catch { next.push(tbl); }
          }
          if (next.length === pending.length) { pending = next; break; }
          pending = next;
        }
        for (const tbl of tables) {
          try {
            const n = Number((await inTenant(tenantId, (c: any) => c.query(`SELECT COUNT(*)::int AS n FROM ${tbl} WHERE tenant_id = $1`, [tenantId]))).rows[0].n);
            if (n > 0) t.residue.push({ table: tbl, rows: n });
          } catch { /* table not readable: ignore */ }
        }
        try { await pool.query('DELETE FROM an_tenants WHERE id = $1', [tenantId]); } catch { /* kept: residue rows reference it */ }
      } catch { /* cleanup is best-effort; the tenant is isolated */ }
      try { await pool.end(); } catch { /* ignore */ }
    },
  };
  return t;
}

export async function makeWarehouse(t: TempTenant, code: string): Promise<Warehouse> {
  const r = await t.services.inventory.saveWarehouse(
    t.tenantId,
    { code, nameAr: `مستودع ${code}`, valuationMethod: 'WEIGHTED_AVERAGE', isActive: true },
    t.uid('wh')
  );
  if (!r.success || !r.data) throw new Error('makeWarehouse failed: ' + JSON.stringify(r.error));
  return r.data;
}

export async function makeItem(
  t: TempTenant,
  opts: { code: string; valuationMethod?: InventoryValuationMethod; trackBatch?: boolean }
): Promise<StockItem> {
  const r = await t.services.inventory.saveStockItem(
    t.tenantId,
    {
      itemCode: opts.code,
      nameAr: `صنف ${opts.code}`,
      category: 'INT',
      uom: 'PCS',
      inventoryAccountCode: '1105',
      cogsAccountCode: '5101',
      adjustmentExpenseAccountCode: '5101',
      adjustmentGainAccountCode: '4202',
      valuationMethod: opts.valuationMethod || 'WEIGHTED_AVERAGE',
      trackBatch: !!opts.trackBatch,
      isActive: true,
    },
    t.uid('item')
  );
  if (!r.success || !r.data) throw new Error('makeItem failed: ' + JSON.stringify(r.error));
  return r.data;
}
