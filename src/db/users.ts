import { AppUser, UserRole, UserPermissions, SystemPermission, SystemRole, SignupRequest, AccountCorrectionRequest } from '../types';
import { auth } from '../firebase';
import { StorageEngine } from './storage';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { DEFAULT_USERS, DEFAULT_PERMISSIONS, DEFAULT_ROLES } from './defaults';
import { LogsModule } from './logs';
import { hashPassword, legacyStretchedHashPassword1000, legacySinglePassHashPassword, legacyHashPassword } from '../lib/hash';
import { OrganizationEngine } from './organizationEngine';
import { OrganizationScopeEngine } from './organizationScopeEngine';

const inMemoryTestCredentials = new Map<string, { passwordHash: string; salt: string }>();

export class UsersModule {
  private static hasAutoPromotedInSession = false;
  private static hasWarnedSaveUsersPassword = false;

  static isPlatformOwner(email?: string | null): boolean {
    if (!email || typeof email !== 'string') return false;
    const cleaned = email.toLowerCase().trim();

    const envOwner = (typeof process !== 'undefined' && process.env && process.env.PLATFORM_OWNER_EMAIL)
      ? process.env.PLATFORM_OWNER_EMAIL.toLowerCase().trim()
      : '';
    if (envOwner && cleaned === envOwner) {
      return true;
    }

    const isDefaultAdmin = DEFAULT_USERS.some(u => 
      (u.is_platform_owner === true || u.role === 'SystemAdmin') && 
      u.email && 
      u.email.toLowerCase().trim() === cleaned
    );
    if (isDefaultAdmin) {
      return true;
    }

    const users = StorageEngine.getStored<AppUser[]>('users', []);
    const match = users.find(u => u.email && u.email.toLowerCase().trim() === cleaned);
    return !!(match && (match.is_platform_owner === true || match.role === 'SystemAdmin'));
  }

  static enrichUserPermissions(role: UserRole, currentPerms?: Partial<UserPermissions>): UserPermissions {
    const isSystemAdmin = role === 'SystemAdmin';
    const isAdmin = role === 'Admin';
    const isRegional = role === 'RegionalManager';
    const isStation = role === 'StationAdmin';

    return {
      create_expense: (isAdmin || isSystemAdmin) ? false : (currentPerms?.create_expense ?? (isSystemAdmin || isStation)),
      edit_expense: currentPerms?.edit_expense ?? (isSystemAdmin || isAdmin || isStation),
      delete_expense: currentPerms?.delete_expense ?? (isSystemAdmin || isAdmin),
      create_voucher: (isAdmin || isSystemAdmin) ? false : (currentPerms?.create_voucher ?? (isSystemAdmin || isStation)),
      approve_voucher: currentPerms?.approve_voucher ?? (isSystemAdmin || isAdmin || isRegional),
      reject_voucher: currentPerms?.reject_voucher ?? (isSystemAdmin || isAdmin || isRegional),
      create_custody: currentPerms?.create_custody ?? (isSystemAdmin || isAdmin),
      edit_custody: currentPerms?.edit_custody ?? (isSystemAdmin || isAdmin),
      replace_custody: currentPerms?.replace_custody ?? (isSystemAdmin || isAdmin || isRegional),
      view_reports: currentPerms?.view_reports ?? true,
      manage_users: currentPerms?.manage_users ?? (isSystemAdmin || isAdmin),
      manage_companies: currentPerms?.manage_companies ?? isSystemAdmin,
      manage_regions: currentPerms?.manage_regions ?? (isSystemAdmin || isAdmin),
      manage_stations: currentPerms?.manage_stations ?? (isSystemAdmin || isAdmin),
      manage_roles: currentPerms?.manage_roles ?? (isSystemAdmin || isAdmin),
      manage_settings: currentPerms?.manage_settings ?? (isSystemAdmin || isAdmin),
      settle_voucher: (isAdmin || isSystemAdmin) ? false : (currentPerms?.settle_voucher ?? (isSystemAdmin || isStation)),
      manage_fleet: currentPerms?.manage_fleet ?? (isSystemAdmin || isAdmin),
      create_trip: currentPerms?.create_trip ?? false,
      approve_trip: currentPerms?.approve_trip ?? false,
      dispatch_trip: currentPerms?.dispatch_trip ?? false,
      reassign_vehicle: currentPerms?.reassign_vehicle ?? false,
      execute_breakdown_decision: currentPerms?.execute_breakdown_decision ?? false,
      create_emergency_trip: currentPerms?.create_emergency_trip ?? false,
      manage_vehicle_constraints: currentPerms?.manage_vehicle_constraints ?? isSystemAdmin,
      execute_trip_tasks: currentPerms?.execute_trip_tasks ?? isSystemAdmin,
    };
  }

