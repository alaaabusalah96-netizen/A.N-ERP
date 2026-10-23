import { StorageEngine } from './storage';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { 
  ContractingProject, 
  BOQItem, 
  Subcontractor, 
  SubcontractorContract, 
  ContractingPaymentVoucher, 
  PaymentVoucherLine, 
  DailyWorker, 
  DailyAttendanceLog, 
  DailyLaborPayoutBatch 
} from '../types/contracting';

export const CONTRACTING_COLLECTIONS = {
  PROJECTS: 'contracting_projects',
  BOQ_ITEMS: 'contracting_boq_items',
  SUBCONTRACTORS: 'contracting_subcontractors',
  SUB_CONTRACTS: 'contracting_subcontracts',
  VOUCHERS: 'contracting_vouchers',
  WORKERS: 'contracting_workers',
  ATTENDANCE: 'contracting_attendance',
  PAYOUTS: 'contracting_payouts',
};

const STORAGE_KEYS = {
  PROJECTS: 'custody_contracting_projects',
  BOQ_ITEMS: 'custody_contracting_boq',
  SUBCONTRACTORS: 'custody_contracting_subcontractors',
  SUB_CONTRACTS: 'custody_contracting_contracts',
  VOUCHERS: 'custody_contracting_vouchers',
  WORKERS: 'custody_contracting_workers',
  ATTENDANCE: 'custody_contracting_attendance',
  PAYOUTS: 'custody_contracting_payouts',
};

// Seed Defaults for Contracting Module
const DEFAULT_PROJECTS: ContractingProject[] = [
  {
    id: 'PRJ-101',
    company_id: 'COMP-EGY-01',
    code: 'PRJ-2026-001',
    name: 'مشروع بوابات ومحطات العاصمة الإدارية',
    client_name: 'شركة العاصمة الإدارية للتنمية العمرانية',
    location: 'العاصمة الإدارية الجديدة - الحي الحكومي',
    contract_value: 4500000,
    advance_payment_rate: 10,
    retention_rate: 5,
    status: 'IN_PROGRESS',
    start_date: '2026-01-15',
    end_date: '2026-11-30',
    notes: 'مشروع استراتيجي تسليم مفتاح مع تشطيبات فاخرة',
    created_at: '2026-01-15T09:00:00Z'
  },
  {
    id: 'PRJ-102',
    company_id: 'COMP-EGY-01',
    code: 'PRJ-2026-002',
    name: 'مشروع مجمع مستودعات وورش كيميت 6 أكتوبر',
    client_name: 'مجموعة كيميت القابضة',
    location: 'المنطقة الصناعية - 6 أكتوبر',
    contract_value: 2800000,
    advance_payment_rate: 15,
    retention_rate: 10,
    status: 'IN_PROGRESS',
    start_date: '2026-03-01',
    end_date: '2026-09-30',
    notes: 'إنشاء هياكل معدنية وجمالونات ومستودعات تخزين',
    created_at: '2026-03-01T10:00:00Z'
  }
];

const DEFAULT_BOQ_ITEMS: BOQItem[] = [
  {
    id: 'BOQ-01',
    project_id: 'PRJ-101',
    item_number: '1.1',
    description: 'أعمال حفر في تربة صخرية وعادية ونقل ناتج الحفر للمقالب العمومية',
    unit: 'م3',
    contracted_qty: 5000,
    unit_price: 120,
    total_amount: 600000
  },
  {
    id: 'BOQ-02',
    project_id: 'PRJ-101',
    item_number: '1.2',
    description: 'توريد وصب خرسانة عادية للقواعد والشملات سمك 25 سم',
    unit: 'م3',
    contracted_qty: 1200,
    unit_price: 1800,
    total_amount: 2160000
  },
  {
    id: 'BOQ-03',
    project_id: 'PRJ-101',
    item_number: '1.3',
    description: 'أعمال بياض ومحارة داخلية وخارجية شاملة السقالات والسلك والمواد',
    unit: 'م2',
    contracted_qty: 8000,
    unit_price: 140,
    total_amount: 1120000
  },
  {
    id: 'BOQ-04',
    project_id: 'PRJ-102',
    item_number: '2.1',
    description: 'توريد وتركيب جمبونات وهياكل حديدية مقاومة للعوامل الجوية',
    unit: 'طن',
    contracted_qty: 150,
    unit_price: 12000,
    total_amount: 1800000
  }
];

