import { Warehouse, Product, InventoryDocument, StockMovement, InventoryDocType, InventoryDocStatus, InventoryLedgerEntry, WarehouseBin, InventoryWorkflowConfig } from '../types/inventory';
import { StorageEngine } from './storage';
import { db } from '../firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { UsersModule } from './users';
import { LogsModule } from './logs';
import { SequenceEngine } from '../lib/enterprise/sequence';
import { DocumentLifecycleEngine } from '../lib/enterprise/lifecycle';
import { FsmConfig } from '../types/enterprise';
import { CompaniesModule } from './companies';
import { createBaseMetadata, updateBaseMetadata, createEventEnvelope } from '../lib/enterprise/metadata';
import { AuditLogEngine } from '../lib/enterprise/audit';
import { AccountingBusinessEngine } from '../lib/enterprise/accounting_engine';
import { CostCenterEngine } from './costCenterEngine';
import { OrganizationEngine } from './organizationEngine';

// ============================================================================
// NON-PRODUCTION SEED DATA / DEMO FIXTURES
// The following DEFAULT_* constants provide sample seed records for initial
// sandbox demonstration only. In live production workflows, all entities are
// partitioned strictly by company_id without fallback to demo identifiers.
// ============================================================================

// NON-PRODUCTION SEED DATA: Default warehouses fixture
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

const DEFAULT_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-1',
    name: 'Cairo Main Warehouse (مخزن القاهرة الرئيسي)',
    code: 'WH-CAI-MAIN',
    is_active: true,
    company_id: 'comp-1', // Non-production seed company ID
    location: 'Abbassia, Cairo',
    receiving_approval_workflow: true
  },
  {
    id: 'wh-2',
    name: 'Alexandria Delivery Depot (مستودع الإسكندرية)',
    code: 'WH-ALX-DEPOT',
    is_active: true,
    company_id: 'comp-1', // Non-production seed company ID
    location: 'Smouha, Alexandria',
    receiving_approval_workflow: false
  },
  {
    id: 'wh-3',
    name: 'Giza Secondary Store (مخزن الجيزة الفرعي)',
    code: 'WH-GIZ-SUB',
    is_active: true,
    company_id: 'comp-1', // Non-production seed company ID
    location: 'Haram, Giza',
    receiving_approval_workflow: true
  }
];

// NON-PRODUCTION SEED DATA: Default products fixture
const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Shell Helix Motor Oil 4L (زيت محرك شل هيلكس 4 لتر)',
    code: 'PRD-MTR-01',
    barcode: '5011987249120',
    unit: 'عبوة (Bottle)',
    min_stock: 15,
    last_purchase_price: 1200,
    is_active: true,
    company_id: 'comp-1', // Non-production seed company ID
    description: 'زيت تخليقي بالكامل لمحركات البنزين والديزل عالية الأداء'
  },
  {
    id: 'prod-2',
    name: '12V 70Ah Car Battery (بطارية سيارة 12 فولت 70 أمبير)',
    code: 'PRD-BAT-02',
    barcode: '4013110223121',
    unit: 'عدد (Piece)',
    min_stock: 5,
    last_purchase_price: 3500,
    is_active: true,
    company_id: 'comp-1', // Non-production seed company ID
    description: 'بطارية سائلة عالية الكفاءة مع ضمان سنة كاملة'
  },
  {
    id: 'prod-3',
    name: 'Bridgestone Tire 205/55R16 (إطار بريدجستون 205/55R16)',
    code: 'PRD-TIR-03',
    barcode: '4902505112345',
    unit: 'عدد (Piece)',
    min_stock: 8,
    last_purchase_price: 4800,
    is_active: true,
    company_id: 'comp-1', // Non-production seed company ID
    description: 'إطار صيفي مريح وذو ثبات فائق على السرعات'
  },
  {
    id: 'prod-4',
    name: 'Air Filter (فلتر هواء محرك)',
    code: 'PRD-FIL-04',
    barcode: '4011558231201',
    unit: 'عدد (Piece)',
    min_stock: 20,
    last_purchase_price: 350,
    is_active: true,
    company_id: 'comp-1', // Non-production seed company ID
    description: 'فلتر هواء ذو كفاءة تنقية عالية للمحرك'
  },
  {
    id: 'prod-5',
    name: 'Front Brake Pads Set (طقم تيل فرامل أمامي)',
    code: 'PRD-BRK-05',
    barcode: '3286340561234',
    unit: 'طقم (Set)',
    min_stock: 12,
    last_purchase_price: 950,
    is_active: true,
    company_id: 'comp-1', // Non-production seed company ID
    description: 'تيل فرامل أمامي ياباني أصلي آمن ومعمر'
  }
];

// NON-PRODUCTION SEED DATA: Default starting stock movements fixture
const DEFAULT_MOVEMENTS: StockMovement[] = [
  {
    id: 'm-init-1',
    doc_id: 'init',
    doc_no: 'INITIAL-STOCK-01',
    doc_type: 'Receipt',
    product_id: 'prod-1',
    warehouse_id: 'wh-1',
    qty_change: 100,
    type: 'IN',
    current_balance_after: 100,
    date: '2026-06-01',
    company_id: 'comp-1', // Non-production seed company ID
    created_at: '2026-06-01T08:00:00Z',
    created_by: 'system'
  },
  {
    id: 'm-init-2',
    doc_id: 'init',
    doc_no: 'INITIAL-STOCK-01',
    doc_type: 'Receipt',
    product_id: 'prod-2',
    warehouse_id: 'wh-1',
    qty_change: 25,
    type: 'IN',
    current_balance_after: 25,
    date: '2026-06-01',
    company_id: 'comp-1', // Non-production seed company ID
    created_at: '2026-06-01T08:00:00Z',
    created_by: 'system'
  },
  {
    id: 'm-init-3',
    doc_id: 'init',
    doc_no: 'INITIAL-STOCK-01',
    doc_type: 'Receipt',
    product_id: 'prod-3',
    warehouse_id: 'wh-1',
    qty_change: 40,
    type: 'IN',
    current_balance_after: 40,
    date: '2026-06-01',
    company_id: 'comp-1', // Non-production seed company ID
    created_at: '2026-06-01T08:00:00Z',
    created_by: 'system'
  },
  {
    id: 'm-init-4',
    doc_id: 'init',
    doc_no: 'INITIAL-STOCK-02',
    doc_type: 'Receipt',
    product_id: 'prod-1',
    warehouse_id: 'wh-2',
    qty_change: 50,
    type: 'IN',
    current_balance_after: 50,
    date: '2026-06-01',
    company_id: 'comp-1', // Non-production seed company ID
    created_at: '2026-06-01T08:00:00Z',
    created_by: 'system'
  }
];

export interface StockLookupIndex {
  byProductWarehouse: Map<string, number>;
  byProductBinWarehouse: Map<string, number>;
  byProductBin: Map<string, number>;
  byBin: Map<string, number>;
  byWarehouse: Map<string, number>;
}

export class InventoryModule {
  private static cachedStockIndex: StockLookupIndex | null = null;
  private static stockIndexVersionKey: string = '';

  private static stockWriteEpoch: number = 0;

  static clearStockLookupIndex(): void {
    InventoryModule.cachedStockIndex = null;
    InventoryModule.stockIndexVersionKey = '';
    InventoryModule.stockWriteEpoch++;
  }

  static getStockLookupIndex(): StockLookupIndex {
    const movements = InventoryModule.getStockMovements();
    // Robust cache key incorporating monotonic write epoch, movement length, and structural hash of IDs
    let movementIdHash = 0;
    for (let i = 0; i < movements.length; i++) {
      const id = movements[i]?.id || '';
      for (let j = 0; j < id.length; j++) {
        movementIdHash = ((movementIdHash << 5) - movementIdHash + id.charCodeAt(j)) | 0;
      }
    }
    const currentVersionKey = `epoch_${InventoryModule.stockWriteEpoch}_len_${movements.length}_hash_${movementIdHash}`;
    if (InventoryModule.cachedStockIndex && InventoryModule.stockIndexVersionKey === currentVersionKey) {
      return InventoryModule.cachedStockIndex;
    }

    const byProductWarehouse = new Map<string, number>();
    const byProductBinWarehouse = new Map<string, number>();
    const byProductBin = new Map<string, number>();
    const byBin = new Map<string, number>();
    const byWarehouse = new Map<string, number>();

    for (const m of movements) {
      const qty = m.qty_change || 0;
      if (m.product_id && m.warehouse_id) {
        const key = `${m.product_id}___${m.warehouse_id}`;
        byProductWarehouse.set(key, (byProductWarehouse.get(key) || 0) + qty);
      }
      if (m.product_id && m.bin_id) {
        const keyBinWh = `${m.product_id}___${m.bin_id}___${m.warehouse_id || ''}`;
        byProductBinWarehouse.set(keyBinWh, (byProductBinWarehouse.get(keyBinWh) || 0) + qty);
        const keyBin = `${m.product_id}___${m.bin_id}`;
        byProductBin.set(keyBin, (byProductBin.get(keyBin) || 0) + qty);
      }
      if (m.bin_id) {
        byBin.set(m.bin_id, (byBin.get(m.bin_id) || 0) + qty);
      }
      if (m.warehouse_id) {
        byWarehouse.set(m.warehouse_id, (byWarehouse.get(m.warehouse_id) || 0) + qty);
      }
    }

    InventoryModule.cachedStockIndex = {
      byProductWarehouse,
      byProductBinWarehouse,
      byProductBin,
      byBin,
      byWarehouse,
    };
    InventoryModule.stockIndexVersionKey = currentVersionKey;
    return InventoryModule.cachedStockIndex;
  }

  // Warehouses
  static getWarehouses(targetCompanyId?: string): Warehouse[] {
    const companyId = targetCompanyId || CompaniesModule.getSelectedCompanyId();
    const fallbackWarehouses = isDevOrTest() ? DEFAULT_WAREHOUSES : [];
    let list = StorageEngine.getStored<Warehouse[]>('warehouses', fallbackWarehouses);
    const companyWarehouses = list.filter(w => w.company_id === companyId);
    
    // Check if there's any scrap/obsolete warehouse for this company
    const hasScrapWh = companyWarehouses.some(w => 
      w.name.includes('خردة') || 
      w.name.includes('كهنة') || 
      w.name.toLowerCase().includes('scrap')
    );
    
    if (!hasScrapWh && companyId && isDevOrTest()) {
      // Seed some default scrap/obsolete warehouses as specified by the user in dev/test!
      const seedScrap: Warehouse[] = [
        {
          id: `wh-scrap-sina-${companyId}`,
          name: 'مخزن خردة/كهنة محطة سينا 2000 (Sina 2000 Scrap Store)',
          code: 'WH-SCRP-SINA',
          is_active: true,
          company_id: companyId,
          location: 'سيناء',
          receiving_approval_workflow: false
        },
        {
          id: `wh-scrap-qad-${companyId}`,
          name: 'مخزن خردة أو كهنة محطة القادسية (Qadisiya Scrap Store)',
          code: 'WH-SCRP-QAD',
          is_active: true,
          company_id: companyId,
          location: 'القادسية',
          receiving_approval_workflow: false
        },
        {
          id: `wh-scrap-alx-${companyId}`,
          name: 'مخزن خردة أو كهنة فرع الإسكندرية (Alexandria Scrap Store)',
          code: 'WH-SCRP-ALX',
          is_active: true,
          company_id: companyId,
          location: 'الإسكندرية',
          receiving_approval_workflow: false
        },
        {
          id: `wh-scrap-giz-${companyId}`,
          name: 'مخزن خردة أو كهنة إدارة الجيزة (Giza Admin Scrap Store)',
          code: 'WH-SCRP-GIZ',
          is_active: true,
          company_id: companyId,
          location: 'الجيزة',
          receiving_approval_workflow: false
        }
      ];
      
      // Save them asynchronously to avoid side-effects during render
      setTimeout(async () => {
        try {
          const currentAll = StorageEngine.getStored<Warehouse[]>('warehouses', fallbackWarehouses);
          const hasScrapNow = currentAll.some(w => w.company_id === companyId && (
            w.name.includes('خردة') || w.name.includes('كهنة') || w.name.toLowerCase().includes('scrap')
          ));
          if (!hasScrapNow) {
            for (const w of seedScrap) {
              const res = await syncWriteWithOfflineFallback('warehouses', w.id, w);
              if (!res.success) return;
            }
            const updatedList = [...currentAll, ...seedScrap];
            StorageEngine.setStored('warehouses', updatedList);
          }
        } catch (e) {
          console.error('Error seeding scrap warehouses:', e);
        }
      }, 0);
      
      return [...companyWarehouses, ...seedScrap];
    }
    
    return companyWarehouses;
  }

