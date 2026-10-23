import { describe, it, expect, beforeEach } from 'vitest';
import { CustodyDB } from './db';
import { OrganizationEngine } from './db/organizationEngine';
import { OrganizationScopeEngine } from './db/organizationScopeEngine';
import { EnterpriseReportEngine } from './lib/enterprise/report_engine';
import { AppUser, Transaction } from './types';
import { StorageEngine } from './db/storage';

describe('Phase 5: Reports & Dashboard Dynamic Filtering and Scope Test', () => {
  const companyId = 'comp-test-phase5';

  beforeEach(() => {
    StorageEngine.clearCache();
    CustodyDB.setSelectedCompanyId(companyId);
  });

  it('Acceptance Criterion 1: Two test users scoped to different Organization Units see non-overlapping data by default without extra clicks', async () => {
    // 1. Setup Company and 2 distinct Org Units
    const rootCompany = await OrganizationEngine.addOrganizationUnit({
      nameAr: 'شركة الاختبار',
      nameEn: 'Test Company',
      code: 'TC-ROOT',
      typeCode: 'COMPANY',
      companyId
    });

    const unitA = await OrganizationEngine.addOrganizationUnit({
      nameAr: 'مصنع القاهرة',
      nameEn: 'Cairo Factory',
      code: 'UNIT-A',
      typeCode: 'FACTORY',
      parentId: rootCompany.id,
      companyId
    });

    const unitB = await OrganizationEngine.addOrganizationUnit({
      nameAr: 'فرع الإسكندرية',
      nameEn: 'Alex Branch',
      code: 'UNIT-B',
      typeCode: 'BRANCH',
      parentId: rootCompany.id,
      companyId
    });

    // 2. Create User A and User B
    const userA: AppUser = {
      id: 'usr-a',
      email: 'usera@test.com',
      full_name: 'User A (Cairo)',
      role: 'RegionalManager',
      company_id: companyId,
      org_unit_id: unitA.id,
      permissions: { view_reports: true, manage_settings: false }
    };

    const userB: AppUser = {
      id: 'usr-b',
      email: 'userb@test.com',
      full_name: 'User B (Alex)',
      role: 'RegionalManager',
      company_id: companyId,
      org_unit_id: unitB.id,
      permissions: { view_reports: true, manage_settings: false }
    };

    // 3. Create transactions for Unit A and Unit B
    const txA1: Transaction = {
      id: 'tx-a1',
      transaction_no: 'TX-001',
      date: '2026-07-27',
      amount: 1500,
      description: 'Raw materials Cairo',
      category: 'Purchases',
      status: 'Pending',
      company_id: companyId,
      org_unit_id: unitA.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'usr-a'
    };

    const txB1: Transaction = {
      id: 'tx-b1',
      transaction_no: 'TX-002',
      date: '2026-07-27',
      amount: 3200,
      description: 'Office supplies Alex',
      category: 'Supplies',
      status: 'Pending',
      company_id: companyId,
      org_unit_id: unitB.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'usr-b'
    };

    StorageEngine.setStored('transactions', [txA1, txB1]);

    // 4. Test User A scope filtering
    const scopedForA = OrganizationScopeEngine.filterByOrganizationScope([txA1, txB1], userA);
    expect(scopedForA.map(t => t.id)).toEqual(['tx-a1']);
    expect(scopedForA.map(t => t.id)).not.toContain('tx-b1');

    // 5. Test User B scope filtering
    const scopedForB = OrganizationScopeEngine.filterByOrganizationScope([txA1, txB1], userB);
    expect(scopedForB.map(t => t.id)).toEqual(['tx-b1']);
    expect(scopedForB.map(t => t.id)).not.toContain('tx-a1');
  });

  it('Acceptance Criterion 2: Report filtered by Cost Center returns mathematically correct totals matching underlying entries', () => {
    // 1. Create transactions tied to Cost Center 101 and Cost Center 202
    const tx1: Transaction = {
      id: 'tx-cc101-a',
      transaction_no: 'TX-101',
      date: '2026-07-20',
      amount: 5000,
      description: 'Marketing Ad Campaign',
      category: 'Marketing',
      status: 'Settled',
      company_id: companyId,
      cost_center_id: 'cc-101',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'admin'
    };

    const tx2: Transaction = {
      id: 'tx-cc101-b',
      transaction_no: 'TX-102',
      date: '2026-07-22',
      amount: 3500,
      description: 'Marketing Influencer Sponsor',
      category: 'Marketing',
      status: 'Settled',
      company_id: companyId,
      cost_center_id: 'cc-101',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'admin'
    };

    const tx3: Transaction = {
      id: 'tx-cc202-a',
      transaction_no: 'TX-201',
      date: '2026-07-25',
      amount: 12000,
      description: 'IT Server Hardware',
      category: 'IT Equipment',
      status: 'Settled',
      company_id: companyId,
      cost_center_id: 'cc-202',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'admin'
    };

    StorageEngine.setStored('custody_transactions', [tx1, tx2, tx3]);

    // 2. Query report for CC-101
    const reportCC101 = EnterpriseReportEngine.getCustodyReport({
      companyId,
      costCenterId: 'cc-101',
      startDate: '2026-07-01',
      endDate: '2026-07-31'
    });

    const sumCC101 = reportCC101.reduce((sum, t) => sum + t.amount, 0);

    // Expected total: 5000 + 3500 = 8500 EGP
    expect(reportCC101.length).toBe(2);
    expect(sumCC101).toBe(8500);

    // 3. Query report for CC-202
    const reportCC202 = EnterpriseReportEngine.getCustodyReport({
      companyId,
      costCenterId: 'cc-202',
      startDate: '2026-07-01',
      endDate: '2026-07-31'
    });

    const sumCC202 = reportCC202.reduce((sum, t) => sum + t.amount, 0);

    // Expected total: 12000 EGP
    expect(reportCC202.length).toBe(1);
    expect(sumCC202).toBe(12000);
  });
});