const DEFAULT_SUBCONTRACTORS: Subcontractor[] = [
  {
    id: 'SUB-01',
    company_id: 'COMP-EGY-01',
    code: 'SUB-101',
    name: 'مؤسسة النيل للخرسانات والشدات الميكانيكية',
    specialty: 'أعمال الهيكل الخرساني والشدات',
    phone: '01002345678',
    commercial_register: '109283',
    tax_number: '492-381-029',
    status: 'ACTIVE',
    created_at: '2026-01-20T10:00:00Z'
  },
  {
    id: 'SUB-02',
    company_id: 'COMP-EGY-01',
    code: 'SUB-102',
    name: 'شركة الفرسان للمحارة والترميمات',
    specialty: 'أعمال التشطيبات والمحارة',
    phone: '01119876543',
    commercial_register: '883921',
    tax_number: '102-948-221',
    status: 'ACTIVE',
    created_at: '2026-02-10T11:00:00Z'
  }
];

const DEFAULT_SUB_CONTRACTS: SubcontractorContract[] = [
  {
    id: 'CNT-01',
    company_id: 'COMP-EGY-01',
    project_id: 'PRJ-101',
    subcontractor_id: 'SUB-01',
    contract_number: 'CNT-2026-001',
    title: 'عقد تنفيذ أعمال الشدات والخرسانات المسلحة للمشروع',
    total_value: 1800000,
    retention_rate: 5,
    advance_deduction_rate: 10,
    status: 'ACTIVE',
    start_date: '2026-02-01',
    end_date: '2026-08-30',
    notes: 'خصم 5% ضمان أعمال يفرج عنها بعد التسليم النهائي'
  }
];

const DEFAULT_VOUCHERS: ContractingPaymentVoucher[] = [
  {
    id: 'VOUCH-101',
    company_id: 'COMP-EGY-01',
    project_id: 'PRJ-101',
    voucher_number: 'مستخلص جاري رقم 1',
    type: 'CLIENT',
    period_from: '2026-01-15',
    period_to: '2026-02-28',
    date: '2026-03-01',
    status: 'APPROVED',
    total_work_completed: 1100000,
    previous_work_completed: 0,
    current_work_completed: 1100000,
    advance_deduction: 110000, // 10%
    retention_deduction: 55000, // 5%
    tax_deduction: 1100, // 0.1%
    other_deductions: 0,
    net_amount: 933900,
    notes: 'مستخلص المالك الأول - تم الصرف بعد اعتماد استشاري المشروع',
    created_at: '2026-03-01T12:00:00Z',
    lines: [
      {
        id: 'LINE-01',
        voucher_id: 'VOUCH-101',
        boq_item_id: 'BOQ-01',
        item_number: '1.1',
        description: 'أعمال حفر في تربة صخرية وعادية ونقل ناتج الحفر',
        unit: 'م3',
        unit_price: 120,
        previous_qty: 0,
        current_qty: 4000,
        total_qty: 4000,
        current_amount: 480000,
        total_amount: 480000,
        completion_percentage: 80
      },
      {
        id: 'LINE-02',
        voucher_id: 'VOUCH-101',
        boq_item_id: 'BOQ-02',
        item_number: '1.2',
        description: 'توريد وصب خرسانة عادية للقواعد والشملات سمك 25 سم',
        unit: 'م3',
        unit_price: 1800,
        previous_qty: 0,
        current_qty: 344.44,
        total_qty: 344.44,
        current_amount: 620000,
        total_amount: 620000,
        completion_percentage: 28.7
      }
    ]
  }
];

const DEFAULT_WORKERS: DailyWorker[] = [
  {
    id: 'WRK-01',
    company_id: 'COMP-EGY-01',
    worker_code: 'WRK-001',
    name: 'الأسطة حسن محمد البناء',
    trade: 'بناء',
    phone: '01011122233',
    daily_rate: 350,
    status: 'ACTIVE',
    created_at: '2026-01-01T08:00:00Z'
  },
  {
    id: 'WRK-02',
    company_id: 'COMP-EGY-01',
    worker_code: 'WRK-002',
    name: 'المعلم السيد العربي الخرساني',
    trade: 'حداد مسلح',
    phone: '01223344556',
    daily_rate: 400,
    status: 'ACTIVE',
    created_at: '2026-01-01T08:00:00Z'
  },
  {
    id: 'WRK-03',
    company_id: 'COMP-EGY-01',
    worker_code: 'WRK-003',
    name: 'إبراهيم صابر عبد الخالق',
    trade: 'عامل عادي',
    phone: '01556677889',
    daily_rate: 220,
    status: 'ACTIVE',
    created_at: '2026-01-01T08:00:00Z'
  }
];

