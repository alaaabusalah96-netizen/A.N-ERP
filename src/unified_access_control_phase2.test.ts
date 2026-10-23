import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 2: Unified Access Control Center Request Flows & Entry Point Redirection', () => {
  const unifiedPath = path.join(process.cwd(), 'src', 'components', 'settings', 'UnifiedAccessControlCenter.tsx');
  const superAdminPath = path.join(process.cwd(), 'src', 'pages', 'SuperAdmin.tsx');

  const unifiedContent = fs.readFileSync(unifiedPath, 'utf8');
  const superAdminContent = fs.readFileSync(superAdminPath, 'utf8');

  it('1. Verifies signup request subview and approvals are integrated into UnifiedAccessControlCenter', () => {
    expect(unifiedContent).toContain("setUsersSubView('signups')");
    expect(unifiedContent).toContain('handleApproveSignup');
    expect(unifiedContent).toContain('handleRejectSignup');
    expect(unifiedContent).toContain('unified-signup-requests-view');
  });

  it('2. Verifies account correction request subview and approvals are integrated into UnifiedAccessControlCenter', () => {
    expect(unifiedContent).toContain("setUsersSubView('corrections')");
    expect(unifiedContent).toContain('handleStartApproveCorrection');
    expect(unifiedContent).toContain('handleConfirmApproveCorrection');
    expect(unifiedContent).toContain('handleRejectCorrection');
    expect(unifiedContent).toContain('unified-correction-requests-view');
  });

  it('3. Verifies interactive notification banner for pending requests in UnifiedAccessControlCenter', () => {
    expect(unifiedContent).toContain('scopedSignupRequests.length');
    expect(unifiedContent).toContain('scopedCorrectionRequests.length');
    expect(unifiedContent).toContain('id="unified-requests-notification-banner"');
  });

  it('4. Verifies role and company-scoped request filtering for multi-tenant isolation', () => {
    expect(unifiedContent).toContain('scopedSignupRequests');
    expect(unifiedContent).toContain('scopedCorrectionRequests');
    expect(unifiedContent).toContain('r.company_id !== effectiveCompanyId');
  });

  it('5. Verifies modal dialogs for rejection feedback and review approvals', () => {
    expect(unifiedContent).toContain('rejectingSignupId');
    expect(unifiedContent).toContain('rejectingCorrectionId');
    expect(unifiedContent).toContain('approvingCorrectionReq');
    expect(unifiedContent).toContain('signupRejectReason');
    expect(unifiedContent).toContain('correctionRejectReason');
  });

  it('6. Verifies audit trail logging on request approvals and rejections', () => {
    expect(unifiedContent).toContain("CustodyDB.logAudit('APPROVE_SIGNUP_REQUEST'");
    expect(unifiedContent).toContain("CustodyDB.logAudit('REJECT_SIGNUP_REQUEST'");
    expect(unifiedContent).toContain("CustodyDB.approveAccountCorrectionRequest");
    expect(unifiedContent).toContain("CustodyDB.rejectAccountCorrectionRequest");
  });

  it('7. Verifies SuperAdmin retains platform support rails and provides direct redirection banner to Unified Access Control', () => {
    expect(superAdminContent).toContain("activeSubTab === 'companies'");
    expect(superAdminContent).toContain("activeSubTab === 'operations'");
    expect(superAdminContent).toContain("activeSubTab === 'impersonate'");
    expect(superAdminContent).toContain("activeSubTab === 'audit'");
    
    const companiesTabPath = path.join(process.cwd(), 'src', 'components', 'SuperAdminCompaniesTab.tsx');
    const companiesTabContent = fs.readFileSync(companiesTabPath, 'utf8');
    expect(companiesTabContent).toContain('id="unified-access-control-redirect-banner"');
    expect(companiesTabContent).toContain("settingsTab: 'permissions'");
  });
});
