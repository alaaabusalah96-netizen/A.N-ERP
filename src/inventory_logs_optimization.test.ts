import { describe, it, expect, beforeEach } from 'vitest';
import { CustodyDB } from './db';
import { CompaniesModule } from './db/companies';
import { InventoryModule } from './db/inventory';
import { LogsModule } from './db/logs';
import { StockMovement, InventoryDocument } from './types/inventory';
import { ActivityLog, AuditLog } from './types';

describe('Phase 4: Inventory Stock Balance O(1) Lookup Index & Paginated Queries', () => {
  beforeEach(() => {
    CustodyDB.clearCache();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('computes exact stock balances using StockLookupIndex O(1) maps', async () => {
    const mockMovements: StockMovement[] = [
      {
        id: 'mov-101',
        doc_id: 'doc-101',
        doc_no: 'IN-001',
        doc_type: 'Receipt',
        product_id: 'prod-test-1',
        warehouse_id: 'wh-test-1',
        bin_id: 'bin-test-A',
        qty_change: 100,
        type: 'IN',
        current_balance_after: 100,
        date: '2026-08-01',
        company_id: 'comp-1',
        created_at: '2026-08-01T10:00:00Z',
        created_by: 'system',
      },
      {
        id: 'mov-102',
        doc_id: 'doc-102',
        doc_no: 'OUT-001',
        doc_type: 'Issue',
        product_id: 'prod-test-1',
        warehouse_id: 'wh-test-1',
        bin_id: 'bin-test-A',
        qty_change: -30,
        type: 'OUT',
        current_balance_after: 70,
        date: '2026-08-01',
        company_id: 'comp-1',
        created_at: '2026-08-01T11:00:00Z',
        created_by: 'system',
      },
      {
        id: 'mov-103',
        doc_id: 'doc-103',
        doc_no: 'IN-002',
        doc_type: 'Receipt',
        product_id: 'prod-test-2',
        warehouse_id: 'wh-test-1',
        bin_id: 'bin-test-B',
        qty_change: 50,
        type: 'IN',
        current_balance_after: 50,
        date: '2026-08-01',
        company_id: 'comp-1',
        created_at: '2026-08-01T12:00:00Z',
        created_by: 'system',
      },
    ];

    await InventoryModule.saveStockMovements(mockMovements);

    // Verify O(1) index directly
    const index = CustodyDB.getStockLookupIndex();
    expect(index.byProductWarehouse.get('prod-test-1___wh-test-1')).toBe(70);
    expect(index.byProductWarehouse.get('prod-test-2___wh-test-1')).toBe(50);
    expect(index.byProductBin.get('prod-test-1___bin-test-A')).toBe(70);
    expect(index.byBin.get('bin-test-A')).toBe(70);
    expect(index.byBin.get('bin-test-B')).toBe(50);
    expect(index.byWarehouse.get('wh-test-1')).toBe(120);

    // Verify methods return identical results using the index
    expect(InventoryModule.getProductStock('prod-test-1', 'wh-test-1')).toBe(70);
    expect(InventoryModule.getBinProductStock('prod-test-1', 'bin-test-A', 'wh-test-1')).toBe(70);
    expect(InventoryModule.getBinTotalStock('bin-test-A')).toBe(70);
    expect(InventoryModule.getWarehouseTotalStock('wh-test-1')).toBe(120);
  });

  it('automatically invalidates StockLookupIndex when stock movements change or cache is cleared', async () => {
    const mov1: StockMovement = {
      id: 'mov-201',
      doc_id: 'doc-201',
      doc_no: 'IN-101',
      doc_type: 'Receipt',
      product_id: 'prod-inv-1',
      warehouse_id: 'wh-inv-1',
      qty_change: 25,
      type: 'IN',
      current_balance_after: 25,
      date: '2026-08-01',
      company_id: 'comp-1',
      created_at: '2026-08-01T10:00:00Z',
      created_by: 'system',
    };

    await InventoryModule.saveStockMovements([mov1]);
    expect(InventoryModule.getProductStock('prod-inv-1', 'wh-inv-1')).toBe(25);

    const mov2: StockMovement = {
      id: 'mov-202',
      doc_id: 'doc-202',
      doc_no: 'IN-102',
      doc_type: 'Receipt',
      product_id: 'prod-inv-1',
      warehouse_id: 'wh-inv-1',
      qty_change: 40,
      type: 'IN',
      current_balance_after: 65,
      date: '2026-08-01',
      company_id: 'comp-1',
      created_at: '2026-08-01T11:00:00Z',
      created_by: 'system',
    };

    await InventoryModule.saveStockMovements([mov1, mov2]);
    // Should automatically invalidate and recompute to 65
    expect(InventoryModule.getProductStock('prod-inv-1', 'wh-inv-1')).toBe(65);

    // Explicit clearStockLookupIndex should reset index clean
    CustodyDB.clearStockLookupIndex();
    expect(CustodyDB.getStockLookupIndex().byProductWarehouse.get('prod-inv-1___wh-inv-1')).toBe(65);
  });

  it('supports paginated and scoped queries for logs and audit logs', () => {
    // Add multiple activity logs
    for (let i = 1; i <= 15; i++) {
      LogsModule.addLog('user-1', 'Admin User', 'TEST_ACTION', `Test log ${i}`, 'st-1', 'comp-1');
    }

    const firstPage = CustodyDB.getPaginatedLogs(1, 5);
    expect(firstPage.data.length).toBe(5);
    expect(firstPage.page).toBe(1);
    expect(firstPage.pageSize).toBe(5);
    expect(firstPage.total).toBeGreaterThanOrEqual(15);
    expect(firstPage.totalPages).toBeGreaterThanOrEqual(3);

    const secondPage = CustodyDB.getPaginatedLogs(2, 5);
    expect(secondPage.data.length).toBe(5);
    expect(secondPage.page).toBe(2);

    // Verify AuditLogs pagination
    const mockAudit: AuditLog = {
      id: 'audit-test-1',
      timestamp: new Date().toISOString(),
      user_id: 'user-1',
      user_name: 'Admin',
      user_role: 'Admin',
      action_type: 'UPDATE',
      description: 'Updated record',
      company_id: 'comp-1',
    };
    LogsModule.addAuditLog(mockAudit);

    const paginatedAudit = CustodyDB.getPaginatedAuditLogs(1, 10);
    expect(paginatedAudit.data.length).toBeGreaterThanOrEqual(1);
    expect(paginatedAudit.data[0].id).toBe('audit-test-1');
  });

  it('supports paginated and tenant-scoped queries for inventory documents and stock movements', async () => {
    const mockDocs: InventoryDocument[] = [
      {
        id: 'inv-doc-1',
        doc_no: 'GRN-001',
        doc_type: 'Receipt',
        date: '2026-08-01',
        source_warehouse_id: 'wh-1',
        company_id: 'comp-1',
        tenantId: 'comp-1',
        organizationId: 'org-1',
        version: 1,
        status: 'Approved',
        created_by: 'user-1',
        created_at: '2026-08-01T10:00:00Z',
        items: [],
      },
      {
        id: 'inv-doc-2',
        doc_no: 'GRN-002',
        doc_type: 'Receipt',
        date: '2026-08-01',
        source_warehouse_id: 'wh-1',
        company_id: 'comp-1',
        tenantId: 'comp-1',
        organizationId: 'org-1',
        version: 1,
        status: 'Approved',
        created_by: 'user-1',
        created_at: '2026-08-01T11:00:00Z',
        items: [],
      },
      {
        id: 'inv-doc-3-other',
        doc_no: 'GRN-003',
        doc_type: 'Receipt',
        date: '2026-08-01',
        source_warehouse_id: 'wh-other',
        company_id: 'comp-2',
        tenantId: 'comp-2',
        organizationId: 'org-1',
        version: 1,
        status: 'Approved',
        created_by: 'user-2',
        created_at: '2026-08-01T12:00:00Z',
        items: [],
      },
    ];

    await InventoryModule.saveInventoryDocuments(mockDocs);

    // With comp-1 selected explicitly
    CompaniesModule.setSelectedCompanyId('comp-1');
    const paginatedDocs = CustodyDB.getPaginatedInventoryDocuments(1, 10);
    expect(paginatedDocs.data.every(d => d.company_id === 'comp-1')).toBe(true);
    expect(paginatedDocs.total).toBe(2);

    const paginatedMovements = CustodyDB.getPaginatedStockMovements(1, 10);
    expect(paginatedMovements.page).toBe(1);
    expect(paginatedMovements.pageSize).toBe(10);
  });
});