const DEFAULT_ATTENDANCE: DailyAttendanceLog[] = [
  {
    id: 'ATT-01',
    company_id: 'COMP-EGY-01',
    project_id: 'PRJ-101',
    date: '2026-08-10',
    worker_id: 'WRK-01',
    worker_name: 'الأسطة حسن محمد البناء',
    trade: 'بناء',
    daily_rate: 350,
    days_worked: 1,
    overtime_hours: 2,
    overtime_rate_per_hour: 50,
    bonus_amount: 50,
    deduction_amount: 0,
    total_wage: 500, // 350 + (2*50) + 50
    payment_status: 'PAID',
    payout_voucher_id: 'PAY-881',
    notes: 'إنجاز واجهة المبنى رقم 2',
    created_at: '2026-08-10T17:00:00Z'
  },
  {
    id: 'ATT-02',
    company_id: 'COMP-EGY-01',
    project_id: 'PRJ-101',
    date: '2026-08-10',
    worker_id: 'WRK-03',
    worker_name: 'إبراهيم صابر عبد الخالق',
    trade: 'عامل عادي',
    daily_rate: 220,
    days_worked: 1,
    overtime_hours: 0,
    overtime_rate_per_hour: 30,
    bonus_amount: 0,
    deduction_amount: 0,
    total_wage: 220,
    payment_status: 'UNPAID',
    notes: 'نقل المؤن والأخشاب',
    created_at: '2026-08-10T17:00:00Z'
  }
];

export class ContractingEngine {
  // Ensure default seeds are loaded into storage engine
  private static ensureInitialized() {
    if (!StorageEngine.getStored<ContractingProject[]>(STORAGE_KEYS.PROJECTS, []).length) {
      StorageEngine.setStored(STORAGE_KEYS.PROJECTS, DEFAULT_PROJECTS);
    }
    if (!StorageEngine.getStored<BOQItem[]>(STORAGE_KEYS.BOQ_ITEMS, []).length) {
      StorageEngine.setStored(STORAGE_KEYS.BOQ_ITEMS, DEFAULT_BOQ_ITEMS);
    }
    if (!StorageEngine.getStored<Subcontractor[]>(STORAGE_KEYS.SUBCONTRACTORS, []).length) {
      StorageEngine.setStored(STORAGE_KEYS.SUBCONTRACTORS, DEFAULT_SUBCONTRACTORS);
    }
    if (!StorageEngine.getStored<SubcontractorContract[]>(STORAGE_KEYS.SUB_CONTRACTS, []).length) {
      StorageEngine.setStored(STORAGE_KEYS.SUB_CONTRACTS, DEFAULT_SUB_CONTRACTS);
    }
    if (!StorageEngine.getStored<ContractingPaymentVoucher[]>(STORAGE_KEYS.VOUCHERS, []).length) {
      StorageEngine.setStored(STORAGE_KEYS.VOUCHERS, DEFAULT_VOUCHERS);
    }
    if (!StorageEngine.getStored<DailyWorker[]>(STORAGE_KEYS.WORKERS, []).length) {
      StorageEngine.setStored(STORAGE_KEYS.WORKERS, DEFAULT_WORKERS);
    }
    if (!StorageEngine.getStored<DailyAttendanceLog[]>(STORAGE_KEYS.ATTENDANCE, []).length) {
      StorageEngine.setStored(STORAGE_KEYS.ATTENDANCE, DEFAULT_ATTENDANCE);
    }
  }

  // --- PROJECTS ---
  static getProjects(companyId?: string): ContractingProject[] {
    ContractingEngine.ensureInitialized();
    const list = StorageEngine.getStored<ContractingProject[]>(STORAGE_KEYS.PROJECTS, []);
    if (companyId) {
      return list.filter(p => p.company_id === companyId);
    }
    return list;
  }

