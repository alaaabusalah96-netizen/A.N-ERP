import { describe, it, expect, beforeEach } from 'vitest';
import { CustodyDB } from './db';
import { OrganizationEngine, repairOrgUnitLegacyLinkages } from './db/organizationEngine';
import { StorageEngine } from './db/storage';
import { AppUser, Company, Region, Station } from './types';

describe('Phase 3: Station Visibility and Reverse-Sync', () => {
  const companyA: Company = {
    id: 'comp-alpha',
    name: 'Alpha Corp',
    code: 'ALPHA',
    is_active: true
  };

  const companyB: Company = {
    id: 'comp-beta',
    name: 'Beta Corp',
    code: 'BETA',
    is_active: true
  };

  const regionNorthA: Region = {
    id: 'reg-north-a',
    company_id: 'comp-alpha',
    name: 'North Region Alpha',
    code: 'REG-NA',
    org_unit_id: 'ou-reg-north-a'
  };

  const regionSouthA: Region = {
    id: 'reg-south-a',
    company_id: 'comp-alpha',
    name: 'South Region Alpha',
    code: 'REG-SA',
    org_unit_id: 'ou-reg-south-a'
  };

  const regionNorthB: Region = {
    id: 'reg-north-b',
    company_id: 'comp-beta',
    name: 'North Region Beta',
    code: 'REG-NB',
    org_unit_id: 'ou-reg-north-b'
  };

  beforeEach(() => {
    StorageEngine.clearCache();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    StorageEngine.setStored('companies', [companyA, companyB]);
    StorageEngine.setStored('regions', [regionNorthA, regionSouthA, regionNorthB]);
    StorageEngine.setStored('stations', []);
    StorageEngine.setStored('organization_units', []);
    StorageEngine.setStored('organization_paths', []);
    OrganizationEngine.invalidateLookupIndex();
  });

  describe('A) addUnit / updateUnit reverse-sync', () => {
    it('creates a Station when an operational branch (out-branch) is added under a region unit', async () => {
      // 1. Create region unit
      const regUnitRes = await OrganizationEngine.addUnit({
        id: 'ou-reg-north-a',
        companyId: 'comp-alpha',
        name: 'North Region Unit',
        code: 'OU-NA',
        typeId: 'out-region',
        parentId: null,
        metadata: { legacyRegionId: 'reg-north-a' }
      });
      expect(regUnitRes.id).toBe('ou-reg-north-a');

      // 2. Add an operational branch under the region unit
      const branchRes = await OrganizationEngine.addUnit({
        id: 'ou-branch-alex',
        companyId: 'comp-alpha',
        name: 'Alexandria Operational Branch',
        code: 'BR-ALX',
        typeId: 'out-branch',
        parentId: 'ou-reg-north-a'
      });
      expect(branchRes.id).toBe('ou-branch-alex');
      expect(branchRes.metadata?.legacyStationId).toBeDefined();

      // Verify Station was upserted into stations
      const stations = CustodyDB.getStations();
      const branchStation = stations.find(s => s.org_unit_id === 'ou-branch-alex');
      expect(branchStation).toBeDefined();
      expect(branchStation?.company_id).toBe('comp-alpha');
      expect(branchStation?.region_id).toBe('reg-north-a');
      expect(branchStation?.station_name).toBe('Alexandria Operational Branch');
      expect(branchStation?.station_code).toBe('BR-ALX');
      expect(branchStation?.custody_amount).toBe(0);
    });

    it('resolves parent region chain across multi-level hierarchy (Sector -> Region -> Branch)', async () => {
      // 1. Sector
      await OrganizationEngine.addUnit({
        id: 'ou-sector-retail',
        companyId: 'comp-alpha',
        name: 'Retail Sector',
        code: 'SEC-RET',
        typeId: 'out-sector',
        parentId: null
      });

      // 2. Region under Sector
      await OrganizationEngine.addUnit({
        id: 'ou-reg-south-a',
        companyId: 'comp-alpha',
        name: 'South Region Unit',
        code: 'OU-SA',
        typeId: 'out-region',
        parentId: 'ou-sector-retail',
        metadata: { legacyRegionId: 'reg-south-a' }
      });

      // 3. Branch under Region
      const branchRes = await OrganizationEngine.addUnit({
        id: 'ou-branch-aswan',
        companyId: 'comp-alpha',
        name: 'Aswan Branch',
        code: 'BR-ASW',
        typeId: 'out-branch',
        parentId: 'ou-reg-south-a'
      });
      expect(branchRes.id).toBe('ou-branch-aswan');

      const stations = CustodyDB.getStations();
      const aswanStation = stations.find(s => s.org_unit_id === 'ou-branch-aswan');
      expect(aswanStation).toBeDefined();
      expect(aswanStation?.region_id).toBe('reg-south-a');
    });

    it('syncs updates from updateUnit to the corresponding Station', async () => {
      await OrganizationEngine.addUnit({
        id: 'ou-reg-north-a',
        companyId: 'comp-alpha',
        name: 'North Region Unit',
        code: 'OU-NA',
        typeId: 'out-region',
        parentId: null,
        metadata: { legacyRegionId: 'reg-north-a' }
      });

      await OrganizationEngine.addUnit({
        id: 'ou-branch-mansoura',
        companyId: 'comp-alpha',
        name: 'Mansoura Branch',
        code: 'BR-MAN',
        typeId: 'out-branch',
        parentId: 'ou-reg-north-a'
      });

      // Update branch name and custody
      const updateRes = await OrganizationEngine.updateUnit('ou-branch-mansoura', {
        name: 'Mansoura Central Branch',
        metadata: { custodyAmount: 75000 }
      });
      expect(updateRes).not.toBeNull();
      expect(updateRes?.name).toBe('Mansoura Central Branch');

      const stations = CustodyDB.getStations();
      const stn = stations.find(s => s.org_unit_id === 'ou-branch-mansoura');
      expect(stn?.station_name).toBe('Mansoura Central Branch');
      expect(stn?.custody_amount).toBe(75000);
    });

    it('repairs existing operational branches without Station when parent region is resolvable', async () => {
      // Manually store units where a branch exists without a station
      const existingUnits = [
        {
          id: 'ou-reg-north-a',
          companyId: 'comp-alpha',
          name: 'North Region Unit',
          code: 'OU-NA',
          typeId: 'out-region',
          parentId: null,
          isActive: true,
          level: 1,
          metadata: { legacyRegionId: 'reg-north-a' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'ou-branch-tanta',
          companyId: 'comp-alpha',
          name: 'Tanta Branch',
          code: 'BR-TANTA',
          typeId: 'out-branch',
          parentId: 'ou-reg-north-a',
          isActive: true,
          level: 2,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      StorageEngine.setStored('organization_units', existingUnits);
      StorageEngine.setStored('stations', []);

      const report = repairOrgUnitLegacyLinkages('comp-alpha');
      expect(report.fixedStations).toBeGreaterThan(0);
      expect(report.repairedBranches).toBe(1);

      const stations = CustodyDB.getStations();
      const repairedStation = stations.find(s => s.org_unit_id === 'ou-branch-tanta');
      expect(repairedStation).toBeDefined();
      expect(repairedStation?.region_id).toBe('reg-north-a');
      expect(repairedStation?.station_name).toBe('Tanta Branch');
    });
  });

  const makeUser = (partial: Partial<AppUser> & { id: string; email: string; role: any }): AppUser => ({
    full_name: 'Test User',
    permissions: {} as any,
    is_active: true,
    ...partial
  });

  describe('B) getStationsForUser visibility matrix', () => {
    let stationAlphaNorth1: Station;
    let stationAlphaNorth2: Station;
    let stationAlphaSouth1: Station;
    let stationBetaNorth1: Station;

    beforeEach(async () => {
      stationAlphaNorth1 = {
        id: 'stn-an1',
        station_name: 'Alpha North 1',
        station_code: 'STN-AN1',
        company_id: 'comp-alpha',
        region_id: 'reg-north-a',
        custody_amount: 10000,
        is_active: true
      };

      stationAlphaNorth2 = {
        id: 'stn-an2',
        station_name: 'Alpha North 2',
        station_code: 'STN-AN2',
        company_id: 'comp-alpha',
        region_id: 'reg-north-a',
        custody_amount: 20000,
        is_active: true
      };

      stationAlphaSouth1 = {
        id: 'stn-as1',
        station_name: 'Alpha South 1',
        station_code: 'STN-AS1',
        company_id: 'comp-alpha',
        region_id: 'reg-south-a',
        custody_amount: 15000,
        is_active: true
      };

      stationBetaNorth1 = {
        id: 'stn-bn1',
        station_name: 'Beta North 1',
        station_code: 'STN-BN1',
        company_id: 'comp-beta',
        region_id: 'reg-north-b',
        custody_amount: 30000,
        is_active: true
      };

      StorageEngine.setStored('stations', [
        stationAlphaNorth1,
        stationAlphaNorth2,
        stationAlphaSouth1,
        stationBetaNorth1
      ]);
    });

    it('Admin sees all stations for their company, but not other companies', () => {
      const adminAlpha = makeUser({
        id: 'user-admin-a',
        email: 'admin@alpha.com',
        role: 'Admin',
        company_id: 'comp-alpha'
      });

      const adminBeta = makeUser({
        id: 'user-admin-b',
        email: 'admin@beta.com',
        role: 'Admin',
        company_id: 'comp-beta'
      });

      const stationsA = CustodyDB.getStationsForUser(adminAlpha);
      expect(stationsA.map(s => s.id).sort()).toEqual(['stn-an1', 'stn-an2', 'stn-as1'].sort());

      const stationsB = CustodyDB.getStationsForUser(adminBeta);
      expect(stationsB.map(s => s.id)).toEqual(['stn-bn1']);
    });

    it('RegionalManager sees stations in their region, never other regions or companies', () => {
      const rmNorthA = makeUser({
        id: 'user-rm-north-a',
        email: 'rm-north@alpha.com',
        role: 'RegionalManager',
        company_id: 'comp-alpha',
        region_id: 'reg-north-a'
      });

      const rmSouthA = makeUser({
        id: 'user-rm-south-a',
        email: 'rm-south@alpha.com',
        role: 'RegionalManager',
        company_id: 'comp-alpha',
        region_id: 'reg-south-a'
      });

      const rmNorthB = makeUser({
        id: 'user-rm-north-b',
        email: 'rm-north@beta.com',
        role: 'RegionalManager',
        company_id: 'comp-beta',
        region_id: 'reg-north-b'
      });

      const northStations = CustodyDB.getStationsForUser(rmNorthA);
      expect(northStations.map(s => s.id).sort()).toEqual(['stn-an1', 'stn-an2'].sort());

      const southStations = CustodyDB.getStationsForUser(rmSouthA);
      expect(southStations.map(s => s.id)).toEqual(['stn-as1']);

      const betaStations = CustodyDB.getStationsForUser(rmNorthB);
      expect(betaStations.map(s => s.id)).toEqual(['stn-bn1']);
    });

    it('RegionalManager with org_unit_id set STILL sees stations matching region_id (OR semantics: never skip region match)', () => {
      // User has both region_id and a specific assigned org_unit_id
      const rmWithOrgUnit = makeUser({
        id: 'user-rm-hybrid',
        email: 'rm-hybrid@alpha.com',
        role: 'RegionalManager',
        company_id: 'comp-alpha',
        region_id: 'reg-north-a',
        org_unit_id: 'some-non-matching-unit'
      });

      const visible = CustodyDB.getStationsForUser(rmWithOrgUnit);
      // Because station.region_id === user.region_id evaluates to true under OR,
      // the stations matching region_id MUST NOT be hidden!
      expect(visible.map(s => s.id).sort()).toEqual(['stn-an1', 'stn-an2'].sort());
    });

    it('StationAdmin sees only their assigned station_id', () => {
      const stationAdmin = makeUser({
        id: 'user-stn-admin',
        email: 'stn1@alpha.com',
        role: 'StationAdmin',
        company_id: 'comp-alpha',
        region_id: 'reg-north-a',
        station_id: 'stn-an1'
      });

      const visible = CustodyDB.getStationsForUser(stationAdmin);
      expect(visible.map(s => s.id)).toEqual(['stn-an1']);
    });

    it('denies access by default for null or unauthorized user roles', () => {
      expect(CustodyDB.getStationsForUser(null)).toEqual([]);
      expect(CustodyDB.getStationsForUser(undefined)).toEqual([]);

      const unknownUser: any = {
        id: 'user-guest',
        email: 'guest@unknown.com',
        role: 'Guest',
        company_id: 'comp-alpha'
      };
      expect(CustodyDB.getStationsForUser(unknownUser)).toEqual([]);
    });

    it('SystemAdmin sees stations scoped to the selected company', () => {
      const sysAdmin = makeUser({
        id: 'user-sysadmin',
        email: 'sys@platform.com',
        role: 'SystemAdmin'
      });

      CustodyDB.setSelectedCompanyId('comp-alpha');
      const alphaStations = CustodyDB.getStationsForUser(sysAdmin);
      expect(alphaStations.map(s => s.id).sort()).toEqual(['stn-an1', 'stn-an2', 'stn-as1'].sort());

      CustodyDB.setSelectedCompanyId('comp-beta');
      const betaStations = CustodyDB.getStationsForUser(sysAdmin);
      expect(betaStations.map(s => s.id)).toEqual(['stn-bn1']);
    });
  });
});
