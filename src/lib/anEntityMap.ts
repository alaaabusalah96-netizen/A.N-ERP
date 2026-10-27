/**
 * AN-MAP-D2 — static entity mapping catalog (KEMIT operational → A.N StoragePort).
 * Used for migration planning only in this phase.
 */
export type MapStatus = 'mapped-read' | 'kemit-only' | 'an-only' | 'deferred';

export interface EntityMapRow {
  id: string;
  domain: string;
  kemitStore: string;
  anEntity: string;
  status: MapStatus;
  notesAr: string;
  notesEn: string;
}

export const AN_ENTITY_MAP: EntityMapRow[] = [
  {
    id: 'auth-session',
    domain: 'identity',
    kemitStore: 'Firestore users + /api/auth/verify-credentials',
    anEntity: 'TokenService / users (gated)',
    status: 'kemit-only',
    notesAr: 'مسار الدخول التشغيلي Firebase حتى حزمة قطع صريحة',
    notesEn: 'Operational login stays Firebase until explicit cutover',
  },
  {
    id: 'company-backend',
    domain: 'platform',
    kemitStore: 'companies/{id} fields auth_driver/db_backend/...',
    anEntity: 'BackendConfig via StorageRouter',
    status: 'mapped-read',
    notesAr: 'الربط محفوظ ويُفحص (A2–A4) دون تحويل التشغيل',
    notesEn: 'Binding stored and probed; traffic not switched',
  },
  {
    id: 'inventory-stock',
    domain: 'inventory',
    kemitStore: 'CustodyDB inventory collections',
    anEntity: 'Warehouse / StockItem / WarehouseStock',
    status: 'mapped-read',
    notesAr: 'ملخص قراءة A.N فقط؛ الشاشة على KEMIT',
    notesEn: 'A.N read summary only; UI on KEMIT',
  },
  {
    id: 'accounting-journals',
    domain: 'accounting',
    kemitStore: 'CustodyDB accounting collections',
    anEntity: 'Account / JournalEntry',
    status: 'mapped-read',
    notesAr: 'ملخص قراءة A.N فقط',
    notesEn: 'A.N read summary only',
  },
  {
    id: 'purchasing-po',
    domain: 'purchasing',
    kemitStore: 'CustodyDB purchasing collections',
    anEntity: 'PurchaseOrder / GoodsReceipt',
    status: 'mapped-read',
    notesAr: 'ملخص قراءة A.N فقط',
    notesEn: 'A.N read summary only',
  },
  {
    id: 'custody-cash',
    domain: 'custody',
    kemitStore: 'KEMIT custody flows (primary product surface)',
    anEntity: 'CashCustody* (an-core present)',
    status: 'deferred',
    notesAr: 'العهدة تبقى KEMIT أولوية؛ ترحيل لاحق بحذر',
    notesEn: 'Custody stays KEMIT-first; later careful migration',
  },
  {
    id: 'hr-payroll',
    domain: 'hr',
    kemitStore: 'may be partial/absent in shell',
    anEntity: 'HR modules in an-core (if present)',
    status: 'deferred',
    notesAr: 'خارج نطاق القراءة الحالي',
    notesEn: 'Out of current read-plane scope',
  },
];

export function listEntityMap() {
  return {
    ok: true,
    plane: 'an-map-d2' as const,
    cutoverApproved: false,
    dualPath: true,
    rows: AN_ENTITY_MAP,
    counts: {
      total: AN_ENTITY_MAP.length,
      mappedRead: AN_ENTITY_MAP.filter((r) => r.status === 'mapped-read').length,
      kemitOnly: AN_ENTITY_MAP.filter((r) => r.status === 'kemit-only').length,
      deferred: AN_ENTITY_MAP.filter((r) => r.status === 'deferred').length,
    },
  };
}
