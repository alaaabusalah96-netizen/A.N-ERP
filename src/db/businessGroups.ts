import { BusinessGroup } from '../types';
import { StorageEngine } from './storage';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { UsersModule } from './users';
import { LogsModule } from './logs';

export class BusinessGroupsModule {
  static getGroups(): BusinessGroup[] {
    return StorageEngine.getStored<BusinessGroup[]>('business_groups', []);
  }

  static async saveGroups(groups: BusinessGroup[]): Promise<{ success: boolean; error?: string }> {
    const existing = StorageEngine.getStored<BusinessGroup[]>('business_groups', []);
    const changedGroups = groups.filter(g => {
      const old = existing.find(ex => ex.id === g.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(g);
    });

    for (const g of changedGroups) {
      const res = await syncWriteWithOfflineFallback('business_groups', g.id, g);
      if (!res.success) {
        const errorMsg = res.error || `فشل حفظ بيانات مجموعة الأعمال ${g.nameAr || g.nameEn || g.id} في قاعدة البيانات.`;
        console.warn(`[saveGroups] Warning: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    }

    StorageEngine.setStored('business_groups', groups);
    return { success: true };
  }

  static async addGroup(code: string, nameAr: string, nameEn: string): Promise<BusinessGroup | null> {
    const groups = BusinessGroupsModule.getGroups();
    const newGroup: BusinessGroup = {
      id: crypto.randomUUID(),
      code,
      nameAr,
      nameEn,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    const updated = [...groups, newGroup];
    const res = await BusinessGroupsModule.saveGroups(updated);
    if (!res.success) {
      return null;
    }
    
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(
      user?.id || 'system', 
      user?.full_name || 'System', 
      'Add Business Group', 
      `Created new business group: ${nameEn} (${code})`
    );
    LogsModule.logAudit('BUSINESS_GROUP_CREATE', `User created business group ${nameEn} with code ${code}`, {
      group_id: newGroup.id,
      code,
      nameAr,
      nameEn
    });
    return newGroup;
  }

  static async updateGroup(id: string, updates: Partial<BusinessGroup>): Promise<{ success: boolean; error?: string }> {
    const groups = BusinessGroupsModule.getGroups();
    const idx = groups.findIndex(g => g.id === id);
    if (idx !== -1) {
      const original = groups[idx];
      const updated = [...groups];
      updated[idx] = { 
        ...original, 
        ...updates, 
        updatedAt: new Date().toISOString() 
      };
      const res = await BusinessGroupsModule.saveGroups(updated);
      if (!res.success) {
        return res;
      }
      
      const user = UsersModule.getActiveUser();
      LogsModule.addLog(
        user?.id || 'system', 
        user?.full_name || 'System', 
        'Update Business Group', 
        `Modified business group: ${updated[idx].nameEn}`
      );
      LogsModule.logAudit('BUSINESS_GROUP_UPDATE', `User updated business group ${updated[idx].nameEn}`, {
        group_id: id,
        updates
      });
      return { success: true };
    }
    return { success: false, error: 'Business group not found' };
  }

  static async toggleGroupStatus(groupId: string, isActive: boolean): Promise<void> {
    const groups = BusinessGroupsModule.getGroups();
    const idx = groups.findIndex(g => g.id === groupId);
    if (idx !== -1) {
      const newStatus: BusinessGroup['status'] = isActive ? 'ACTIVE' : 'INACTIVE';
      const updated = [...groups];
      updated[idx] = { 
        ...groups[idx], 
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      const res = await BusinessGroupsModule.saveGroups(updated);
      if (!res.success) return;
      
      const activeUser = UsersModule.getActiveUser();
      const operator = activeUser?.impersonator || activeUser;
      const statusStr = isActive ? 'Activated' : 'Suspended';
      LogsModule.addLog(
        operator?.id || 'system', 
        operator?.full_name || 'System', 
        'Toggle Business Group Status', 
        `${statusStr} business group ${updated[idx].nameEn}`
      );
      LogsModule.logAudit('BUSINESS_GROUP_STATUS_TOGGLE', `User changed business group ${updated[idx].nameEn} status to ${newStatus}`, {
        group_id: groupId,
        nameEn: updated[idx].nameEn,
        status: newStatus
      });
    }
  }

  static async deleteGroup(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await syncWriteWithOfflineFallback('business_groups', id, null);
    if (!res.success) {
      console.warn(`[deleteGroup] Warning: ${res.error}`);
      return { success: false, error: res.error };
    }
    const groups = BusinessGroupsModule.getGroups().filter(g => g.id !== id);
    StorageEngine.setStored('business_groups', groups);
    return { success: true };
  }
}
