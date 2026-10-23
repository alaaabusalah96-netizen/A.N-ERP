import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as offlineQueue from './db/offlineQueue';
import { StorageEngine } from './db/storage';
import { CompaniesModule } from './db/companies';
import { StationsModule } from './db/stations';
import { BusinessGroupsModule } from './db/businessGroups';
import { TransactionsModule } from './db/transactions';
import { DEFAULT_USERS } from './db/defaults';

describe('Phase B — Write-Ordering Consistency Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const sysAdminUser = { ...DEFAULT_USERS[0], company_id: 'comp-1' };
    StorageEngine.setStored('active_user', sysAdminUser);
    StorageEngine.setStored('selected_company_id', 'comp-1');
  });

  describe('CompaniesModule Write-Ordering', () => {
    it('saves companies locally only when cloud sync succeeds', async () => {
      const initialCompanies = [{ id: 'comp-1', name: 'Original Company', custody_value: 1000 }];
      StorageEngine.setStored('companies', initialCompanies);

      const updatedCompanies = [{ id: 'comp-1', name: 'Updated Company', custody_value: 2000 }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: true,
        syncedToFirestore: true,
        queuedOffline: false
      });

      const res = await CompaniesModule.saveCompanies(updatedCompanies);
      expect(res.success).toBe(true);
      expect(StorageEngine.getStored('companies', [])).toEqual(updatedCompanies);
    });

    it('leaves local storage untouched and surfaces failure when cloud sync fails', async () => {
      const initialCompanies = [{ id: 'comp-1', name: 'Original Company', custody_value: 1000 }];
      StorageEngine.setStored('companies', initialCompanies);

      const updatedCompanies = [{ id: 'comp-1', name: 'Updated Company', custody_value: 2000 }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: false,
        syncedToFirestore: false,
        queuedOffline: false,
        error: 'Network connection lost'
      });

      const res = await CompaniesModule.saveCompanies(updatedCompanies);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Network connection lost');
      // Local storage must remain untouched with original data
      expect(StorageEngine.getStored('companies', [])).toEqual(initialCompanies);
    });
  });

  describe('StationsModule (Regions & Stations) Write-Ordering', () => {
    it('saves regions locally only when cloud sync succeeds', async () => {
      const initialRegions = [{ id: 'reg-1', name: 'Cairo Region', code: 'CAI', company_id: 'comp-1' }];
      StorageEngine.setStored('regions', initialRegions);

      const updatedRegions = [{ id: 'reg-1', name: 'Greater Cairo Region', code: 'GCAI', company_id: 'comp-1' }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: true,
        syncedToFirestore: true,
        queuedOffline: false
      });

      const res = await StationsModule.saveRegions(updatedRegions);
      expect(res.success).toBe(true);
      expect(StorageEngine.getStored('regions', [])).toEqual(updatedRegions);
    });

    it('leaves regions local storage untouched and surfaces error on sync failure', async () => {
      const initialRegions = [{ id: 'reg-1', name: 'Cairo Region', code: 'CAI', company_id: 'comp-1' }];
      StorageEngine.setStored('regions', initialRegions);

      const updatedRegions = [{ id: 'reg-1', name: 'Greater Cairo Region', code: 'GCAI', company_id: 'comp-1' }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: false,
        syncedToFirestore: false,
        queuedOffline: false,
        error: 'Permission denied in firestore'
      });

      const res = await StationsModule.saveRegions(updatedRegions);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Permission denied in firestore');
      expect(StorageEngine.getStored('regions', [])).toEqual(initialRegions);
    });

    it('saves stations locally only when cloud sync succeeds', async () => {
      const initialStations = [{ id: 'stn-1', station_name: 'Station 1', station_code: 'S1', custody_amount: 5000, is_active: true, company_id: 'comp-1' }];
      StorageEngine.setStored('stations', initialStations);

      const updatedStations = [{ id: 'stn-1', station_name: 'Station 1 Main', station_code: 'S1', custody_amount: 6000, is_active: true, company_id: 'comp-1' }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: true,
        syncedToFirestore: true,
        queuedOffline: false
      });

      const res = await StationsModule.saveStations(updatedStations);
      expect(res.success).toBe(true);
      expect(StorageEngine.getStored('stations', [])).toEqual(updatedStations);
    });

    it('leaves stations local storage untouched and surfaces error on sync failure', async () => {
      const initialStations = [{ id: 'stn-1', station_name: 'Station 1', station_code: 'S1', custody_amount: 5000, is_active: true, company_id: 'comp-1' }];
      StorageEngine.setStored('stations', initialStations);

      const updatedStations = [{ id: 'stn-1', station_name: 'Station 1 Main', station_code: 'S1', custody_amount: 6000, is_active: true, company_id: 'comp-1' }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: false,
        syncedToFirestore: false,
        queuedOffline: false,
        error: 'Station write quota exceeded'
      });

      const res = await StationsModule.saveStations(updatedStations);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Station write quota exceeded');
      expect(StorageEngine.getStored('stations', [])).toEqual(initialStations);
    });
  });

  describe('BusinessGroupsModule Write-Ordering', () => {
    it('saves groups locally only when cloud sync succeeds', async () => {
      const initialGroups = [{ id: 'bg-1', code: 'BG-1', nameAr: 'مجموعة 1', nameEn: 'Group 1', status: 'ACTIVE' as const, createdAt: '2026-01-01' }];
      StorageEngine.setStored('business_groups', initialGroups);

      const updatedGroups = [{ id: 'bg-1', code: 'BG-1', nameAr: 'مجموعة النصر', nameEn: 'Nasr Group', status: 'ACTIVE' as const, createdAt: '2026-01-01' }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: true,
        syncedToFirestore: true,
        queuedOffline: false
      });

      const res = await BusinessGroupsModule.saveGroups(updatedGroups);
      expect(res.success).toBe(true);
      expect(StorageEngine.getStored('business_groups', [])).toEqual(updatedGroups);
    });

    it('leaves groups local storage untouched and surfaces error on sync failure', async () => {
      const initialGroups = [{ id: 'bg-1', code: 'BG-1', nameAr: 'مجموعة 1', nameEn: 'Group 1', status: 'ACTIVE' as const, createdAt: '2026-01-01' }];
      StorageEngine.setStored('business_groups', initialGroups);

      const updatedGroups = [{ id: 'bg-1', code: 'BG-1', nameAr: 'مجموعة النصر', nameEn: 'Nasr Group', status: 'ACTIVE' as const, createdAt: '2026-01-01' }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: false,
        syncedToFirestore: false,
        queuedOffline: false,
        error: 'Firestore unreachable'
      });

      const res = await BusinessGroupsModule.saveGroups(updatedGroups);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Firestore unreachable');
      expect(StorageEngine.getStored('business_groups', [])).toEqual(initialGroups);
    });
  });

  describe('TransactionsModule (Categories) Write-Ordering', () => {
    it('saves categories locally only when cloud sync succeeds', async () => {
      const initialCategories = [{ id: 'cat-1', name_ar: 'وقود', name_en: 'Fuel' }];
      StorageEngine.setStored('categories', initialCategories);

      const updatedCategories = [{ id: 'cat-1', name_ar: 'وقود وزيوت', name_en: 'Fuel & Oil' }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: true,
        syncedToFirestore: true,
        queuedOffline: false
      });

      const res = await TransactionsModule.saveCategories(updatedCategories);
      expect(res.success).toBe(true);
      expect(StorageEngine.getStored('categories', [])).toEqual(updatedCategories);
    });

    it('leaves categories local storage untouched and surfaces error on sync failure', async () => {
      const initialCategories = [{ id: 'cat-1', name_ar: 'وقود', name_en: 'Fuel' }];
      StorageEngine.setStored('categories', initialCategories);

      const updatedCategories = [{ id: 'cat-1', name_ar: 'وقود وزيوت', name_en: 'Fuel & Oil' }];

      vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
        success: false,
        syncedToFirestore: false,
        queuedOffline: false,
        error: 'Network timeout during category sync'
      });

      const res = await TransactionsModule.saveCategories(updatedCategories);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Network timeout during category sync');
      expect(StorageEngine.getStored('categories', [])).toEqual(initialCategories);
    });
  });
});