  static async saveWarehouses(list: Warehouse[], targetCompanyId?: string): Promise<{ success: boolean; error?: string }> {
    const fallbackWarehouses = isDevOrTest() ? DEFAULT_WAREHOUSES : [];
    const all = StorageEngine.getStored<Warehouse[]>('warehouses', fallbackWarehouses);
    const companyId = targetCompanyId || CompaniesModule.getSelectedCompanyId();
    const filteredOut = all.filter(w => w.company_id !== companyId);
    const combined = !companyId ? list : [...filteredOut, ...list];

    const changed = list.filter(w => {
      const old = all.find(ex => ex.id === w.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(w);
    });

    for (const w of changed) {
      const res = await syncWriteWithOfflineFallback('warehouses', w.id, w);
      if (!res.success) {
        console.warn(`[saveWarehouses] Warning: ${res.error}`);
        return { success: false, error: res.error };
      }
    }

    StorageEngine.setStored('warehouses', combined);
    return { success: true };
  }

  static async addWarehouse(warehouse: Omit<Warehouse, 'id'> & { company_id?: string }): Promise<Warehouse> {
    const list = InventoryModule.getWarehouses();
    const companyId = warehouse.company_id || CompaniesModule.getSelectedCompanyId();
    const newW: Warehouse = {
      ...warehouse,
      id: `wh-${crypto.randomUUID()}`,
      company_id: companyId
    };
    list.push(newW);
    await InventoryModule.saveWarehouses(list);
    return newW;
  }

  // Warehouse Bins (Phase 3)
  static getWarehouseBins(warehouseId?: string): WarehouseBin[] {
    const list = StorageEngine.getStored<WarehouseBin[]>('warehouse_bins', []);
    if (warehouseId) {
      return list.filter(b => b.warehouse_id === warehouseId);
    }
    return list;
  }

  static async saveWarehouseBins(bins: WarehouseBin[]): Promise<{ success: boolean; error?: string }> {
    const existing = StorageEngine.getStored<WarehouseBin[]>('warehouse_bins', []);
    const changed = bins.filter(b => {
      const old = existing.find(ex => ex.id === b.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(b);
    });

    for (const b of changed) {
      const res = await syncWriteWithOfflineFallback('warehouse_bins', b.id, b);
      if (!res.success) {
        console.warn(`[saveWarehouseBins] Warning: ${res.error}`);
        return { success: false, error: res.error };
      }
    }

    StorageEngine.setStored('warehouse_bins', bins);
    return { success: true };
  }

  static async addWarehouseBin(bin: Omit<WarehouseBin, 'id'>): Promise<WarehouseBin> {
    const list = StorageEngine.getStored<WarehouseBin[]>('warehouse_bins', []);
    const newBin: WarehouseBin = {
      ...bin,
      id: `bin-${crypto.randomUUID()}`
    };
    list.push(newBin);
    await InventoryModule.saveWarehouseBins(list);
    return newBin;
  }

  static async updateWarehouseBin(binId: string, updates: Partial<WarehouseBin>): Promise<void> {
    const list = StorageEngine.getStored<WarehouseBin[]>('warehouse_bins', []);
    const idx = list.findIndex(b => b.id === binId);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        ...updates
      };
      await InventoryModule.saveWarehouseBins(list);
    }
  }

  static async deleteWarehouseBin(binId: string): Promise<boolean> {
    const list = StorageEngine.getStored<WarehouseBin[]>('warehouse_bins', []);
    const filtered = list.filter(b => b.id !== binId);
    if (filtered.length !== list.length) {
      const res = await syncWriteWithOfflineFallback('warehouse_bins', binId, null);
      if (!res.success) {
        console.warn(`[deleteWarehouseBin] Warning: ${res.error}`);
        return false;
      }
      StorageEngine.setStored('warehouse_bins', filtered);
      return true;
    }
    return false;
  }

  // Stock tracking at Bin Level
  static getBinProductStock(productId: string, binId: string, warehouseId?: string): number {
    const index = InventoryModule.getStockLookupIndex();
    if (warehouseId) {
      return index.byProductBinWarehouse.get(`${productId}___${binId}___${warehouseId}`) || 0;
    }
    return index.byProductBin.get(`${productId}___${binId}`) || 0;
  }

  static getBinTotalStock(binId: string): number {
    const index = InventoryModule.getStockLookupIndex();
    return index.byBin.get(binId) || 0;
  }

  static getWarehouseTotalStock(warehouseId: string): number {
    const index = InventoryModule.getStockLookupIndex();
    return index.byWarehouse.get(warehouseId) || 0;
  }

  // Relocation: Move stock internally between bins in the same warehouse
  static async relocateBinStock(
    companyId: string,
    warehouseId: string,
    productId: string,
    fromBinId: string,
    toBinId: string,
    qty: number
  ): Promise<{ success: boolean; messageAr: string; messageEn: string }> {
    if (!companyId) {
      return {
        success: false,
        messageAr: 'يجب اختيار شركة أولاً قبل النقل الداخلي.',
        messageEn: 'Please select a company before internal relocation.'
      };
    }
    if (qty <= 0) {
      return {
        success: false,
        messageAr: 'يجب أن تكون الكمية أكبر من الصفر',
        messageEn: 'Quantity must be greater than zero'
      };
    }

    // Verify source bin stock
    const sourceStock = InventoryModule.getBinProductStock(productId, fromBinId);
    if (sourceStock < qty) {
      return {
        success: false,
        messageAr: `عذراً، رصيد الحاوية المصدر غير كافٍ لإتمام عملية النقل (المتاح: ${sourceStock}، المطلوب: ${qty})`,
        messageEn: `Sorry, insufficient stock in source bin to complete transfer (Available: ${sourceStock}, Requested: ${qty})`
      };
    }

    const currentWarehouseStock = InventoryModule.getProductStock(productId, warehouseId);
    if (currentWarehouseStock < qty) {
      return {
        success: false,
        messageAr: `عذراً، رصيد المستودع غير كافٍ لإتمام عملية النقل (المتاح: ${currentWarehouseStock}، المطلوب: ${qty})`,
        messageEn: `Sorry, insufficient stock in warehouse to complete transfer (Available: ${currentWarehouseStock}, Requested: ${qty})`
      };
    }

    const bins = InventoryModule.getWarehouseBins(warehouseId);
    const sourceBin = bins.find(b => b.id === fromBinId);
    const destBin = bins.find(b => b.id === toBinId);

    if (!sourceBin || !destBin) {
      return {
        success: false,
        messageAr: 'الحاوية المحددة غير موجودة في هذا المستودع',
        messageEn: 'The specified bin was not found in this warehouse'
      };
    }

    // Validate capacity on destination bin
    const destCurrentStock = InventoryModule.getBinTotalStock(toBinId);
    if (destBin.max_capacity_qty && (destCurrentStock + qty) > destBin.max_capacity_qty) {
      return {
        success: false,
        messageAr: `عذراً، عملية النقل تتجاوز السعة القصوى للحاوية المستهدفة (${destBin.name}). السعة المتاحة: ${Math.max(0, destBin.max_capacity_qty - destCurrentStock)} وحدة.`,
        messageEn: `Sorry, this relocation exceeds the maximum capacity of target bin (${destBin.name}). Available capacity: ${Math.max(0, destBin.max_capacity_qty - destCurrentStock)} units.`
      };
    }

    const user = UsersModule.getActiveUser();
    const operatorId = user?.id || 'system';
    const userName = user?.full_name || 'System';

    const movements = InventoryModule.getStockMovements();
    const ledgerEntries = InventoryModule.getInventoryLedger();

    // Compute consistent balances for the movements and ledger
    const balanceBeforeOut = currentWarehouseStock;
    const balanceAfterOut = Math.max(0, currentWarehouseStock - qty);
    const balanceBeforeIn = balanceAfterOut;
    const balanceAfterIn = currentWarehouseStock;

    // 1. Negative movement from source bin
    const relocDocId = `reloc-${crypto.randomUUID()}`;
    const relocDocNo = `RELOC-${crypto.randomUUID().slice(0, 8)}`;

    const movFromId = `mov-${crypto.randomUUID()}`;
    const movFrom: StockMovement = {
      id: movFromId,
      doc_id: relocDocId,
      doc_no: relocDocNo,
      doc_type: 'Adjustment', // adjustment-type stock record
      product_id: productId,
      warehouse_id: warehouseId,
      qty_change: -qty,
      type: 'OUT',
      current_balance_after: balanceAfterOut,
      date: new Date().toISOString().split('T')[0],
      company_id: companyId,
      created_at: new Date().toISOString(),
      created_by: operatorId,
      bin_id: fromBinId,
      bin_code: sourceBin.code
    };

    // 2. Positive movement to destination bin
    const movToId = `mov-${crypto.randomUUID()}`;
    const movTo: StockMovement = {
      id: movToId,
      doc_id: movFrom.doc_id,
      doc_no: movFrom.doc_no,
      doc_type: 'Adjustment',
      product_id: productId,
      warehouse_id: warehouseId,
      qty_change: qty,
      type: 'IN',
      current_balance_after: balanceAfterIn,
      date: movFrom.date,
      company_id: companyId,
      created_at: new Date().toISOString(),
      created_by: operatorId,
      bin_id: toBinId,
      bin_code: destBin.code
    };

    movements.push(movFrom, movTo);

    // Ledger records
    const ledFrom: InventoryLedgerEntry = {
      id: `led-${crypto.randomUUID()}`,
      company_id: companyId,
      warehouse_id: warehouseId,
      product_id: productId,
      transaction_type: 'Bin Relocation (Out)',
      reference_document_id: movFrom.doc_id,
      reference_document_no: movFrom.doc_no,
      qty_in: 0,
      qty_out: qty,
      balance_before: balanceBeforeOut,
      balance_after: balanceAfterOut,
      unit_cost: 0,
      running_cost: 0,
      timestamp: new Date().toISOString(),
      user_id: operatorId,
      user_name: userName,
      audit_ref: `${movFrom.doc_no}-LEDGER`,
      bin_id: fromBinId,
      bin_code: sourceBin.code
    };

    const ledTo: InventoryLedgerEntry = {
      id: `led-${crypto.randomUUID()}`,
      company_id: companyId,
      warehouse_id: warehouseId,
      product_id: productId,
      transaction_type: 'Bin Relocation (In)',
      reference_document_id: movTo.doc_id,
      reference_document_no: movTo.doc_no,
      qty_in: qty,
      qty_out: 0,
      balance_before: balanceBeforeIn,
      balance_after: balanceAfterIn,
      unit_cost: 0,
      running_cost: 0,
      timestamp: new Date().toISOString(),
      user_id: operatorId,
      user_name: userName,
      audit_ref: `${movTo.doc_no}-LEDGER`,
      bin_id: toBinId,
      bin_code: destBin.code
    };

    ledgerEntries.push(ledFrom, ledTo);

    const resMov = await InventoryModule.saveStockMovements(movements);
    if (!resMov.success) {
      return {
        success: false,
        messageAr: 'فشل مزامنة حركة المخزون مع الخادم السحابي',
        messageEn: 'Failed to sync stock movement to cloud server'
      };
    }
    const resLed = await InventoryModule.saveInventoryLedger(ledgerEntries);
    if (!resLed.success) {
      return {
        success: false,
        messageAr: 'فشل مزامنة سجل المخزون مع الخادم السحابي',
        messageEn: 'Failed to sync inventory ledger to cloud server'
      };
    }

    LogsModule.addLog(
      operatorId,
      userName,
      'Internal Bin Relocation',
      `Moved ${qty} units of item ${productId} from Bin ${sourceBin.code} to Bin ${destBin.code} inside warehouse ${warehouseId}.`
    );

    return {
      success: true,
      messageAr: 'تم نقل المخزون داخلياً بين الحاويات بنجاح',
      messageEn: 'Internal bin stock relocation completed successfully'
    };
  }

