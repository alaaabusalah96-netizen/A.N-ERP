import { vi, describe, it, expect, beforeEach } from 'vitest';

// 1. Mock firebase dependencies BEFORE any imports to prevent side effects
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(() => (() => {})),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
}));

// Mock Firestore
const mockRunTransaction = vi.fn();
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((db, col, id) => ({ id, path: `${col}/${id}` })),
  collection: vi.fn((db, col) => ({ id: col })),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  increment: vi.fn((val) => val),
  onSnapshot: vi.fn(() => (() => {})),
  writeBatch: vi.fn(() => ({})),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  query: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  startAfter: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  runTransaction: (db: any, cb: any) => mockRunTransaction(db, cb),
}));

// Mock window and dispatchEvent
if (typeof window === 'undefined') {
  (global as any).window = {
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
  };
}

// Mock localStorage
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value.toString();
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(localStorageStore).forEach((key) => delete localStorageStore[key]);
  }),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// Import target classes
import { AuditLogEngine } from './lib/enterprise/audit';
import { DocumentLifecycleEngine } from './lib/enterprise/lifecycle';
import { SequenceEngine } from './lib/enterprise/sequence';
import { PermissionEngine } from './lib/enterprise/permission';
import { WarehouseBusinessEngine } from './lib/enterprise/warehouse_engine';
import { AccountingBusinessEngine } from './lib/enterprise/accounting_engine';
import { InventoryModule } from './db/inventory';
import { CompaniesModule } from './db/companies';
import { StorageEngine } from './db/storage';
import { EventEnvelope, FsmConfig } from './types/enterprise';

