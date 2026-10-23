import { Region, Station, AppUser } from '../types';
import { StorageEngine } from './storage';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { DEFAULT_REGIONS, DEFAULT_STATIONS } from './defaults';
import { UsersModule } from './users';
import { LogsModule } from './logs';
import { CompaniesModule } from './companies';
import { OrganizationScopeEngine } from './organizationScopeEngine';
import { OrganizationEngine, isOperationalCustodyType, repairOrgUnitLegacyLinkages } from './organizationEngine';
import { OrganizationUnit } from '../types/organization';
import { requireCompanyId } from './companyGuard';

export class StationsModule {
  // Regions
  static getRegions(): Region[] {
    const raw = StorageEngine.getStored<Region[]>('regions', DEFAULT_REGIONS);
    const seen = new Set<string>();
    const deduplicated: Region[] = [];
    for (const r of raw) {
      if (r && r.id && !seen.has(r.id)) {
        seen.add(r.id);
        deduplicated.push(r);
      }
    }
    if (raw.length !== deduplicated.length) {
      StorageEngine.setStored('regions', deduplicated);
    }
    return deduplicated;
  }

  static getScopedRegions(): Region[] {
    const regions = StationsModule.getRegions();
    const user = UsersModule.getActiveUser();
    if (!user) return [];

    if (user.role === 'SystemAdmin') {
      const targetCompanyId = CompaniesModule.getSelectedCompanyId();
      return regions.filter(r => r.company_id === targetCompanyId);
    }

    const userCompanyId = user.company_id;
    let filtered = regions.filter(r => r.company_id === userCompanyId);

    // Organization Scope evaluation with tree inheritance
    if (user.org_unit_id || (user.assigned_org_unit_ids && user.assigned_org_unit_ids.length > 0)) {
      return OrganizationScopeEngine.filterByOrganizationScope(filtered, user);
    }

    if (user.role === 'RegionalManager') {
      if (user.region_id) {
        filtered = filtered.filter(r => r.id === user.region_id);
      }
    } else if (user.role === 'StationAdmin') {
      if (user.station_id) {
        const stations = StationsModule.getStations();
        const station = stations.find(s => s.id === user.station_id);
        if (station && station.region_id) {
          filtered = filtered.filter(r => r.id === station.region_id);
        } else {
          return [];
        }
      } else {
        return [];
      }
    }

    return filtered;
  }

