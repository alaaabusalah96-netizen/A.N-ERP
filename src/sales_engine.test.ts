import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SalesBusinessEngine, SALES_COLLECTIONS } from './lib/enterprise/sales_engine';
import { StorageEngine } from './db/storage';
import * as offlineQueue from './db/offlineQueue';

describe('SalesBusinessEngine Write-Order and Cloud Sync Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    StorageEngine.cache = {};
  });

  it('createCustomer commits to StorageEngine only when cloud sync succeeds', async () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const customer = await SalesBusinessEngine.createCustomer('COMP-001', {
      nameAr: 'شركة النيل للتجارة',
      nameEn: 'Nile Trading Co',
      phone: '01122334455',
      openingBalance: 5000
    });

    expect(customer).toBeDefined();
    expect(customer.nameAr).toBe('شركة النيل للتجارة');
    expect(syncSpy).toHaveBeenCalledWith(
      SALES_COLLECTIONS.CUSTOMERS,
      customer.id,
      expect.objectContaining({ nameAr: 'شركة النيل للتجارة' })
    );

    const stored = StorageEngine.getStored<any[]>('customers', []);
    expect(stored.find(c => c.id === customer.id)).toBeDefined();
  });

  it('createCustomer throws and leaves StorageEngine unchanged when cloud sync fails', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Permission Denied'
    });

    await expect(
      SalesBusinessEngine.createCustomer('COMP-001', {
        nameAr: 'عميل فاشل',
        nameEn: 'Failed Customer'
      })
    ).rejects.toThrow('Permission Denied');

    const stored = StorageEngine.getStored<any[]>('customers', []);
    expect(stored.length).toBe(0);
  });

  it('createSalesInvoice commits to StorageEngine and updates customer balance on cloud success', async () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    StorageEngine.setStored('customers', [
      { id: 'cust-1', company_id: 'COMP-001', nameAr: 'عميل 1', nameEn: 'Cust 1', balance: 1000 }
    ]);

    const invoice = await SalesBusinessEngine.createSalesInvoice('COMP-001', 'user-1', {
      customerId: 'cust-1',
      customerName: 'عميل 1',
      items: [{ productId: 'p1', name: 'Item 1', qty: 2, price: 500, total: 1000 }],
      subtotal: 1000,
      taxAmount: 140,
      netAmount: 1140
    });

    expect(invoice).toBeDefined();
    expect(syncSpy).toHaveBeenCalledWith(
      SALES_COLLECTIONS.SALES_INVOICES,
      invoice.id,
      expect.objectContaining({ netAmount: 1140 })
    );

    const storedInvoices = StorageEngine.getStored<any[]>('sales_invoices', []);
    expect(storedInvoices.find(i => i.id === invoice.id)).toBeDefined();

    const storedCustomers = StorageEngine.getStored<any[]>('customers', []);
    expect(storedCustomers.find(c => c.id === 'cust-1')?.balance).toBe(2140);
  });

  it('processPOSCheckout commits to StorageEngine when cloud sync succeeds', async () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const pos = await SalesBusinessEngine.processPOSCheckout('COMP-001', 'user-1', 'الكاشير', {
      items: [{ productId: 'p1', name: 'Item 1', qty: 1, price: 200, total: 200 }],
      subtotal: 200,
      vatAmount: 28,
      grandTotal: 228,
      paymentMethod: 'CASH'
    });

    expect(pos).toBeDefined();
    expect(syncSpy).toHaveBeenCalledWith(
      SALES_COLLECTIONS.POS_TRANSACTIONS,
      pos.id,
      expect.objectContaining({ grandTotal: 228 })
    );

    const storedPOS = StorageEngine.getStored<any[]>('pos_transactions', []);
    expect(storedPOS.find(p => p.id === pos.id)).toBeDefined();
  });

  it('createDeliveryNote commits to StorageEngine when cloud sync succeeds', async () => {
    const syncSpy = vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const dn = await SalesBusinessEngine.createDeliveryNote('COMP-001', {
      customerId: 'cust-1',
      customerName: 'عميل 1',
      items: [{ productId: 'p1', name: 'Item 1', qty: 5 }]
    });

    expect(dn).toBeDefined();
    expect(syncSpy).toHaveBeenCalledWith(
      SALES_COLLECTIONS.DELIVERY_NOTES,
      dn.id,
      expect.objectContaining({ customerName: 'عميل 1' })
    );

    const storedDN = StorageEngine.getStored<any[]>('delivery_notes', []);
    expect(storedDN.find(d => d.id === dn.id)).toBeDefined();
  });
});