describe('Kemit ERP Enterprise Foundation Engines Integration & Unit Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
    StorageEngine.clearCache();
    vi.clearAllMocks();
    mockRunTransaction.mockImplementation((db: any, callback: any) =>
      callback({
        get: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
        set: () => {},
        update: () => {},
      })
    );
  });

  // ==========================================
  // 1. Audit Log Engine Tests
  // ==========================================
  describe('1. AuditLogEngine', () => {
    it('should successfully append and retrieve audit logs in memory mode', async () => {
      const auditEngine = new AuditLogEngine();

      const sampleEnvelope: EventEnvelope = {
        eventId: 'evt-12345',
        eventType: 'ExpenseCreated',
        timestamp: new Date().toISOString(),
        tenantId: 'comp-1',
        organizationId: 'org-1',
        user_id: 'user-777',
        user_name: 'Test Cashier',
        user_role: 'StationAdmin',
        payload: { expenseId: 'exp-999', amount: 450 },
        metadataVersion: '1.0'
      };

      const result = await auditEngine.appendAuditRecord(sampleEnvelope);
      expect(result).toBeDefined();
      expect(result.id).toBe('evt-12345');
      expect(result.event.user_id).toBe('user-777');

      const retrieved = await auditEngine.getAuditRecords('comp-1');
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].id).toBe('evt-12345');
      expect(retrieved[0].event.payload.amount).toBe(450);
    });

    it('should reject appending empty or invalid event envelopes', async () => {
      const auditEngine = new AuditLogEngine();
      await expect(auditEngine.appendAuditRecord(null as any)).rejects.toThrow();
      await expect(auditEngine.appendAuditRecord({ eventType: 'StockReceived' } as any)).rejects.toThrow();
    });
  });

  // ==========================================
  // 2. Document Lifecycle Engine (FSM) Tests
  // ==========================================
  describe('2. DocumentLifecycleEngine (FSM)', () => {
    interface TestDoc {
      id: string;
      status: 'Draft' | 'Submitted' | 'Approved';
      total: number;
    }

    const testFsmConfig: FsmConfig<'Draft' | 'Submitted' | 'Approved', 'submit' | 'approve', { doc: TestDoc }> = {
      documentType: 'TestOrder',
      initialState: 'Draft',
      states: {
        Draft: { name: 'Draft', labelAr: 'مسودة', labelEn: 'Draft', isInitial: true },
        Submitted: { name: 'Submitted', labelAr: 'مقدم', labelEn: 'Submitted' },
        Approved: { name: 'Approved', labelAr: 'معتمد', labelEn: 'Approved', isTerminal: true },
      },
      transitions: [
        {
          event: 'submit',
          from: 'Draft',
          to: 'Submitted',
          labelAr: 'إرسال',
          labelEn: 'Submit',
          authorizedRoles: ['StationAdmin', 'Admin'],
          guard: (context) => context.doc.total > 0,
        },
        {
          event: 'approve',
          from: 'Submitted',
          to: 'Approved',
          labelAr: 'اعتماد',
          labelEn: 'Approve',
          authorizedRoles: ['Admin'],
          action: (context) => {
            context.doc.total = context.doc.total * 0.9; // 10% discount post action
          },
        },
      ],
    };

    it('should allow valid transitions when user role is cleared and guard conditions pass', async () => {
      const engine = new DocumentLifecycleEngine(testFsmConfig);
      const doc: TestDoc = { id: 'doc-1', status: 'Draft', total: 100 };

      // Check clearance
      const clearance = await engine.canTransition('Draft', 'submit', 'StationAdmin', { doc });
      expect(clearance.can).toBe(true);

      // Trigger transition
      const result = await engine.triggerTransition('Draft', 'submit', 'StationAdmin', { doc });
      expect(result.success).toBe(true);
      expect(result.toState).toBe('Submitted');
    });

    it('should reject transitions if user role is unauthorized', async () => {
      const engine = new DocumentLifecycleEngine(testFsmConfig);
      const doc: TestDoc = { id: 'doc-1', status: 'Submitted', total: 100 };

      const result = await engine.triggerTransition('Submitted', 'approve', 'StationAdmin', { doc });
      expect(result.success).toBe(false);
      expect(result.messageEn).toContain('not authorized');
    });

    it('should reject transitions if guard fails', async () => {
      const engine = new DocumentLifecycleEngine(testFsmConfig);
      const doc: TestDoc = { id: 'doc-1', status: 'Draft', total: -10 }; // Total fails guard (> 0)

      const result = await engine.triggerTransition('Draft', 'submit', 'Admin', { doc });
      expect(result.success).toBe(false);
      expect(result.messageEn).toContain('Pre-conditions for this transition were not met');
    });

    it('should execute post-transition actions successfully', async () => {
      const engine = new DocumentLifecycleEngine(testFsmConfig);
      const doc: TestDoc = { id: 'doc-1', status: 'Submitted', total: 100 };

      const result = await engine.triggerTransition('Submitted', 'approve', 'Admin', { doc });
      expect(result.success).toBe(true);
      expect(result.toState).toBe('Approved');
      expect(doc.total).toBe(90); // 10% discount applied
    });
  });

  // ==========================================
  // 3. Sequence Engine Tests
  // ==========================================
  describe('3. SequenceEngine', () => {
    it('should generate a formatted sequence number correctly when sequence document does not exist', async () => {
      // Mock runTransaction to simulate first-time sequence file creation (default start fallback)
      mockRunTransaction.mockImplementation(async (db, cb) => {
        const mockTx = {
          get: vi.fn(() => Promise.resolve({ exists: () => false })),
          set: vi.fn(),
          update: vi.fn(),
        };
        return cb(mockTx);
      });

      const nextNum = await SequenceEngine.generateNextSequence({} as any, 'comp-777', 'last_voucher_no', {
        prefix: 'PV',
        padding: 4,
        includeYear: true,
        manualStartNo: 1001,
      });

      // PV-YYYY-1001
      expect(nextNum).toContain('PV-');
      expect(nextNum).toContain(`-${new Date().getFullYear()}-`);
      expect(nextNum).toContain('1001');
    });

    it('should increment existing sequence numbers transactionally', async () => {
      // Mock runTransaction to simulate an existing sequence file reading counter = 1008
      mockRunTransaction.mockImplementation(async (db, cb) => {
        const mockTx = {
          get: vi.fn(() =>
            Promise.resolve({
              exists: () => true,
              data: () => ({ last_voucher_no: 1008 }),
            })
          ),
          set: vi.fn(),
          update: vi.fn(),
        };
        return cb(mockTx);
      });

      const nextNum = await SequenceEngine.generateNextSequence({} as any, 'comp-777', 'last_voucher_no', {
        prefix: 'PV',
        padding: 5,
        includeYear: false,
      });

      // No year included, padded to 5: PV-01009
      expect(nextNum).toBe('PV-01009');
    });
  });

  // ==========================================
  // 4. Permission Engine Tests
  // ==========================================
  describe('4. PermissionEngine', () => {
    const defaultRolePerms = [
      { role: 'StationAdmin', permissions: ['create_expense', 'view_reconciliation'] },
      { role: 'Admin', permissions: ['create_expense', 'approve_voucher', 'edit_settings'] },
    ];

    it('should correctly evaluate standard role-based baseline permissions', () => {
      const pe = new PermissionEngine(defaultRolePerms);

      const ctx: any = { userId: 'u-1', role: 'StationAdmin', tenantId: 't-1' };
      expect(pe.hasPermission('create_expense', ctx)).toBe(true);
      expect(pe.hasPermission('approve_voucher', ctx)).toBe(false); // only for Admin
    });

    it('should respect custom User Overrides that grant or revoke permissions', () => {
      const pe = new PermissionEngine(defaultRolePerms);

      const ctx: any = {
        userId: 'u-1',
        role: 'StationAdmin',
        tenantId: 't-1',
        userOverrides: [
          { userId: 'u-1', permissionId: 'approve_voucher', granted: true }, // Explicitly grant
          { userId: 'u-1', permissionId: 'create_expense', granted: false }, // Explicitly revoke
        ],
      };

      expect(pe.hasPermission('approve_voucher', ctx)).toBe(true); // Overridden to true
      expect(pe.hasPermission('create_expense', ctx)).toBe(false); // Overridden to false
    });

    it('should implement lazy expiry on Temporary Overrides correctly', () => {
      const pe = new PermissionEngine(defaultRolePerms);

      const pastTime = '2026-01-01T00:00:00Z';
      const futureTime = '2026-12-31T23:59:59Z';
      const referenceTime = '2026-06-15T12:00:00Z';

      // 1. Valid Active temporary override
      const ctxActive: any = {
        userId: 'u-1',
        role: 'StationAdmin',
        tenantId: 't-1',
        currentTime: referenceTime,
        temporaryOverrides: [
          {
            userId: 'u-1',
            permissionId: 'approve_voucher',
            granted: true,
            validFrom: pastTime,
            expiresAt: futureTime,
          },
        ],
      };
      expect(pe.hasPermission('approve_voucher', ctxActive)).toBe(true);

      // 2. Expired temporary override (should be ignored and fall back to baseline = false)
      const ctxExpired: any = {
        userId: 'u-1',
        role: 'StationAdmin',
        tenantId: 't-1',
        currentTime: referenceTime,
        temporaryOverrides: [
          {
            userId: 'u-1',
            permissionId: 'approve_voucher',
            granted: true,
            validFrom: pastTime,
            expiresAt: '2026-06-01T00:00:00Z', // Expired before referenceTime
          },
        ],
      };
      expect(pe.hasPermission('approve_voucher', ctxExpired)).toBe(false);
    });
  });

  // ==========================================
  // 5. Warehouse & Stock Engine Tests
  // ==========================================
  describe('5. WarehouseBusinessEngine', () => {
    it('should reject unsupported events gracefully', async () => {
      const engine = new WarehouseBusinessEngine();
      const event: EventEnvelope = {
        eventId: 'e-1',
        eventType: 'UNKNOWN_EVENT_TYPE',
        timestamp: new Date().toISOString(),
        tenantId: 'comp-1',
        organizationId: 'org-1',
        user_id: 'u-1',
        user_name: 'Admin',
        user_role: 'Admin',
        payload: {},
        metadataVersion: '1.0'
      };

      const result = await engine.processEvent(event);
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('UNSUPPORTED_EVENT');
    });

    it('should process multi-item STOCK_TRANSFERRED successfully when all items succeed', async () => {
      const tenantId = 'comp-wh-test';
      CompaniesModule.setSelectedCompanyId(tenantId);
      StorageEngine.setStored('warehouses', [
        { id: 'wh-src', name: 'Source WH', company_id: tenantId },
        { id: 'wh-dest', name: 'Dest WH', company_id: tenantId }
      ]);
      StorageEngine.setStored('stock_movements', [
        {
          id: 'm-1',
          doc_id: 'init-1',
          doc_no: 'INIT-1',
          doc_type: 'Receipt',
          product_id: 'prod-A',
          warehouse_id: 'wh-src',
          qty_change: 100,
          type: 'IN',
          current_balance_after: 100,
          date: '2026-08-28',
          company_id: tenantId,
          created_at: new Date().toISOString(),
          created_by: 'u-1'
        },
        {
          id: 'm-2',
          doc_id: 'init-2',
          doc_no: 'INIT-2',
          doc_type: 'Receipt',
          product_id: 'prod-B',
          warehouse_id: 'wh-src',
          qty_change: 50,
          type: 'IN',
          current_balance_after: 50,
          date: '2026-08-28',
          company_id: tenantId,
          created_at: new Date().toISOString(),
          created_by: 'u-1'
        }
      ]);

      const engine = new WarehouseBusinessEngine();
      const event: EventEnvelope = {
        eventId: 'evt-transfer-ok',
        eventType: 'STOCK_TRANSFERRED',
        timestamp: new Date().toISOString(),
        tenantId,
        organizationId: 'org-1',
        user_id: 'u-1',
        user_name: 'Admin',
        user_role: 'Admin',
        payload: {
          srcWarehouseId: 'wh-src',
          destWarehouseId: 'wh-dest',
          items: [
            { product_id: 'prod-A', qty: 20 },
            { product_id: 'prod-B', qty: 10 }
          ]
        },
        metadataVersion: '1.0'
      };

      const result = await engine.processEvent(event);
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe('SUCCESS');

      // Verify stock balances
      expect(InventoryModule.getProductStockInWarehouse('wh-src', 'prod-A')).toBe(80);
      expect(InventoryModule.getProductStockInWarehouse('wh-dest', 'prod-A')).toBe(20);
      expect(InventoryModule.getProductStockInWarehouse('wh-src', 'prod-B')).toBe(40);
      expect(InventoryModule.getProductStockInWarehouse('wh-dest', 'prod-B')).toBe(10);
    });

    it('should roll back and compensate earlier items if a later step fails during multi-item transfer', async () => {
      const tenantId = 'comp-wh-test-fail';
      CompaniesModule.setSelectedCompanyId(tenantId);
      StorageEngine.setStored('warehouses', [
        { id: 'wh-src', name: 'Source WH', company_id: tenantId },
        { id: 'wh-dest', name: 'Dest WH', company_id: tenantId }
      ]);
      StorageEngine.setStored('stock_movements', [
        {
          id: 'm-1',
          doc_id: 'init-1',
          doc_no: 'INIT-1',
          doc_type: 'Receipt',
          product_id: 'prod-A',
          warehouse_id: 'wh-src',
          qty_change: 100,
          type: 'IN',
          current_balance_after: 100,
          date: '2026-08-28',
          company_id: tenantId,
          created_at: new Date().toISOString(),
          created_by: 'u-1'
        },
        {
          id: 'm-2',
          doc_id: 'init-2',
          doc_no: 'INIT-2',
          doc_type: 'Receipt',
          product_id: 'prod-B',
          warehouse_id: 'wh-src',
          qty_change: 50,
          type: 'IN',
          current_balance_after: 50,
          date: '2026-08-28',
          company_id: tenantId,
          created_at: new Date().toISOString(),
          created_by: 'u-1'
        }
      ]);

      const engine = new WarehouseBusinessEngine();
      const realAdjustStock = InventoryModule.adjustStock;
      let callCount = 0;
      const adjustSpy = vi.spyOn(InventoryModule, 'adjustStock').mockImplementation(async (...args) => {
        callCount++;
        // Step 1: prod-A deduct from src (call 1) -> ok
        // Step 2: prod-A add to dest (call 2) -> ok
        // Step 3: prod-B deduct from src (call 3) -> fail
        if (callCount === 3) {
          throw new Error('Database disk full / simulation error');
        }
        return realAdjustStock.apply(InventoryModule, args);
      });

      const event: EventEnvelope = {
        eventId: 'evt-transfer-fail',
        eventType: 'STOCK_TRANSFERRED',
        timestamp: new Date().toISOString(),
        tenantId,
        organizationId: 'org-1',
        user_id: 'u-1',
        user_name: 'Admin',
        user_role: 'Admin',
        payload: {
          srcWarehouseId: 'wh-src',
          destWarehouseId: 'wh-dest',
          items: [
            { product_id: 'prod-A', qty: 20 },
            { product_id: 'prod-B', qty: 10 }
          ]
        },
        metadataVersion: '1.0'
      };

      const result = await engine.processEvent(event);
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('EXECUTION_ERROR');
      expect(result.messageAr).toContain('فشل تحويل المخزون وتم التراجع عن الحركات السابقة');

      // Crucial verification: prod-A was rolled back and source / dest balances for prod-A and prod-B are intact
      expect(InventoryModule.getProductStockInWarehouse('wh-src', 'prod-A')).toBe(100);
      expect(InventoryModule.getProductStockInWarehouse('wh-dest', 'prod-A')).toBe(0);
      expect(InventoryModule.getProductStockInWarehouse('wh-src', 'prod-B')).toBe(50);
      expect(InventoryModule.getProductStockInWarehouse('wh-dest', 'prod-B')).toBe(0);

      adjustSpy.mockRestore();
    });
  });

  // ==========================================
  // 6. Accounting Ledger Engine Tests
  // ==========================================
  describe('6. AccountingBusinessEngine', () => {
    it('should initialize Standard Chart of Accounts template for a company on-demand', async () => {
      const accounts = await AccountingBusinessEngine.getAccounts('comp-empty-1');
      expect(accounts.length).toBeGreaterThan(0);
      
      const mainCashAcc = accounts.find(a => a.code === '110101');
      expect(mainCashAcc).toBeDefined();
      expect(mainCashAcc?.nameEn).toContain('Cash in Hand');
    });

    it('should support dynamic industry template initialization (Poultry, Retail, Manufacturing, Transport)', async () => {
      // 1. Poultry template
      const poultryAccs = AccountingBusinessEngine.initializeChartOfAccounts('comp-poultry-1', 'poultry');
      expect(poultryAccs.some(a => a.nameAr.includes('الأعلاف'))).toBe(true);
      expect(poultryAccs.some(a => a.nameEn.includes('Biological Assets'))).toBe(true);

      // 2. Retail template
      const retailAccs = AccountingBusinessEngine.initializeChartOfAccounts('comp-retail-1', 'retail');
      expect(retailAccs.some(a => a.nameAr.includes('نقاط البيع'))).toBe(true);
      expect(retailAccs.some(a => a.nameEn.includes('Cost of Goods Sold'))).toBe(true);

      // 3. Manufacturing template
      const mfgAccs = AccountingBusinessEngine.initializeChartOfAccounts('comp-mfg-1', 'manufacturing');
      expect(mfgAccs.some(a => a.nameAr.includes('المواد الخام'))).toBe(true);
      expect(mfgAccs.some(a => a.nameEn.includes('Work in Progress'))).toBe(true);

      // 4. Transport template
      const transportAccs = AccountingBusinessEngine.initializeChartOfAccounts('comp-transport-1', 'transport');
      expect(transportAccs.some(a => a.nameAr.includes('أسطول الشاحنات'))).toBe(true);
      expect(transportAccs.some(a => a.nameEn.includes('Highway Tolls') || a.nameAr.includes('رسوم الطرق'))).toBe(true);

      // 5. Initialize via CHART_OF_ACCOUNTS_INITIALIZED event
      const engine = new AccountingBusinessEngine();
      const event: EventEnvelope = {
        eventId: 'evt-coa-init-1',
        eventType: 'CHART_OF_ACCOUNTS_INITIALIZED',
        timestamp: new Date().toISOString(),
        tenantId: 'comp-event-init',
        organizationId: 'org-1',
        user_id: 'u-1',
        user_name: 'Admin',
        user_role: 'Admin',
        payload: { templateId: 'poultry' },
        metadataVersion: '1.0'
      };
      const res = await engine.processEvent(event);
      expect(res.success).toBe(true);
      expect(res.outputData.some((a: any) => a.nameAr.includes('الأعلاف'))).toBe(true);
    });

    it('should provide available templates metadata and auto-detection fallback', () => {
      const templates = AccountingBusinessEngine.getAvailableTemplates();
      expect(templates.length).toBe(5);
      expect(templates.map(t => t.id)).toEqual(['standard', 'poultry', 'retail', 'manufacturing', 'transport']);

      // Auto-detection based on company ID/industry
      expect(AccountingBusinessEngine.getCompanyTemplateId('c-poultry-corp')).toBe('poultry');
      expect(AccountingBusinessEngine.getCompanyTemplateId('c-carrefour-eg')).toBe('retail');
      expect(AccountingBusinessEngine.getCompanyTemplateId('c-sewedy-cables')).toBe('manufacturing');
      expect(AccountingBusinessEngine.getCompanyTemplateId('c-transport-fleet')).toBe('transport');
      expect(AccountingBusinessEngine.getCompanyTemplateId('c-general-trading')).toBe('standard');
    });
  });
});