  static async saveProject(project: ContractingProject): Promise<{ success: boolean; error?: string }> {
    ContractingEngine.ensureInitialized();
    const res = await syncWriteWithOfflineFallback(CONTRACTING_COLLECTIONS.PROJECTS, project.id, project);
    if (!res.success) {
      return { success: false, error: res.error || 'فشل مزامنة المشروع مع السحابة' };
    }
    const list = StorageEngine.getStored<ContractingProject[]>(STORAGE_KEYS.PROJECTS, []);
    const index = list.findIndex(p => p.id === project.id);
    if (index >= 0) {
      list[index] = project;
    } else {
      list.unshift(project);
    }
    StorageEngine.setStored(STORAGE_KEYS.PROJECTS, list);
    return { success: true };
  }

  // --- BOQ ITEMS ---
  static getBOQItems(projectId: string): BOQItem[] {
    ContractingEngine.ensureInitialized();
    const list = StorageEngine.getStored<BOQItem[]>(STORAGE_KEYS.BOQ_ITEMS, []);
    return list.filter(b => b.project_id === projectId);
  }

  static async saveBOQItem(item: BOQItem): Promise<{ success: boolean; error?: string }> {
    ContractingEngine.ensureInitialized();
    if (!item.company_id) {
      const prj = ContractingEngine.getProjects().find(p => p.id === item.project_id);
      if (prj?.company_id) {
        item.company_id = prj.company_id;
      }
    }
    const res = await syncWriteWithOfflineFallback(CONTRACTING_COLLECTIONS.BOQ_ITEMS, item.id, item);
    if (!res.success) {
      return { success: false, error: res.error || 'فشل مزامنة بند المقايسة مع السحابة' };
    }
    const list = StorageEngine.getStored<BOQItem[]>(STORAGE_KEYS.BOQ_ITEMS, []);
    const index = list.findIndex(b => b.id === item.id);
    if (index >= 0) {
      list[index] = item;
    } else {
      list.push(item);
    }
    StorageEngine.setStored(STORAGE_KEYS.BOQ_ITEMS, list);
    return { success: true };
  }

  // --- SUBCONTRACTORS & CONTRACTS ---
  static getSubcontractors(companyId?: string): Subcontractor[] {
    ContractingEngine.ensureInitialized();
    const list = StorageEngine.getStored<Subcontractor[]>(STORAGE_KEYS.SUBCONTRACTORS, []);
    if (companyId) {
      return list.filter(s => s.company_id === companyId);
    }
    return list;
  }

  static async saveSubcontractor(sub: Subcontractor): Promise<{ success: boolean; error?: string }> {
    ContractingEngine.ensureInitialized();
    const res = await syncWriteWithOfflineFallback(CONTRACTING_COLLECTIONS.SUBCONTRACTORS, sub.id, sub);
    if (!res.success) {
      return { success: false, error: res.error || 'فشل مزامنة مقاول الباطن مع السحابة' };
    }
    const list = StorageEngine.getStored<Subcontractor[]>(STORAGE_KEYS.SUBCONTRACTORS, []);
    const idx = list.findIndex(s => s.id === sub.id);
    if (idx >= 0) list[idx] = sub; else list.unshift(sub);
    StorageEngine.setStored(STORAGE_KEYS.SUBCONTRACTORS, list);
    return { success: true };
  }

  static getSubcontracts(projectId?: string): SubcontractorContract[] {
    ContractingEngine.ensureInitialized();
    const list = StorageEngine.getStored<SubcontractorContract[]>(STORAGE_KEYS.SUB_CONTRACTS, []);
    if (projectId) return list.filter(c => c.project_id === projectId);
    return list;
  }

  static async saveSubcontract(contract: SubcontractorContract): Promise<{ success: boolean; error?: string }> {
    ContractingEngine.ensureInitialized();
    const res = await syncWriteWithOfflineFallback(CONTRACTING_COLLECTIONS.SUB_CONTRACTS, contract.id, contract);
    if (!res.success) {
      return { success: false, error: res.error || 'فشل مزامنة عقد المقاولة مع السحابة' };
    }
    const list = StorageEngine.getStored<SubcontractorContract[]>(STORAGE_KEYS.SUB_CONTRACTS, []);
    const idx = list.findIndex(c => c.id === contract.id);
    if (idx >= 0) list[idx] = contract; else list.unshift(contract);
    StorageEngine.setStored(STORAGE_KEYS.SUB_CONTRACTS, list);
    return { success: true };
  }

