import { describe, it, expect, beforeEach } from 'vitest';
import { StationsModule } from './db/stations';
import { StorageEngine } from './db/storage';
import { Region, Station } from './types';

describe('Region and Station Deduplication & Single-Write Guarantees', () => {
  beforeEach(() => {
    localStorage.clear();
    StorageEngine.cache = {};
  });

  it('1. StationsModule.addRegion creates exactly one region without duplication', async () => {
    const compId = 'test-co-dedup-1';
    const region = await StationsModule.addRegion('منطقة الجيزة', 'GIZA-01', compId);

    expect(region).not.toBeNull();
    expect(region?.id).toBeDefined();

    const allRegions = StationsModule.getRegions();
    const matches = allRegions.filter(r => r.id === region!.id);
    expect(matches.length).toBe(1);

    const compRegions = allRegions.filter(r => r.company_id === compId);
    expect(compRegions.length).toBe(1);
    expect(compRegions[0].name).toBe('منطقة الجيزة');
  });

  it('2. StationsModule.getRegions self-heals and deduplicates existing duplicate IDs in storage', () => {
    const duplicateRegion: Region = {
      id: 'reg-duplicate-uuid',
      name: 'منطقة القاهرة',
      code: 'CAIRO',
      company_id: 'co-cairo',
      org_unit_id: 'org-unit-region-cairo'
    };

    // Simulate corrupted/duplicate storage state
    StorageEngine.setStored('regions', [duplicateRegion, { ...duplicateRegion }, { ...duplicateRegion }]);
    
    // getRegions should return only 1 unique region
    const deduped = StationsModule.getRegions();
    expect(deduped.filter(r => r.id === 'reg-duplicate-uuid').length).toBe(1);

    // And storage should have been self-healed
    const rawInStorage = StorageEngine.getStored<Region[]>('regions', []);
    expect(rawInStorage.filter(r => r.id === 'reg-duplicate-uuid').length).toBe(1);
  });

  it('3. StationsModule.addStation creates exactly one station without duplication', async () => {
    const compId = 'test-co-dedup-2';
    const reg = await StationsModule.addRegion('منطقة الإسكندرية', 'ALEX-01', compId);
    const station = await StationsModule.addStation('فرع سموحة', 'SMH-01', 5000, reg?.id, compId);

    expect(station).not.toBeNull();
    expect(station?.id).toBeDefined();

    const allStations = StationsModule.getStations();
    const matches = allStations.filter(s => s.id === station!.id);
    expect(matches.length).toBe(1);

    const compStations = allStations.filter(s => s.company_id === compId);
    expect(compStations.length).toBe(1);
    expect(compStations[0].station_name).toBe('فرع سموحة');
  });

  it('4. StationsModule.getStations self-heals and deduplicates existing duplicate IDs in storage', () => {
    const duplicateStation: Station = {
      id: 'stn-duplicate-uuid',
      station_name: 'محطة الهرم',
      station_code: 'HRM-1',
      custody_amount: 10000,
      is_active: true,
      company_id: 'co-giza',
      org_unit_id: 'org-unit-station-hrm'
    };

    // Simulate duplicate entries
    StorageEngine.setStored('stations', [duplicateStation, { ...duplicateStation }]);

    const deduped = StationsModule.getStations();
    expect(deduped.filter(s => s.id === 'stn-duplicate-uuid').length).toBe(1);

    const rawInStorage = StorageEngine.getStored<Station[]>('stations', []);
    expect(rawInStorage.filter(s => s.id === 'stn-duplicate-uuid').length).toBe(1);
  });

  it('5. saveRegions and saveStations deduplicate input arrays before persisting', async () => {
    const r1: Region = { id: 'r-1', name: 'R1', code: 'C1', company_id: 'co-1' };
    await StationsModule.saveRegions([r1, { ...r1 }, { ...r1 }]);

    const savedRegions = StorageEngine.getStored<Region[]>('regions', []);
    expect(savedRegions.filter(r => r.id === 'r-1').length).toBe(1);

    const s1: Station = { id: 's-1', station_name: 'S1', station_code: 'SC1', custody_amount: 100, is_active: true, company_id: 'co-1' };
    await StationsModule.saveStations([s1, { ...s1 }, { ...s1 }]);

    const savedStations = StorageEngine.getStored<Station[]>('stations', []);
    expect(savedStations.filter(s => s.id === 's-1').length).toBe(1);
  });
});
