import { BaseMetadata } from './enterprise';

export type PRStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type POStatus = 'DRAFT' | 'ISSUED' | 'RECEIVED' | 'CANCELLED';

export interface Vendor {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  nameAr: string;
  nameEn: string;
  code: string; // e.g., "VND-1001"
  phone?: string;
  email?: string;
  taxNo?: string;
  address?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface PRItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  qty: number;
  estimatedPrice: number;
}

export interface PurchaseRequest {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  prNumber: string; // e.g., "PR-2026-0001"
  requesterId: string;
  requesterName: string;
  department?: string;
  date: string;
  items: PRItem[];
  totalAmount: number;
  status: PRStatus;
  notes?: string;
  metadata: BaseMetadata;
}

export interface POItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

export interface PurchaseOrder {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  poNumber: string; // e.g., "PO-2026-0001"
  prId?: string; // Optional reference to source PR
  prNumber?: string;
  vendorId: string;
  vendorName: string;
  date: string;
  items: POItem[];
  totalAmount: number;
  status: POStatus;
  notes?: string;
  deliveryWarehouseId?: string;
  metadata: BaseMetadata;
}

export type RFQStatus = 'DRAFT' | 'SENT' | 'COMPLETED' | 'CANCELLED';

export interface RFQ {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  rfqNumber: string;
  prId?: string;
  prNumber?: string;
  date: string;
  deadline?: string;
  items: PRItem[];
  vendorIds: string[];
  status: RFQStatus;
  notes?: string;
  metadata: BaseMetadata;
}

export interface VendorQuotation {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  rfqId: string;
  rfqNumber: string;
  vendorId: string;
  vendorName: string;
  quoteNumber: string;
  date: string;
  deliveryDays?: number;
  paymentTerms?: string;
  items: POItem[];
  totalAmount: number;
  status: 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
  notes?: string;
  metadata: BaseMetadata;
}

export interface PurchasingWorkflowConfig {
  companyId: string;
  prPrefix: string;
  poPrefix: string;
  rfqPrefix: string;
  vendorPrefix: string;
  requirePrApproval: boolean;
  prApprovalThresholds: {
    maxAmount: number;
    requiredRoles: string[];
    labelAr: string;
    labelEn: string;
  }[];
  autoCreatePoOnPrApprove: boolean;
  requireRfqAboveAmount: number;
  allowDirectPoWithoutPr: boolean;
}

export interface VendorAPStatementItem {
  id: string;
  date: string;
  docType: 'PO_RECEIPT' | 'PAYMENT_VOUCHER' | 'OPENING_BALANCE' | 'RETURN';
  docNo: string;
  descriptionAr: string;
  descriptionEn: string;
  debit: number; // Payment reduces AP
  credit: number; // Purchase increases AP
  balance: number;
}
