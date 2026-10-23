import { Company } from '../types';
import { auth } from '../firebase';
import { StorageEngine, loadFromIDB } from './storage';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { DEFAULT_COMPANIES } from './defaults';
import { UsersModule } from './users';
import { LogsModule } from './logs';

export type CompanyHydrationStatus = 'loading' | 'empty' | 'ready';

function isDevOrTest(): boolean {
  // If NODE_ENV is explicitly production or import.meta.env.PROD is true, it is production (not dev/test)
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
    return false;
  }
  if (typeof (import.meta as any) !== 'undefined' && (import.meta as any).env && (import.meta as any).env.PROD === true) {
    return false;
  }

  // Otherwise check if explicitly dev or test
  if (typeof (import.meta as any) !== 'undefined' && (import.meta as any).env) {
    if ((import.meta as any).env.DEV) return true;
    if ((import.meta as any).env.MODE === 'test' || (import.meta as any).env.MODE === 'development') return true;
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return true;
    }
  }
  return false;
}

export class CompaniesModule {
  private static _isHydrated: boolean = false;
  private static _hydratePromise: Promise<Company[]> | null = null;

  static isHydrated(): boolean {
    if (StorageEngine.cache['companies'] !== undefined) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('custody_companies') !== null) return true;
    return this._isHydrated;
  }

  static getHydrationStatus(): CompanyHydrationStatus {
    const companies = this.getCompanies();
    if (!this.isHydrated() && companies.length === 0) {
      return 'loading';
    }
    return companies.length > 0 ? 'ready' : 'empty';
  }

  static async ensureHydrated(): Promise<Company[]> {
    if (this._hydratePromise) return this._hydratePromise;

    this._hydratePromise = (async () => {
      // If already in cache
      if (StorageEngine.cache['companies'] !== undefined) {
        this._isHydrated = true;
        return StorageEngine.cache['companies'];
      }

      // Check localStorage first
      if (typeof localStorage !== 'undefined') {
        const local = localStorage.getItem('custody_companies');
        if (local !== null) {
          try {
            const parsed = JSON.parse(local);
            StorageEngine.cache['companies'] = parsed;
            this._isHydrated = true;
            return parsed;
          } catch {}
        }
      }

      // Load from IDB
      if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
        try {
          const idbVal = await loadFromIDB('companies');
          if (idbVal !== undefined && idbVal !== null) {
            StorageEngine.cache['companies'] = idbVal;
            this._isHydrated = true;
            return idbVal;
          }
        } catch {}
      }

      // If nothing in local or IDB
      const fallback = isDevOrTest() ? DEFAULT_COMPANIES : [];
      StorageEngine.cache['companies'] = fallback;
      this._isHydrated = true;
      return fallback;
    })();

    return this._hydratePromise;
  }

  static getCompanies(): Company[] {
    const deletedIds = new Set(StorageEngine.getStored<string[]>('deleted_company_ids', []));
    const fallback = isDevOrTest() ? DEFAULT_COMPANIES.filter(c => !deletedIds.has(c.id)) : [];
    const companies = StorageEngine.getStored<Company[]>('companies', fallback);
    return companies.filter(c => !deletedIds.has(c.id));
  }

  static async saveCompanies(companies: Company[]): Promise<{ success: boolean; error?: string }> {
    const existing = StorageEngine.getStored<Company[]>('companies', []);
    const changedCompanies = companies.filter(c => {
      const old = existing.find(ex => ex.id === c.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(c);
    });

    for (const c of changedCompanies) {
      const res = await syncWriteWithOfflineFallback('companies', c.id, c);
      if (!res.success) {
        const errorMsg = res.error || `فشل حفظ بيانات الشركة ${c.name || c.id} في قاعدة البيانات.`;
        console.warn(`[saveCompanies] Warning: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    }

    StorageEngine.setStored('companies', companies);
    return { success: true };
  }

  static async addCompany(name: string, custodyValue?: number, customId?: string): Promise<Company | null> {
    const companies = CompaniesModule.getCompanies();
    const val = custodyValue ?? 0;
    const companyId = (customId && customId.trim()) ? customId.trim() : crypto.randomUUID();
    const newCompany: Company = {
      id: companyId,
      name,
      custody_value: val,
      is_active: true,
      subscription_status: 'active',
      subscription_plan: 'Enterprise'
    };
    const updated = [...companies, newCompany];
    const res = await CompaniesModule.saveCompanies(updated);
    if (!res.success) {
      return null;
    }

    // Auto-migrate & provision root organizational unit for the new company
    try {
      const { OrganizationEngine } = await import('./organizationEngine');
      OrganizationEngine.autoMigrateLegacyStructure(newCompany.id);
    } catch (orgErr) {
      console.warn('[addCompany] Could not auto-migrate org structure for company:', orgErr);
    }

    // Attempt authoritative backend API sync for server-side persistence
    try {
      const { getAuthHeaders } = await import('../lib/userProvisioning');
      const headers = await getAuthHeaders();
      await fetch('/api/admin/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          id: newCompany.id,
          name: newCompany.name,
          custody_value: newCompany.custody_value,
          subscription_plan: 'Enterprise',
          subscription_status: 'active'
        })
      });
    } catch (apiErr) {
      console.warn('[addCompany] Backend API company sync skipped/warning:', apiErr);
    }
    
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Add Company', `Created new company: ${name}`);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('custody_db_updated', { detail: { key: 'companies', value: updated } }));
    }

    return newCompany;
  }

  static async updateCompany(id: string, updates: Partial<Company>): Promise<{ success: boolean; error?: string }> {
    const companies = CompaniesModule.getCompanies();
    const idx = companies.findIndex(c => c.id === id);
    if (idx !== -1) {
      const updated = [...companies];
      updated[idx] = { ...updated[idx], ...updates };
      const res = await CompaniesModule.saveCompanies(updated);
      if (!res.success) {
        return res;
      }
      const user = UsersModule.getActiveUser();
      LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Update Company', `Modified company: ${updated[idx].name}`);
      return { success: true };
    }
    return { success: false, error: 'Company not found' };
  }

  static async deleteCompany(id: string): Promise<{ success: boolean; error?: string; message?: string }> {
    // 1. Call backend server cascading deletion API with credentials and valid auth header
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else if (typeof localStorage !== 'undefined') {
        const sessionToken = localStorage.getItem('custody_auth_token');
        if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
      }
    } catch (err) {
      console.warn('[deleteCompany] Could not acquire auth token:', err);
    }

    let serverRes: Response | null = null;
    let data: any = null;
    try {
      serverRes = await fetch(`/api/admin/companies/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });
      data = await serverRes.json().catch(() => ({}));
    } catch (networkErr: any) {
      console.error('[deleteCompany] Network error calling /api/admin/companies:', networkErr);
      return {
        success: false,
        error: networkErr?.message || 'Network error communicating with server.'
      };
    }

    // 2. Parse JSON; success ONLY if res.ok && data.success
    if (!serverRes || !serverRes.ok || !data?.success) {
      const errorMsg = data?.message || (serverRes ? `Server returned HTTP ${serverRes.status}` : 'Unknown error');
      console.warn('[deleteCompany] Deletion aborted because server failed:', errorMsg);
      // 3. On failure: do NOT remove company/users from local storage; show data.message; return { success: false }
      return {
        success: false,
        error: errorMsg
      };
    }

    // 4. On success only: then local cascade (companies, users, regions, stations, selection) as today
    const deletedIds = StorageEngine.getStored<string[]>('deleted_company_ids', []);
    if (!deletedIds.includes(id)) {
      deletedIds.push(id);
      StorageEngine.setStored('deleted_company_ids', deletedIds);
    }

    // Delete from Firestore via syncWriteWithOfflineFallback
    await syncWriteWithOfflineFallback('companies', id, null);

    // Cascade delete across all local collections
    // Filter companies
    const companies = StorageEngine.getStored<Company[]>('companies', []).filter(c => c.id !== id);
    StorageEngine.setStored('companies', companies);

    // Filter users belonging to this company (check both company_id and companyId)
    const allUsers = StorageEngine.getStored<any[]>('users', []).filter(u => u.company_id !== id && u.companyId !== id);
    StorageEngine.setStored('users', allUsers);

    // Filter regions belonging to this company
    const allRegions = StorageEngine.getStored<any[]>('regions', []).filter(r => r.company_id !== id && r.companyId !== id);
    StorageEngine.setStored('regions', allRegions);

    // Filter stations belonging to this company
    const allStations = StorageEngine.getStored<any[]>('stations', []).filter(s => s.company_id !== id && s.companyId !== id);
    StorageEngine.setStored('stations', allStations);

    // If current selected company was this deleted one, reset selection
    if (StorageEngine.getStored('selected_company_id', '') === id) {
      const nextComp = companies[0]?.id || '';
      StorageEngine.setStored('selected_company_id', nextComp);
    }

    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Delete Company', `Deleted company ID: ${id} and all associated users and data`);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }

    return { success: true, message: data.message };
  }

  static getSelectedCompanyId(): string {
    const resolveFromStorage = (): string => {
      const stored = StorageEngine.getStored<string>('selected_company_id', '');
      if (stored && stored !== 'undefined' && stored !== 'null') return stored;

      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('custody_selected_company_id');
        if (saved && saved !== 'undefined' && saved !== 'null') {
          try {
            const parsed = JSON.parse(saved);
            if (typeof parsed === 'string') return parsed;
          } catch {
            return saved;
          }
        }
      }
      return '';
    };

    const user = UsersModule.getActiveUser();
    if (!user) {
      return resolveFromStorage();
    }
    
    if (user.role !== 'SystemAdmin' && user.company_id) {
      return user.company_id;
    }
    
    return resolveFromStorage();
  }

  static setSelectedCompanyId(id: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('custody_selected_company_id', id);
    }
    StorageEngine.setStored('selected_company_id', id);
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Switch Company', `Viewing focus changed to company ID: ${id}`);
  }

  static async toggleCompanyStatus(companyId: string, isActive: boolean): Promise<void> {
    const companies = CompaniesModule.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx !== -1) {
      const updated = [...companies];
      updated[idx] = { ...updated[idx], is_active: isActive };
      const res = await CompaniesModule.saveCompanies(updated);
      if (!res.success) return;
      
      const activeUser = UsersModule.getActiveUser();
      const superAdmin = activeUser?.impersonator || activeUser;
      const statusStr = isActive ? 'Activated' : 'Suspended';
      LogsModule.addLog(superAdmin?.id || 'system', superAdmin?.full_name || 'System', 'Toggle Company Status', `${statusStr} company ${updated[idx].name}`);
      LogsModule.logAudit('COMPANY_STATUS_TOGGLE', `Super Admin ${statusStr.toLowerCase()} company ${updated[idx].name}`, {
        company_id: companyId,
        company_name: updated[idx].name,
        is_active: isActive
      });
    }
  }

  static async updateCompanySubscription(
    companyId: string,
    plan: Company['subscription_plan'],
    status: Company['subscription_status'],
    expiry: string
  ): Promise<void> {
    const companies = CompaniesModule.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx !== -1) {
      const updated = [...companies];
      updated[idx] = { 
        ...updated[idx], 
        subscription_plan: plan, 
        subscription_status: status, 
        subscription_expiry: expiry 
      };
      const res = await CompaniesModule.saveCompanies(updated);
      if (!res.success) return;
      
      const activeUser = UsersModule.getActiveUser();
      const superAdmin = activeUser?.impersonator || activeUser;
      LogsModule.addLog(superAdmin?.id || 'system', superAdmin?.full_name || 'System', 'Update Subscription', `Updated subscription for ${updated[idx].name} to ${plan} (${status})`);
      LogsModule.logAudit('COMPANY_SUBSCRIPTION_UPDATE', `Super Admin updated subscription for company ${updated[idx].name} to plan ${plan} with status ${status}`, {
        company_id: companyId,
        company_name: updated[idx].name,
        subscription_plan: plan,
        subscription_status: status,
        subscription_expiry: expiry
      });
    }
  }

  static async setCompanyGroup(companyId: string, groupId: string | undefined): Promise<void> {
    const companies = CompaniesModule.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx !== -1) {
      const updated = [...companies];
      updated[idx] = { ...updated[idx], group_id: groupId };
      const res = await CompaniesModule.saveCompanies(updated);
      if (!res.success) return;
      
      const user = UsersModule.getActiveUser();
      LogsModule.addLog(
        user?.id || 'system', 
        user?.full_name || 'System', 
        'Set Company Group', 
        `Associated company ${updated[idx].name} with business group ID: ${groupId || 'None'}`
      );
      LogsModule.logAudit('COMPANY_GROUP_ASSOCIATION', `Associated company ${updated[idx].name} with business group ID ${groupId || 'None'}`, {
        company_id: companyId,
        group_id: groupId
      });
    }
  }

  static async markCompanyAsMerged(sourceCompanyId: string, targetCompanyId: string): Promise<void> {
    const companies = CompaniesModule.getCompanies();
    const idx = companies.findIndex(c => c.id === sourceCompanyId);
    if (idx !== -1) {
      const updated = [...companies];
      updated[idx] = { 
        ...updated[idx], 
        status_merge: 'MERGED', 
        merged_into_company_id: targetCompanyId 
      };
      const res = await CompaniesModule.saveCompanies(updated);
      if (!res.success) return;
      
      const user = UsersModule.getActiveUser();
      LogsModule.addLog(
        user?.id || 'system', 
        user?.full_name || 'System', 
        'Merge Company', 
        `Marked company ${updated[idx].name} as MERGED into target company ID: ${targetCompanyId}`
      );
      LogsModule.logAudit('COMPANY_MERGED', `Marked company ${updated[idx].name} as merged into company ID ${targetCompanyId}`, {
        source_company_id: sourceCompanyId,
        target_company_id: targetCompanyId
      });
      
      // TODO: Future search and report screens must track merged_into_company_id for data consolidation
      // and redirect query visibility from sourceCompanyId to targetCompanyId per business requirements.
    }
  }
}

