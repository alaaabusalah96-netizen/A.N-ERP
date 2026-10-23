import { describe, it, expect } from 'vitest';
import { getFilteredMenuItems } from './components/Layout';
import { AppUser } from './types';

describe('Phase 14: SystemAdmin Navigation = SaaS / Platform Tools Only', () => {
  const mockSystemAdmin: AppUser = {
    id: 'user-sys-1',
    company_id: 'comp-1',
    station_id: '',
    email: 'sysadmin@kemit.com',
    full_name: 'Platform Super Admin',
    role: 'SystemAdmin',
    permissions: {
      create_expense: true,
      settle_voucher: true,
      manage_users: true,
      view_reports: true,
      manage_settings: true
    },
    is_active: true
  };

  const mockCompanyAdmin: AppUser = {
    id: 'user-admin-1',
    company_id: 'comp-1',
    station_id: '',
    email: 'compadmin@kemit.com',
    full_name: 'Company Admin',
    role: 'Admin',
    permissions: {
      create_expense: true,
      settle_voucher: true,
      manage_users: true,
      view_reports: true,
      manage_settings: true
    },
    is_active: true
  };

  it('1. SystemAdmin menu contains ONLY platform tools (SaaS dashboard, audit log, settings, search) and NO operational modules', () => {
    const items = getFilteredMenuItems(mockSystemAdmin, 'en');
    const ids = items.map(i => i.id);

    // Platform tools must be present
    expect(ids).toContain('super-admin');
    expect(ids).toContain('audit-log');
    expect(ids).toContain('settings');
    expect(ids).toContain('search');

    // Operational modules must be hidden from SystemAdmin
    const operationalModules = [
      'new-expense',
      'voucher',
      'reconciliation',
      'approvals',
      'inventory',
      'purchasing',
      'accounting',
      'sales_ar',
      'pos',
      'crm',
      'fixed_assets',
      'fleet',
      'hr_payroll',
      'reports'
    ];
    for (const opId of operationalModules) {
      expect(ids).not.toContain(opId);
    }
  });

  it('2. Company Admin menu is unchanged and retains full operational module access', () => {
    const items = getFilteredMenuItems(mockCompanyAdmin, 'en');
    const ids = items.map(i => i.id);

    // Should NOT contain SaaS super-admin
    expect(ids).not.toContain('super-admin');

    // Should contain Company dashboard & operational modules
    expect(ids).toContain('company-admin');
    expect(ids).toContain('reconciliation');
    expect(ids).toContain('approvals');
    expect(ids).toContain('inventory');
    expect(ids).toContain('purchasing');
    expect(ids).toContain('accounting');
    expect(ids).toContain('sales_ar');
    expect(ids).toContain('pos');
    expect(ids).toContain('crm');
    expect(ids).toContain('fixed_assets');
    expect(ids).toContain('fleet');
    expect(ids).toContain('hr_payroll');
    expect(ids).toContain('reports');
    expect(ids).toContain('audit-log');
    expect(ids).toContain('settings');
  });
});
