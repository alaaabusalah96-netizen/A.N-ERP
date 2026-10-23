export type ApprovalDocumentType = 
  | 'PURCHASE_REQUEST' 
  | 'PURCHASE_ORDER' 
  | 'CASH_VOUCHER' 
  | 'INVENTORY_VOUCHER' 
  | 'EXPENSE' 
  | 'SALES_INVOICE'
  | 'PAYROLL_RUN'
  | 'FIXED_ASSET_DISPOSAL'
  | 'GENERAL';

export const DOCUMENT_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  PURCHASE_REQUEST: { ar: 'طلب شراء احتياجات', en: 'Purchase Request' },
  PURCHASE_ORDER: { ar: 'أمر توريد / شراء', en: 'Purchase Order' },
  CASH_VOUCHER: { ar: 'سند صرف نقدية / عهدة', en: 'Cash Payment Voucher' },
  INVENTORY_VOUCHER: { ar: 'إذن إضافة / تحويل مخزني', en: 'Inventory Movement Voucher' },
  EXPENSE: { ar: 'مطالبة / تسوية مصروفات', en: 'Expense Claim' },
  SALES_INVOICE: { ar: 'فاتورة مبيعات آجلة', en: 'Credit Sales Invoice' },
  PAYROLL_RUN: { ar: 'مسير راتب ومستحقات', en: 'Payroll Run' },
  FIXED_ASSET_DISPOSAL: { ar: 'طلب تكهين / استبعاد أصل', en: 'Fixed Asset Disposal' },
  GENERAL: { ar: 'مستند عام / طلب عادي', en: 'General Document' }
};

export type ApproverType = 'ROLE' | 'SPECIFIC_USER' | 'DEPARTMENT_HEAD' | 'ORG_UNIT_MANAGER';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type StepAction = 'APPROVED' | 'REJECTED' | 'SKIPPED';

export interface ApprovalStepDefinition {
  stepNumber: number;
  name: string;
  approverType: ApproverType;
  requiredRoles?: string[]; // e.g. ['DepartmentManager'], ['Finance'], ['CEO', 'Admin', 'SystemAdmin']
  requiredUserId?: string;
  labelAr: string;
  labelEn: string;
  autoApproveBelowAmount?: number;
}

export interface ApprovalWorkflowDefinition {
  id: string;
  company_id: string;
  documentType: ApprovalDocumentType | string;
  name: string;
  description?: string;
  organization_unit_id?: string; // Scope to specific org unit or company-wide if undefined
  isActive: boolean;
  minAmount?: number;
  maxAmount?: number;
  steps: ApprovalStepDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalStepRecord {
  stepNumber: number;
  stepName: string;
  action: StepAction;
  actorId: string;
  actorName: string;
  actorRole: string;
  comments?: string;
  timestamp: string;
}

export interface ApprovalInstance {
  id: string;
  workflowId: string;
  workflowName: string;
  documentId: string;
  documentType: ApprovalDocumentType | string;
  company_id: string;
  organization_unit_id?: string;
  amount?: number;
  requesterId: string;
  requesterName?: string;
  currentStepNumber: number;
  totalSteps: number;
  status: ApprovalStatus;
  history: ApprovalStepRecord[];
  createdAt: string;
  updatedAt: string;
}