  private static readonly DEFAULT_INVENTORY_CONFIG: InventoryWorkflowConfig = {
    valuation_method: 'FEFO',
    allow_overdraft: 'STRICT',
    bin_tracking_policy: 'OPTIONAL',
    batch_expiry_policy: 'WARNING',
    transfer_approval_mode: 'TWO_STEP',
    auto_post_accounting: true,
    require_approval_for_posting: true,
    reorder_alert_threshold_percent: 20,
    default_inventory_account_code: '120101',
    default_ap_account_code: '210101',
    default_cogs_account_code: '510101',
    default_variance_account_code: '510401',
    default_scrap_account_code: '410101'
  };

  // Workflow Configuration
  static getInventoryConfig(): InventoryWorkflowConfig {
    const companyId = CompaniesModule.getSelectedCompanyId();
    const key = `custodyflow_inventory_config_${companyId}`;
    const stored = StorageEngine.getStored<InventoryWorkflowConfig>(key, InventoryModule.DEFAULT_INVENTORY_CONFIG);
    return { ...InventoryModule.DEFAULT_INVENTORY_CONFIG, ...stored };
  }

  static saveInventoryConfig(config: Partial<InventoryWorkflowConfig>): InventoryWorkflowConfig {
    const companyId = CompaniesModule.getSelectedCompanyId();
    const key = `custodyflow_inventory_config_${companyId}`;
    const current = InventoryModule.getInventoryConfig();
    const updated = { ...current, ...config };
    StorageEngine.setStored(key, updated);
    return updated;
  }

  // Products
  static getProducts(targetCompanyId?: string): Product[] {
    const companyId = targetCompanyId || CompaniesModule.getSelectedCompanyId();
    const fallbackProducts = isDevOrTest() ? DEFAULT_PRODUCTS : [];
    const list = StorageEngine.getStored<Product[]>('products', fallbackProducts);
    if (!companyId) return list;
    return list.filter(p => p.company_id === companyId || !p.company_id);
  }

