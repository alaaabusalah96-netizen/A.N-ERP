export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
export type PaymentVoucherType = 'CLIENT' | 'SUBCONTRACTOR';
export type PaymentVoucherStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'REJECTED';
export type DailyWorkerTrade = 'نجار مسلح' | 'حداد مسلح' | 'بناء' | 'مبيض محارة' | 'سباك' | 'كهربائي' | 'فني تشطيبات' | 'عامل عادي' | 'سائق معدات' | 'مشرف موقع';

export interface BOQItem {
  id: string;
  company_id?: string;
  project_id: string;
  item_number: string; // e.g. "1.1"
  description: string; // e.g. "أعمال حفر في تربة عادية ونقل الركام"
  unit: string; // e.g. "م3", "م2", "طقم", "م.ط", "مقطوعية"
  contracted_qty: number;
  unit_price: number;
  total_amount: number; // contracted_qty * unit_price
}

export interface ContractingProject {
  id: string;
  company_id: string;
  code: string; // e.g. "PRJ-2026-01"
  name: string; // e.g. "مشروع إنشاء برج الزهور السكني"
  client_name: string; // e.g. "شركة القاهرة للتنمية العقارية"
  location: string; // e.g. "التجمع الخامس - القاهرة الجديدة"
  contract_value: number; // قيمة العقد الإجمالية
  advance_payment_rate: number; // % الدفعة المقدمة (e.g., 10%)
  retention_rate: number; // % ضمان الأعمال المحتجز (e.g., 5% or 10%)
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  notes?: string;
  created_at: string;
}

export interface Subcontractor {
  id: string;
  company_id: string;
  code: string; // e.g. "SUB-101"
  name: string; // e.g. "شركة الأهرام للمقاولات والديكور"
  specialty: string; // e.g. "أعمال الهيكل الخرساني والشدات"
  phone: string;
  commercial_register?: string;
  tax_number?: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface SubcontractorContract {
  id: string;
  company_id: string;
  project_id: string;
  subcontractor_id: string;
  contract_number: string; // e.g. "SUB-CNT-2026-001"
  title: string; // e.g. "عقد تنفيذ أعمال المحارة والتشطيبات الخارجية"
  total_value: number;
  retention_rate: number; // % المحتجزات (ضمان الأعمال)
  advance_deduction_rate: number; // % خصم الدفعة المقدمة
  status: 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
  start_date: string;
  end_date: string;
  notes?: string;
}

export interface PaymentVoucherLine {
  id: string;
  voucher_id: string;
  boq_item_id?: string;
  item_number: string;
  description: string;
  unit: string;
  unit_price: number;
  previous_qty: number; // الكمية المنفذة في المستخلصات السابقة
  current_qty: number; // الكمية المنفذة في الفترة الحالية
  total_qty: number; // إجمالي الكمية حتى التاريخ الحالي (previous_qty + current_qty)
  current_amount: number; // قيمة الأعمال الحالية (current_qty * unit_price)
  total_amount: number; // قيمة إجمالي الأعمال حتى تاريخه (total_qty * unit_price)
  completion_percentage: number; // نسبة الإنجاز %
}

export interface ContractingPaymentVoucher {
  id: string;
  company_id: string;
  project_id: string;
  contract_id?: string; // Filled if type === 'SUBCONTRACTOR'
  voucher_number: string; // e.g. "مستخلص جاري رقم 3" or "EXT-2026-003"
  type: PaymentVoucherType; // 'CLIENT' (مالك) or 'SUBCONTRACTOR' (مقاول باطن)
  period_from: string;
  period_to: string;
  date: string;
  status: PaymentVoucherStatus;
  
  // Financial Summary Breakdown
  total_work_completed: number; // إجمالي الأعمال المنفذة تراكمياً
  previous_work_completed: number; // إجمالي الأعمال السابقة
  current_work_completed: number; // صافي قيمة أعمال الفترة الحالية (total - previous)
  
  advance_deduction: number; // خصم الدفعة المقدمة
  retention_deduction: number; // خصم ضمان الأعمال / المحتجزات
  tax_deduction: number; // خصم الضرائب والتأمينات
  other_deductions: number; // خصومات استقطاعات أخرى
  
  net_amount: number; // صافي المبلغ المستحق للصرف أو التحصيل
  notes?: string;
  created_at: string;
  created_by?: string;
  lines: PaymentVoucherLine[];
}

export interface DailyWorker {
  id: string;
  company_id: string;
  worker_code: string; // e.g. "WRK-001"
  name: string; // e.g. "معلم حسن البناء"
  trade: DailyWorkerTrade | string;
  phone: string;
  daily_rate: number; // فئة اليومية بالجنيه
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface DailyAttendanceLog {
  id: string;
  company_id: string;
  project_id: string;
  date: string; // YYYY-MM-DD
  worker_id: string;
  worker_name: string;
  trade: string;
  daily_rate: number;
  days_worked: number; // 1 = يوم كامل، 0.5 = نصف يوم، 1.5 = يوم ونصف
  overtime_hours: number; // ساعات إضافية
  overtime_rate_per_hour: number;
  bonus_amount: number; // مكافأة / حافز موقع
  deduction_amount: number; // خصومات
  total_wage: number; // إجمالي الأجر المستحق اليوم
  payment_status: 'UNPAID' | 'PAID';
  payout_voucher_id?: string;
  notes?: string;
  created_at: string;
}

export interface DailyLaborPayoutBatch {
  id: string;
  company_id: string;
  project_id: string;
  payout_date: string;
  period_from: string;
  period_to: string;
  worker_count: number;
  total_amount: number;
  notes?: string;
  cash_voucher_id?: string; // Linked Cash Payment Voucher in Custody System
  created_at: string;
}
