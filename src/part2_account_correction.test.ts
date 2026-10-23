import { describe, it, expect, beforeEach } from 'vitest';
import { CustodyDB } from './db';
import { StorageEngine } from './db/storage';
import { AppUser, Company, AccountCorrectionRequest } from './types';

describe('Part 2: Account Correction Request Governance & Review Flow', () => {
  beforeEach(() => {
    StorageEngine.clearCache();
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('submits an account correction request, retrieves it by admin structure, and approves password/email change without consuming headcount', async () => {
    // 1. Create a Company with max_accounts_allowed = 2
    const company: Company = {
      id: 'comp-correction-1',
      name: 'Kemit Test Company',
      currency: 'EGP',
      max_accounts_allowed: 2
    };

    // 2. Create existing Admin and Regional Manager users (filling 2 of 2 slots)
    const adminUser: AppUser = {
      id: 'usr-admin-1',
      company_id: company.id,
      email: 'admin@company.com',
      password: await CustodyDB.hashPassword('admin123', 'admin@company.com'),
      salt: 'admin@company.com',
      full_name: 'Lead Admin',
      role: 'Admin',
      is_active: true,
      permissions: {
        create_expense: true,
        delete_expense: true,
        settle_voucher: true,
        replace_custody: true,
        view_reports: true,
        manage_settings: true
      }
    };

    const regionalUser: AppUser = {
      id: 'usr-regional-1',
      company_id: company.id,
      email: 'manager@company.com',
      password: await CustodyDB.hashPassword('oldpass123', 'manager@company.com'),
      salt: 'manager@company.com',
      full_name: 'Regional Manager',
      role: 'RegionalManager',
      is_active: true,
      permissions: {
        create_expense: true,
        delete_expense: false,
        settle_voucher: true,
        replace_custody: true,
        view_reports: true,
        manage_settings: false
      }
    };

    await CustodyDB.saveCompanies([company]);
    await CustodyDB.saveUsers([adminUser, regionalUser]);

    // Verify company has 2 users (100% capacity)
    const initialUsers = CustodyDB.getUsers().filter(u => u.company_id === company.id);
    expect(initialUsers.length).toBe(2);

    // 3. User submits an Account Correction Request (Password reset & Email change)
    const request: AccountCorrectionRequest = {
      id: 'req-corr-101',
      company_id: company.id,
      targetUserId: regionalUser.id,
      targetEmail: regionalUser.email,
      targetUserName: regionalUser.full_name,
      targetRole: 'RegionalManager',
      correctionType: 'password_reset',
      reason: 'Forgot password after mobile replacement',
      status: 'Pending',
      created_at: new Date().toISOString()
    };

    await CustodyDB.saveAccountCorrectionRequest(request);

    // 4. Verify Admin can retrieve pending correction requests
    const pendingCorrections = CustodyDB.getAccountCorrectionRequests().filter(
      r => r.status === 'Pending' && r.company_id === company.id
    );
    expect(pendingCorrections.length).toBe(1);
    expect(pendingCorrections[0].reason).toBe('Forgot password after mobile replacement');

    // 5. Admin approves the correction request with a new password and updated email
    const approvalResult = await CustodyDB.approveAccountCorrectionRequest(request.id, {
      newEmail: 'newmanager@company.com',
      newFullName: 'Updated Regional Manager',
      newPasswordPlain: 'newsecurepass999',
      approvedBy: 'admin@company.com'
    });

    expect(approvalResult.success).toBe(true);

    // 6. Verify headcount is UNCHANGED (still exactly 2 users, max_accounts_allowed not exceeded)
    const afterUsers = CustodyDB.getUsers().filter(u => u.company_id === company.id);
    expect(afterUsers.length).toBe(2);

    // 7. Verify the user record was updated in place
    const updatedUser = CustodyDB.getUsers().find(u => u.id === regionalUser.id);
    expect(updatedUser).toBeDefined();
    expect(updatedUser?.email).toBe('newmanager@company.com');
    expect(updatedUser?.full_name).toBe('Updated Regional Manager');

    // 8. Verify the user can be verified with the NEW password and NEW email
    const loginResult = CustodyDB.verifyUserPassword('newmanager@company.com', 'newsecurepass999');
    expect(loginResult).toBeDefined();
    expect(loginResult?.email).toBe('newmanager@company.com');

    // 9. Verify correction request status is now Approved
    const updatedRequest = CustodyDB.getAccountCorrectionRequests().find(r => r.id === request.id);
    expect(updatedRequest?.status).toBe('Approved');
    expect(updatedRequest?.approved_by).toBe('admin@company.com');

    // 10. Verify audit log entry was created
    const logs = CustodyDB.getAuditLogs();
    const approvalLog = logs.find(l => l.action_type === 'APPROVE_ACCOUNT_CORRECTION');
    expect(approvalLog).toBeDefined();
    expect(approvalLog?.description).toContain('newmanager@company.com');
  });

  it('rejects an account correction request and logs the rejection reason', async () => {
    const request: AccountCorrectionRequest = {
      id: 'req-corr-102',
      company_id: 'comp-1',
      targetUserId: 'usr-1',
      targetEmail: 'test@company.com',
      targetUserName: 'Test User',
      targetRole: 'StationAdmin',
      correctionType: 'other',
      reason: 'Change email to external personal email',
      status: 'Pending',
      created_at: new Date().toISOString()
    };

    await CustodyDB.saveAccountCorrectionRequest(request);

    const res = await CustodyDB.rejectAccountCorrectionRequest(
      request.id,
      'External personal emails are not allowed by security policy.',
      'admin@company.com'
    );

    expect(res.success).toBe(true);

    const rejectedReq = CustodyDB.getAccountCorrectionRequests().find(r => r.id === request.id);
    expect(rejectedReq?.status).toBe('Rejected');
    expect(rejectedReq?.rejection_reason).toBe('External personal emails are not allowed by security policy.');

    const logs = CustodyDB.getAuditLogs();
    const rejectLog = logs.find(l => l.action_type === 'REJECT_ACCOUNT_CORRECTION');
    expect(rejectLog).toBeDefined();
    expect(rejectLog?.description).toContain('External personal emails are not allowed');
  });
});