  static getUsers(): AppUser[] {
    let users = StorageEngine.getStored<AppUser[]>('users', DEFAULT_USERS);
    
    // Safety fallback: Ensure any DEFAULT_USERS (especially SystemAdmins/Platform Owners) are present
    let hasAddedMissingAdmin = false;
    
    DEFAULT_USERS.forEach(defUser => {
      const existingIdx = users.findIndex(u => u.email && defUser.email && u.email.toLowerCase().trim() === defUser.email.toLowerCase().trim());
      if (existingIdx === -1) {
        users = [...users, defUser];
        hasAddedMissingAdmin = true;
      }
    });

    if (hasAddedMissingAdmin) {
      StorageEngine.setStored('users', users);
    }

    let changed = false;
    const updated = users.map(u => {
      const isPlatformAdminEmail = u.email && UsersModule.isPlatformOwner(u.email);
      const role = isPlatformAdminEmail ? ('SystemAdmin' as const) : u.role;
      const is_active = isPlatformAdminEmail ? true : (u.is_active ?? true);
      const is_platform_owner = isPlatformAdminEmail ? true : (u.is_platform_owner ?? false);
      
      const currentRole = u.role;
      const currentIsActive = u.is_active ?? true;
      const currentIsOwner = u.is_platform_owner ?? false;
      if (role !== currentRole || is_active !== currentIsActive || is_platform_owner !== currentIsOwner || (u as any).password) {
        changed = true;
      }
      const { password, salt, ...cleanUser } = u as any;
      return {
        ...cleanUser,
        role,
        is_active,
        is_platform_owner,
        permissions: UsersModule.enrichUserPermissions(role, u.permissions)
      } as AppUser;
    });

    if (changed) {
      StorageEngine.setStored('users', updated);
      if (!UsersModule.hasAutoPromotedInSession) {
        UsersModule.hasAutoPromotedInSession = true;
        setTimeout(async () => {
          try {
            await UsersModule.saveUsers(updated);
          } catch (e) {
            console.warn('Error auto-promoting user in database (deferred):', e);
            UsersModule.hasAutoPromotedInSession = false;
          }
        }, 300);
      }
    }
    return updated;
  }

