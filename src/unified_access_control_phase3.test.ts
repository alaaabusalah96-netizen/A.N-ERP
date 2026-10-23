import { describe, it, expect, beforeEach } from 'vitest';
import { CustodyDB } from './db';
import { UsersModule } from './db/users';
import { LogsModule } from './db/logs';
import { StorageEngine } from './db/storage';
import { AppUser } from './types';

describe('Phase 3: Strengthen Impersonation for Technical Support & System Isolation', () => {
  const superAdminUser: AppUser = {
    id: 'usr-superadmin-master',
    email: 'admin@platform.com',
    full_name: 'Platform Super Admin',
    role: 'SystemAdmin',
    is_active: true,
    is_platform_owner: true,
    permissions: UsersModule.enrichUserPermissions('SystemAdmin')
  };

  const stationUserWithRestrictions: AppUser = {
    id: 'usr-branch-restricted-01',
    email: 'cashier@delta.com',
    full_name: 'Delta Station Admin',
    role: 'StationAdmin',
    company_id: 'comp-delta-01',
    station_id: 'stn-delta-cairo',
    is_active: true,
    // Target user has restrictive individual overrides
    permissions: {
      ...UsersModule.enrichUserPermissions('StationAdmin'),
      create_expense: false,
      create_voucher: false
    }
  };

  beforeEach(() => {
    StorageEngine.cache = {};
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    StorageEngine.setStored('companies', [
      { id: 'comp-delta-01', name: 'Delta Enterprises' }
    ]);
    StorageEngine.setStored('users', [superAdminUser, stationUserWithRestrictions]);
    UsersModule.setActiveUser(superAdminUser);
  });

  it('1. Normal Mode: SystemAdmin is a gatekeeper without operational custody context', () => {
    const active = UsersModule.getActiveUser();
    expect(active).not.toBeNull();
    expect(active?.role).toBe('SystemAdmin');
    expect(active?.impersonator).toBeUndefined();
    expect(active?.permissions.manage_companies).toBe(true);
    expect(active?.permissions.manage_roles).toBe(true);
    expect(active?.station_id).toBeUndefined();
  });

  it('2. Impersonation Mode: Uses enrichUserPermissions(targetUser.role) to bypass restrictive overrides for support', () => {
    // Start impersonation of station admin
    UsersModule.impersonateUser(stationUserWithRestrictions, 'Troubleshoot cash voucher synchronization');

    const impersonated = UsersModule.getActiveUser();
    expect(impersonated).not.toBeNull();
    expect(impersonated?.id).toBe(stationUserWithRestrictions.id);
    expect(impersonated?.role).toBe('StationAdmin');
    expect(impersonated?.company_id).toBe('comp-delta-01');
    expect(impersonated?.station_id).toBe('stn-delta-cairo');
    
    // Check that impersonator reference is stored
    expect(impersonated?.impersonator).toBeDefined();
    expect(impersonated?.impersonator?.id).toBe(superAdminUser.id);
    expect(impersonated?.impersonator?.full_name).toBe(superAdminUser.full_name);

    // Overrides bypassed: create_expense and create_voucher are true per StationAdmin default baseline
    expect(impersonated?.permissions.create_expense).toBe(true);
    expect(impersonated?.permissions.create_voucher).toBe(true);
  });

  it('3. Impersonation Mode: Strictly prevents privilege escalation beyond target user base role', () => {
    UsersModule.impersonateUser(stationUserWithRestrictions, 'Check station custody logs');
    const impersonated = UsersModule.getActiveUser();

    // StationAdmin must NEVER escalate to SystemAdmin or Admin capabilities
    expect(impersonated?.role).toBe('StationAdmin');
    expect(impersonated?.permissions.manage_companies).toBe(false);
    expect(impersonated?.permissions.manage_roles).toBe(false);
  });

  it('4. Auditing: Captures impersonator_id, target_user_id, and is_impersonation during actions', () => {
    UsersModule.impersonateUser(stationUserWithRestrictions, 'Perform custody correction under supervision');

    // Perform an action under impersonation
    LogsModule.logAudit('ADJUST_CUSTODY_SUPPORT', 'Adjusted emergency cash float during support session', {
      station_id: 'stn-delta-cairo',
      company_id: 'comp-delta-01'
    });

    const auditLogs = LogsModule.getAuditLogs();
    const actionLog = auditLogs.find(l => l.action_type === 'ADJUST_CUSTODY_SUPPORT');

    expect(actionLog).toBeDefined();
    expect(actionLog?.is_impersonation).toBe(true);
    expect(actionLog?.impersonator_id).toBe(superAdminUser.id);
    expect(actionLog?.impersonator_name).toBe(superAdminUser.full_name);
    expect(actionLog?.target_user_id).toBe(stationUserWithRestrictions.id);
    expect(actionLog?.target_user_name).toBe(stationUserWithRestrictions.full_name);
    expect(actionLog?.description).toContain('[Impersonation by Platform Super Admin]');
  });

  it('5. Exit Impersonation: Revokes assumed operational access immediately and cleanly restores SystemAdmin', () => {
    UsersModule.impersonateUser(stationUserWithRestrictions, 'Support diagnostic');
    expect(UsersModule.getActiveUser()?.role).toBe('StationAdmin');

    // End impersonation
    UsersModule.exitImpersonation();

    const restored = UsersModule.getActiveUser();
    expect(restored).not.toBeNull();
    expect(restored?.id).toBe(superAdminUser.id);
    expect(restored?.role).toBe('SystemAdmin');
    expect(restored?.impersonator).toBeUndefined();
    expect(restored?.permissions.manage_companies).toBe(true);
    expect(restored?.permissions.manage_roles).toBe(true);

    const auditLogs = LogsModule.getAuditLogs();
    const endLog = auditLogs.find(l => l.action_type === 'IMPERSONATION_END');
    expect(endLog).toBeDefined();
    expect(endLog?.details?.is_impersonation).toBe(true);
    expect(endLog?.details?.impersonator_id).toBe(superAdminUser.id);
    expect(endLog?.details?.target_user_id).toBe(stationUserWithRestrictions.id);
  });
});

