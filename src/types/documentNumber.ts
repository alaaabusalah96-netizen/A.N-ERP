export type DocumentType = 
  | 'INVOICE'
  | 'RECEIPT'
  | 'PO'
  | 'PR'
  | 'TRANSFER'
  | 'INVENTORY'
  | 'ASSET'
  | 'HR'
  | 'CUSTODY'
  | 'VOUCHER'
  | 'EXPENSE'
  | 'JOURNAL_ENTRY'
  | string;

export type ResetFrequency = 'NEVER' | 'YEARLY' | 'MONTHLY';

export interface DocumentNumberConfig {
  id: string;
  company_id: string;
  org_unit_id?: string;       // Optional: specific to an organization unit
  documentType: DocumentType;
  prefix: string;              // e.g. "INV", "PR", "PO"
  suffix?: string;             // e.g. "EGP"
  pattern?: string;            // e.g. "{PREFIX}-{ORG_CODE}-{YEAR}-{SEQ:5}"
  padding: number;             // Default padding for {SEQ} token (e.g. 4 => 0001)
  resetFrequency?: ResetFrequency;
  includeYear: boolean;
  includeOrgCode: boolean;
  currentSequence: number;     // Last issued sequence number
  manualStartNo?: number;      // e.g. 1001 or 1
  updatedAt: string;
}

export interface GenerateNumberParams {
  companyId: string;
  documentType: DocumentType;
  org_unit_id?: string;
  orgCode?: string;
  date?: string | Date;       // ISO date or Date object to derive year/month
  dbInstance?: any;            // Optional Firestore instance
}

export interface GenerateNumberResult {
  documentNumber: string;
  sequenceNumber: number;
  configId?: string;
  documentType: DocumentType;
}