  // --- PAYMENT CERTIFICATES / VOUCHERS ---
  static getPaymentVouchers(projectId?: string, type?: 'CLIENT' | 'SUBCONTRACTOR'): ContractingPaymentVoucher[] {
    ContractingEngine.ensureInitialized();
    let list = StorageEngine.getStored<ContractingPaymentVoucher[]>(STORAGE_KEYS.VOUCHERS, []);
    if (projectId) list = list.filter(v => v.project_id === projectId);
    if (type) list = list.filter(v => v.type === type);
    return list;
  }

  static async savePaymentVoucher(voucher: ContractingPaymentVoucher): Promise<{ success: boolean; error?: string }> {
    ContractingEngine.ensureInitialized();
    const res = await syncWriteWithOfflineFallback(CONTRACTING_COLLECTIONS.VOUCHERS, voucher.id, voucher);
    if (!res.success) {
      return { success: false, error: res.error || 'فشل مزامنة المستخلص مع السحابة' };
    }
    const list = StorageEngine.getStored<ContractingPaymentVoucher[]>(STORAGE_KEYS.VOUCHERS, []);
    const idx = list.findIndex(v => v.id === voucher.id);
    if (idx >= 0) list[idx] = voucher; else list.unshift(voucher);
    StorageEngine.setStored(STORAGE_KEYS.VOUCHERS, list);
    return { success: true };
  }

  /**
   * Calculates complete payment application breakdown given line items and deduction percentages
   */
  static calculateVoucherBreakdown(
    lines: PaymentVoucherLine[],
    previousWorkCompleted: number,
    advanceRate: number,
    retentionRate: number,
    taxRate: number = 0,
    otherDeductions: number = 0
  ) {
    let totalWorkCompleted = 0;
    const computedLines = lines.map(line => {
      const total_qty = (line.previous_qty || 0) + (line.current_qty || 0);
      const current_amount = (line.current_qty || 0) * (line.unit_price || 0);
      const total_amount = total_qty * (line.unit_price || 0);
      totalWorkCompleted += total_amount;
      return {
        ...line,
        total_qty,
        current_amount,
        total_amount
      };
    });

    const currentWorkCompleted = totalWorkCompleted - previousWorkCompleted;
    const advance_deduction = (currentWorkCompleted * advanceRate) / 100;
    const retention_deduction = (currentWorkCompleted * retentionRate) / 100;
    const tax_deduction = (currentWorkCompleted * taxRate) / 100;
    const net_amount = currentWorkCompleted - advance_deduction - retention_deduction - tax_deduction - otherDeductions;

    return {
      lines: computedLines,
      total_work_completed: totalWorkCompleted,
      previous_work_completed: previousWorkCompleted,
      current_work_completed: currentWorkCompleted,
      advance_deduction,
      retention_deduction,
      tax_deduction,
      other_deductions: otherDeductions,
      net_amount: Math.max(0, net_amount)
    };
  }

  // --- DAILY WORKERS & SITE ATTENDANCE ---
  static getDailyWorkers(companyId?: string): DailyWorker[] {
    ContractingEngine.ensureInitialized();
    const list = StorageEngine.getStored<DailyWorker[]>(STORAGE_KEYS.WORKERS, []);
    if (companyId) return list.filter(w => w.company_id === companyId);
    return list;
  }

  static async saveDailyWorker(worker: DailyWorker): Promise<{ success: boolean; error?: string }> {
    ContractingEngine.ensureInitialized();
    const res = await syncWriteWithOfflineFallback(CONTRACTING_COLLECTIONS.WORKERS, worker.id, worker);
    if (!res.success) {
      return { success: false, error: res.error || 'فشل مزامنة العامل مع السحابة' };
    }
    const list = StorageEngine.getStored<DailyWorker[]>(STORAGE_KEYS.WORKERS, []);
    const idx = list.findIndex(w => w.id === worker.id);
    if (idx >= 0) list[idx] = worker; else list.unshift(worker);
    StorageEngine.setStored(STORAGE_KEYS.WORKERS, list);
    return { success: true };
  }

  static getAttendanceLogs(projectId?: string, date?: string): DailyAttendanceLog[] {
    ContractingEngine.ensureInitialized();
    let list = StorageEngine.getStored<DailyAttendanceLog[]>(STORAGE_KEYS.ATTENDANCE, []);
    if (projectId) list = list.filter(a => a.project_id === projectId);
    if (date) list = list.filter(a => a.date === date);
    return list;
  }

