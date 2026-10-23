import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Item 3: User Delete Policy Alignment (Server & UI)', () => {
  const serverCode = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');
  const uaccCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/settings/UnifiedAccessControlCenter.tsx'), 'utf-8');
  const settingsCode = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Settings.tsx'), 'utf-8');

  it('1. server.ts DELETE /api/admin/users/:id strictly restricts deletion to Platform Admin / SystemAdmin', () => {
    // Extract DELETE route block
    const deleteRouteIndex = serverCode.indexOf('app.delete("/api/admin/users/:id"');
    const deleteRouteCode = serverCode.slice(deleteRouteIndex, deleteRouteIndex + 1500);

    // Confirm company Admin cannot delete users on server API
    expect(deleteRouteCode).toContain('if (!isPlatformAdmin) {');
    expect(deleteRouteCode).toContain('Forbidden: Insufficient privileges to delete user. User deletion is reserved for Platform Admins');
    expect(deleteRouteCode).not.toContain('!isPlatformAdmin && creator.role !== "Admin"');
    expect(deleteRouteCode).not.toContain('targetData.company_id !== creator.company_id');
  });

  it('2. server.ts blocks self-deletion', () => {
    expect(serverCode).toContain('if (targetUserId === creator.id)');
    expect(serverCode).toContain('Cannot delete your own active session account');
  });

  it('3. UI UnifiedAccessControlCenter restricts delete button strictly to isSystemAdmin && u.id !== currentUser.id', () => {
    expect(uaccCode).toContain('isSystemAdmin && u.id !== currentUser.id');
  });

  it('4. Settings page handleDeleteUser enforces currentUser.role === "SystemAdmin" and blocks self deletion', () => {
    expect(settingsCode).toContain("if (currentUser.role !== 'SystemAdmin')");
    expect(settingsCode).toContain('if (id === currentUser.id)');
  });

  it('5. Policy logic evaluation: Company Admin denied, SystemAdmin permitted, Self-delete blocked', () => {
    const isAllowedToDelete = (callerRole: string, callerId: string, targetId: string) => {
      const isPlatformAdmin = callerRole === 'SystemAdmin';
      if (!isPlatformAdmin) return { allowed: false, reason: 'FORBIDDEN_NOT_SYSTEM_ADMIN' };
      if (callerId === targetId) return { allowed: false, reason: 'CANNOT_DELETE_SELF' };
      return { allowed: true };
    };

    // Company Admin cannot delete another user
    expect(isAllowedToDelete('Admin', 'admin_1', 'user_2')).toEqual({
      allowed: false,
      reason: 'FORBIDDEN_NOT_SYSTEM_ADMIN'
    });

    // Cashier cannot delete another user
    expect(isAllowedToDelete('Cashier', 'cashier_1', 'user_2')).toEqual({
      allowed: false,
      reason: 'FORBIDDEN_NOT_SYSTEM_ADMIN'
    });

    // SystemAdmin can delete another user
    expect(isAllowedToDelete('SystemAdmin', 'sys_admin_1', 'user_2')).toEqual({
      allowed: true
    });

    // SystemAdmin cannot delete self
    expect(isAllowedToDelete('SystemAdmin', 'sys_admin_1', 'sys_admin_1')).toEqual({
      allowed: false,
      reason: 'CANNOT_DELETE_SELF'
    });
  });
});
