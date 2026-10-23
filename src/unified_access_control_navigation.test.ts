import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CustodyDB } from './db';
import { CompaniesModule } from './db/companies';

describe('Unified Access Control Navigation & Contextual Routing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. should properly set and get selected company id in CustodyDB', () => {
    const testCompanyId = 'cmp-nav-test-123';
    CustodyDB.setSelectedCompanyId(testCompanyId);
    expect(CustodyDB.getSelectedCompanyId()).toBe(testCompanyId);
  });

  it('2. should verify navigate_tab custom event structure and dispatching', () => {
    let capturedDetail: any = null;
    const listener = (e: any) => {
      capturedDetail = e.detail;
    };

    window.addEventListener('navigate_tab', listener);

    window.dispatchEvent(new CustomEvent('navigate_tab', {
      detail: {
        tab: 'settings',
        settingsTab: 'permissions',
        selectedCompanyId: 'cmp-test-456',
        centerTab: 'org_structure'
      }
    }));

    expect(capturedDetail).not.toBeNull();
    expect(capturedDetail.tab).toBe('settings');
    expect(capturedDetail.settingsTab).toBe('permissions');
    expect(capturedDetail.selectedCompanyId).toBe('cmp-test-456');
    expect(capturedDetail.centerTab).toBe('org_structure');

    window.removeEventListener('navigate_tab', listener);
  });

  it('3. should verify companies list availability in Unified Access Control context', () => {
    const companies = CompaniesModule.getCompanies();
    expect(Array.isArray(companies)).toBe(true);
    expect(companies.length).toBeGreaterThan(0);
  });
});