  static async saveRegions(regions: Region[]): Promise<{ success: boolean; error?: string }> {
    const seen = new Set<string>();
    const deduplicated: Region[] = [];
    for (const r of regions) {
      if (r && r.id && !seen.has(r.id)) {
        seen.add(r.id);
        deduplicated.push(r);
      }
    }

    const existing = StorageEngine.getStored<Region[]>('regions', []);
    const changedRegions = deduplicated.filter(r => {
      const old = existing.find(ex => ex.id === r.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(r);
    });

    for (const r of changedRegions) {
      const res = await syncWriteWithOfflineFallback('regions', r.id, r);
      if (!res.success) {
        const errorMsg = res.error || `فشل حفظ بيانات المنطقة ${r.name || r.id} في قاعدة البيانات.`;
        console.warn(`[saveRegions] Warning: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    }

    StorageEngine.setStored('regions', deduplicated);
    return { success: true };
  }

  static async addRegion(name: string, code?: string, companyId?: string): Promise<Region | null> {
    const compId = requireCompanyId(companyId || CompaniesModule.getSelectedCompanyId());
    const regId = crypto.randomUUID();
    const org_unit_id = `org-unit-region-${regId}`;

    const newReg: Region = {
      id: regId,
      name,
      code: code || '',
      company_id: compId,
      org_unit_id
    };
    let createdUnitId: string | null = null;
    // Compatibility sync: mirror creation into Organization Engine
    try {
      const units = StorageEngine.getStored<OrganizationUnit[]>('organization_units', []);
      const parentUnit = units.find(u => u.id === `org-unit-company-${compId}` || (u.companyId === compId && u.typeId === 'out-company'));

      const createdUnit = await OrganizationEngine.addUnit({
        companyId: compId,
        parentId: parentUnit?.id || null,
        typeId: 'out-region',
        code: code || `REG-${regId}`,
        name: name,
        nameAr: name,
        nameEn: name,
        metadata: { legacyRegionId: regId },
        isActive: true
      });
      if (createdUnit?.id) {
        createdUnitId = createdUnit.id;
      }
    } catch (err) {
      console.warn('Region compatibility sync to OrganizationUnit failed:', err);
    }

    if (createdUnitId) {
      newReg.org_unit_id = createdUnitId;
    }

    const currentRegions = StationsModule.getRegions();
    const existingIndex = currentRegions.findIndex(r => r.id === newReg.id);
    let updated: Region[];
    if (existingIndex >= 0) {
      updated = [...currentRegions];
      updated[existingIndex] = { ...updated[existingIndex], ...newReg };
    } else {
      updated = [...currentRegions, newReg];
    }
    const res = await StationsModule.saveRegions(updated);
    if (!res.success) {
      return null;
    }

    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Add Region', `Created region: ${name}`);
    return newReg;
  }

  static async updateRegion(id: string, updates: Partial<Region>): Promise<{ success: boolean; error?: string }> {
    const regions = StationsModule.getRegions();
    const idx = regions.findIndex(r => r.id === id);
    if (idx !== -1) {
      const updated = [...regions];
      updated[idx] = { ...updated[idx], ...updates };
      const res = await StationsModule.saveRegions(updated);
      if (!res.success) {
        return res;
      }

      // Compatibility sync: update corresponding OrganizationUnit
      try {
        const units = StorageEngine.getStored<OrganizationUnit[]>('organization_units', []);
        const matchedUnit = units.find(u => u.id === `org-unit-region-${id}` || (u.metadata && u.metadata.legacyRegionId === id));
        if (matchedUnit) {
          OrganizationEngine.updateUnit(matchedUnit.id, {
            name: updates.name || matchedUnit.name,
            nameAr: updates.name || matchedUnit.nameAr,
            nameEn: updates.name || matchedUnit.nameEn,
            code: updates.code !== undefined ? updates.code : matchedUnit.code
          });
        }
      } catch (err) {
        console.warn('Region compatibility sync update failed:', err);
      }

      const user = UsersModule.getActiveUser();
      LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Update Region', `Modified region: ${updated[idx].name}`);
      return { success: true };
    }
    return { success: false, error: 'Region not found' };
  }

  static async deleteRegion(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await syncWriteWithOfflineFallback('regions', id, null);
    if (!res.success) {
      console.warn(`[deleteRegion] Warning: ${res.error}`);
      return { success: false, error: res.error };
    }
    const regions = StationsModule.getRegions().filter(r => r.id !== id);
    StorageEngine.setStored('regions', regions);

    // Compatibility sync: delete corresponding OrganizationUnit
    try {
      const units = StorageEngine.getStored<OrganizationUnit[]>('organization_units', []);
      const matchedUnit = units.find(u => u.id === `org-unit-region-${id}` || (u.metadata && u.metadata.legacyRegionId === id));
      if (matchedUnit) {
        OrganizationEngine.deleteUnit(matchedUnit.id);
      }
    } catch (err) {
      console.warn('Region compatibility sync delete failed:', err);
    }

    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Delete Region', `Deleted region ID: ${id}`);
    return { success: true };
  }

  private static isRepairing = false;

  // Stations
  static getStations(): Station[] {
    const raw = StorageEngine.getStored<Station[]>('stations', DEFAULT_STATIONS);
    const seen = new Set<string>();
    const deduplicated: Station[] = [];
    for (const s of raw) {
      if (s && s.id && !seen.has(s.id)) {
        seen.add(s.id);
        deduplicated.push(s);
      }
    }
    if (raw.length !== deduplicated.length) {
      StorageEngine.setStored('stations', deduplicated);
    }

    // Auto-repair existing out-branch/operational units without Station if parent region resolvable
    if (!StationsModule.isRepairing) {
      const units = StorageEngine.getStored<OrganizationUnit[]>('organization_units', []);
      const hasUnlinkedOperationalUnit = units.some(u =>
        isOperationalCustodyType(u.typeId) &&
        !deduplicated.some(s => s.org_unit_id === u.id || (u.metadata?.legacyStationId && s.id === u.metadata.legacyStationId))
      );
      if (hasUnlinkedOperationalUnit) {
        StationsModule.isRepairing = true;
        try {
          repairOrgUnitLegacyLinkages();
        } finally {
          StationsModule.isRepairing = false;
        }
        return StorageEngine.getStored<Station[]>('stations', deduplicated);
      }
    }

    return deduplicated;
  }

  static getStationsForUser(user: AppUser | null | undefined): Station[] {
    if (!user) return [];

    const stations = StationsModule.getStations();

    // SystemAdmin: selected company
    if (user.role === 'SystemAdmin' || user.is_platform_owner) {
      const targetCompanyId = CompaniesModule.getSelectedCompanyId() || user.company_id;
      if (targetCompanyId) {
        return stations.filter(s => s.company_id === targetCompanyId);
      }
      return stations;
    }

    // Admin: all stations for user.company_id
    if (user.role === 'Admin') {
      if (!user.company_id) return [];
      return stations.filter(s => s.company_id === user.company_id);
    }

    // RegionalManager: company_id match AND (
    //   station.region_id === user.region_id
    //   OR org-tree scope of org_unit_id / assigned_org_unit_ids
    //   OR station.org_unit_id descendant of user’s region unit
    // ) using OR — never skip region match only because org_unit_id is set
    if (user.role === 'RegionalManager') {
      const userCompanyId = user.company_id;
      if (!userCompanyId) return [];

      const hasOrgScope = Boolean(user.org_unit_id || (user.assigned_org_unit_ids && user.assigned_org_unit_ids.length > 0));
      const accessibleOrgUnitIds = hasOrgScope ? OrganizationScopeEngine.getAccessibleOrgUnitIds(user, userCompanyId) : [];

      let regionUnitIds: Set<string> | null = null;
      if (user.region_id) {
        regionUnitIds = new Set<string>();
        const allUnits = OrganizationEngine.getOrganizationUnits(userCompanyId);
        const regions = StationsModule.getRegions();
        const userRegion = regions.find(r => r.id === user.region_id && r.company_id === userCompanyId);

        const matchingUnits = allUnits.filter(u =>
          (userRegion?.org_unit_id && u.id === userRegion.org_unit_id) ||
          u.metadata?.legacyRegionId === user.region_id ||
          u.metadata?.legacy_region_id === user.region_id ||
          u.id === `org-unit-region-${user.region_id}` ||
          u.id === user.region_id ||
          u.code === user.region_id
        );

        for (const ru of matchingUnits) {
          regionUnitIds.add(ru.id);
          const descendants = OrganizationEngine.getDescendantUnits(ru.id, userCompanyId);
          for (const d of descendants) {
            regionUnitIds.add(d.id);
          }
        }
      }

      return stations.filter(station => {
        if (station.company_id !== userCompanyId) return false;

        // 1. Direct region_id match
        if (user.region_id && station.region_id === user.region_id) {
          return true;
        }

        // 2. Org-tree scope of org_unit_id / assigned_org_unit_ids
        if (hasOrgScope) {
          if (station.org_unit_id && accessibleOrgUnitIds.includes(station.org_unit_id)) {
            return true;
          }
          if (OrganizationScopeEngine.isTargetInUserScope(station, user)) {
            return true;
          }
        }

        // 3. station.org_unit_id descendant of user's region unit
        if (station.org_unit_id && regionUnitIds && regionUnitIds.has(station.org_unit_id)) {
          return true;
        }

        return false;
      });
    }

    // StationAdmin: user.station_id only
    if (user.role === 'StationAdmin') {
      if (!user.station_id) return [];
      return stations.filter(s => (user.company_id ? s.company_id === user.company_id : true) && s.id === user.station_id);
    }

    // Deny-by-default otherwise
    return [];
  }

  static getScopedStations(forUser?: AppUser): Station[] {
    const user = forUser || UsersModule.getActiveUser();
    return StationsModule.getStationsForUser(user);
  }

  static async saveStations(stations: Station[]): Promise<{ success: boolean; error?: string }> {
    const seen = new Set<string>();
    const deduplicated: Station[] = [];
    for (const s of stations) {
      if (s && s.id && !seen.has(s.id)) {
        seen.add(s.id);
        deduplicated.push(s);
      }
    }

    const existing = StorageEngine.getStored<Station[]>('stations', []);
    const changedStations = deduplicated.filter(s => {
      const old = existing.find(ex => ex.id === s.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(s);
    });

    for (const s of changedStations) {
      const res = await syncWriteWithOfflineFallback('stations', s.id, s);
      if (!res.success) {
        const errorMsg = res.error || `فشل حفظ بيانات المحطة ${s.station_name || s.id} في قاعدة البيانات.`;
        console.warn(`[saveStations] Warning: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    }

    StorageEngine.setStored('stations', deduplicated);
    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Update Stations', 'Modified available cash custody stations configuration.');
    return { success: true };
  }

  static async addStation(name: string, code: string, custodyAmount: number, regionId?: string, companyId?: string): Promise<Station | null> {
    const compId = requireCompanyId(companyId || CompaniesModule.getSelectedCompanyId());
    const stnId = crypto.randomUUID();
    const org_unit_id = `org-unit-station-${stnId}`;

    const newStn: Station = {
      id: stnId,
      station_name: name,
      station_code: code,
      custody_amount: custodyAmount,
      is_active: true,
      region_id: regionId || undefined,
      company_id: compId,
      org_unit_id
    };
    let createdUnitId: string | null = null;
    // Compatibility sync: mirror creation into Organization Engine
    try {
      let parentUnitId = `org-unit-company-${compId}`;
      if (regionId) {
        const units = StorageEngine.getStored<OrganizationUnit[]>('organization_units', []);
        const regUnit = units.find(u => u.id === `org-unit-region-${regionId}` || (u.metadata && u.metadata.legacyRegionId === regionId));
        if (regUnit) parentUnitId = regUnit.id;
      }

      const createdUnit = await OrganizationEngine.addUnit({
        companyId: compId,
        parentId: parentUnitId,
        typeId: 'out-station',
        code: code || `STN-${stnId}`,
        name: name,
        nameAr: name,
        nameEn: name,
        metadata: { legacyStationId: stnId, custodyAmount },
        isActive: true
      });
      if (createdUnit?.id) {
        createdUnitId = createdUnit.id;
      }
    } catch (err) {
      console.warn('Station compatibility sync to OrganizationUnit failed:', err);
    }

    if (createdUnitId) {
      newStn.org_unit_id = createdUnitId;
    }

    const currentStations = StationsModule.getStations();
    const existingIndex = currentStations.findIndex(s => s.id === newStn.id);
    let updated: Station[];
    if (existingIndex >= 0) {
      updated = [...currentStations];
      updated[existingIndex] = { ...updated[existingIndex], ...newStn };
    } else {
      updated = [...currentStations, newStn];
    }
    const res = await StationsModule.saveStations(updated);
    if (!res.success) {
      return null;
    }

    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Add Station', `Created station: ${name} with custody ${custodyAmount} EGP`);
    LogsModule.logAudit('CREATE_STATION', `Created station ${name} (${code}) with custody ${custodyAmount} EGP.`, {
      after: newStn
    });
    return newStn;
  }

  static async updateStation(id: string, updates: Partial<Station>): Promise<{ success: boolean; error?: string }> {
    const stations = StationsModule.getStations();
    const idx = stations.findIndex(s => s.id === id);
    if (idx !== -1) {
      const before = { ...stations[idx] };
      const after = { ...stations[idx], ...updates };
      const updated = [...stations];
      updated[idx] = after;
      const res = await StationsModule.saveStations(updated);
      if (!res.success) {
        return res;
      }

      // Compatibility sync: update corresponding OrganizationUnit
      try {
        const units = StorageEngine.getStored<OrganizationUnit[]>('organization_units', []);
        const matchedUnit = units.find(u => u.id === `org-unit-station-${id}` || (u.metadata && u.metadata.legacyStationId === id));
        if (matchedUnit) {
          OrganizationEngine.updateUnit(matchedUnit.id, {
            name: updates.station_name || matchedUnit.name,
            nameAr: updates.station_name || matchedUnit.nameAr,
            nameEn: updates.station_name || matchedUnit.nameEn,
            code: updates.station_code !== undefined ? updates.station_code : matchedUnit.code,
            metadata: {
              ...matchedUnit.metadata,
              custodyAmount: updates.custody_amount !== undefined ? updates.custody_amount : matchedUnit.metadata?.custodyAmount
            }
          });
        }
      } catch (err) {
        console.warn('Station compatibility sync update failed:', err);
      }

      // If custody_amount changed, propagate difference to company's custody_value
      if (updates.custody_amount !== undefined && updates.custody_amount !== before.custody_amount) {
        const diff = updates.custody_amount - before.custody_amount;
        const compId = before.company_id || CompaniesModule.getSelectedCompanyId();
        const companies = CompaniesModule.getCompanies();
        const compIdx = companies.findIndex(c => c.id === compId);
        if (compIdx !== -1) {
          const updatedCompany = {
            ...companies[compIdx],
            custody_value: (companies[compIdx].custody_value || 0) + diff
          };
          const compList = [...companies];
          compList[compIdx] = updatedCompany;
          await CompaniesModule.saveCompanies(compList);
        }
      }

      const user = UsersModule.getActiveUser();
      LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Update Station', `Modified station: ${updated[idx].station_name}`);
      LogsModule.logAudit('UPDATE_STATION', `Updated station ${before.station_name} (${before.station_code}).`, {
        before,
        after
      });
      return { success: true };
    }
    return { success: false, error: 'Station not found' };
  }

  static async deleteStation(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await syncWriteWithOfflineFallback('stations', id, null);
    if (!res.success) {
      console.warn(`[deleteStation] Warning: ${res.error}`);
      return { success: false, error: res.error };
    }
    const before = StationsModule.getStations().find(s => s.id === id);
    const stations = StationsModule.getStations().filter(s => s.id !== id);
    StorageEngine.setStored('stations', stations);

    // Compatibility sync: delete corresponding OrganizationUnit
    try {
      const units = StorageEngine.getStored<OrganizationUnit[]>('organization_units', []);
      const matchedUnit = units.find(u => u.id === `org-unit-station-${id}` || (u.metadata && u.metadata.legacyStationId === id));
      if (matchedUnit) {
        OrganizationEngine.deleteUnit(matchedUnit.id);
      }
    } catch (err) {
      console.warn('Station compatibility sync delete failed:', err);
    }

    const user = UsersModule.getActiveUser();
    LogsModule.addLog(user?.id || 'system', user?.full_name || 'System', 'Delete Station', `Deleted station ID: ${id}`);
    if (before) {
      LogsModule.logAudit('DELETE_STATION', `Deleted station ${before.station_name} (${before.station_code}).`, {
        before
      });
    }
    return { success: true };
  }
}
