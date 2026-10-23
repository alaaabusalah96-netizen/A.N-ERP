export interface Customer {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  nameAr: string;
  nameEn: string;
  code: string;
  phone: string;
  email: string;
  taxNo: string;
  address: string;
  balance: number; // Receivable balance
  createdAt: string;
}

export interface SalesInvoiceItem {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  description?: string;
  unit: string;
  qty: number;
  unitPrice: number;
  taxRate: number; // e.g. 0.14 for 14%
  taxAmount: number;
  total: number;
}

export interface SalesInvoice {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  items: SalesInvoiceItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  netAmount: number;
  status: 'PAID' | 'UNPAID' | 'PARTIALLY_PAID';
  date: string;
  dueDate: string;
  notes: string;
  createdAt: string;
  etaStatus?: 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
  etaUuid?: string;
  etaSubmissionPayload?: any;
  isSigned?: boolean;
}

export interface POSTransaction {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  receiptNo: string;
  items: any[];
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
  paymentMethod: 'CASH' | 'CARD' | 'WALLET';
  cashier: string;
  timestamp: string;
}

export interface DeliveryNote {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  deliveryNo: string;
  salesInvoiceId?: string;
  customerId: string;
  customerName: string;
  items: any[];
  status: 'DRAFT' | 'DISPATCHED' | 'DELIVERED';
  date: string;
  createdAt: string;
}
