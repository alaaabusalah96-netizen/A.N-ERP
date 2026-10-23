import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PurchasingBusinessEngine, PURCHASING_COLLECTIONS } from './lib/enterprise/purchasing_engine';
import { StorageEngine } from './db/storage';
import * as offlineQueue from './db/offlineQueue';

describe('PurchasingBusinessEngine Write-Order and Cloud Sync Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    StorageEngine.cache = {};
  });

  it('addVendor commits to StorageEngine only when cloud sync succeeds', async () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const res = await PurchasingBusinessEngine.addVendor(
      'COMP-001',
      'مورد الأهرام',
      'Al-Ahram Vendor',
      '01000000000',
      'ahram@example.com'
    );

    expect(res.success).toBe(true);
    expect(res.vendor).toBeDefined();
    expect(syncSpy).toHaveBeenCalledWith(
      PURCHASING_COLLECTIONS.VENDORS,
      res.vendor?.id,
      expect.objectContaining({ nameAr: 'مورد الأهرام' })
    );

    const stored = StorageEngine.getStored<any[]>('vendors', []);
    expect(stored.find(v => v.id === res.vendor?.id)).toBeDefined();
  });

  it('addVendor aborts and leaves StorageEngine unchanged when cloud sync fails', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Permission Denied'
    });

    const res = await PurchasingBusinessEngine.addVendor(
      'COMP-001',
      'مورد مرفوض',
      'Rejected Vendor'
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('Permission Denied');

    const stored = StorageEngine.getStored<any[]>('vendors', []);
    expect(stored.length).toBe(0);
  });

  it('saveWorkflowConfig updates StorageEngine only when cloud sync succeeds', async () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const config = {
      companyId: 'COMP-001',
      requirePrApproval: true,
      allowDirectPoWithoutPr: false,
      prPrefix: 'PR-TEST',
      poPrefix: 'PO-TEST',
      rfqPrefix: 'RFQ-TEST',
      vendorPrefix: 'VND-TEST',
      requireRfqAboveAmount: 10000,
      autoCreatePoOnPrApprove: false,
      enableVendorPortal: false,
      prApprovalThresholds: [],
      poApprovalThresholds: []
    };

    const res = await PurchasingBusinessEngine.saveWorkflowConfig(config);
    expect(res.success).toBe(true);
    expect(syncSpy).toHaveBeenCalledWith(
      PURCHASING_COLLECTIONS.WORKFLOW_CONFIGS,
      'COMP-001',
      config
    );

    const stored = StorageEngine.getStored<any[]>('purchasing_workflow_configs', []);
    expect(stored[0].prPrefix).toBe('PR-TEST');
  });

  it('savePurchaseRequests and savePurchaseOrders handle cloud sync failures gracefully', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Network Error'
    });

    const resPR = await PurchasingBusinessEngine.savePurchaseRequests([
      { id: 'pr-1', company_id: 'COMP-001' } as any
    ]);
    expect(resPR.success).toBe(false);
    expect(resPR.error).toContain('Network Error');

    const resPO = await PurchasingBusinessEngine.savePurchaseOrders([
      { id: 'po-1', company_id: 'COMP-001' } as any
    ]);
    expect(resPO.success).toBe(false);
    expect(resPO.error).toContain('Network Error');
  });
});