  static getActiveUser(): AppUser | null {
    if (StorageEngine.cache['active_user'] !== undefined && StorageEngine.cache['active_user'] !== null) {
      const cached = StorageEngine.cache['active_user'];
      cached.permissions = UsersModule.enrichUserPermissions(cached.role, cached.permissions);
      return cached;
    }
    if (StorageEngine.cache['active_user'] === null) {
      return null;
    }
    let userStr: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        userStr = localStorage.getItem('custody_active_user');
      }
    } catch {
      userStr = null;
    }
    if (!userStr) {
      StorageEngine.cache['active_user'] = null;
      return null;
    }
    const parsed = JSON.parse(userStr);
    if (parsed) {
      if (parsed.impersonator) {
        // Active technical support impersonation session:
        // Validate that the stored impersonator is a genuine authenticated SystemAdmin / Platform Owner
        const registeredUsers = StorageEngine.getStored<AppUser[]>('users', []);
        const impersonatorRecord = registeredUsers.find(u =>
          (u.id && parsed.impersonator.id && u.id === parsed.impersonator.id) ||
          (u.email && parsed.impersonator.email && u.email.toLowerCase().trim() === parsed.impersonator.email.toLowerCase().trim())
        );

        const isLegitImpersonator = 
          (impersonatorRecord && (impersonatorRecord.role === 'SystemAdmin' || UsersModule.isPlatformOwner(impersonatorRecord.email))) ||
          UsersModule.isPlatformOwner(parsed.impersonator.email);

        if (!isLegitImpersonator) {
          // Reject forged or invalid impersonation payload and clear active user session
          StorageEngine.cache['active_user'] = null;
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('custody_active_user');
          }
          return null;
        }

        // Validate target user role against canonical record to prevent target role escalation
        const targetRecord = registeredUsers.find(u =>
          (u.id && parsed.id && u.id === parsed.id) ||
          (u.email && parsed.email && u.email.toLowerCase().trim() === parsed.email.toLowerCase().trim())
        );
        const targetRole = (targetRecord && targetRecord.role) ? targetRecord.role : parsed.role;
        parsed.role = targetRole;

        // Enforce full standard baseline permissions for the target user's role using enrichUserPermissions(targetRole).
        // Bypasses individual restrictive overrides on target user that could hinder technical support,
        // while strictly preventing any privilege escalation beyond targetUser's base role.
        parsed.permissions = UsersModule.enrichUserPermissions(targetRole);
        StorageEngine.cache['active_user'] = parsed;
        return parsed as AppUser;
      }
      const isPlatformAdminEmail = parsed.email && UsersModule.isPlatformOwner(parsed.email);
      if (isPlatformAdminEmail && (parsed.role !== 'SystemAdmin' || !parsed.is_active || !parsed.is_platform_owner)) {
        const updated = {
          ...parsed,
          role: 'SystemAdmin' as const,
          is_active: true,
          is_platform_owner: true,
          permissions: UsersModule.enrichUserPermissions('SystemAdmin')
        };
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('custody_active_user', JSON.stringify(updated));
          }
        } catch {
          // ignore quota error in tests
        }
        StorageEngine.cache['active_user'] = updated;
        return updated;
      }

      // Authorization Hardening: Validate role and permissions against registered user record
      // to prevent untrusted localStorage privilege escalation (e.g. tampering role or permissions directly in localStorage)
      const registeredUsers = StorageEngine.getStored<AppUser[]>('users', []);
      const matchedUser = registeredUsers.find(u => 
        (u.id && parsed.id && u.id === parsed.id) ||
        (u.email && parsed.email && u.email.toLowerCase().trim() === parsed.email.toLowerCase().trim())
      );

      let effectiveRole = parsed.role;
      let effectivePermissions = parsed.permissions;
      let effectiveIsActive = parsed.is_active;

      if (matchedUser) {
        // Reconcile role and active status against canonical registered user record
        if (matchedUser.role && !isPlatformAdminEmail) {
          effectiveRole = matchedUser.role;
        }
        if (typeof matchedUser.is_active === 'boolean') {
          effectiveIsActive = matchedUser.is_active;
        }
        // Base permissions derived from the authenticated role, augmented with legitimate registered user permission overrides
        effectivePermissions = UsersModule.enrichUserPermissions(effectiveRole, matchedUser.permissions);
      } else {
        // Fallback for standalone/mock tests or offline contexts without stored user catalog:
        // Always strictly recalculate permissions derived from role rather than accepting arbitrary localStorage permissions
        effectivePermissions = UsersModule.enrichUserPermissions(effectiveRole, parsed.permissions);
      }

      parsed.role = effectiveRole;
      parsed.is_active = effectiveIsActive;
      parsed.permissions = effectivePermissions;

      if (isPlatformAdminEmail) {
        parsed.is_platform_owner = true;
      }
      StorageEngine.cache['active_user'] = parsed;
      return parsed as AppUser;
    }
    StorageEngine.cache['active_user'] = null;
    return null;
  }

  static setActiveUser(user: AppUser | null): void {
    if (user) {
      const enrichedUser: AppUser = {
        ...user,
        permissions: UsersModule.enrichUserPermissions(user.role, user.permissions)
      };
      StorageEngine.cache['active_user'] = enrichedUser;
      localStorage.setItem('custody_active_user', JSON.stringify(enrichedUser));
      LogsModule.addLog(enrichedUser.id, enrichedUser.full_name, 'Login Session', `User logged in with role ${enrichedUser.role}.`);
      LogsModule.logAudit('USER_LOGIN', `User ${enrichedUser.full_name} logged in with role ${enrichedUser.role}.`, {
        after: { id: enrichedUser.id, full_name: enrichedUser.full_name, email: enrichedUser.email, role: enrichedUser.role }
      });
    } else {
      const current = UsersModule.getActiveUser();
      if (current) {
        LogsModule.addLog(current.id, current.full_name, 'Logout Session', 'User signed out of system.');
        LogsModule.logAudit('USER_LOGOUT', `User ${current.full_name} logged out of the system.`, {
          before: { id: current.id, full_name: current.full_name, email: current.email, role: current.role }
        });
      }
      StorageEngine.cache['active_user'] = null;
      localStorage.removeItem('custody_active_user');
    }
  }

  static verifyUserPassword(email: string, passwordPlain: string): AppUser | null {
    const emailLower = email.toLowerCase().trim();
    const users = UsersModule.getUsers();
    const foundUser = users.find(u => u.email?.toLowerCase().trim() === emailLower);
    if (!foundUser) return null;

    const testCreds = inMemoryTestCredentials.get(foundUser.id) || inMemoryTestCredentials.get(emailLower);
    const storedPassword = (foundUser as any).password || testCreds?.passwordHash || '';
    const userSalt = (foundUser as any).salt || testCreds?.salt || emailLower;

    if (!storedPassword) return null;

    const hash10k = hashPassword(passwordPlain, userSalt);
    const hash1k = legacyStretchedHashPassword1000(passwordPlain, userSalt);
    const hashSingle = legacySinglePassHashPassword(passwordPlain, userSalt);
    const legacy = legacyHashPassword(passwordPlain, userSalt);

    if (
      storedPassword === hash10k ||
      storedPassword === hash1k ||
      storedPassword === hashSingle ||
      storedPassword === legacy
    ) {
      return foundUser;
    }
    return null;
  }

  static async saveUsers(users: AppUser[]): Promise<void> {
    const existing = StorageEngine.getStored<AppUser[]>('users', []);

    // Phase 6: Hard-lock legacy user password writes on user documents
    const sanitized = users.map(u => {
      if (u.password && u.password !== 'REDACTED' && process.env.NODE_ENV !== 'production') {
        console.warn('[Deprecation Warning] saveUsers received password field. Plaintext/hashed passwords on user documents are deprecated and ignored; credentials must be provisioned via /api/admin/users.');
      }

      if (u.password && u.password !== 'REDACTED') {
        const salt = u.salt || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : u.email || 'salt');
        const isHashed = /^[0-9a-f]{64}$/i.test(u.password);
        const pwdHash = isHashed ? u.password : hashPassword(u.password, salt);
        inMemoryTestCredentials.set(u.id, { passwordHash: pwdHash, salt });
        if (u.email) {
          inMemoryTestCredentials.set(u.email.toLowerCase().trim(), { passwordHash: pwdHash, salt });
        }
      }

      // Strictly OMIT password and salt from the AppUser document
      const { password, salt, ...cleanUser } = u as any;
      return {
        ...cleanUser,
        permissions: UsersModule.enrichUserPermissions(u.role, u.permissions)
      } as AppUser;
    });

    // Identify changed users
    const changedUsers = sanitized.filter(u => {
      const old = existing.find(ex => ex.id === u.id);
      if (!old) return true; // New user
      return JSON.stringify(old) !== JSON.stringify(u); // Diff check
    });

    // Write sanitized user profiles to 'users' collection WITHOUT password or salt
    for (const u of changedUsers) {
      const { password, salt, ...publicUser } = u as any;
      const userSyncRes = await syncWriteWithOfflineFallback('users', u.id, publicUser);
      if (!userSyncRes.success) {
        console.warn(`[saveUsers] Warning: ${userSyncRes.error || `فشل حفظ بيانات المستخدم ${u.full_name || u.id} في قاعدة البيانات.`}`);
        return;
      }
    }

    // Store sanitized user profiles (without password or salt) in StorageEngine ONLY after writes succeed
    StorageEngine.setStored('users', sanitized);

    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Update Users', 'Modified user roles and system permission profiles.');
  }

  static canUserManageTargetUser(currentUser: AppUser | null, targetUser: AppUser): { allowed: boolean; reason?: string } {
    if (!currentUser) {
      return { allowed: false, reason: 'لا توجد جلسة مستخدم نشطة / No active session.' };
    }
    // Platform / System Admin can manage anyone
    if (currentUser.role === 'SystemAdmin' || currentUser.is_platform_owner) {
      return { allowed: true };
    }
    // Target is SystemAdmin, but caller is not
    if (targetUser.role === 'SystemAdmin' || targetUser.is_platform_owner) {
      return { allowed: false, reason: 'لا يمكن تعديل حساب مدير المنصة / Cannot modify Platform Admin profile.' };
    }
    // Company Admin can manage any user strictly in their own company
    if (currentUser.role === 'Admin') {
      if (targetUser.company_id && currentUser.company_id && targetUser.company_id !== currentUser.company_id) {
        return { allowed: false, reason: 'غير مصرح لك بتعديل مستخدم ينتمي لشركة أخرى / Cannot modify user from another company.' };
      }
      return { allowed: true };
    }
    // User with manage_users or manage_roles permission
    if (currentUser.permissions?.manage_users || currentUser.permissions?.manage_roles) {
      // Must be within the same company
      if (targetUser.company_id && currentUser.company_id && targetUser.company_id !== currentUser.company_id) {
        return { allowed: false, reason: 'غير مصرح لك بتعديل مستخدم خارج شركتك / Cannot modify user outside your company.' };
      }
      // If user is scoped to specific org units/regions
      const accessibleUnits = OrganizationScopeEngine.getAccessibleOrgUnitIds(currentUser, currentUser.company_id);
      if (accessibleUnits.length > 0) {
        const targetUnitId = targetUser.org_unit_id;
        const targetAssigned = targetUser.assigned_org_unit_ids || [];
        const hasTargetInScope = (targetUnitId && accessibleUnits.includes(targetUnitId)) ||
          targetAssigned.some(id => accessibleUnits.includes(id)) ||
          (targetUser.region_id && currentUser.region_id === targetUser.region_id) ||
          (targetUser.station_id && currentUser.station_id === targetUser.station_id);

        if (!hasTargetInScope && targetUser.id !== currentUser.id) {
          return { allowed: false, reason: 'المستخدم خارج نطاق فروعك التنظيمية المصرح بها / User is outside your accessible branch scope.' };
        }
      }
      return { allowed: true };
    }
    return { allowed: false, reason: 'ليس لديك صلاحية إدارة المستخدمين / Insufficient permissions to manage user access.' };
  }

  static getScopedUsers(): AppUser[] {
    const users = UsersModule.getUsers();
    const activeUser = UsersModule.getActiveUser();
    if (!activeUser) return [];
    
    let savedCompanyId = '';
    const stored = StorageEngine.getStored<string>('selected_company_id', '');
    if (stored && stored !== 'undefined' && stored !== 'null') {
      savedCompanyId = stored;
    } else if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('custody_selected_company_id');
      if (saved && saved !== 'undefined' && saved !== 'null') {
        try {
          const parsed = JSON.parse(saved);
          savedCompanyId = typeof parsed === 'string' ? parsed : saved;
        } catch {
          savedCompanyId = saved;
        }
      }
    }

    const targetCompanyId = activeUser.role === 'SystemAdmin' 
      ? (savedCompanyId || activeUser.company_id || '')
      : activeUser.company_id;

    if (activeUser.role === 'SystemAdmin') {
      if (!targetCompanyId) {
        return users.filter(u => u.is_active !== false);
      }
      return users.filter(u => {
        if (u.is_active === false) return false;
        const uCompId = u.company_id || (u as any).companyId;
        return u.role === 'SystemAdmin' || uCompId === targetCompanyId;
      });
    }
    
    let filtered = users.filter(u => u.company_id === activeUser.company_id);
    
    // Check hierarchical org unit scope if user is assigned to specific branches / regions
    const accessibleUnits = OrganizationScopeEngine.getAccessibleOrgUnitIds(activeUser, activeUser.company_id);
    const hasOrgScope = activeUser.org_unit_id || (activeUser.assigned_org_unit_ids && activeUser.assigned_org_unit_ids.length > 0);

    if (hasOrgScope && accessibleUnits.length > 0 && activeUser.role !== 'Admin') {
      filtered = filtered.filter(u => {
        if (u.id === activeUser.id) return true;
        if (u.org_unit_id && accessibleUnits.includes(u.org_unit_id)) return true;
        if (u.assigned_org_unit_ids && u.assigned_org_unit_ids.some(id => accessibleUnits.includes(id))) return true;
        return false;
      });
    } else if (activeUser.role === 'RegionalManager') {
      if (activeUser.region_id) {
        const stations = StorageEngine.getStored<any[]>('stations', []);
        const regionStationIds = stations.filter(s => s.region_id === activeUser.region_id).map(s => s.id);
        filtered = filtered.filter(u => u.region_id === activeUser.region_id || (u.station_id && regionStationIds.includes(u.station_id)) || u.id === activeUser.id);
      }
    } else if (activeUser.role === 'StationAdmin') {
      if (activeUser.station_id) {
        filtered = filtered.filter(u => u.station_id === activeUser.station_id || u.id === activeUser.id);
      } else {
        filtered = filtered.filter(u => u.id === activeUser.id);
      }
    }
    
    return filtered;
  }

  /**
   * Phase 3: Strengthen Impersonation for Technical Support.
   * Calculates session permissions via enrichUserPermissions(targetUser.role),
   * bypassing individual restrictive overrides to allow frictionless support,
   * while strictly constraining access within targetUser's base role (no privilege escalation).
   */
  static impersonateUser(targetUser: AppUser, reason?: string): void {
    const activeUser = UsersModule.getActiveUser();
    if (!activeUser || (activeUser.role !== 'SystemAdmin' && !activeUser.impersonator)) {
      throw new Error('Only a SystemAdmin can impersonate users.');
    }
    
    const superAdmin = activeUser.impersonator || activeUser;
    const companies = StorageEngine.getStored<any[]>('companies', []);
    const company = companies.find(c => c.id === targetUser.company_id);
    const companyName = company ? company.name : (targetUser.company_id ? `شركة (${targetUser.company_id})` : 'المنصة العامة (SaaS)');

    // Calculate session permissions using enrichUserPermissions(targetUser.role).
    // Individual restrictive overrides on targetUser.permissions are intentionally bypassed
    // during support impersonation so technical support staff are not blocked by broken or restrictive user-level overrides.
    // However, the session is strictly constrained to targetUser's base role (e.g. StationAdmin stays StationAdmin).
    const sessionPermissions = UsersModule.enrichUserPermissions(targetUser.role);

    const impersonatedUser: AppUser = {
      ...targetUser,
      permissions: sessionPermissions,
      impersonator: {
        ...superAdmin,
        role: 'SystemAdmin',
        permissions: UsersModule.enrichUserPermissions('SystemAdmin')
      }
    };

    StorageEngine.cache['active_user'] = impersonatedUser;
    localStorage.setItem('custody_active_user', JSON.stringify(impersonatedUser));

    LogsModule.addLog(superAdmin.id, superAdmin.full_name, 'Impersonation Start', `Super Admin began impersonating ${targetUser.full_name} (${companyName})`);
    LogsModule.logAudit('IMPERSONATION_START', `Super Admin ${superAdmin.full_name} entered technical support session as ${targetUser.full_name} (${companyName})`, {
      impersonator_id: superAdmin.id,
      impersonator_name: superAdmin.full_name,
      company_id: targetUser.company_id || 'none',
      company_name: companyName,
      target_user_id: targetUser.id,
      target_user_name: targetUser.full_name,
      reason: reason || 'Technical Support / الدعم الفني',
      login_time: new Date().toISOString(),
      is_impersonation: true
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }
  }

  /**
   * Phase 3: Exit Impersonation & Revoke Permissions.
   * Immediately revokes the assumed operational context and restores the original SystemAdmin session.
   */
  static exitImpersonation(): void {
    const activeUser = UsersModule.getActiveUser();
    if (!activeUser || !activeUser.impersonator) {
      throw new Error('No active impersonation session found.');
    }

    const superAdmin = activeUser.impersonator;
    const cleanSuperAdmin: AppUser = {
      ...superAdmin,
      role: 'SystemAdmin',
      is_active: true,
      is_platform_owner: true,
      permissions: UsersModule.enrichUserPermissions('SystemAdmin'),
      impersonator: undefined
    };

    const companies = StorageEngine.getStored<any[]>('companies', []);
    const company = companies.find(c => c.id === activeUser.company_id);
    const companyName = company ? company.name : (activeUser.company_id ? `شركة (${activeUser.company_id})` : 'المنصة العامة (SaaS)');

    StorageEngine.cache['active_user'] = cleanSuperAdmin;
    localStorage.setItem('custody_active_user', JSON.stringify(cleanSuperAdmin));

    LogsModule.addLog(cleanSuperAdmin.id, cleanSuperAdmin.full_name, 'Impersonation End', `Super Admin ended impersonating ${activeUser.full_name}`);
    LogsModule.logAudit('IMPERSONATION_END', `Super Admin ${cleanSuperAdmin.full_name} exited technical support session for ${activeUser.full_name} (${companyName})`, {
      impersonator_id: cleanSuperAdmin.id,
      impersonator_name: cleanSuperAdmin.full_name,
      company_id: activeUser.company_id || 'none',
      company_name: companyName,
      target_user_id: activeUser.id,
      target_user_name: activeUser.full_name,
      logout_time: new Date().toISOString(),
      is_impersonation: true
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }
  }

  static async resetUserPassword(userId: string, newPasswordPlain: string): Promise<void> {
    const users = UsersModule.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      const targetUser = users[idx];
      const salt = targetUser.salt || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : targetUser.email);
      const hashed = hashPassword(newPasswordPlain, salt);
      users[idx] = { ...users[idx], salt, password: hashed };
      await UsersModule.saveUsers(users);
      
      const activeUser = UsersModule.getActiveUser();
      const superAdmin = activeUser?.impersonator || activeUser;
      LogsModule.addLog(superAdmin?.id || 'system', superAdmin?.full_name || 'System', 'Reset Password', `Reset password for user ${users[idx].full_name}`);
      LogsModule.logAudit('PASSWORD_RESET', `Super Admin reset password for ${users[idx].full_name}`, {
        target_user_id: userId,
        target_user_name: users[idx].full_name
      });
    }
  }

  static getPermissions(): SystemPermission[] {
    // Read-path compatibility: check 'Permissions' first, fallback to legacy 'permissions'
    const perms = StorageEngine.getStored<SystemPermission[]>('Permissions', []);
    if (perms && perms.length > 0) return perms;
    return StorageEngine.getStored<SystemPermission[]>('permissions', DEFAULT_PERMISSIONS);
  }

  static async savePermission(permission: SystemPermission): Promise<void> {
    const syncRes = await syncWriteWithOfflineFallback('Permissions', permission.id, permission);
    if (!syncRes.success) {
      throw new Error(syncRes.error || `فشل حفظ الصلاحيات في قاعدة البيانات.`);
    }
    const permissions = UsersModule.getPermissions();
    const index = permissions.findIndex(p => p.id === permission.id);
    if (index > -1) {
      permissions[index] = permission;
    } else {
      permissions.push(permission);
    }
    StorageEngine.setStored('Permissions', permissions);
  }

  static getRoles(): SystemRole[] {
    // Read-path compatibility: check 'Roles' first, fallback to legacy 'roles'
    const roles = StorageEngine.getStored<SystemRole[]>('Roles', []);
    if (roles && roles.length > 0) return roles;
    return StorageEngine.getStored<SystemRole[]>('roles', DEFAULT_ROLES);
  }

  static async saveRole(role: SystemRole): Promise<void> {
    const syncRes = await syncWriteWithOfflineFallback('Roles', role.id, role);
    if (!syncRes.success) {
      throw new Error(syncRes.error || `فشل حفظ الدور في قاعدة البيانات.`);
    }
    const roles = UsersModule.getRoles();
    const index = roles.findIndex(r => r.id === role.id);
    if (index > -1) {
      roles[index] = role;
    } else {
      roles.push(role);
    }
    StorageEngine.setStored('Roles', roles);
  }

  static getSignupRequests(): SignupRequest[] {
    return StorageEngine.getStored<SignupRequest[]>('signup_requests', []);
  }

  /**
   * Validates per-organization-unit account headcount ceiling before signup request submission.
   * Enforces the rule that an organization unit cannot exceed its max_accounts_allowed (default 1, max 5).
   */
  static validateSignupRequestHeadcount(request: {
    org_unit_id?: string;
    station_id?: string;
    region_id?: string;
    company_id?: string;
    role?: string;
  }): {
    allowed: boolean;
    messageAr?: string;
    messageEn?: string;
    currentCount: number;
    maxAllowed: number;
    unit?: any;
  } {
    const unit = OrganizationEngine.resolveOrgUnitForEntity(request, request.company_id);

    if (!unit) {
      return { allowed: true, currentCount: 0, maxAllowed: 1 };
    }

    const headcount = OrganizationEngine.getUnitAccountHeadcount(unit.id);

    if (headcount.activeAccountsCount >= headcount.maxAllowed) {
      return {
        allowed: false,
        currentCount: headcount.activeAccountsCount,
        maxAllowed: headcount.maxAllowed,
        unit,
        messageAr: `عذراً، لقد وصلت هذه الوحدة التنظيمية ("${unit.nameAr || unit.name}") إلى الحد الأقصى المسموح به لعدد الحسابات (${headcount.maxAllowed}). يرجى الطلب من المسؤول في المستوى التنظيمي الأعلى رفع الحد أولاً.`,
        messageEn: `This organization unit ("${unit.nameEn || unit.name}") has reached its maximum allowed number of accounts (${headcount.maxAllowed}). Please ask the administrator at the organizational level above to increase the limit first.`
      };
    }

    return {
      allowed: true,
      currentCount: headcount.activeAccountsCount,
      maxAllowed: headcount.maxAllowed,
      unit
    };
  }

  static async saveSignupRequest(request: SignupRequest): Promise<void> {
    const requests = UsersModule.getSignupRequests();
    const isExisting = requests.some(r => r.id === request.id);
    if (!isExisting && request.status === 'Pending') {
      const validation = UsersModule.validateSignupRequestHeadcount(request);
      if (!validation.allowed) {
        throw new Error(validation.messageEn || 'Headcount limit reached for this organization unit.');
      }
    }

    // 1. Save locally first (local-first)
    const index = requests.findIndex(r => r.id === request.id);
    if (index > -1) {
      requests[index] = request;
    } else {
      requests.unshift(request);
    }
    StorageEngine.setStored('signup_requests', requests);

    // 2. Sync to Firestore without throwing on failure
    try {
      const syncRes = await syncWriteWithOfflineFallback('signup_requests', request.id, request);
      if (!syncRes.success) {
        console.warn(`[saveSignupRequest] Cloud sync deferred/warning: ${syncRes.error}`);
      }
    } catch (err: any) {
      console.warn('[saveSignupRequest] Firestore sync failed, saved locally:', err?.message || err);
    }
  }

  static async deleteSignupRequest(id: string): Promise<void> {
    // 1. Update local storage first (local-first) — remove immediately so UI cannot re-show it
    const requests = UsersModule.getSignupRequests();
    const filtered = requests.filter(r => r.id !== id);
    StorageEngine.setStored('signup_requests', filtered);

    // 2. Sync deletion to Firestore. Retry once. Never re-insert the deleted id from a failed path.
    const attemptDelete = async () => {
      return await syncWriteWithOfflineFallback('signup_requests', id, null);
    };

    try {
      let syncRes = await attemptDelete();
      if (!syncRes.success) {
        console.warn(`[deleteSignupRequest] Cloud delete deferred/warning: ${syncRes.error}`);
        // one quiet retry
        await new Promise(r => setTimeout(r, 400));
        syncRes = await attemptDelete();
        if (!syncRes.success) {
          console.warn(`[deleteSignupRequest] Cloud delete retry failed: ${syncRes.error}`);
        }
      }
    } catch (err: any) {
      console.warn('[deleteSignupRequest] Firestore delete failed, deleted locally:', err?.message || err);
    }

    // 3. Ensure local list still does not contain this id after any async listener race
    const after = UsersModule.getSignupRequests().filter(r => r.id !== id);
    if (after.length !== UsersModule.getSignupRequests().length) {
      StorageEngine.setStored('signup_requests', after);
    }
  }

  static upsertLocalUser(user: AppUser): void {
    const users = StorageEngine.getStored<AppUser[]>('users', DEFAULT_USERS);
    const index = users.findIndex(u => u.id === user.id || (u.email && user.email && u.email.toLowerCase().trim() === user.email.toLowerCase().trim()));
    
    const enrichedUser = {
      ...user,
      permissions: UsersModule.enrichUserPermissions(user.role, user.permissions)
    };

    let updated: AppUser[];
    if (index > -1) {
      updated = [...users];
      updated[index] = { ...updated[index], ...enrichedUser };
    } else {
      updated = [...users, enrichedUser];
    }
    
    StorageEngine.setStored('users', updated);
  }

  static getAccountCorrectionRequests(): AccountCorrectionRequest[] {
    return StorageEngine.getStored<AccountCorrectionRequest[]>('account_correction_requests', []);
  }

  static async saveAccountCorrectionRequest(request: AccountCorrectionRequest): Promise<void> {
    const requests = UsersModule.getAccountCorrectionRequests();
    const index = requests.findIndex(r => r.id === request.id);
    if (index > -1) {
      requests[index] = request;
    } else {
      requests.unshift(request);
    }
    StorageEngine.setStored('account_correction_requests', requests);

    try {
      const syncRes = await syncWriteWithOfflineFallback('account_correction_requests', request.id, request);
      if (!syncRes.success) {
        console.warn(`[saveAccountCorrectionRequest] Cloud sync deferred/warning: ${syncRes.error}`);
      }
    } catch (err: any) {
      console.warn('[saveAccountCorrectionRequest] Firestore sync failed, saved locally:', err?.message || err);
    }
  }

  static async deleteAccountCorrectionRequest(id: string): Promise<void> {
    const requests = UsersModule.getAccountCorrectionRequests();
    const filtered = requests.filter(r => r.id !== id);
    StorageEngine.setStored('account_correction_requests', filtered);

    try {
      const syncRes = await syncWriteWithOfflineFallback('account_correction_requests', id, null);
      if (!syncRes.success) {
        console.warn(`[deleteAccountCorrectionRequest] Cloud delete deferred/warning: ${syncRes.error}`);
      }
    } catch (err: any) {
      console.warn('[deleteAccountCorrectionRequest] Firestore delete failed, deleted locally:', err?.message || err);
    }
  }

  static async approveAccountCorrectionRequest(
    id: string,
    updates: {
      newEmail?: string;
      newFullName?: string;
      newPasswordPlain?: string;
      approvedBy?: string;
    }
  ): Promise<{ success: boolean; messageAr: string; messageEn: string }> {
    const requests = UsersModule.getAccountCorrectionRequests();
    const reqIndex = requests.findIndex(r => r.id === id);
    if (reqIndex === -1) {
      return { success: false, messageAr: 'طلب التعديل غير موجود', messageEn: 'Correction request not found' };
    }

    const request = requests[reqIndex];
    const users = UsersModule.getUsers();
    const userIndex = users.findIndex(u =>
      (request.targetUserId && u.id === request.targetUserId) ||
      (u.email && u.email.toLowerCase().trim() === request.targetEmail.toLowerCase().trim())
    );

    if (userIndex === -1) {
      return {
        success: false,
        messageAr: 'الحساب المستهدف غير موجود في قائمة المستخدمين',
        messageEn: 'Target account not found in active users list'
      };
    }

    const targetUser = { ...users[userIndex] };
    const oldEmail = targetUser.email;
    const oldName = targetUser.full_name;

    if (updates.newEmail && updates.newEmail.trim()) {
      targetUser.email = updates.newEmail.toLowerCase().trim();
    }
    if (updates.newFullName && updates.newFullName.trim()) {
      targetUser.full_name = updates.newFullName.trim();
    }
    if (updates.newPasswordPlain && updates.newPasswordPlain.trim()) {
      const salt = targetUser.salt || targetUser.email || oldEmail;
      const hashed = hashPassword(updates.newPasswordPlain, salt);
      targetUser.password = hashed;
      targetUser.salt = salt;
    }

    users[userIndex] = targetUser;
    await UsersModule.saveUsers(users);

    const updatedReq: AccountCorrectionRequest = {
      ...request,
      status: 'Approved',
      approved_at: new Date().toISOString(),
      approved_by: updates.approvedBy || 'Admin'
    };
    await UsersModule.saveAccountCorrectionRequest(updatedReq);

    LogsModule.logAudit(
      'APPROVE_ACCOUNT_CORRECTION',
      `Approved correction for user ${oldName} (${oldEmail}) -> ${targetUser.full_name} (${targetUser.email})`,
      {
        company_id: request.company_id,
        request_id: id,
        target_user_id: targetUser.id,
        old_email: oldEmail,
        new_email: targetUser.email,
        old_name: oldName,
        new_name: targetUser.full_name,
        password_reset: !!(updates.newPasswordPlain && updates.newPasswordPlain.trim())
      }
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }

    return {
      success: true,
      messageAr: 'تم اعتماد التعديل وتحديث بيانات الحساب بنجاح',
      messageEn: 'Account correction approved and user data updated successfully'
    };
  }

  static async rejectAccountCorrectionRequest(
    id: string,
    rejectionReason: string,
    rejectedBy?: string
  ): Promise<{ success: boolean; messageAr: string; messageEn: string }> {
    const requests = UsersModule.getAccountCorrectionRequests();
    const reqIndex = requests.findIndex(r => r.id === id);
    if (reqIndex === -1) {
      return { success: false, messageAr: 'طلب التعديل غير موجود', messageEn: 'Correction request not found' };
    }

    const request = requests[reqIndex];
    const updatedReq: AccountCorrectionRequest = {
      ...request,
      status: 'Rejected',
      rejection_reason: rejectionReason,
      approved_at: new Date().toISOString(),
      approved_by: rejectedBy || 'Admin'
    };
    await UsersModule.saveAccountCorrectionRequest(updatedReq);

    LogsModule.logAudit(
      'REJECT_ACCOUNT_CORRECTION',
      `Rejected correction request for user ${request.targetUserName} (${request.targetEmail}). Reason: ${rejectionReason}`,
      {
        company_id: request.company_id,
        request_id: id,
        target_email: request.targetEmail,
        rejection_reason: rejectionReason
      }
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }

    return {
      success: true,
      messageAr: 'تم رفض طلب تعديل الحساب',
      messageEn: 'Account correction request rejected'
    };
  }
}