  static async saveProducts(list: Product[], targetCompanyId?: string): Promise<{ success: boolean; error?: string }> {
    const fallbackProducts = isDevOrTest() ? DEFAULT_PRODUCTS : [];
    const all = StorageEngine.getStored<Product[]>('products', fallbackProducts);
    const companyId = targetCompanyId || CompaniesModule.getSelectedCompanyId();
    const filteredOut = all.filter(p => p.company_id !== companyId);
    const combined = !companyId ? list : [...filteredOut, ...list];

    const changed = list.filter(p => {
      const old = all.find(ex => ex.id === p.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(p);
    });

    for (const p of changed) {
      const res = await syncWriteWithOfflineFallback('products', p.id, p);
      if (!res.success) {
        console.warn(`[saveProducts] Warning: ${res.error}`);
        return { success: false, error: res.error };
      }
    }

    StorageEngine.setStored('products', combined);
    return { success: true };
  }

  static async addProduct(product: Omit<Product, 'id'> & { company_id?: string }): Promise<Product> {
    const companyId = product.company_id || CompaniesModule.getSelectedCompanyId();
    const list = InventoryModule.getProducts(companyId);
    const newP: Product = {
      ...product,
      id: `prod-${crypto.randomUUID()}`,
      company_id: companyId
    };
    list.push(newP);
    await InventoryModule.saveProducts(list, companyId);
    return newP;
  }

  // Documents
  static getInventoryDocuments(targetCompanyId?: string): InventoryDocument[] {
    const companyId = targetCompanyId || CompaniesModule.getSelectedCompanyId();
    const list = StorageEngine.getStored<InventoryDocument[]>('inventory_documents', []);
    if (!companyId) return list;
    return list.filter(d => (d.tenantId === companyId) || ((d as any).company_id === companyId));
  }

  static getPaginatedInventoryDocuments(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (doc: InventoryDocument) => boolean,
    sortFn?: (a: InventoryDocument, b: InventoryDocument) => number
  ): { data: InventoryDocument[]; total: number; page: number; pageSize: number; totalPages: number } {
    const companyId = CompaniesModule.getSelectedCompanyId();
    const scopedFilter = (d: InventoryDocument): boolean => {
      if (companyId && d.tenantId !== companyId) return false;
      return filterFn ? filterFn(d) : true;
    };
    return StorageEngine.getStoredPaginated<InventoryDocument>('inventory_documents', page, pageSize, scopedFilter, sortFn);
  }

  static async getPaginatedInventoryDocumentsIDB(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (doc: InventoryDocument) => boolean,
    sortFn?: (a: InventoryDocument, b: InventoryDocument) => number
  ): Promise<{ data: InventoryDocument[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const companyId = CompaniesModule.getSelectedCompanyId();
    const scopedFilter = (d: InventoryDocument): boolean => {
      if (companyId && d.tenantId !== companyId) return false;
      return filterFn ? filterFn(d) : true;
    };
    return StorageEngine.getPaginatedIDB<InventoryDocument>('inventory_documents', page, pageSize, scopedFilter, sortFn);
  }

  static async saveInventoryDocuments(list: InventoryDocument[], targetCompanyId?: string): Promise<{ success: boolean; error?: string }> {
    const all = StorageEngine.getStored<InventoryDocument[]>('inventory_documents', []);
    const companyId = targetCompanyId || CompaniesModule.getSelectedCompanyId();
    const filteredOut = all.filter(d => (d.tenantId !== companyId) && ((d as any).company_id !== companyId));
    const combined = !companyId ? list : [...filteredOut, ...list];

    const changed = list.filter(d => {
      const old = all.find(ex => ex.id === d.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(d);
    });

    for (const d of changed) {
      const res = await syncWriteWithOfflineFallback('inventory_documents', d.id, d);
      if (!res.success) {
        console.warn(`[saveInventoryDocuments] Warning: ${res.error}`);
        return { success: false, error: res.error };
      }
    }

    StorageEngine.setStored('inventory_documents', combined);
    return { success: true };
  }

  // Stock Movements
  static getStockMovements(targetCompanyId?: string): StockMovement[] {
    const companyId = targetCompanyId || CompaniesModule.getSelectedCompanyId();
    const fallbackMovements = isDevOrTest() ? DEFAULT_MOVEMENTS : [];
    const list = StorageEngine.getStored<StockMovement[]>('stock_movements', fallbackMovements);
    if (!companyId) return [...list];
    return list.filter(m => m.company_id === companyId);
  }

  static getPaginatedStockMovements(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (m: StockMovement) => boolean,
    sortFn?: (a: StockMovement, b: StockMovement) => number
  ): { data: StockMovement[]; total: number; page: number; pageSize: number; totalPages: number } {
    const companyId = CompaniesModule.getSelectedCompanyId();
    const scopedFilter = (m: StockMovement): boolean => {
      if (companyId && m.company_id !== companyId) return false;
      return filterFn ? filterFn(m) : true;
    };
    return StorageEngine.getStoredPaginated<StockMovement>('stock_movements', page, pageSize, scopedFilter, sortFn);
  }

  static async getPaginatedStockMovementsIDB(
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (m: StockMovement) => boolean,
    sortFn?: (a: StockMovement, b: StockMovement) => number
  ): Promise<{ data: StockMovement[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const companyId = CompaniesModule.getSelectedCompanyId();
    const scopedFilter = (m: StockMovement): boolean => {
      if (companyId && m.company_id !== companyId) return false;
      return filterFn ? filterFn(m) : true;
    };
    return StorageEngine.getPaginatedIDB<StockMovement>('stock_movements', page, pageSize, scopedFilter, sortFn);
  }

  static async saveStockMovements(list: StockMovement[]): Promise<{ success: boolean; error?: string }> {
    InventoryModule.clearStockLookupIndex();
    const fallbackMovements = isDevOrTest() ? DEFAULT_MOVEMENTS : [];
    const all = StorageEngine.getStored<StockMovement[]>('stock_movements', fallbackMovements);
    const companyId = CompaniesModule.getSelectedCompanyId();
    const filteredOut = all.filter(m => m.company_id !== companyId);
    const combined = !companyId ? list : [...filteredOut, ...list];

    const changed = list.filter(m => {
      const old = all.find(ex => ex.id === m.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(m);
    });

    for (const m of changed) {
      const res = await syncWriteWithOfflineFallback('stock_movements', m.id, m);
      if (!res.success) {
        console.warn(`[saveStockMovements] Warning: ${res.error}`);
        return { success: false, error: res.error };
      }
    }

    StorageEngine.setStored('stock_movements', combined);
    return { success: true };
  }

  // Ledger Entries
  static getInventoryLedger(targetCompanyId?: string): InventoryLedgerEntry[] {
    const companyId = targetCompanyId || CompaniesModule.getSelectedCompanyId();
    // NON-PRODUCTION SEED DATA: Default inventory ledger fixture
    const defaultLedger: InventoryLedgerEntry[] = isDevOrTest() ? [
      {
        id: 'led-init-1',
        company_id: 'comp-1', // Non-production seed company ID
        warehouse_id: 'wh-1',
        product_id: 'prod-1',
        transaction_type: 'Receipt',
        reference_document_id: 'init',
        reference_document_no: 'INITIAL-STOCK-01',
        qty_in: 100,
        qty_out: 0,
        balance_before: 0,
        balance_after: 100,
        unit_cost: 1200,
        running_cost: 120000,
        timestamp: '2026-06-01T08:00:00Z',
        user_id: 'system',
        user_name: 'System',
        audit_ref: 'INITIAL-STOCK-01'
      },
      {
        id: 'led-init-2',
        company_id: 'comp-1', // Non-production seed company ID
        warehouse_id: 'wh-1',
        product_id: 'prod-2',
        transaction_type: 'Receipt',
        reference_document_id: 'init',
        reference_document_no: 'INITIAL-STOCK-01',
        qty_in: 25,
        qty_out: 0,
        balance_before: 0,
        balance_after: 25,
        unit_cost: 3500,
        running_cost: 87500,
        timestamp: '2026-06-01T08:00:00Z',
        user_id: 'system',
        user_name: 'System',
        audit_ref: 'INITIAL-STOCK-01'
      },
      {
        id: 'led-init-3',
        company_id: 'comp-1', // Non-production seed company ID
        warehouse_id: 'wh-1',
        product_id: 'prod-3',
        transaction_type: 'Receipt',
        reference_document_id: 'init',
        reference_document_no: 'INITIAL-STOCK-01',
        qty_in: 40,
        qty_out: 0,
        balance_before: 0,
        balance_after: 40,
        unit_cost: 4800,
        running_cost: 192000,
        timestamp: '2026-06-01T08:00:00Z',
        user_id: 'system',
        user_name: 'System',
        audit_ref: 'INITIAL-STOCK-01'
      },
      {
        id: 'led-init-4',
        company_id: 'comp-1', // Non-production seed company ID
        warehouse_id: 'wh-2',
        product_id: 'prod-1',
        transaction_type: 'Receipt',
        reference_document_id: 'init',
        reference_document_no: 'INITIAL-STOCK-02',
        qty_in: 50,
        qty_out: 0,
        balance_before: 0,
        balance_after: 50,
        unit_cost: 1200,
        running_cost: 60000,
        timestamp: '2026-06-01T08:00:00Z',
        user_id: 'system',
        user_name: 'System',
        audit_ref: 'INITIAL-STOCK-02'
      }
    ] : [];
    const list = StorageEngine.getStored<InventoryLedgerEntry[]>('inventory_ledger', defaultLedger);
    return list.filter(entry => entry.company_id === companyId);
  }

  static async saveInventoryLedger(list: InventoryLedgerEntry[]): Promise<{ success: boolean; error?: string }> {
    const companyId = CompaniesModule.getSelectedCompanyId();
    const all = StorageEngine.getStored<InventoryLedgerEntry[]>('inventory_ledger', []);
    
    // NON-PRODUCTION SEED DATA: Default inventory ledger fixture for uninitialized storage
    const initialList = all.length === 0 && isDevOrTest() ? [
      {
        id: 'led-init-1',
        company_id: 'comp-1', // Non-production seed company ID
        warehouse_id: 'wh-1',
        product_id: 'prod-1',
        transaction_type: 'Receipt',
        reference_document_id: 'init',
        reference_document_no: 'INITIAL-STOCK-01',
        qty_in: 100,
        qty_out: 0,
        balance_before: 0,
        balance_after: 100,
        unit_cost: 1200,
        running_cost: 120000,
        timestamp: '2026-06-01T08:00:00Z',
        user_id: 'system',
        user_name: 'System',
        audit_ref: 'INITIAL-STOCK-01'
      },
      {
        id: 'led-init-2',
        company_id: 'comp-1', // Non-production seed company ID
        warehouse_id: 'wh-1',
        product_id: 'prod-2',
        transaction_type: 'Receipt',
        reference_document_id: 'init',
        reference_document_no: 'INITIAL-STOCK-01',
        qty_in: 25,
        qty_out: 0,
        balance_before: 0,
        balance_after: 25,
        unit_cost: 3500,
        running_cost: 87500,
        timestamp: '2026-06-01T08:00:00Z',
        user_id: 'system',
        user_name: 'System',
        audit_ref: 'INITIAL-STOCK-01'
      },
      {
        id: 'led-init-3',
        company_id: 'comp-1', // Non-production seed company ID
        warehouse_id: 'wh-1',
        product_id: 'prod-3',
        transaction_type: 'Receipt',
        reference_document_id: 'init',
        reference_document_no: 'INITIAL-STOCK-01',
        qty_in: 40,
        qty_out: 0,
        balance_before: 0,
        balance_after: 40,
        unit_cost: 4800,
        running_cost: 192000,
        timestamp: '2026-06-01T08:00:00Z',
        user_id: 'system',
        user_name: 'System',
        audit_ref: 'INITIAL-STOCK-01'
      },
      {
        id: 'led-init-4',
        company_id: 'comp-1', // Non-production seed company ID
        warehouse_id: 'wh-2',
        product_id: 'prod-1',
        transaction_type: 'Receipt',
        reference_document_id: 'init',
        reference_document_no: 'INITIAL-STOCK-02',
        qty_in: 50,
        qty_out: 0,
        balance_before: 0,
        balance_after: 50,
        unit_cost: 1200,
        running_cost: 60000,
        timestamp: '2026-06-01T08:00:00Z',
        user_id: 'system',
        user_name: 'System',
        audit_ref: 'INITIAL-STOCK-02'
      }
    ] : all;

    const filteredOut = initialList.filter(entry => entry.company_id !== companyId);
    const combined = !companyId ? list : [...filteredOut, ...list];

    const changed = list.filter(entry => {
      const old = all.find(ex => ex.id === entry.id);
      if (!old) return true;
      return JSON.stringify(old) !== JSON.stringify(entry);
    });

    for (const entry of changed) {
      const res = await syncWriteWithOfflineFallback('inventory_ledger', entry.id, entry);
      if (!res.success) {
        console.warn(`[saveInventoryLedger] Warning: ${res.error}`);
        return { success: false, error: res.error };
      }
    }

    StorageEngine.setStored('inventory_ledger', combined);
    return { success: true };
  }

  /**
   * Helper to compute real-time product stock within a warehouse.
   */
  static getProductStock(productId: string, warehouseId: string): number {
    const index = InventoryModule.getStockLookupIndex();
    return index.byProductWarehouse.get(`${productId}___${warehouseId}`) || 0;
  }

  /**
   * Helper to compute real-time product stock grouped by Batch and Expiry Date, ordered dynamically based on company valuation strategy (FEFO / FIFO / LIFO / MANUAL).
   */
  static getProductBatches(productId: string, warehouseId: string): { batch_no: string; expiry_date?: string; available_qty: number }[] {
    if (!productId || !warehouseId) return [];
    const movements = InventoryModule.getStockMovements();
    const config = InventoryModule.getInventoryConfig();
    const batchMap = new Map<string, { batch_no: string; expiry_date?: string; available_qty: number; first_date?: string }>();

    movements
      .filter(m => m.product_id === productId && m.warehouse_id === warehouseId)
      .forEach(m => {
        const batchNo = m.batch_no || 'بدون باتش';
        const expiry = m.expiry_date || '';
        const key = `${batchNo}___${expiry}`;

        const existing = batchMap.get(key) || { batch_no: batchNo, expiry_date: expiry, available_qty: 0, first_date: m.created_at || m.date };
        existing.available_qty += m.qty_change;
        batchMap.set(key, existing);
      });

    // Filter to positive balance batches
    const activeBatches = Array.from(batchMap.values()).filter(b => b.available_qty > 0);

    const method = config.valuation_method || 'FEFO';
    activeBatches.sort((a, b) => {
      if (method === 'FEFO') {
        if (a.expiry_date && b.expiry_date) {
          return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
        }
        if (a.expiry_date) return -1;
        if (a.expiry_date) return 1;
        return a.batch_no.localeCompare(b.batch_no);
      } else if (method === 'FIFO') {
        return (a.first_date || '').localeCompare(b.first_date || '');
      } else if (method === 'LIFO') {
        return (b.first_date || '').localeCompare(a.first_date || '');
      } else {
        return a.batch_no.localeCompare(b.batch_no);
      }
    });

    return activeBatches;
  }

  static getWarehouseStock(warehouseId: string): number {
    return InventoryModule.getWarehouseTotalStock(warehouseId);
  }

  static getProductStockInWarehouse(warehouseId: string, productId: string, binId?: string): number {
    if (binId) {
      return InventoryModule.getBinProductStock(productId, binId, warehouseId);
    }
    return InventoryModule.getProductStock(productId, warehouseId);
  }

  static async adjustStock(
    warehouseId: string,
    productId: string,
    qtyChange: number,
    docType: InventoryDocType,
    userId: string,
    binId?: string,
    idempotencyKey?: string
  ): Promise<void> {
    const wh = StorageEngine.getStored<Warehouse[]>('warehouses', []).find(w => w.id === warehouseId);
    const companyId = wh?.company_id || CompaniesModule.getSelectedCompanyId();
    if (!companyId) {
      throw new Error('لا يمكن تسجيل حركة مخزون بدون شركة محددة / Cannot record stock movement without a company context.');
    }

    const org_unit_id = InventoryModule.resolveWarehouseOrgUnit(warehouseId, companyId);
    const balanceKey = `${productId}___${warehouseId}___${binId || 'nobin'}`;

    if (!db || typeof db !== 'object') {
      throw new Error('قاعدة البيانات غير متاحة ولم يتم حفظ حركة المخزون / Database is unavailable; stock movement was NOT persisted.');
    }

    try {
      const balanceDocRef = doc(db, 'inventory_balances', companyId, 'items', balanceKey);
      let committedMovement: StockMovement | null = null;

      await runTransaction(db, async (transaction) => {
        const balanceDoc = await transaction.get(balanceDocRef);
        let currentStock = 0;
        if (balanceDoc.exists()) {
          currentStock = balanceDoc.data().balance ?? 0;
        } else {
          currentStock = InventoryModule.getProductStockInWarehouse(warehouseId, productId, binId);
        }

        const current_balance_after = currentStock + qtyChange;
        if (qtyChange < 0 && current_balance_after < 0) {
          const config = InventoryModule.getInventoryConfig();
          if (config.allow_overdraft === 'STRICT') {
            throw new Error(`رصيد غير كافٍ للمنتج (${productId}) في المستودع/الحاوية. الرصيد الحالي: ${currentStock}، الكمية المطلوبة: ${Math.abs(qtyChange)}. / Insufficient stock for product (${productId}). Available: ${currentStock}, Requested: ${Math.abs(qtyChange)}.`);
          }
        }

        const movementId = idempotencyKey ? `m-adj-${idempotencyKey}` : `m-adj-${crypto.randomUUID()}`;
        const movementDocRef = doc(db, 'stock_movements', movementId);

        if (idempotencyKey) {
          const existingMovement = await transaction.get(movementDocRef);
          if (existingMovement.exists()) {
            committedMovement = existingMovement.data() as StockMovement;
            return;
          }
        }

        const movement: StockMovement = {
          id: movementId,
          doc_id: 'direct-adjust',
          doc_no: idempotencyKey ? `ADJ-${idempotencyKey.slice(0, 8)}` : `ADJ-${crypto.randomUUID().slice(0, 8)}`,
          doc_type: docType,
          product_id: productId,
          warehouse_id: warehouseId,
          org_unit_id,
          bin_id: binId,
          qty_change: qtyChange,
          type: qtyChange >= 0 ? 'IN' : 'OUT',
          current_balance_after,
          date: new Date().toISOString().split('T')[0],
          company_id: companyId,
          created_at: new Date().toISOString(),
          created_by: userId
        };

        transaction.set(balanceDocRef, {
          balance: current_balance_after,
          productId,
          warehouseId,
          binId: binId || null,
          updatedAt: new Date().toISOString(),
          company_id: companyId
        }, { merge: true });

        transaction.set(movementDocRef, movement);
        committedMovement = movement;
      });

      if (committedMovement) {
        const allMovements = InventoryModule.getStockMovements();
        const existingIdx = allMovements.findIndex(m => m.id === committedMovement!.id);
        if (existingIdx >= 0) {
          allMovements[existingIdx] = committedMovement;
        } else {
          allMovements.push(committedMovement);
        }
        StorageEngine.setStored('stock_movements', allMovements);
      }
    } catch (err: any) {
      // 1. Business-rule rejection (insufficient stock / رصيد غير كافٍ) -> rethrow; no fallback
      if (err.message && (err.message.includes('رصيد غير كافٍ') || err.message.includes('Insufficient stock'))) {
        throw err;
      }
      // 2. Everything else -> do NOT write local stock; rethrow clear dual-language error that movement was NOT persisted
      throw new Error(`فشل تعديل المخزون ولم يتم حفظ الحركة: ${err?.message || 'خطأ غير معروف'} / Stock adjustment failed and movement was NOT persisted: ${err?.message || 'Unknown error'}`);
    }
  }

  /**
   * Resolves the linked Organization Unit ID for a warehouse.
   */
  public static resolveWarehouseOrgUnit(warehouseId?: string, companyId?: string): string | null {
    if (!warehouseId) return null;
    const targetCompanyId = companyId || CompaniesModule.getSelectedCompanyId();
    const warehouses = InventoryModule.getWarehouses(targetCompanyId);
    const wh = warehouses.find(w => w.id === warehouseId);
    if (!wh) return null;
    if (wh.org_unit_id) return wh.org_unit_id;
    if (wh.parent_id) {
      return InventoryModule.resolveWarehouseOrgUnit(wh.parent_id, targetCompanyId);
    }
    return null;
  }

  /**
   * Gets warehouses linked to a specific Organization Unit (and optionally its sub-units).
   */
  public static getWarehousesByOrgUnit(
    companyId: string, 
    org_unit_id: string, 
    includeSubUnits: boolean = true
  ): Warehouse[] {
    const warehouses = InventoryModule.getWarehouses(companyId);
    let targetOrgUnitIds = [org_unit_id];
    if (includeSubUnits) {
      const descendants = OrganizationEngine.getDescendantUnits(org_unit_id, companyId);
      targetOrgUnitIds.push(...descendants.map(d => d.id));
    }
    const targetSet = new Set(targetOrgUnitIds);
    return warehouses.filter(w => {
      const resolvedOrgUnit = InventoryModule.resolveWarehouseOrgUnit(w.id, companyId);
      return resolvedOrgUnit ? targetSet.has(resolvedOrgUnit) : false;
    });
  }

  /**
   * Computes stock across all warehouses linked to an Organization Unit (and optionally its sub-units).
   */
  public static getOrgUnitStock(
    companyId: string, 
    org_unit_id: string, 
    productId?: string, 
    includeSubUnits: boolean = true
  ): number {
    const orgWarehouses = InventoryModule.getWarehousesByOrgUnit(companyId, org_unit_id, includeSubUnits);
    const whIds = new Set(orgWarehouses.map(w => w.id));
    if (whIds.size === 0) return 0;

    const movements = InventoryModule.getStockMovements().filter(m => m.company_id === companyId && whIds.has(m.warehouse_id));
    if (productId) {
      return movements
        .filter(m => m.product_id === productId)
        .reduce((sum, m) => sum + m.qty_change, 0);
    }
    return movements.reduce((sum, m) => sum + m.qty_change, 0);
  }

  /**
   * Gets stock movements filtered by Organization Unit tree.
   */
  public static getOrgUnitStockMovements(
    companyId: string, 
    org_unit_id: string, 
    includeSubUnits: boolean = true
  ): StockMovement[] {
    const orgWarehouses = InventoryModule.getWarehousesByOrgUnit(companyId, org_unit_id, includeSubUnits);
    const whIds = new Set(orgWarehouses.map(w => w.id));
    
    let targetOrgUnitIds = [org_unit_id];
    if (includeSubUnits) {
      const descendants = OrganizationEngine.getDescendantUnits(org_unit_id, companyId);
      targetOrgUnitIds.push(...descendants.map(d => d.id));
    }
    const targetSet = new Set(targetOrgUnitIds);

    return InventoryModule.getStockMovements().filter(m => {
      if (m.company_id !== companyId) return false;
      if (m.org_unit_id && targetSet.has(m.org_unit_id)) return true;
      return whIds.has(m.warehouse_id);
    });
  }

  /**
   * Adds an Inventory Document
   */
  static async addInventoryDocument(
    docData: Omit<InventoryDocument, keyof import('../types/enterprise').BaseMetadata | 'id' | 'status' | 'doc_no'>
  ): Promise<InventoryDocument> {
    const companyId = (docData as any).tenantId || CompaniesModule.getSelectedCompanyId();
    const user = UsersModule.getActiveUser();
    const operatorId = user?.id || 'system';

    // 1. Generate Sequence Number
    let docNo = '';
    const prefix = docData.doc_type.substring(0, 3).toUpperCase();
    try {
      docNo = await SequenceEngine.generateNextSequence(
        db,
        companyId,
        `last_inv_seq_${docData.doc_type}`,
        { prefix, padding: 4, includeYear: true }
      );
    } catch {
      // Fallback in case of database sync error
      docNo = `${prefix}-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8)}`;
    }

    // 2. Resolve Organization Units
    const sourceOrgUnit = docData.org_unit_id || InventoryModule.resolveWarehouseOrgUnit(docData.source_warehouse_id, companyId);
    let destOrgUnit = docData.dest_org_unit_id || null;
    if (!destOrgUnit && docData.dest_entity_id) {
      if (docData.dest_entity_type === 'org_unit') {
        destOrgUnit = docData.dest_entity_id;
      } else if (docData.dest_entity_type === 'warehouse') {
        destOrgUnit = InventoryModule.resolveWarehouseOrgUnit(docData.dest_entity_id, companyId);
      }
    }

    // 3. Prepare metadata
    const metadata = createBaseMetadata(companyId, operatorId);

    // 4. Draft initial status
    const newDoc: InventoryDocument = {
      ...docData,
      org_unit_id: sourceOrgUnit,
      dest_org_unit_id: destOrgUnit,
      ...metadata,
      id: `inv-doc-${crypto.randomUUID()}`,
      doc_no: docNo,
      status: 'Draft'
    };

    const documents = InventoryModule.getInventoryDocuments();
    documents.unshift(newDoc);
    await InventoryModule.saveInventoryDocuments(documents);

    // Logs
    LogsModule.addLog(
      operatorId,
      user?.full_name || 'System',
      'Create Inventory Document',
      `Created document ${docNo} (${docData.doc_type}) with ${docData.items.length} items.`
    );

    LogsModule.logAudit('INV_DOC_CREATE', `Created inventory document ${docNo}`, {
      id: newDoc.id,
      doc_no: docNo,
      doc_type: docData.doc_type,
      source_warehouse_id: docData.source_warehouse_id
    });

    return newDoc;
  }

  /**
   * Update an existing draft document
   */
  static async updateInventoryDocument(docId: string, updates: Partial<InventoryDocument>, expectedVersion?: number): Promise<void> {
    const documents = InventoryModule.getInventoryDocuments();
    const idx = documents.findIndex(d => d.id === docId);
    if (idx !== -1) {
      if (documents[idx].status !== 'Draft') {
        throw new Error('Only Draft documents can be edited.');
      }
      const existingDoc = documents[idx];
      const currentVer = existingDoc.version ?? (existingDoc as any).metadata?.version ?? 1;
      const requestedVer = expectedVersion ?? updates.version ?? (updates as any).metadata?.version;

      if (requestedVer !== undefined && requestedVer !== currentVer) {
        throw new Error('⚠️ عذراً، تم تعديل مستند المخزون هذا بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً. / This inventory document has been modified by another user. Please refresh and try again (concurrency conflict).');
      }

      const user = UsersModule.getActiveUser();
      const updatedMetadata = updateBaseMetadata(existingDoc, user?.id || 'system');
      const newVer = currentVer + 1;
      updatedMetadata.version = newVer;

      documents[idx] = {
        ...existingDoc,
        ...updates,
        ...updatedMetadata,
        version: newVer
      };
      await InventoryModule.saveInventoryDocuments(documents);

      LogsModule.addLog(
        user?.id || 'system',
        user?.full_name || 'System',
        'Update Inventory Document',
        `Updated draft document ${documents[idx].doc_no}`
      );
    }
  }

  /**
   * Deletes a Draft document
   */
  static async deleteInventoryDocument(docId: string): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const documents = InventoryModule.getInventoryDocuments();
      const doc = documents.find(d => d.id === docId);
      if (!doc) {
        return { success: false, errors: ['Document not found.'] };
      }
      if (doc.status !== 'Draft') {
        return { success: false, errors: ['Only Draft documents can be deleted.'] };
      }
      const filtered = documents.filter(d => d.id !== docId);
      const res = await syncWriteWithOfflineFallback('inventory_documents', docId, null);
      if (!res.success) {
        return { success: false, errors: [res.error || 'Failed to sync deletion to server.'] };
      }
      StorageEngine.setStored('inventory_documents', filtered);

      const user = UsersModule.getActiveUser();
      LogsModule.addLog(
        user?.id || 'system',
        user?.full_name || 'System',
        'Delete Inventory Document',
        `Deleted draft document ${doc.doc_no}`
      );
      return { success: true };
    } catch (err: any) {
      console.error('Error deleting inventory document:', err);
      return { success: false, errors: [err.message || 'Failed to delete inventory document.'] };
    }
  }

  static async processDocumentStage(docId: string, stage: InventoryDocStatus, userId: string = 'system'): Promise<void> {
    const documents = InventoryModule.getInventoryDocuments();
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    doc.status = stage;
    await InventoryModule.saveInventoryDocuments(documents);
    await InventoryModule.generateStockMovementsForDoc(doc, userId, stage === 'Dispatched' ? 'Dispatched' : 'Posted');
    await InventoryModule.postAccountingEntryForDoc(doc, userId);
  }

  /**
   * Document Lifecycle FSM engine transition.
   * Handles state machine and updates stock ledger when reaching 'Posted' or 'Approved'.
   */
  static async triggerLifecycleTransition(
    docId: string,
    event: 'Submit' | 'Approve' | 'Reject' | 'Cancel' | 'Receive',
    expectedVersion?: number
  ): Promise<{ success: boolean; messageAr: string; messageEn: string }> {
    let documents = InventoryModule.getInventoryDocuments();
    let docIndex = documents.findIndex(d => d.id === docId);
    if (docIndex === -1) {
      // Fallback: check all stored inventory documents
      const allDocs = StorageEngine.getStored<InventoryDocument[]>('inventory_documents', []);
      docIndex = allDocs.findIndex(d => d.id === docId);
      if (docIndex === -1) {
        return { success: false, messageAr: 'المستند غير موجود', messageEn: 'Document not found' };
      }
      documents = allDocs;
    }

    const document = documents[docIndex];
    if (expectedVersion !== undefined) {
      const currentVer = document.version ?? (document as any).metadata?.version ?? 1;
      if (expectedVersion !== currentVer) {
        return {
          success: false,
          messageAr: '⚠️ عذراً، تم تعديل مستند المخزون هذا بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً.',
          messageEn: 'This inventory document has been modified by another user. Please refresh and try again (concurrency conflict).'
        };
      }
    }
    const user = UsersModule.getActiveUser();
    if (!user) {
      return { success: false, messageAr: 'يجب تسجيل الدخول أولاً', messageEn: 'User must be authenticated' };
    }

    // FSM Setup
    const fsmConfig: FsmConfig<InventoryDocStatus, 'Submit' | 'Approve' | 'Reject' | 'Cancel' | 'Receive', InventoryDocument> = {
      documentType: 'InventoryDocument',
      initialState: 'Draft',
      states: {
        Draft: { name: 'Draft', labelAr: 'مسودة', labelEn: 'Draft', isInitial: true },
        Pending: { name: 'Pending', labelAr: 'قيد المراجعة', labelEn: 'Pending' },
        Dispatched: { name: 'Dispatched', labelAr: 'مشحون قيد النقل', labelEn: 'Dispatched / In-Transit' },
        Approved: { name: 'Approved', labelAr: 'معتمد', labelEn: 'Approved', isTerminal: true },
        Posted: { name: 'Posted', labelAr: 'مرحل / مستلم', labelEn: 'Posted', isTerminal: true },
        Rejected: { name: 'Rejected', labelAr: 'مرفوض', labelEn: 'Rejected', isTerminal: true },
        Cancelled: { name: 'Cancelled', labelAr: 'ملغي', labelEn: 'Cancelled', isTerminal: true }
      },
      transitions: [
        {
          event: 'Submit',
          from: 'Draft',
          to: 'Pending',
          labelAr: 'إرسال للاعتماد',
          labelEn: 'Submit for Approval',
          authorizedRoles: ['StationAdmin', 'Admin', 'SystemAdmin']
        },
        {
          event: 'Approve',
          from: 'Pending',
          to: 'Posted', // We'll resolve dynamically below
          labelAr: 'اعتماد نهائي',
          labelEn: 'Final Approval',
          authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin']
        },
        {
          event: 'Receive',
          from: 'Dispatched',
          to: 'Posted',
          labelAr: 'تأكيد الاستلام والترخيص',
          labelEn: 'Confirm Receipt & Authorize',
          authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin', 'Storekeeper', 'StationAdmin']
        },
        {
          event: 'Reject',
          from: 'Pending',
          to: 'Rejected',
          labelAr: 'رفض المستند',
          labelEn: 'Reject Document',
          authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin']
        },
        {
          event: 'Cancel',
          from: 'Draft',
          to: 'Cancelled',
          labelAr: 'إلغاء',
          labelEn: 'Cancel',
          authorizedRoles: ['StationAdmin', 'Admin', 'SystemAdmin']
        },
        {
          event: 'Cancel',
          from: 'Pending',
          to: 'Cancelled',
          labelAr: 'إلغاء',
          labelEn: 'Cancel',
          authorizedRoles: ['Admin', 'RegionalManager', 'SystemAdmin']
        }
      ]
    };

    const fsm = new DocumentLifecycleEngine(fsmConfig);
    const clearance = await fsm.canTransition(document.status, event, user.role, document);
    if (!clearance.can) {
      return { success: false, messageAr: clearance.reasonAr, messageEn: clearance.reasonEn };
    }

    // Determine target state.
    // If the event is 'Approve', let's check the destination state based on the warehouse's configuration.
    // However, if the warehouse does NOT have 'receiving_approval_workflow' or if we want to directly POST,
    // we set state to 'Posted' (Final) and execute the stock ledger updates.
    let nextStatus: InventoryDocStatus = 'Draft';
    if (event === 'Submit') {
      const warehouses = InventoryModule.getWarehouses();
      const warehouse = warehouses.find(w => w.id === document.source_warehouse_id);
      
      // If no receiving approval workflow is required, submit triggers IMMEDIATE Approved/Posted (or Dispatched for Transfers)!
      if (warehouse && !warehouse.receiving_approval_workflow) {
        if (document.doc_type === 'Transfer' || document.doc_type === 'BranchTransfer' || document.doc_type === 'StationTransfer') {
          nextStatus = 'Dispatched';
        } else {
          nextStatus = 'Posted';
        }
      } else {
        nextStatus = 'Pending';
      }
    } else if (event === 'Approve') {
      if (document.doc_type === 'Transfer' || document.doc_type === 'BranchTransfer' || document.doc_type === 'StationTransfer') {
        nextStatus = 'Dispatched';
      } else {
        nextStatus = 'Posted';
      }
    } else if (event === 'Receive') {
      nextStatus = 'Posted';
    } else if (event === 'Reject') {
      nextStatus = 'Rejected';
    } else if (event === 'Cancel') {
      nextStatus = 'Cancelled';
    }

    // Trigger state change
    const updatedMetadata = updateBaseMetadata(document, user.id);
    const updatedDoc: InventoryDocument = {
      ...document,
      ...updatedMetadata,
      status: nextStatus
    };

    // Validate capacities and simple overdrafts before executing transitions that generate stock records
    if (nextStatus === 'Dispatched' || nextStatus === 'Posted') {
      const valResult = InventoryModule.validateCapacityAndOverdraft(updatedDoc, nextStatus);
      if (!valResult.success) {
        return valResult;
      }
    }

    // If nextState is 'Dispatched', we generate dispatch stock movements (source warehouse deduction)
    if (nextStatus === 'Dispatched') {
      try {
        await InventoryModule.generateStockMovementsForDoc(updatedDoc, user.id, 'Dispatched');
        await InventoryModule.postAccountingEntryForDoc(updatedDoc, user.id);
      } catch (err: any) {
        return {
          success: false,
          messageAr: `فشل ترحيل شحنة التحويل: ${err.message}`,
          messageEn: `Transfer dispatch posting failed: ${err.message}`
        };
      }
    }

    // If nextState is 'Posted', we generate stock movements and update stock!
    if (nextStatus === 'Posted') {
      try {
        await InventoryModule.generateStockMovementsForDoc(updatedDoc, user.id, 'Posted');
        await InventoryModule.postAccountingEntryForDoc(updatedDoc, user.id);
      } catch (err: any) {
        return {
          success: false,
          messageAr: `فشل ترحيل المخزون: ${err.message}`,
          messageEn: `Stock posting failed: ${err.message}`
        };
      }
    }

    documents[docIndex] = updatedDoc;
    await InventoryModule.saveInventoryDocuments(documents);

    // Audit Log & Event Log
    LogsModule.addLog(
      user.id,
      user.full_name,
      'Transition Inventory Document',
      `Document ${document.doc_no} transitioned from ${document.status} to ${nextStatus} via ${event}.`
    );

    LogsModule.logAudit('INV_DOC_TRANSITION', `Transitioned document ${document.doc_no} to ${nextStatus}`, {
      id: document.id,
      doc_no: document.doc_no,
      old_status: document.status,
      new_status: nextStatus,
      event
    });

    return {
      success: true,
      messageAr: `تم تنفيذ الإجراء بنجاح: المستند الآن في حالة (${fsmConfig.states[nextStatus]?.labelAr})`,
      messageEn: `Action executed successfully: Document is now (${fsmConfig.states[nextStatus]?.labelEn})`
    };
  }

  /**
   * Generates StockMovement records based on the approved document's details.
   */
  private static async generateStockMovementsForDoc(
    doc: InventoryDocument, 
    operatorId: string, 
    stage: 'Dispatched' | 'Posted' = 'Posted'
  ): Promise<void> {
    const movements = InventoryModule.getStockMovements();
    const ledgerEntries = InventoryModule.getInventoryLedger();
    const products = InventoryModule.getProducts();
    const updatedProductsList = [...products];
    const activeUser = UsersModule.getActiveUser();
    const userName = activeUser?.full_name || 'System';

    for (const item of doc.items) {
      // Find and update product's last_purchase_price if doc is Receipt or Addition
      if ((doc.doc_type === 'Receipt' || doc.doc_type === 'Addition') && item.last_purchase_price) {
        const prodIdx = updatedProductsList.findIndex(p => p.id === item.product_id);
        if (prodIdx !== -1) {
          updatedProductsList[prodIdx] = {
            ...updatedProductsList[prodIdx],
            last_purchase_price: item.last_purchase_price
          };
        }
      }

      // Check current stock first to make sure we don't overdraft unless allowed (by default ERP rules)
      const currentStock = InventoryModule.getProductStock(item.product_id, doc.source_warehouse_id);
      
      // Determine qty changes for source warehouse
      let sourceQtyChange = 0;
      let targetQtyChange = 0;

      const isTransferType = doc.doc_type === 'Transfer' || doc.doc_type === 'BranchTransfer' || doc.doc_type === 'StationTransfer';

      if (isTransferType) {
        // If we are at 'Posted' stage, check if we already did the source deduction during 'Dispatched' stage
        const existingMovements = movements.filter(m => m.doc_id === doc.id);
        const isTwoStepFlow = existingMovements.some(m => m.qty_change < 0);

        if (stage === 'Dispatched') {
          // STEP 1: Dispatched (Out from Source)
          sourceQtyChange = -item.qty;
        } else if (stage === 'Posted') {
          // STEP 2: Posted (In to Destination)
          const qtyReceived = item.qty_received !== undefined ? item.qty_received : item.qty;
          targetQtyChange = qtyReceived;
          if (!isTwoStepFlow) {
            // Backward-compatible: If it wasn't dispatched first, do source deduction now too!
            sourceQtyChange = -item.qty;
          }
        }
      } else {
        // Simple/other documents processed entirely at 'Posted' stage
        if (stage === 'Posted') {
          switch (doc.doc_type) {
            case 'Receipt': // استلام
            case 'Addition': // إضافة
            case 'BranchReturn': // مرتجع من فرع
              sourceQtyChange = item.qty;
              break;

            case 'Issue': // الصرف
            case 'SupplierReturn': // مرتجع لمورد
              sourceQtyChange = -item.qty;
              break;

            case 'Damage': // خردة/كهنة
              if (doc.scrap_action === 'IN') {
                sourceQtyChange = item.qty; // إضافة للمخزن عند التكهين
              } else {
                sourceQtyChange = -item.qty; // صرف من المخزن عند بيع الخردة
              }
              break;

            case 'Adjustment': // تسوية جردية
              sourceQtyChange = item.qty - currentStock;
              break;
          }
        }
      }

      // Validate overdraft if negative movement
      if (sourceQtyChange < 0 && (currentStock + sourceQtyChange) < 0) {
        // Allow overdraft for Adjustments, but reject for other documents
        if (doc.doc_type !== 'Adjustment') {
          throw new Error(`عذراً، الرصيد غير كافٍ للصنف ${item.product_name} في المخزن المحدد (الرصيد الحالي: ${currentStock})`);
        }
      }

      const prod = products.find(p => p.id === item.product_id);
      const unit_cost = item.last_purchase_price || prod?.last_purchase_price || 0;

      const sourceOrgUnitId = doc.org_unit_id || InventoryModule.resolveWarehouseOrgUnit(doc.source_warehouse_id, doc.tenantId);
      const sourceCostCenterId = sourceOrgUnitId ? (await CostCenterEngine.resolveCostCenterForOrgUnit(sourceOrgUnitId, doc.tenantId))?.id || null : null;

      const destOrgUnitId = doc.dest_org_unit_id || (doc.dest_entity_type === 'warehouse' ? InventoryModule.resolveWarehouseOrgUnit(doc.dest_entity_id, doc.tenantId) : doc.dest_entity_type === 'org_unit' ? doc.dest_entity_id : null);
      const destCostCenterId = destOrgUnitId ? (await CostCenterEngine.resolveCostCenterForOrgUnit(destOrgUnitId, doc.tenantId))?.id || null : null;

      // 1. Create movement for source warehouse
      if (sourceQtyChange !== 0) {
        const allocations = item.bin_allocations || [];
        if (allocations.length > 0) {
          // SPLIT BY BINS
          let runningStock = currentStock;
          allocations.forEach((alloc, allocIdx) => {
            const signedAllocQty = sourceQtyChange > 0 ? alloc.qty : -alloc.qty;
            const newBalanceAfter = runningStock + signedAllocQty;
            
            const movSource: StockMovement = {
              id: `mov-${crypto.randomUUID()}`,
              doc_id: doc.id,
              doc_no: doc.doc_no,
              doc_type: doc.doc_type,
              product_id: item.product_id,
              warehouse_id: doc.source_warehouse_id,
              org_unit_id: sourceOrgUnitId,
              qty_change: signedAllocQty,
              type: signedAllocQty > 0 ? 'IN' : 'OUT',
              current_balance_after: newBalanceAfter,
              date: doc.date,
              company_id: doc.tenantId,
              created_at: new Date().toISOString(),
              created_by: operatorId,
              bin_id: alloc.bin_id,
              bin_code: alloc.bin_code,
              batch_no: item.batch_no,
              expiry_date: item.expiry_date
            };
            movements.push(movSource);

            const ledgerSource: InventoryLedgerEntry = {
              id: `led-${crypto.randomUUID()}`,
              company_id: doc.tenantId,
              warehouse_id: doc.source_warehouse_id,
              org_unit_id: sourceOrgUnitId,
              cost_center_id: sourceCostCenterId,
              product_id: item.product_id,
              transaction_type: isTransferType ? `${doc.doc_type} - Dispatched (Bin)` : `${doc.doc_type} (Bin)`,
              reference_document_id: doc.id,
              reference_document_no: doc.doc_no,
              qty_in: signedAllocQty > 0 ? signedAllocQty : 0,
              qty_out: signedAllocQty < 0 ? Math.abs(signedAllocQty) : 0,
              balance_before: runningStock,
              balance_after: newBalanceAfter,
              unit_cost,
              running_cost: newBalanceAfter * unit_cost,
              timestamp: new Date().toISOString(),
              user_id: operatorId,
              user_name: userName,
              audit_ref: `${doc.doc_no}-LEDGER`,
              bin_id: alloc.bin_id,
              bin_code: alloc.bin_code,
              batch_no: item.batch_no,
              expiry_date: item.expiry_date
            };
            ledgerEntries.push(ledgerSource);
            runningStock = newBalanceAfter;
          });
        } else {
          // Standard warehouse overall transaction
          const newBalanceAfter = currentStock + sourceQtyChange;
          const movSource: StockMovement = {
            id: `mov-${crypto.randomUUID()}`,
            doc_id: doc.id,
            doc_no: doc.doc_no,
            doc_type: doc.doc_type,
            product_id: item.product_id,
            warehouse_id: doc.source_warehouse_id,
            org_unit_id: sourceOrgUnitId,
            qty_change: sourceQtyChange,
            type: sourceQtyChange > 0 ? 'IN' : 'OUT',
            current_balance_after: newBalanceAfter,
            date: doc.date,
            company_id: doc.tenantId,
            created_at: new Date().toISOString(),
            created_by: operatorId,
            batch_no: item.batch_no,
            expiry_date: item.expiry_date
          };
          movements.push(movSource);

          // CREATE SOURCE LEDGER ENTRY
          const ledgerSource: InventoryLedgerEntry = {
            id: `led-${crypto.randomUUID()}`,
            company_id: doc.tenantId,
            warehouse_id: doc.source_warehouse_id,
            org_unit_id: sourceOrgUnitId,
            cost_center_id: sourceCostCenterId,
            product_id: item.product_id,
            transaction_type: isTransferType ? `${doc.doc_type} - Dispatched` : doc.doc_type,
            reference_document_id: doc.id,
            reference_document_no: doc.doc_no,
            qty_in: sourceQtyChange > 0 ? sourceQtyChange : 0,
            qty_out: sourceQtyChange < 0 ? Math.abs(sourceQtyChange) : 0,
            balance_before: currentStock,
            balance_after: newBalanceAfter,
            unit_cost,
            running_cost: newBalanceAfter * unit_cost,
            timestamp: new Date().toISOString(),
            user_id: operatorId,
            user_name: userName,
            audit_ref: `${doc.doc_no}-LEDGER`,
            batch_no: item.batch_no,
            expiry_date: item.expiry_date
          };
          ledgerEntries.push(ledgerSource);
        }
      }

      // 2. Create movement for target warehouse if Transfer & Target Entity is a Warehouse
      const isDestAWarehouse = InventoryModule.getWarehouses().some(w => w.id === doc.dest_entity_id);

      if (isTransferType && targetQtyChange > 0 && isDestAWarehouse) {
        const targetCurrentStock = InventoryModule.getProductStock(item.product_id, doc.dest_entity_id);
        const allocations = item.bin_allocations || [];

        if (allocations.length > 0) {
          // SPLIT BY DESTINATION BINS
          let runningStock = targetCurrentStock;
          allocations.forEach((alloc, allocIdx) => {
            const newBalanceAfter = runningStock + alloc.qty;
            const movTarget: StockMovement = {
              id: `mov-${crypto.randomUUID()}`,
              doc_id: doc.id,
              doc_no: doc.doc_no,
              doc_type: doc.doc_type,
              product_id: item.product_id,
              warehouse_id: doc.dest_entity_id,
              org_unit_id: destOrgUnitId,
              qty_change: alloc.qty,
              type: 'IN',
              current_balance_after: newBalanceAfter,
              date: doc.date,
              company_id: doc.tenantId,
              created_at: new Date().toISOString(),
              created_by: operatorId,
              bin_id: alloc.bin_id,
              bin_code: alloc.bin_code,
              batch_no: item.batch_no,
              expiry_date: item.expiry_date
            };
            movements.push(movTarget);

            // CREATE TARGET LEDGER ENTRY
            const ledgerTarget: InventoryLedgerEntry = {
              id: `led-${crypto.randomUUID()}`,
              company_id: doc.tenantId,
              warehouse_id: doc.dest_entity_id,
              org_unit_id: destOrgUnitId,
              cost_center_id: destCostCenterId,
              product_id: item.product_id,
              transaction_type: `${doc.doc_type} - Received (Bin)`,
              reference_document_id: doc.id,
              reference_document_no: doc.doc_no,
              qty_in: alloc.qty,
              qty_out: 0,
              balance_before: runningStock,
              balance_after: newBalanceAfter,
              unit_cost,
              running_cost: newBalanceAfter * unit_cost,
              timestamp: new Date().toISOString(),
              user_id: operatorId,
              user_name: userName,
              audit_ref: `${doc.doc_no}-LEDGER`,
              bin_id: alloc.bin_id,
              bin_code: alloc.bin_code,
              batch_no: item.batch_no,
              expiry_date: item.expiry_date
            };
            ledgerEntries.push(ledgerTarget);
            runningStock = newBalanceAfter;
          });
        } else {
          const movTarget: StockMovement = {
            id: `mov-${crypto.randomUUID()}`,
            doc_id: doc.id,
            doc_no: doc.doc_no,
            doc_type: doc.doc_type,
            product_id: item.product_id,
            warehouse_id: doc.dest_entity_id,
            org_unit_id: destOrgUnitId,
            qty_change: targetQtyChange,
            type: 'IN',
            current_balance_after: targetCurrentStock + targetQtyChange,
            date: doc.date,
            company_id: doc.tenantId,
            created_at: new Date().toISOString(),
            created_by: operatorId,
            batch_no: item.batch_no,
            expiry_date: item.expiry_date
          };
          movements.push(movTarget);

          // CREATE TARGET LEDGER ENTRY
          const ledgerTarget: InventoryLedgerEntry = {
            id: `led-${crypto.randomUUID()}`,
            company_id: doc.tenantId,
            warehouse_id: doc.dest_entity_id,
            org_unit_id: destOrgUnitId,
            cost_center_id: destCostCenterId,
            product_id: item.product_id,
            transaction_type: `${doc.doc_type} - Received`,
            reference_document_id: doc.id,
            reference_document_no: doc.doc_no,
            qty_in: targetQtyChange,
            qty_out: 0,
            balance_before: targetCurrentStock,
            balance_after: targetCurrentStock + targetQtyChange,
            unit_cost,
            running_cost: (targetCurrentStock + targetQtyChange) * unit_cost,
            timestamp: new Date().toISOString(),
            user_id: operatorId,
            user_name: userName,
            audit_ref: `${doc.doc_no}-LEDGER`,
            batch_no: item.batch_no,
            expiry_date: item.expiry_date
          };
          ledgerEntries.push(ledgerTarget);
        }
      }
    }

    // Save everything in transaction-like batch
    await InventoryModule.saveStockMovements(movements);
    await InventoryModule.saveInventoryLedger(ledgerEntries);
    await InventoryModule.saveProducts(updatedProductsList);
  }

  /**
   * Posts automated double-entry GL journal entries for an inventory movement.
   */
  public static async postAccountingEntryForDoc(
    doc: InventoryDocument,
    operatorId: string
  ): Promise<void> {
    try {
      const config = InventoryModule.getInventoryConfig();
      if (!config.auto_post_accounting) {
        return; // Auto accounting GL entry generation disabled by company workflow
      }

      if (!doc.tenantId) {
        console.error(`[postAccountingEntryForDoc] Auto accounting journal entry aborted: missing tenantId on document ${doc.id}`);
        return;
      }
      const companyId = doc.tenantId;
      const products = InventoryModule.getProducts();

      // Calculate total document monetary value
      const totalAmount = doc.items.reduce((sum, item) => {
        const prod = products.find(p => p.id === item.product_id);
        const cost = item.last_purchase_price || prod?.last_purchase_price || 0;
        return sum + (item.qty * cost);
      }, 0);

      if (totalAmount <= 0) {
        return; // Skip posting for zero-value documents
      }

      const docTypeNameAr = 
        doc.doc_type === 'Receipt' ? (doc.receipt_source_type === 'transfer' ? 'إذن استلام بالتحويل' : 'إذن استلام من مورد') :
        doc.doc_type === 'Addition' ? 'إذن إضافة مخزني' :
        doc.doc_type === 'Issue' ? 'إذن صرف مخزني' :
        doc.doc_type === 'Transfer' ? 'إذن تحويل بين المخازن' :
        doc.doc_type === 'BranchTransfer' ? 'إذن تحويل فرع' :
        doc.doc_type === 'StationTransfer' ? 'إذن تحويل محطة' :
        doc.doc_type === 'SupplierReturn' ? 'إذن مرتجع لمورد' :
        doc.doc_type === 'BranchReturn' ? 'إذن مرتجع من فرع' :
        doc.doc_type === 'Damage' ? 'إذن خردة/إتلاف' : 'سند تسوية جردية';

      const statementAr = `أثر محاسبي تلقائي: ${docTypeNameAr} رقم ${doc.doc_no} - ${doc.statement || doc.reason}`;
      const statementEn = `Auto Inventory Posting: ${doc.doc_type} #${doc.doc_no} - ${doc.statement || doc.reason}`;

      const invAcc = config.default_inventory_account_code || '120101';
      const apAcc = config.default_ap_account_code || '210101';
      const cogsAcc = config.default_cogs_account_code || '510101';
      const varAcc = config.default_variance_account_code || '510401';
      const scrapAcc = config.default_scrap_account_code || '410101';

      const lines: { accountCode: string; debit: number; credit: number; notes?: string }[] = [];

      switch (doc.doc_type) {
        case 'Receipt':
          if (doc.receipt_source_type === 'transfer') {
            lines.push(
              { accountCode: invAcc, debit: totalAmount, credit: 0, notes: `Debit: Target Inventory (${doc.doc_no})` },
              { accountCode: invAcc, debit: 0, credit: totalAmount, notes: `Credit: Transfer Clearing (${doc.doc_no})` }
            );
          } else {
            lines.push(
              { accountCode: invAcc, debit: totalAmount, credit: 0, notes: `Debit: Warehouse Stock Inventory` },
              { accountCode: apAcc, debit: 0, credit: totalAmount, notes: `Credit: Accounts Payable (${doc.recipient || 'Supplier'})` }
            );
          }
          break;

        case 'Addition':
          lines.push(
            { accountCode: invAcc, debit: totalAmount, credit: 0, notes: `Debit: Warehouse Stock Inventory` },
            { accountCode: varAcc, debit: 0, credit: totalAmount, notes: `Credit: General Stock Addition Adjustment` }
          );
          break;

        case 'Issue':
          lines.push(
            { accountCode: cogsAcc, debit: totalAmount, credit: 0, notes: `Debit: Operational Expense (${doc.reason})` },
            { accountCode: invAcc, debit: 0, credit: totalAmount, notes: `Credit: Warehouse Stock Inventory` }
          );
          break;

        case 'Transfer':
        case 'BranchTransfer':
        case 'StationTransfer':
          lines.push(
            { accountCode: invAcc, debit: totalAmount, credit: 0, notes: `Debit: Target Location Stock` },
            { accountCode: invAcc, debit: 0, credit: totalAmount, notes: `Credit: Source Location Stock` }
          );
          break;

        case 'SupplierReturn':
          lines.push(
            { accountCode: apAcc, debit: totalAmount, credit: 0, notes: `Debit: Accounts Payable Refund` },
            { accountCode: invAcc, debit: 0, credit: totalAmount, notes: `Credit: Warehouse Stock Inventory` }
          );
          break;

        case 'BranchReturn':
          lines.push(
            { accountCode: invAcc, debit: totalAmount, credit: 0, notes: `Debit: Warehouse Stock Inventory` },
            { accountCode: cogsAcc, debit: 0, credit: totalAmount, notes: `Credit: Operational Expense Adjustment` }
          );
          break;

        case 'Damage':
          if (doc.scrap_action === 'IN') {
            lines.push(
              { accountCode: cogsAcc, debit: totalAmount, credit: 0, notes: `Debit: Scrapped Assets Expense` },
              { accountCode: invAcc, debit: 0, credit: totalAmount, notes: `Credit: Warehouse Stock Inventory` }
            );
          } else {
            lines.push(
              { accountCode: scrapAcc, debit: totalAmount, credit: 0, notes: `Debit: Scrap Sales Account` },
              { accountCode: invAcc, debit: 0, credit: totalAmount, notes: `Credit: Scrap Outflow` }
            );
          }
          break;

        case 'Adjustment':
          lines.push(
            { accountCode: invAcc, debit: totalAmount, credit: 0, notes: `Debit: Stock Adjustment` },
            { accountCode: varAcc, debit: 0, credit: totalAmount, notes: `Credit: Inventory Variance Adjustment` }
          );
          break;

        default:
          return;
      }

      const resolvedOrgUnit = doc.org_unit_id || InventoryModule.resolveWarehouseOrgUnit(doc.source_warehouse_id, companyId);
      const resolvedCostCenter = resolvedOrgUnit ? (await CostCenterEngine.resolveCostCenterForOrgUnit(resolvedOrgUnit, companyId))?.id : undefined;

      if (lines.length > 0) {
        await AccountingBusinessEngine.postOperationalDoubleEntry(
          companyId,
          operatorId,
          `INV #${doc.doc_no}`,
          statementAr,
          statementEn,
          lines,
          {
            org_unit_id: resolvedOrgUnit || undefined,
            warehouseId: doc.source_warehouse_id,
            costCenterId: resolvedCostCenter
          }
        );
      }
    } catch (err) {
      console.error(`Error posting accounting entry for document ${doc.doc_no}:`, err);
    }
  }

  /**
   * Validates capacity constraints and simple overdrafts before a document reaches its next stage.
   */
  static validateCapacityAndOverdraft(
    doc: InventoryDocument,
    nextStatus: InventoryDocStatus
  ): { success: boolean; messageAr: string; messageEn: string } {
    const warehouses = InventoryModule.getWarehouses();
    const stage = nextStatus === 'Dispatched' ? 'Dispatched' : 'Posted';

    for (const item of doc.items) {
      const currentStock = InventoryModule.getProductStock(item.product_id, doc.source_warehouse_id);
      
      let sourceQtyChange = 0;
      let targetQtyChange = 0;
      const isTransferType = doc.doc_type === 'Transfer' || doc.doc_type === 'BranchTransfer' || doc.doc_type === 'StationTransfer';

      if (isTransferType) {
        if (stage === 'Dispatched') {
          sourceQtyChange = -item.qty;
        } else if (stage === 'Posted') {
          const qtyReceived = item.qty_received !== undefined ? item.qty_received : item.qty;
          targetQtyChange = qtyReceived;
        }
      } else {
        if (stage === 'Posted') {
          switch (doc.doc_type) {
            case 'Receipt':
            case 'Addition':
            case 'BranchReturn':
              sourceQtyChange = item.qty;
              break;
            case 'Issue':
            case 'SupplierReturn':
              sourceQtyChange = -item.qty;
              break;
            case 'Damage':
              sourceQtyChange = doc.scrap_action === 'IN' ? item.qty : -item.qty;
              break;
            case 'Adjustment':
              sourceQtyChange = item.qty - currentStock;
              break;
          }
        }
      }

      // 1. Validate simple overdraft based on company workflow policy
      const config = InventoryModule.getInventoryConfig();
      if (sourceQtyChange < 0 && (currentStock + sourceQtyChange) < 0) {
        if (doc.doc_type !== 'Adjustment' && config.allow_overdraft === 'STRICT') {
          return {
            success: false,
            messageAr: `عذراً، الرصيد غير كافٍ للصنف ${item.product_name} في المخزن المحدد (الرصيد الحالي: ${currentStock}). يمكن تعديل سياسة الصرف بالسالب من إعدادات المخازن.`,
            messageEn: `Sorry, insufficient stock for item ${item.product_name} in selected warehouse (Current stock: ${currentStock}). Overdraft policy can be updated in Inventory Settings.`
          };
        }
      }

      // 2. Validate warehouse capacity limits if adding stock
      if (sourceQtyChange > 0) {
        const wh = warehouses.find(w => w.id === doc.source_warehouse_id);
        if (wh && wh.is_capacity_enforced && wh.max_capacity_qty) {
          const currentTotal = InventoryModule.getWarehouseTotalStock(doc.source_warehouse_id);
          if ((currentTotal + sourceQtyChange) > wh.max_capacity_qty) {
            return {
              success: false,
              messageAr: `عذراً، لا يمكن إتمام العملية لأنها ستتجاوز السعة القصوى للمستودع (${wh.name}). السعة المتاحة: ${wh.max_capacity_qty - currentTotal} وحدة.`,
              messageEn: `Sorry, this operation exceeds the maximum capacity of warehouse (${wh.name}). Available capacity: ${wh.max_capacity_qty - currentTotal} units.`
            };
          }
        }
      }

      if (targetQtyChange > 0) {
        const wh = warehouses.find(w => w.id === doc.dest_entity_id);
        if (wh && wh.is_capacity_enforced && wh.max_capacity_qty) {
          const currentTotal = InventoryModule.getWarehouseTotalStock(doc.dest_entity_id);
          if ((currentTotal + targetQtyChange) > wh.max_capacity_qty) {
            return {
              success: false,
              messageAr: `عذراً، لا يمكن إتمام العملية لأنها ستتجاوز السعة القصوى للمستودع المستلم (${wh.name}). السعة المتاحة: ${wh.max_capacity_qty - currentTotal} وحدة.`,
              messageEn: `Sorry, this operation exceeds the maximum capacity of target warehouse (${wh.name}). Available capacity: ${wh.max_capacity_qty - currentTotal} units.`
            };
          }
        }
      }

      // 3. Validate bin capacity limits if bin allocations are specified
      const allocations = item.bin_allocations || [];
      if (allocations.length > 0) {
        const activeWhId = sourceQtyChange !== 0 ? doc.source_warehouse_id : doc.dest_entity_id;
        const bins = InventoryModule.getWarehouseBins(activeWhId);

        for (const alloc of allocations) {
          const bin = bins.find(b => b.id === alloc.bin_id);
          if (bin && bin.is_active && bin.max_capacity_qty) {
            const currentBinStock = InventoryModule.getBinTotalStock(alloc.bin_id);
            const change = sourceQtyChange !== 0 
              ? (sourceQtyChange > 0 ? alloc.qty : -alloc.qty)
              : alloc.qty;

            if (change > 0 && (currentBinStock + change) > bin.max_capacity_qty) {
              return {
                success: false,
                messageAr: `عذراً، عملية التخصيص تتجاوز السعة القصوى للحاوية (${bin.name}). السعة المتاحة: ${bin.max_capacity_qty - currentBinStock} وحدة.`,
                messageEn: `Sorry, allocation exceeds the maximum capacity of bin (${bin.name}). Available capacity: ${bin.max_capacity_qty - currentBinStock} units.`
              };
            }
          }
        }
      }
    }

    return { success: true, messageAr: '', messageEn: '' };
  }

  /**
   * Completes a Multi-Echelon transfer by receiving the dispatched stock,
   * recording actual received quantities and variances, and updating stock.
   */
  static async receiveTransferDocument(
    docId: string,
    receivedItems: { product_id: string; qty_received: number; variance_reason?: string }[],
    receivedNotes?: string
  ): Promise<{ success: boolean; messageAr: string; messageEn: string }> {
    const documents = InventoryModule.getInventoryDocuments();
    const docIndex = documents.findIndex(d => d.id === docId);
    if (docIndex === -1) {
      return { success: false, messageAr: 'المستند غير موجود', messageEn: 'Document not found' };
    }

    const document = documents[docIndex];
    if (document.status !== 'Dispatched') {
      return {
        success: false,
        messageAr: 'عذراً، يمكن فقط استلام المستندات التي تم شحنها وقيد النقل بالفعل',
        messageEn: 'Only dispatched or in-transit documents can be received'
      };
    }

    const user = UsersModule.getActiveUser();
    if (!user) {
      return { success: false, messageAr: 'يجب تسجيل الدخول أولاً', messageEn: 'User must be authenticated' };
    }

    // Map received items onto document
    const updatedItems = document.items.map(item => {
      const rec = receivedItems.find(r => r.product_id === item.product_id);
      const qtyReceived = rec !== undefined ? rec.qty_received : item.qty;
      const variance = item.qty - qtyReceived;
      return {
        ...item,
        qty_received: qtyReceived,
        qty_variance: variance,
        variance_reason: rec?.variance_reason || ''
      };
    });

    // Save the document with received fields first so triggerLifecycleTransition loads it
    const updatedMetadata = updateBaseMetadata(document, user.id);
    document.items = updatedItems;
    document.received_date = new Date().toISOString();
    document.received_by = user.id;
    document.received_notes = receivedNotes || '';
    
    documents[docIndex] = {
      ...document,
      ...updatedMetadata
    };
    await InventoryModule.saveInventoryDocuments(documents);

    // Now trigger the transition to 'Posted'
    return await InventoryModule.triggerLifecycleTransition(docId, 'Receive');
  }
}