  static async saveAttendanceLog(log: DailyAttendanceLog): Promise<{ success: boolean; error?: string }> {
    ContractingEngine.ensureInitialized();
    // Calculate wage
    const baseWage = (log.daily_rate || 0) * (log.days_worked || 1);
    const overtimeWage = (log.overtime_hours || 0) * (log.overtime_rate_per_hour || 0);
    log.total_wage = Math.max(0, baseWage + overtimeWage + (log.bonus_amount || 0) - (log.deduction_amount || 0));

    const res = await syncWriteWithOfflineFallback(CONTRACTING_COLLECTIONS.ATTENDANCE, log.id, log);
    if (!res.success) {
      return { success: false, error: res.error || 'فشل مزامنة يومية العامل مع السحابة' };
    }
    const list = StorageEngine.getStored<DailyAttendanceLog[]>(STORAGE_KEYS.ATTENDANCE, []);
    const idx = list.findIndex(a => a.id === log.id);
    if (idx >= 0) list[idx] = log; else list.unshift(log);
    StorageEngine.setStored(STORAGE_KEYS.ATTENDANCE, list);
    return { success: true };
  }

  /**
   * Helper to compute wage total for a worker attendance row
   */
  static calculateWorkerWage(rate: number, days: number, otHours: number, otRate: number, bonus: number, deduction: number): number {
    const base = rate * days;
    const ot = otHours * otRate;
    return Math.max(0, base + ot + bonus - deduction);
  }

  /**
   * Generates a batch payout for unpaid worker logs and marks them as PAID
   */
  static async processDailyLaborPayoutBatch(
    companyId: string,
    projectId: string,
    dateFrom: string,
    dateTo: string,
    notes?: string
  ): Promise<{ success: boolean; batch?: DailyLaborPayoutBatch; error?: string }> {
    ContractingEngine.ensureInitialized();
    const logs = ContractingEngine.getAttendanceLogs(projectId).filter(
      l => l.payment_status === 'UNPAID' && l.date >= dateFrom && l.date <= dateTo
    );

    const batchId = `PAY-BATCH-${Date.now()}`;
    const totalWage = logs.reduce((sum, l) => sum + l.total_wage, 0);

    const batch: DailyLaborPayoutBatch = {
      id: batchId,
      company_id: companyId,
      project_id: projectId,
      payout_date: new Date().toISOString().split('T')[0],
      period_from: dateFrom,
      period_to: dateTo,
      worker_count: logs.length,
      total_amount: totalWage,
      notes,
      created_at: new Date().toISOString()
    };

    // Prepare updated logs
    const updatedLogs = logs.map(l => ({
      ...l,
      payment_status: 'PAID' as const,
      payout_voucher_id: batchId
    }));

    // Sync each updated log
    for (const log of updatedLogs) {
      const res = await syncWriteWithOfflineFallback(CONTRACTING_COLLECTIONS.ATTENDANCE, log.id, log);
      if (!res.success) {
        return { success: false, error: res.error || `فشل تحديث سجل الحضور ${log.id} في السحابة` };
      }
    }

    // Sync batch record
    const batchRes = await syncWriteWithOfflineFallback(CONTRACTING_COLLECTIONS.PAYOUTS, batch.id, batch);
    if (!batchRes.success) {
      return { success: false, error: batchRes.error || 'فشل حفظ دفعة الصرف في السحابة' };
    }

    // Only update local storage on cloud success
    const allLogs = StorageEngine.getStored<DailyAttendanceLog[]>(STORAGE_KEYS.ATTENDANCE, []);
    allLogs.forEach(l => {
      if (logs.some(unpaid => unpaid.id === l.id)) {
        l.payment_status = 'PAID';
        l.payout_voucher_id = batchId;
      }
    });
    StorageEngine.setStored(STORAGE_KEYS.ATTENDANCE, allLogs);

    const payouts = StorageEngine.getStored<DailyLaborPayoutBatch[]>(STORAGE_KEYS.PAYOUTS, []);
    payouts.unshift(batch);
    StorageEngine.setStored(STORAGE_KEYS.PAYOUTS, payouts);

    return { success: true, batch };
  }
}
