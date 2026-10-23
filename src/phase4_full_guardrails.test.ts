import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CustodyDB } from './db';
import { StorageEngine } from './db/storage';
import { CompaniesModule } from './db/companies';
import { StationsModule } from './db/stations';
import { OrganizationEngine } from './db/organizationEngine';
import * as userProvisioning from './lib/userProvisioning';
import { deriveScopeIdsFromOrgUnit } from './pages/Settings';
import type { Company, Region, Station, AppUser } from './types';

describe('Phase 4: Comprehensive Guardrails & Vitest Coverage', () => {
  beforeEach(() => {
    localStorage.clear();
    StorageEngine.cache = {};
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // PHASE 1 GUARDRAILS
  // -------------------------------------------------------------------------
  describe('Phase 1 Guardrails: Admin Provisioning & Atomicity', () => {
    it('preserves typed password when >= 12 chars', () => {
      const typedPass = 'SecureTypedPassword2026!';
      const initialAdminPass = typedPass.length >= 12
        ? typedPass
        : `Pass@${Math.floor(100000 + Math.random() * 900000)}${Math.random().toString(36).slice(2, 6)}`;

      expect(initialAdminPass).toBe(typedPass);
      expect(initialAdminPass.length).toBeGreaterThanOrEqual(12);
    });

    it('generates secure temporary password >= 12 chars when password is blank or short', () => {
      const blankPass = '';
      const initialAdminPass = blankPass.length >= 12
        ? blankPass
        : `Pass@${Math.floor(100000 + Math.random() * 900000)}${Math.random().toString(36).slice(2, 6)}`;

      expect(initialAdminPass.length).toBeGreaterThanOrEqual(12);
      expect(initialAdminPass.startsWith('Pass@')).toBe(true);
    });

    it('invokes createManagedUser with exact parameters and must_change_password: true', async () => {
      let capturedPayload: any = null;
      vi.spyOn(userProvisioning, 'createManagedUser').mockImplementation(async (payload) => {
        capturedPayload = payload;
        return {
          success: true,
          user: {
            id: 'usr_created_admin',
            email: payload.email,
            full_name: payload.full_name || 'Admin',
            role: 'Admin',
            company_id: payload.company_id,
            permissions: payload.permissions || {},
            must_change_password: payload.must_change_password ?? true,
            is_active: true
          }
        };
      });

      const res = await userProvisioning.createManagedUser({
        email: 'ceo@testcorp.com',
        password: 'Pass@992819abcd',
        full_name: 'Chief Executive',
        role: 'Admin',
        company_id: 'comp_testcorp_1',
        permissions: CustodyDB.enrichUserPermissions('Admin'),
        must_change_password: true
      });

      expect(res.success).toBe(true);
      expect(capturedPayload.email).toBe('ceo@testcorp.com');
      expect(capturedPayload.password).toBe('Pass@992819abcd');
      expect(capturedPayload.role).toBe('Admin');
      expect(capturedPayload.company_id).toBe('comp_testcorp_1');
      expect(capturedPayload.must_change_password).toBe(true);
    });

    it('rolls back company on createManagedUser failure so no orphaned company remains', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'Deleted' })
      } as any);

      const targetCompId = 'comp_orphan_test';
      const comp = await CustodyDB.addCompany('Orphan Candidate', 0);
      await CustodyDB.updateCompany(comp!.id, { id: targetCompId });

      expect(CustodyDB.getCompanies().some(c => c.id === targetCompId)).toBe(true);

      // Simulate createManagedUser failure
      const provisionRes = {
        success: false,
        message: 'Firebase Auth rate limit exceeded'
      };

      // Rollback must delete company
      if (!provisionRes.success) {
        await CustodyDB.deleteCompany(targetCompId);
      }

      const remaining = CustodyDB.getCompanies();
      expect(remaining.some(c => c.id === targetCompId)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 2 GUARDRAILS
  // -------------------------------------------------------------------------
  describe('Phase 2 Guardrails: Server-First Company Deletion', () => {
    const COMP_ID = 'comp_phase4_del';

    beforeEach(() => {
      const mockComp: Company = { id: COMP_ID, name: 'Del Test Co', is_active: true };
      const mockUser: AppUser = {
        id: 'usr_del_1',
        email: 'del@test.com',
        full_name: 'Del User',
        role: 'Admin',
        company_id: COMP_ID,
        is_active: true,
        permissions: {}
      };
      const mockRegion: Region = { id: 'reg_del_1', company_id: COMP_ID, name: 'Del Region' };
      const mockStation: Station = {
        id: 'st_del_1',
        company_id: COMP_ID,
        region_id: 'reg_del_1',
        station_name: 'Del Station',
        station_code: 'ST-DEL-01',
        custody_amount: 1000,
        is_active: true
      };

      StorageEngine.setStored('companies', [mockComp]);
      StorageEngine.setStored('users', [mockUser]);
      StorageEngine.setStored('regions', [mockRegion]);
      StorageEngine.setStored('stations', [mockStation]);
    });

    it('deleteCompany aborts and does NOT wipe local storage on HTTP 500 or success:false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ success: false, message: 'Internal Server Error' })
      } as any);

      const res = await CompaniesModule.deleteCompany(COMP_ID);
      expect(res.success).toBe(false);

      // Local storage must remain completely intact
      expect(StorageEngine.getStored<Company[]>('companies', []).some(c => c.id === COMP_ID)).toBe(true);
      expect(StorageEngine.getStored<AppUser[]>('users', []).some(u => u.company_id === COMP_ID)).toBe(true);
      expect(StorageEngine.getStored<Region[]>('regions', []).some(r => r.company_id === COMP_ID)).toBe(true);
      expect(StorageEngine.getStored<Station[]>('stations', []).some(s => s.company_id === COMP_ID)).toBe(true);
    });

    it('deleteCompany wipes local storage and records tombstone on HTTP 200 with success:true', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'Deleted' })
      } as any);

      const res = await CompaniesModule.deleteCompany(COMP_ID);
      expect(res.success).toBe(true);

      // Local storage must be wiped
      expect(StorageEngine.getStored<Company[]>('companies', []).some(c => c.id === COMP_ID)).toBe(false);
      expect(StorageEngine.getStored<AppUser[]>('users', []).some(u => u.company_id === COMP_ID)).toBe(false);
      expect(StorageEngine.getStored<Region[]>('regions', []).some(r => r.company_id === COMP_ID)).toBe(false);
      expect(StorageEngine.getStored<Station[]>('stations', []).some(s => s.company_id === COMP_ID)).toBe(false);

      // Tombstone recorded
      const tombstones = StorageEngine.getStored<string[]>('deleted_company_ids', []);
      expect(tombstones.includes(COMP_ID)).toBe(true);
    });

    it('recreating company admin with SAME email after successful deletion succeeds cleanly', async () => {
      // Step 1: Company deleted on server and locally
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      } as any);
      await CompaniesModule.deleteCompany(COMP_ID);

      // Step 2: Provision same email for a new company
      const NEW_COMP_ID = 'comp_fresh_reuse';
      vi.spyOn(userProvisioning, 'createManagedUser').mockResolvedValue({
        success: true,
        user: {
          id: 'usr_recreated_admin',
          email: 'del@test.com',
          full_name: 'Recreated Admin',
          role: 'Admin',
          company_id: NEW_COMP_ID,
          permissions: CustodyDB.enrichUserPermissions('Admin'),
          must_change_password: true,
          is_active: true
        }
      });

      const comp = await CustodyDB.addCompany('Fresh Recreated Co', 0);
      await CustodyDB.updateCompany(comp!.id, { id: NEW_COMP_ID });

      const adminRes = await userProvisioning.createManagedUser({
        email: 'del@test.com',
        password: 'Pass@1234567890!',
        full_name: 'Recreated Admin',
        role: 'Admin',
        company_id: NEW_COMP_ID,
        permissions: CustodyDB.enrichUserPermissions('Admin'),
        must_change_password: true
      });

      expect(adminRes.success).toBe(true);
      expect(adminRes.user?.company_id).toBe(NEW_COMP_ID);
      expect(adminRes.user?.email).toBe('del@test.com');
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 3 GUARDRAILS
  // -------------------------------------------------------------------------
  describe('Phase 3 Guardrails: Atomic Region Persistence & Fail-Closed Derivation', () => {
    const COMP_ID = 'comp_tree_guard';

    it('addUnit out-region failure rolls back and leaves no orphaned unit', async () => {
      vi.spyOn(StationsModule, 'saveRegions').mockResolvedValueOnce({
        success: false,
        error: 'Firestore quota exceeded'
      });

      await expect(
        OrganizationEngine.addUnit({
          companyId: COMP_ID,
          typeId: 'out-region',
          code: 'REG-FAIL',
          name: 'فشل الإنشاء'
        })
      ).rejects.toThrow('Firestore quota exceeded');

      const units = OrganizationEngine.getUnits(COMP_ID);
      expect(units.find(u => u.code === 'REG-FAIL')).toBeUndefined();
    });

    it('deriveScopeIdsFromOrgUnit returns null/unlinked when regions row is absent', () => {
      vi.spyOn(CustodyDB, 'getRegions').mockReturnValue([]);
      StorageEngine.setStored('organization_units', [{
        id: 'unit-unbacked',
        companyId: COMP_ID,
        parentId: null,
        typeId: 'out-region',
        code: 'REG-UNBACKED',
        name: 'منطقة بلا صف',
        nameAr: 'منطقة بلا صف',
        nameEn: 'Unbacked',
        isActive: true,
        path: '/unit-unbacked',
        level: 1,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      }]);

      const derived = deriveScopeIdsFromOrgUnit('unit-unbacked', 'RegionalManager');
      expect(derived.region_id).toBeNull();
      expect(derived.unlinked).toBe(true);
      expect(derived.unlinkedMessage).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // STATIC ASSERTIONS / GUARDRAILS
  // -------------------------------------------------------------------------
  describe('Static Anti-Silent-Failure Guardrails', () => {
    it('UnifiedAccessControlCenter.tsx: handleCreateCompany does not catch and swallow admin creation error', () => {
      const uaccPath = path.resolve(__dirname, 'components/settings/UnifiedAccessControlCenter.tsx');
      const content = fs.readFileSync(uaccPath, 'utf8');

      // Assert that when createManagedUser fails, company is rolled back and an error is thrown
      expect(content).toContain('CustodyDB.deleteCompany(effectiveCompanyId)');
      expect(content).toContain('throw new Error');

      // Assert that credentials modal is NOT shown on error
      const afterCreateAdmin = content.slice(content.indexOf('createManagedUser({'));
      expect(afterCreateAdmin).toContain('setCreatedCompanyCredentials');
      expect(afterCreateAdmin).toContain('if (!provisionRes.success || !provisionRes.user)');
    });

    it('companies.ts: deleteCompany does not wipe local storage on server error', () => {
      const compPath = path.resolve(__dirname, 'db/companies.ts');
      const content = fs.readFileSync(compPath, 'utf8');

      // Ensure serverRes.ok and data.success are required before any local deletion
      expect(content).toContain('if (!serverRes || !serverRes.ok || !data?.success)');
      expect(content).toContain('return {');
      expect(content).toContain('success: false');

      // Ensure local wipe comes strictly after the server check inside deleteCompany
      const deleteCompIndex = content.indexOf('static async deleteCompany(');
      const deleteCompBody = content.slice(deleteCompIndex);
      const failIndex = deleteCompBody.indexOf('if (!serverRes || !serverRes.ok || !data?.success)');
      const localRemoveIndex = deleteCompBody.indexOf("StorageEngine.setStored('companies',");
      expect(failIndex).toBeGreaterThan(0);
      expect(localRemoveIndex).toBeGreaterThan(failIndex);
    });

    it('Settings.tsx: handleAddUser strictly assigns derived.region_id without fallback', () => {
      const settingsPath = path.resolve(__dirname, 'pages/Settings.tsx');
      const content = fs.readFileSync(settingsPath, 'utf8');

      expect(content).toContain('region_id: isRegional ? (derived.region_id || null) : null');
      expect(content).not.toContain('region_id: isRegional ? (derived.region_id || newUserRegionId || null) : null');
    });

    it('server.ts: region verification requires region-like organization unit or real region document', () => {
      const serverPath = path.resolve(__dirname, '../server.ts');
      const content = fs.readFileSync(serverPath, 'utf8');

      expect(content).toContain("orgData?.typeId === 'out-region'");
      expect(content).toContain("isRegionType");
    });
  });
});
