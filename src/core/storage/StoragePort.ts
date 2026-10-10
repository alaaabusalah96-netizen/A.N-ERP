/**
 * @file StoragePort.ts
 * @description StoragePort Contract for A.N ERP (v7.1)
 * Defined code-first at Aggregate level.
 * All write operations mandate an idempotencyKey.
 * Errors follow RFC 7807 problem details specification.
 */

import type { AccountingDecisionRecord } from '../standards/decisionTypes';
import type { StandardRecord, JurisdictionRecord, AccountingRuleRecord, TaxRuleRecord, AccountingPolicyRecord, CoverageStatus } from '../standards/standardsTypes';

export interface RFC7807Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
}

export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: RFC7807Problem;
}

export type AdapterType = 'postgresql' | 'mysql' | 'mongodb' | 'firebase' | 'inmemory';
export type IsolationLevel = 'Shared' | 'Dedicated';

export interface BackendConfig {
  adapterType: AdapterType;
  /** Name of the environment reference / secret name (e.g. 'DATABASE_URL'), never raw credentials */
  connectionRef: string;
  isolationLevel: IsolationLevel;
}

export interface TenantCompany {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  crNumber?: string;
  taxNumber?: string;
  baseCurrency?: string;
  country?: string;
  auditRetentionPolicyYears?: number;
  backendConfig: BackendConfig;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt?: string;
}

export type CompanyProfile = TenantCompany;

export interface GeoLocation {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface LoginAttemptRecord {
  userId: string;
  tenantId?: string;
  location: GeoLocation;
  ip: string;
  timestamp: number;
}

export interface FailedAttemptRecord {
  userId: string;
  count: number;
  lockedUntil?: number;
  updatedAt: number;
}

export interface ActiveSessionRecord {
  sessionId: string;
  userId: string;
  tenantId?: string;
  username: string;
  fullName: string;
  role: string;
  deviceType: string;
  ipAddress: string;
  location: GeoLocation;
  familyId?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface User {
  id: string;
  tenantId: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  roleTitleAr?: string;
  branchName?: string;
  status: 'ACTIVE' | 'INACTIVE';
  passwordHash?: string;
  twoFactorSecret?: string;
  twoFactorEnabled?: boolean;
  backupCodes?: string[];
  hashedBackupCodes?: string[];
  permissions?: string[];
  assignedNodeId?: string;
  requiresPasswordChange?: boolean;
  encryptedPii?: { iv: string; tag: string; data: string } | string;
  createdAt?: string;
}

// Phase 5 (AUTH-003): persistent invitations. Only the SHA-256 hash of the token is ever stored.
export interface Invitation {
  id: string;
  tenantId: string;
  tokenHash: string;
  email: string;
  proposedRole: string;
  orgNodeId?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  expiresAt: string;
  createdBy: string;
  createdAt?: string;
  consumedAt?: string;
}

export interface ConsumedInvitation {
  id: string;
  email: string;
  proposedRole: string;
  orgNodeId?: string;
}

export interface RefreshTokenRecord {
  tokenHash: string;
  familyId: string;
  sequence: number;
  userId: string;
  tenantId: string;
  sessionId: string;
  expiresAt: number; // ms timestamp
  isUsed: boolean;
  revokedAt?: number;
}

export interface TokenFamily {
  familyId: string;
  userId: string;
  tenantId: string;
  isInvalidated: boolean;
  invalidationReason?: string;
  createdAt: number;
}

export interface Account {
  code: string;
  tenantId: string;
  nameAr: string;
  nameEn?: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  nature?: 'DEBIT' | 'CREDIT';
  currency?: string;
  debitBalance?: number;
  creditBalance?: number;
  balance?: number;
  isActive?: boolean;
  isParent?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface JournalLine {
  id: string;
  accountCode: string;
  costCenter?: string;
  debit: number;
  credit: number;
  description: string;
}

export type JournalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'POSTED' | 'REVERSED';

export interface JournalEntry {
  id: string;
  code: string;
  tenantId: string;
  date: string;
  type: string;
  description: string;
  lines: JournalLine[];
  totalAmount: number;
  status: JournalStatus;
  createdBy: string;
  approvedBy?: string;
  postedAt?: string;
  reversedByEntryId?: string;
}

// Wave 7.5E & Section 13.1: Accounting Periods & Fiscal Closing
export type AccountingPeriodStatus = 'OPEN' | 'CLOSED' | 'REOPENED';
export interface AccountingPeriod {
  id: string;
  tenantId: string;
  code: string;
  startDate: string;
  endDate: string;
  status: AccountingPeriodStatus;
  reopenedBy?: string;
  reopenedReason?: string;
  closedAt?: string;
  closedBy?: string;
}

export interface SequenceResult {
  sequenceNumber: number;
  formattedCode: string;
}

export interface ApprovalStep {
  stepNumber: number;
  roleRequired: string;
  approverId?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  actionTimestamp?: string;
  comment?: string;
  // Phase 12 (APR-001): configurable steps (all optional; requests without approverType keep the legacy lenient behavior)
  approverType?: 'ROLE' | 'USER';
  approverRef?: string;                    // role name or user id
  label?: string;                          // step name in Arabic
  stepKind?: 'ARRIVAL_CONFIRM' | 'TECHNICAL_INSPECTION' | 'FINAL_CONFIRM' | 'REVIEW' | 'GENERAL';
  rejectReason?: string;
}

export type ApprovalDocumentType = 'GOODS_RECEIPT_SUPPLIER' | 'STOCK_ISSUE' | 'STOCK_TRANSFER_RECEIPT';

export interface ApprovalPolicy {
  id: string;
  tenantId: string;
  documentType: ApprovalDocumentType;
  mode: 'DIRECT' | 'STEPS';
  steps: Array<{ label: string; approverType: 'ROLE' | 'USER'; approverRef: string; stepKind: NonNullable<ApprovalStep['stepKind']> }>;
  enforceDistinctApprovers: boolean;
  isActive: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface BreakGlassDetails {
  executed: boolean;
  actor1Id: string;
  actor1Role: string;
  actor2Id: string;
  actor2Role: string;
  reasonAr: string;
  ticketRef: string;
  executedAt: string;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  documentType: string;
  documentId: string;
  documentCode: string;
  initiatorId: string;
  currentStep: number;
  steps: ApprovalStep[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  // Phase 12 (APR-001)
  enforceDistinctApprovers?: boolean;     // snapshot of the policy at creation time
  rejectReason?: string;
  rejectedStep?: number;
  breakGlass?: BreakGlassDetails;
}

export interface SystemChangeLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  changeType: 'SCHEMA_MIGRATION' | 'PHASE_CLOSURE' | 'STORAGE_CONFIG' | 'ENGINE_POST' | 'SOD_ENFORCEMENT' | 'MIGRATION' | 'NUMBERING_OVERRIDE' | 'SECURITY' | 'Security' | 'ANONYMIZATION' | 'CANARY_ALERT' | 'BREAK_GLASS' | 'PLATFORM_MANAGEMENT';
  module: string;
  entitiesAffected: string[];
  summaryAr: string;
  beforeState?: any;
  afterState?: any;
  evidenceRef?: string;
  version: string;
}

export interface CountryTaxRule {
  countryCode: string; // SA, EG, AE, KW, QA, BH, OM
  countryNameAr: string;
  standardVatRate: number; // e.g. 0.15 for SA, 0.14 for EG
  currencyCode: string;
  taxAuthorityName: string;
  taxIdFormatRegex: string;
  updatedAt?: string;
}

export interface TenantModuleManifest {
  tenantId: string;
  moduleId: string; // e.g. 'pos', 'inventory', 'custody', 'expenses', etc.
  moduleNameAr: string;
  isEnabled: boolean;
  config?: Record<string, any>;
  activatedAt: string;
}

// Phase 5: Cash Custody Module (1 of 15)
export type CustodyStatus = 'OPEN' | 'SETTLED' | 'CLOSED' | 'LIQUIDATED';
export type CustodyTransactionStatus = 'RECORDED' | 'INCLUDED_IN_SETTLEMENT' | 'REJECTED';
export type CustodySettlementStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type CustodyVarianceType = 'NONE' | 'SURPLUS' | 'DEFICIT';

export interface CashCustody {
  id: string;
  tenantId: string;
  companyId: string;
  custodyCode: string;
  employeeId: string;
  employeeName: string;
  branchId?: string;
  branchName?: string;
  costCenterId: string;
  costCenterName?: string;
  currency: string;
  allocatedAmount: number;
  currentBalance: number;
  maxLimitPerRole: number;
  status: CustodyStatus;
  openedBy: string;
  openedByName: string;
  openedAt: string;
  closedAt?: string;
  closedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashCustodyTransaction {
  id: string;
  tenantId: string;
  companyId: string;
  transactionCode: string;
  custodyId: string;
  amount: number;
  expenseCategory: string;
  expenseAccountCode: string;
  description: string;
  receiptNumber: string;
  attachmentUrl: string;
  attachmentName?: string;
  costCenterId?: string;
  recordedBy: string;
  recordedByName: string;
  status: CustodyTransactionStatus;
  settlementId?: string;
  transactionDate: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface CashCustodySettlement {
  id: string;
  tenantId: string;
  companyId: string;
  settlementCode: string;
  custodyId: string;
  settlementDate: string;
  totalExpenses: number;
  replenishmentAmount: number;
  varianceAmount: number;
  varianceType: CustodyVarianceType;
  journalEntryId?: string;
  status: CustodySettlementStatus;
  settledBy: string;
  settledByName: string;
  notes?: string;
  createdAt: string;
  idempotencyKey: string;
}

// Phase 6: Expenses Module (2 of 15)
export type ExpenseRequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED_L1' | 'APPROVED' | 'REJECTED' | 'POSTED';
export type ExpenseApprovalTier = 'L1' | 'L2' | 'COMPLETED';
export type ExpensePaymentMethod = 'DIRECT_BANK_TRANSFER' | 'CHEQUE' | 'EMPLOYEE_REIMBURSEMENT';

export interface ExpenseCategory {
  id: string;
  tenantId: string;
  companyId: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  defaultAccountCode: string;
  requiresAttachment: boolean;
  attachmentThresholdAmount: number;
  isActive: boolean;
  createdAt: string;
}

export interface ExpenseLine {
  id: string;
  tenantId: string;
  companyId: string;
  requestId: string;
  categoryId: string;
  categoryNameAr: string;
  expenseAccountCode: string;
  description: string;
  amount: number;
  costCenterId?: string;
  projectId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  createdAt: string;
}

export interface ExpenseAttachment {
  id: string;
  tenantId: string;
  companyId: string;
  requestId: string;
  lineId?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ExpenseRequest {
  id: string;
  tenantId: string;
  companyId: string;
  requestCode: string;
  titleAr: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  costCenterId?: string;
  projectId?: string;
  totalAmount: number;
  currency: string;
  paymentMethod: ExpensePaymentMethod;
  disbursementAccountCode?: string;
  status: ExpenseRequestStatus;
  currentApprovalTier: ExpenseApprovalTier;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  approvedL1By?: string;
  approvedL1ByName?: string;
  approvedL1At?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  journalEntryId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  idempotencyKey?: string;
}

// ============================================================================
// Phase 7: Warehouses & Inventory Module Types (3 of 15 - بند 7)
// ============================================================================
export type InventoryValuationMethod = 'WEIGHTED_AVERAGE' | 'FIFO' | 'SPECIFIC_LOT' | 'STANDARD_COST';
export type StockMovementType =
  | 'RECEIPT'
  | 'ISSUE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'COUNT_ADJUSTMENT_GAIN'
  | 'COUNT_ADJUSTMENT_LOSS';

export type StockTransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
export type StockCountType = 'PERIODIC' | 'SURPRISE';
export type StockCountStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED' | 'POSTED' | 'REJECTED';

export interface Warehouse {
  id: string;
  tenantId: string;
  companyId: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  branchId?: string;
  branchName?: string;
  location?: string;
  isDefault?: boolean;
  valuationMethod: InventoryValuationMethod;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface WarehouseBin {
  id: string;
  tenantId: string;
  companyId: string;
  warehouseId: string;
  code: string;
  aisle?: string;
  rack?: string;
  shelf?: string;
  bin?: string;
  descriptionAr?: string;
  isActive: boolean;
  createdAt: string;
}

export interface StockItem {
  id: string;
  tenantId: string;
  companyId: string;
  itemCode: string;
  barcode?: string;
  nameAr: string;
  nameEn?: string;
  category: string;
  uom: string;
  inventoryAccountCode: string;
  cogsAccountCode: string;
  adjustmentExpenseAccountCode: string;
  adjustmentGainAccountCode: string;
  valuationMethod: InventoryValuationMethod;
  standardCost: number;
  averageCost: number;
  lastPurchaseCost?: number;
  sellingPrice: number;
  reorderPoint: number;
  minStockLevel: number;
  maxStockLevel: number;
  trackBatch: boolean;
  trackSerial: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface WarehouseStock {
  id: string;
  tenantId: string;
  companyId: string;
  warehouseId: string;
  itemId: string;
  currentQty: number;
  reservedQty: number;
  availableQty: number;
  averageCost: number;
  totalValue: number;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  companyId: string;
  movementNumber: string;
  movementType: StockMovementType;
  warehouseId: string;
  warehouseNameAr?: string;
  binId?: string;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceAfterQty: number;
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  sourceDocumentNumber?: string;
  journalEntryId?: string;
  batchNumber?: string;
  serialNumber?: string;
  notes?: string;
  performedBy: string;
  performedByName: string;
  timestamp: string;
  idempotencyKey?: string;
  // Phase 13 (COST-001): optional purchase-order tag. On entry it tags the cost layer; on exit of a SPECIFIC_LOT item it selects the layers of that PO.
  sourcePoNumber?: string;
}

export interface StockTransferLine {
  id: string;
  tenantId: string;
  companyId: string;
  transferId: string;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  batchNumber?: string;
  serialNumber?: string;
  lineNumber?: number;
  uom?: string;
  notes?: string;
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  companyId: string;
  transferNumber: string;
  sourceWarehouseId: string;
  sourceWarehouseNameAr: string;
  targetWarehouseId: string;
  targetWarehouseNameAr: string;
  status: StockTransferStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  dispatchedBy?: string;
  dispatchedByName?: string;
  dispatchedAt?: string;
  receivedBy?: string;
  receivedByName?: string;
  receivedAt?: string;
  totalItemsCount: number;
  totalQuantity: number;
  totalCost: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  idempotencyKey?: string;
  // Phase 14 (ACC-AUTO-001)
  dispatchJournalEntryId?: string;
  receiveJournalEntryId?: string;
  journalStatus?: 'NONE' | 'POSTED' | 'PENDING_RETRY';
}

// Phase 15 (PO-001): Purchase Orders & Goods Receipts
export type PurchaseOrderStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';
export type GoodsReceiptStatus = 'IN_APPROVAL' | 'APPROVED' | 'POSTING_FAILED' | 'REJECTED' | 'RETURNED_TO_SUPPLIER' | 'CANCELLED';

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface PurchaseOrderLine {
  id: string;
  tenantId: string;
  poId: string;
  lineNumber: number;
  itemId: string;
  orderedQty: number;
  unitCost: number;
  receivedQty: number;
  rejectedQty: number;
}
export interface GoodsReceipt {
  id: string;
  tenantId: string;
  receiptNumber: string;
  poId: string;
  poNumber: string;
  warehouseId: string;
  status: GoodsReceiptStatus;
  approvalRequestId?: string;
  stockDocumentId?: string;
  rejectReason?: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}
export interface GoodsReceiptLine {
  id: string;
  tenantId: string;
  receiptId: string;
  poLineId: string;
  itemId: string;
  receivedQty: number;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
}
export interface CompleteGoodsReceiptAtomicInput {
  receipt: GoodsReceipt;
  lines: GoodsReceiptLine[];
  poId: string;
  qtyUpdates: Array<{ poLineId: string; addReceived: number; addRejected: number }>;
  newPoStatus: PurchaseOrderStatus;
}


// Phase 8a (P2P-001): Purchase Request + RFQ + Supplier Quotes (extends R15 PO)
export type PurchaseRequestStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'CANCELLED';
export type RfqStatus = 'DRAFT' | 'SENT' | 'CLOSED' | 'CANCELLED';
export type SupplierQuoteStatus = 'RECEIVED' | 'SELECTED' | 'REJECTED' | 'EXPIRED';

export interface PurchaseRequest {
  id: string;
  tenantId: string;
  prNumber: string;
  status: PurchaseRequestStatus;
  requestedBy: string;
  neededBy?: string;
  notes?: string;
  costCenterId?: string;
  projectId?: string;
  sourceReorderEventId?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  convertedPoId?: string;
  createdAt: string;
  updatedAt: string;
}
export interface PurchaseRequestLine {
  id: string;
  tenantId: string;
  prId: string;
  lineNumber: number;
  itemId: string;
  quantity: number;
  uom?: string;
  neededBy?: string;
  costCenterId?: string;
  projectId?: string;
  notes?: string;
}
export interface RequestForQuote {
  id: string;
  tenantId: string;
  rfqNumber: string;
  status: RfqStatus;
  prId?: string;
  notes?: string;
  createdBy: string;
  sentAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface RfqLine {
  id: string;
  tenantId: string;
  rfqId: string;
  lineNumber: number;
  itemId: string;
  quantity: number;
  uom?: string;
  notes?: string;
}
export interface SupplierQuote {
  id: string;
  tenantId: string;
  quoteNumber: string;
  rfqId: string;
  vendorId: string;
  vendorName: string;
  status: SupplierQuoteStatus;
  quoteDate: string;
  validUntil?: string;
  notes?: string;
  createdBy: string;
  selectedAt?: string;
  convertedPoId?: string;
  createdAt: string;
  updatedAt: string;
}
export interface SupplierQuoteLine {
  id: string;
  tenantId: string;
  quoteId: string;
  rfqLineId: string;
  lineNumber: number;
  itemId: string;
  quantity: number;
  unitPrice: number;
  leadTimeDays?: number;
  notes?: string;
}

// Phase 8c (P2P-002): Supplier Invoice + Three-Way Matching
export type SupplierInvoiceStatus = 'DRAFT' | 'MATCH_PENDING' | 'MATCH_FAILED' | 'MATCHED' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'CANCELLED';
export interface SupplierInvoice {
  id: string; tenantId: string; invoiceNumber: string; vendorInvoiceRef: string;
  poId: string; poNumber: string; vendorId: string; vendorName: string; receiptId?: string;
  status: SupplierInvoiceStatus; invoiceDate: string; dueDate?: string; currency?: string;
  subtotal: number; taxAmount: number; totalAmount: number; matchTolerancePct: number;
  matchSummary?: string; journalEntryId?: string; notes?: string; createdBy: string;
  approvedBy?: string; approvedAt?: string; rejectedReason?: string; createdAt: string; updatedAt: string;
}
export interface SupplierInvoiceLine {
  id: string; tenantId: string; invoiceId: string; lineNumber: number; poLineId: string; itemId: string;
  invoicedQty: number; unitPrice: number; lineTotal: number; taxAmount?: number; notes?: string;
}
export interface ThreeWayMatchLineResult {
  poLineId: string; itemId: string; orderedQty: number; receivedQty: number; invoicedQty: number;
  poUnitCost: number; invoiceUnitPrice: number; qtyOk: boolean; priceOk: boolean; detailAr: string;
}
export interface ThreeWayMatchResult {
  invoiceId: string; passed: boolean; tolerancePct: number; lines: ThreeWayMatchLineResult[]; summaryAr: string;
}


// Phase 16 (REC-001): stock vs ledger integrity (read-only aggregates)
export interface InventoryIntegrityRow {
  warehouseId: string;
  itemId: string;
  stockQty: number;
  stockValue: number;
  movementsQty: number;
  movementsValue: number;
}



export interface StockCountLine {
  id: string;
  tenantId: string;
  companyId: string;
  countId: string;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  systemQty: number;
  countedQty: number;
  varianceQty: number;
  unitCost: number;
  varianceAmount: number;
  batchNumber?: string;
  serialNumber?: string;
  notes?: string;
}

export interface StockCount {
  id: string;
  tenantId: string;
  companyId: string;
  countNumber: string;
  countType: StockCountType;
  warehouseId: string;
  warehouseNameAr: string;
  status: StockCountStatus;
  performedBy: string;
  performedByName: string;
  performedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  totalItemsCount: number;
  hasVariance: boolean;
  netVarianceAmount: number;
  journalEntryId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  idempotencyKey?: string;
}

export interface ItemBatch {
  id: string;
  tenantId: string;
  companyId: string;
  itemId: string;
  warehouseId: string;
  batchNumber: string;
  productionDate?: string;
  expiryDate?: string;
  currentQty: number;
  unitCost: number;
  createdAt: string;
}

export interface ItemSerial {
  id: string;
  tenantId: string;
  companyId: string;
  itemId: string;
  warehouseId: string;
  serialNumber: string;
  status: 'IN_STOCK' | 'ISSUED' | 'TRANSFERRED' | 'WRITTEN_OFF';
  warrantyExpiry?: string;
  createdAt: string;
}

export type DualControlStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface MasterItem {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  category: string;
  unitPrice: number;
  costPrice: number;
  status: DualControlStatus;
  createdBy: string;
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  approvedAt?: string;
}

export interface MasterPartner {
  id: string;
  tenantId: string;
  type: 'CUSTOMER' | 'VENDOR';
  code: string;
  nameAr: string;
  taxNumber?: string;
  phone?: string;
  status: DualControlStatus;
  createdBy: string;
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  approvedAt?: string;
}

export interface AuditChainEntry {
  id: string;
  sequenceNumber: number;
  tenantId: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: any;
  afterState?: any;
  ipAddress?: string;
  previousHash: string;
  entryHash: string;
}

// Phase 3A: Organizational Hierarchy Types
export type OrgNodeType = 'REGION' | 'SITE' | 'BRANCH' | 'DEPARTMENT';

export interface OrgNode {
  id: string;
  tenantId: string;
  type: OrgNodeType;
  code: string;
  nameAr: string;
  nameEn?: string;
  parentId?: string | null;
  managerUserId?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
}

// Phase 4.5: Operational Audit & Custom Fields Persistence (4.5E)
export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  module: string;
  fieldKey: string;
  fieldLabelAr: string;
  fieldType: string;
  isRequired: boolean;
  options?: string[];
}

export interface OperationalAuditRecord {
  id: string;
  tenantId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: any;
  ipAddress?: string;
  timestamp: string;
}

export interface StoragePort {
  readonly adapterName: string;

  // Tenant / Company Aggregates
  getTenant(tenantId: string): Promise<StorageResult<TenantCompany>>;
  saveTenant(tenant: TenantCompany, idempotencyKey: string, skipIdempotency?: boolean): Promise<StorageResult<TenantCompany>>;
  listTenants(): Promise<StorageResult<TenantCompany[]>>;

  // Users & RBAC
  getUser(tenantId: string, userId: string): Promise<StorageResult<User>>;
  getUserByUsername(tenantId: string, username: string): Promise<StorageResult<User>>;
  getUserById(userId: string): Promise<StorageResult<User>>;
  listUsers(tenantId?: string): Promise<StorageResult<User[]>>;
  saveUser(user: User, idempotencyKey: string, skipIdempotency?: boolean): Promise<StorageResult<User>>;
  updateUser(userId: string, updates: Partial<User>): Promise<StorageResult<User>>;
  // Phase 4 (IDENT-001): membership / role / scope layer
  getMembershipContext(tenantId: string, userId: string): Promise<StorageResult<{ membershipId: string; status: string; role: string | null; scopes: { type: 'TENANT' | 'NODE'; orgNodeId?: string }[] } | null>>;
  setMembershipStatus(tenantId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'): Promise<StorageResult<boolean>>;
  // Phase 5 (AUTH-003): invitations (atomic consume / release)
  createInvitation(tenantId: string, inv: Invitation): Promise<StorageResult<boolean>>;
  consumeInvitation(tenantId: string, tokenHash: string): Promise<StorageResult<ConsumedInvitation | null>>;
  releaseInvitation(tenantId: string, tokenHash: string): Promise<StorageResult<boolean>>;

  // Login Attempts & Security Tracking (Anomaly Detection & Lockout)
  getLastSuccessfulLogin(userId: string): Promise<StorageResult<LoginAttemptRecord | null>>;
  recordSuccessfulLogin(record: LoginAttemptRecord): Promise<StorageResult<void>>;
  getFailedLoginAttempts(userId: string): Promise<StorageResult<FailedAttemptRecord | null>>;
  recordFailedLoginAttempt(userId: string, count: number, lockedUntil?: number): Promise<StorageResult<void>>;
  clearFailedLoginAttempts(userId: string): Promise<StorageResult<void>>;

  // Active Sessions
  saveActiveSession(session: ActiveSessionRecord): Promise<StorageResult<ActiveSessionRecord>>;
  getActiveSession(sessionId: string): Promise<StorageResult<ActiveSessionRecord | null>>;
  listActiveSessionsByUser(userId: string): Promise<StorageResult<ActiveSessionRecord[]>>;
  listActiveSessions(tenantId: string): Promise<StorageResult<ActiveSessionRecord[]>>;
  deleteActiveSession(sessionId: string): Promise<StorageResult<void>>;

  // Chart of Accounts & Balances
  getAccount(tenantId: string, accountCode: string): Promise<StorageResult<Account>>;
  listAccounts?(tenantId: string): Promise<StorageResult<Account[]>>;
  saveAccount(tenantId: string, account: Account, idempotencyKey: string, skipIdempotency?: boolean): Promise<StorageResult<Account>>;
  getAccountBalance(
    tenantId: string,
    accountCode: string
  ): Promise<StorageResult<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number }>>;

  // Historical Financial Query (As Of - 2D)
  getAccountBalanceAsOf(
    tenantId: string,
    accountCode: string,
    asOfDate: string
  ): Promise<StorageResult<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number; asOfDate: string }>>;

  // Atomic Journal Posting Operations
  createJournalEntry(
    tenantId: string,
    entry: JournalEntry,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>>;

  postJournalEntry(
    tenantId: string,
    entryId: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>>;

  reverseJournalEntry(
    tenantId: string,
    entryId: string,
    reason: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>>;

  getJournalEntry(tenantId: string, entryId: string): Promise<StorageResult<JournalEntry>>;
  listJournalEntries(tenantId: string): Promise<StorageResult<JournalEntry[]>>;
  deleteJournalEntry(tenantId: string, entryId: string): Promise<StorageResult<void>>;

  // Fiscal Closing & Accounting Period Control (Wave 7.5E & Section 13.1)
  getPeriodForDate(tenantId: string, date: string): Promise<StorageResult<AccountingPeriod | null>>;
  setPeriodStatus(
    tenantId: string,
    periodId: string,
    status: AccountingPeriodStatus,
    actorId: string,
    reason?: string
  ): Promise<StorageResult<AccountingPeriod>>;

  // Atomic Numbering & Override (2C)
  nextSequence(
    tenantId: string,
    sequenceKey: string,
    prefix: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>>;

  overrideSequence(
    tenantId: string,
    sequenceKey: string,
    manualNumber: number,
    reason: string,
    authorizedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>>;

  // Approval Workflow
  createApprovalRequest(
    tenantId: string,
    request: ApprovalRequest,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>>;
  
  approveStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    idempotencyKey: string,
    approverRole?: string
  ): Promise<StorageResult<ApprovalRequest>>;

  // Phase 12 (APR-001): reject, read, list, and per-tenant policies
  rejectApprovalStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    approverRole: string,
    reason: string,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>>;
  getApprovalRequest(tenantId: string, id: string): Promise<StorageResult<ApprovalRequest | null>>;
  listApprovalRequests(tenantId: string, filter?: { status?: string; documentType?: string; documentId?: string }): Promise<StorageResult<ApprovalRequest[]>>;
  getApprovalPolicy(tenantId: string, documentType: ApprovalDocumentType): Promise<StorageResult<ApprovalPolicy | null>>;
  listApprovalPolicies(tenantId: string): Promise<StorageResult<ApprovalPolicy[]>>;
  saveApprovalPolicy(tenantId: string, policy: ApprovalPolicy, idempotencyKey: string): Promise<StorageResult<ApprovalPolicy>>;

  // System Change Log (Immutable Ledger on Primary)
  appendSystemChangeLog(entry: SystemChangeLogEntry): Promise<StorageResult<SystemChangeLogEntry>>;
  getSystemChangeLogs(): Promise<StorageResult<SystemChangeLogEntry[]>>;

  // Session & Refresh Token Storage
  saveTokenFamily(family: TokenFamily): Promise<StorageResult<TokenFamily>>;
  getTokenFamily(familyId: string): Promise<StorageResult<TokenFamily>>;
  saveRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>>;
  getRefreshToken(tokenHash: string): Promise<StorageResult<RefreshTokenRecord>>;
  updateRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>>;
  consumeRefreshToken(tokenHash: string, revokedAt: number): Promise<StorageResult<boolean>>;
  invalidateTokenFamily(familyId: string, reason: string): Promise<StorageResult<boolean>>;

  // Phase 2: Module Manifest Management (2H)
  getTenantModules(tenantId: string): Promise<StorageResult<TenantModuleManifest[]>>;
  enableTenantModules(tenantId: string, modules: TenantModuleManifest[], idempotencyKey: string): Promise<StorageResult<TenantModuleManifest[]>>;

  // Phase 2: Master Data with Dual-Control (2F)
  saveMasterItem(tenantId: string, item: MasterItem, idempotencyKey: string): Promise<StorageResult<MasterItem>>;
  getMasterItem(tenantId: string, itemId: string): Promise<StorageResult<MasterItem>>;
  listMasterItems(tenantId: string): Promise<StorageResult<MasterItem[]>>;
  approveMasterItem(tenantId: string, itemId: string, approverId: string, idempotencyKey: string): Promise<StorageResult<MasterItem>>;

  saveMasterPartner(tenantId: string, partner: MasterPartner, idempotencyKey: string): Promise<StorageResult<MasterPartner>>;
  getMasterPartner(tenantId: string, partnerId: string): Promise<StorageResult<MasterPartner>>;
  listMasterPartners(tenantId: string, type?: 'CUSTOMER' | 'VENDOR'): Promise<StorageResult<MasterPartner[]>>;
  approveMasterPartner(tenantId: string, partnerId: string, approverId: string, idempotencyKey: string): Promise<StorageResult<MasterPartner>>;

  // Phase 2: Tamper-Evident Hash-Chained Audit Trail (2G & 2E)
  appendAuditChain(tenantId: string, entry: Omit<AuditChainEntry, 'sequenceNumber' | 'previousHash' | 'entryHash'>): Promise<StorageResult<AuditChainEntry>>;
  getAuditChain(tenantId: string, limit?: number): Promise<StorageResult<AuditChainEntry[]>>;
  verifyAuditChain(tenantId: string): Promise<StorageResult<{ isValid: boolean; verifiedRecordsCount: number; brokenAtSequence?: number; messageAr: string }>>;

  // Phase 2: Country Tax Rules (2A)
  getCountryTaxRule(countryCode: string): Promise<StorageResult<CountryTaxRule>>;
  listCountryTaxRules(): Promise<StorageResult<CountryTaxRule[]>>;
  upsertCountryTaxRule(rule: CountryTaxRule): Promise<StorageResult<CountryTaxRule>>;

  // Phase 3A: Organizational Hierarchy
  saveOrgNode(tenantId: string, node: OrgNode, idempotencyKey: string): Promise<StorageResult<OrgNode>>;
  getOrgNode(tenantId: string, nodeId: string): Promise<StorageResult<OrgNode>>;
  listOrgHierarchy(tenantId: string, rootNodeId?: string): Promise<StorageResult<OrgNode[]>>;
  getUserVisibleNodes(tenantId: string, userAssignedNodeId: string): Promise<StorageResult<OrgNode[]>>;

  // Phase 3C: Break-Glass Approval Workflow
  approveBreakGlass(tenantId: string, requestId: string, breakGlass: BreakGlassDetails, idempotencyKey: string): Promise<StorageResult<ApprovalRequest>>;

  // Phase 3E: Privacy & Right to be Forgotten
  anonymizeUserPii(tenantId: string, userId: string, actorId: string, idempotencyKey: string): Promise<StorageResult<{ userId: string; anonymizedAt: string }>>;

  // Phase 4.5: Operational Audit & Custom Fields Persistence (4.5E)
  saveAuditRecord(record: OperationalAuditRecord): Promise<StorageResult<OperationalAuditRecord>>;
  getAuditRecords(tenantId: string, limit?: number): Promise<StorageResult<OperationalAuditRecord[]>>;
  saveCustomField(tenantId: string, field: CustomFieldDefinition): Promise<StorageResult<CustomFieldDefinition>>;
  getCustomFields(tenantId: string, module?: string): Promise<StorageResult<CustomFieldDefinition[]>>;
  checkIdempotencyRecord(tenantId: string, key: string, operation: string): Promise<StorageResult<any | null>>;
  saveIdempotencyRecord(tenantId: string, key: string, operation: string, payload: any): Promise<StorageResult<void>>;

  // Phase 5: Cash Custody Module Operations (1 of 15)
  createCashCustody(tenantId: string, custody: CashCustody, idempotencyKey: string): Promise<StorageResult<CashCustody>>;
  getCashCustody(tenantId: string, custodyId: string): Promise<StorageResult<CashCustody | null>>;
  listCashCustodies(tenantId: string, filter?: { status?: string; employeeId?: string }): Promise<StorageResult<CashCustody[]>>;
  updateCashCustody(tenantId: string, custodyId: string, updates: Partial<CashCustody>): Promise<StorageResult<CashCustody>>;
  recordCustodyExpense(tenantId: string, transaction: CashCustodyTransaction, idempotencyKey: string, skipBalanceDeduction?: boolean): Promise<StorageResult<CashCustodyTransaction>>;
  listCustodyTransactions(tenantId: string, custodyId?: string): Promise<StorageResult<CashCustodyTransaction[]>>;
  saveCustodySettlement(tenantId: string, settlement: CashCustodySettlement, idempotencyKey: string): Promise<StorageResult<CashCustodySettlement>>;
  listCustodySettlements(tenantId: string, custodyId?: string): Promise<StorageResult<CashCustodySettlement[]>>;

  // Phase 6: Expenses Module Operations (2 of 15)
  createExpenseRequest(tenantId: string, request: ExpenseRequest, lines: ExpenseLine[], attachments: ExpenseAttachment[], idempotencyKey: string): Promise<StorageResult<ExpenseRequest>>;
  getExpenseRequest(tenantId: string, requestId: string): Promise<StorageResult<{ request: ExpenseRequest; lines: ExpenseLine[]; attachments: ExpenseAttachment[] } | null>>;
  listExpenseRequests(tenantId: string, filter?: { status?: string; employeeId?: string }): Promise<StorageResult<ExpenseRequest[]>>;
  updateExpenseRequestStatus(tenantId: string, requestId: string, updates: Partial<ExpenseRequest>, idempotencyKey: string): Promise<StorageResult<ExpenseRequest>>;
  listExpenseCategories(tenantId: string): Promise<StorageResult<ExpenseCategory[]>>;
  saveExpenseCategory(tenantId: string, category: ExpenseCategory, idempotencyKey: string, skipIdempotency?: boolean): Promise<StorageResult<ExpenseCategory>>;

  // Phase 7: Warehouses & Inventory Module Operations (3 of 15 - بند 7)
  saveWarehouse(tenantId: string, warehouse: Warehouse, idempotencyKey: string): Promise<StorageResult<Warehouse>>;
  getWarehouse(tenantId: string, warehouseId: string): Promise<StorageResult<Warehouse | null>>;
  listWarehouses(tenantId: string, filter?: { isActive?: boolean; branchId?: string }): Promise<StorageResult<Warehouse[]>>;
  
  saveWarehouseBin(tenantId: string, bin: WarehouseBin): Promise<StorageResult<WarehouseBin>>;
  listWarehouseBins(tenantId: string, warehouseId: string): Promise<StorageResult<WarehouseBin[]>>;
  
  saveStockItem(tenantId: string, item: StockItem, idempotencyKey: string): Promise<StorageResult<StockItem>>;
  getStockItem(tenantId: string, itemId: string): Promise<StorageResult<StockItem | null>>;
  listStockItems(tenantId: string, filter?: { category?: string; isActive?: boolean }): Promise<StorageResult<StockItem[]>>;
  
  getWarehouseStock(tenantId: string, warehouseId: string, itemId: string): Promise<StorageResult<WarehouseStock | null>>;
  listWarehouseStock(tenantId: string, warehouseId?: string, itemId?: string): Promise<StorageResult<WarehouseStock[]>>;
  
  recordStockMovement(tenantId: string, movement: StockMovement, idempotencyKey: string): Promise<StorageResult<StockMovement>>;
  listStockMovements(tenantId: string, filter?: { warehouseId?: string; itemId?: string; movementType?: string; limit?: number }): Promise<StorageResult<StockMovement[]>>;

  // Phase 13 (COST-001): per-tenant inventory settings (defaults are returned when no row exists)
  getInventorySettings(tenantId: string): Promise<StorageResult<InventorySettings>>;
  saveInventorySettings(tenantId: string, settings: Partial<Omit<InventorySettings, 'tenantId'>>, actorId: string, idempotencyKey: string): Promise<StorageResult<InventorySettings>>;
  // Phase 14 (ACC-AUTO-001)
  getStockAccountingConfig(tenantId: string): Promise<StorageResult<StockAccountingConfig>>;
  saveStockAccountingConfig(tenantId: string, settings: Partial<Omit<StockAccountingConfig, 'tenantId'>>, actorId: string, idempotencyKey: string): Promise<StorageResult<StockAccountingConfig>>;
  setStockDocumentJournal(tenantId: string, docId: string, journalEntryId: string | null, status: 'NONE' | 'POSTED' | 'PENDING_RETRY'): Promise<StorageResult<void>>;
  setStockTransferJournal(tenantId: string, transferId: string, which: 'DISPATCH' | 'RECEIVE', journalEntryId: string | null, status: 'NONE' | 'POSTED' | 'PENDING_RETRY'): Promise<StorageResult<void>>;

  // Standards Intelligence F1 (SI-1..SI-10). Global reference data (no tenant): history is immutable, a duplicate
  // (id, version) is rejected with 409 unless it is a replay of the same idempotencyKey.
  saveStandard(s: StandardRecord, actorId: string, idempotencyKey: string): Promise<StorageResult<StandardRecord>>;
  listStandards(filter?: { standardId?: string; framework?: string }): Promise<StorageResult<StandardRecord[]>>;
  updateStandardCoverage(standardId: string, version: number, coverage: CoverageStatus, evidenceRef: string | null, actorId: string, idempotencyKey: string): Promise<StorageResult<StandardRecord>>;
  saveJurisdiction(j: JurisdictionRecord, actorId: string, idempotencyKey: string): Promise<StorageResult<JurisdictionRecord>>;
  listJurisdictions(): Promise<StorageResult<JurisdictionRecord[]>>;
  saveAccountingRule(rule: AccountingRuleRecord, actorId: string, idempotencyKey: string): Promise<StorageResult<AccountingRuleRecord>>;
  listAccountingRules(filter?: { ruleId?: string; eventType?: string; jurisdictionId?: string }): Promise<StorageResult<AccountingRuleRecord[]>>;
  saveStdTaxRule(rule: TaxRuleRecord, actorId: string, idempotencyKey: string): Promise<StorageResult<TaxRuleRecord>>;
  listStdTaxRules(filter?: { taxRuleId?: string; jurisdictionId?: string; taxType?: string }): Promise<StorageResult<TaxRuleRecord[]>>;
  // Tenant policies: atomic append of a NEW effective-dated version (closes the previous one, rejects backdating).
  appendAccountingPolicyVersion(tenantId: string, input: { id: string; tenantId: string; policyKey: string; value: string; effectiveFrom: string; reason?: string | null; createdBy: string }, actorId: string, idempotencyKey: string): Promise<StorageResult<AccountingPolicyRecord>>;
  listAccountingPolicies(tenantId: string, policyKey?: string): Promise<StorageResult<AccountingPolicyRecord[]>>;

  // Standards Intelligence F2: durable AccountingDecision (tenant-scoped). Idempotent on (tenantId, decisionKey): a replay returns
  // the ORIGINAL stored decision. Immutable except the one-way link to a journal (same journal = no-op, other journal = 409).
  saveAccountingDecision(tenantId: string, rec: AccountingDecisionRecord): Promise<StorageResult<AccountingDecisionRecord>>;
  getAccountingDecision(tenantId: string, id: string): Promise<StorageResult<AccountingDecisionRecord | null>>;
  listAccountingDecisions(tenantId: string, filter?: { eventType?: string; eventId?: string; journalEntryId?: string; status?: string; limit?: number }): Promise<StorageResult<AccountingDecisionRecord[]>>;
  linkDecisionToJournal(tenantId: string, decisionId: string, journalEntryId: string): Promise<StorageResult<AccountingDecisionRecord>>;

  // Phase 15 (PO-001)
  savePurchaseOrder(tenantId: string, po: PurchaseOrder, lines: PurchaseOrderLine[], idempotencyKey: string): Promise<StorageResult<PurchaseOrder>>;
  getPurchaseOrder(tenantId: string, poId: string): Promise<StorageResult<{ po: PurchaseOrder; lines: PurchaseOrderLine[] } | null>>;
  listPurchaseOrders(tenantId: string, filter?: { status?: string; vendorId?: string }): Promise<StorageResult<PurchaseOrder[]>>;
  updatePurchaseOrderStatus(tenantId: string, poId: string, status: PurchaseOrderStatus, actorId: string): Promise<StorageResult<PurchaseOrder>>;
  // Repair batch 1 (DEF-P2-001): with `guard`, the adapter locks the PO lines and re-checks the remaining quantity inside the same transaction
  saveGoodsReceipt(tenantId: string, receipt: GoodsReceipt, lines: GoodsReceiptLine[], idempotencyKey: string, guard?: { tolerancePct: number }): Promise<StorageResult<GoodsReceipt>>;
  getGoodsReceipt(tenantId: string, receiptId: string): Promise<StorageResult<{ receipt: GoodsReceipt; lines: GoodsReceiptLine[] } | null>>;
  listGoodsReceipts(tenantId: string, filter?: { poId?: string; status?: string }): Promise<StorageResult<GoodsReceipt[]>>;
  updateGoodsReceipt(tenantId: string, receipt: GoodsReceipt): Promise<StorageResult<GoodsReceipt>>;
  completeGoodsReceiptAtomic(tenantId: string, input: CompleteGoodsReceiptAtomicInput, idempotencyKey: string): Promise<StorageResult<GoodsReceipt>>;
  sumOpenReceiptQtyForPoLine(tenantId: string, poLineId: string): Promise<StorageResult<number>>;

  // Phase 8a (P2P-001): PR / RFQ / Supplier Quotes
  savePurchaseRequest(tenantId: string, pr: PurchaseRequest, lines: PurchaseRequestLine[], idempotencyKey: string): Promise<StorageResult<PurchaseRequest>>;
  getPurchaseRequest(tenantId: string, prId: string): Promise<StorageResult<{ pr: PurchaseRequest; lines: PurchaseRequestLine[] } | null>>;
  listPurchaseRequests(tenantId: string, filter?: { status?: string; requestedBy?: string }): Promise<StorageResult<PurchaseRequest[]>>;
  updatePurchaseRequest(tenantId: string, pr: PurchaseRequest): Promise<StorageResult<PurchaseRequest>>;
  saveRfq(tenantId: string, rfq: RequestForQuote, lines: RfqLine[], idempotencyKey: string): Promise<StorageResult<RequestForQuote>>;
  getRfq(tenantId: string, rfqId: string): Promise<StorageResult<{ rfq: RequestForQuote; lines: RfqLine[] } | null>>;
  listRfqs(tenantId: string, filter?: { status?: string; prId?: string }): Promise<StorageResult<RequestForQuote[]>>;
  updateRfq(tenantId: string, rfq: RequestForQuote): Promise<StorageResult<RequestForQuote>>;
  saveSupplierQuote(tenantId: string, quote: SupplierQuote, lines: SupplierQuoteLine[], idempotencyKey: string): Promise<StorageResult<SupplierQuote>>;
  getSupplierQuote(tenantId: string, quoteId: string): Promise<StorageResult<{ quote: SupplierQuote; lines: SupplierQuoteLine[] } | null>>;
  listSupplierQuotes(tenantId: string, filter?: { rfqId?: string; vendorId?: string; status?: string }): Promise<StorageResult<SupplierQuote[]>>;
  updateSupplierQuote(tenantId: string, quote: SupplierQuote): Promise<StorageResult<SupplierQuote>>;

  // Phase 8c (P2P-002): Supplier Invoice + Three-Way Match
  saveSupplierInvoice(tenantId: string, inv: SupplierInvoice, lines: SupplierInvoiceLine[], idempotencyKey: string): Promise<StorageResult<SupplierInvoice>>;
  getSupplierInvoice(tenantId: string, invoiceId: string): Promise<StorageResult<{ invoice: SupplierInvoice; lines: SupplierInvoiceLine[] } | null>>;
  listSupplierInvoices(tenantId: string, filter?: { status?: string; poId?: string; vendorId?: string }): Promise<StorageResult<SupplierInvoice[]>>;
  updateSupplierInvoice(tenantId: string, inv: SupplierInvoice): Promise<StorageResult<SupplierInvoice>>;

  // Phase 16 (REC-001)
  getInventoryIntegrityAggregates(tenantId: string): Promise<StorageResult<InventoryIntegrityRow[]>>;
  // Phase 18 (SCOPE-001): per-user warehouse scope
  listUserWarehouseAccess(tenantId: string, userId: string): Promise<StorageResult<string[]>>;
  setUserWarehouseAccess(tenantId: string, userId: string, warehouseIds: string[], actorId: string, idempotencyKey: string): Promise<StorageResult<string[]>>;




  
  createStockTransfer(tenantId: string, transfer: StockTransfer, lines: StockTransferLine[], idempotencyKey: string): Promise<StorageResult<StockTransfer>>;
  postStockTransferAtomic(tenantId: string, input: PostStockTransferAtomicInput, idempotencyKey: string): Promise<StorageResult<StockTransfer>>;
  getStockTransfer(tenantId: string, transferId: string): Promise<StorageResult<{ transfer: StockTransfer; lines: StockTransferLine[] } | null>>;
  listStockTransfers(tenantId: string, filter?: { status?: string; warehouseId?: string }): Promise<StorageResult<StockTransfer[]>>;
  updateStockTransferStatus(tenantId: string, transferId: string, status: StockTransferStatus, actorId: string, actorName: string, idempotencyKey: string): Promise<StorageResult<StockTransfer>>;
  
  createStockCount(tenantId: string, count: StockCount, lines: StockCountLine[], idempotencyKey: string): Promise<StorageResult<StockCount>>;
  getStockCount(tenantId: string, countId: string): Promise<StorageResult<{ count: StockCount; lines: StockCountLine[] } | null>>;
  listStockCounts(tenantId: string, filter?: { warehouseId?: string; status?: string }): Promise<StorageResult<StockCount[]>>;
  updateStockCountStatus(tenantId: string, countId: string, status: StockCountStatus, actorId: string, actorName: string, journalEntryId?: string, idempotencyKey?: string): Promise<StorageResult<StockCount>>;
  
  saveItemBatch(tenantId: string, batch: ItemBatch): Promise<StorageResult<ItemBatch>>;
  listItemBatches(tenantId: string, itemId?: string, warehouseId?: string): Promise<StorageResult<ItemBatch[]>>;
  
  saveItemSerial(tenantId: string, serial: ItemSerial): Promise<StorageResult<ItemSerial>>;
  listItemSerials(tenantId: string, itemId?: string, warehouseId?: string): Promise<StorageResult<ItemSerial[]>>;

  // ============================================================================
  // Phase 7.6: Multi-Line Upgrades, Print, Returns, Stock Cards, Attachments & Barcodes
  // ============================================================================
  saveStockDocument(tenantId: string, doc: StockDocument, idempotencyKey: string): Promise<StorageResult<StockDocument>>;
  postStockDocumentAtomic(tenantId: string, input: PostStockDocumentAtomicInput, idempotencyKey: string): Promise<StorageResult<StockDocument>>;
  getStockDocument(tenantId: string, docId: string): Promise<StorageResult<StockDocument | null>>;
  listStockDocuments(tenantId: string, filter?: { warehouseId?: string; documentType?: StockDocumentType; limit?: number }): Promise<StorageResult<StockDocument[]>>;

  saveCustodyExpenseVoucher(tenantId: string, voucher: CustodyExpenseVoucher, idempotencyKey: string): Promise<StorageResult<CustodyExpenseVoucher>>;
  getCustodyExpenseVoucher(tenantId: string, voucherId: string): Promise<StorageResult<CustodyExpenseVoucher | null>>;
  listCustodyExpenseVouchers(tenantId: string, custodyId?: string): Promise<StorageResult<CustodyExpenseVoucher[]>>;
  reverseCustodyExpenseVoucher(tenantId: string, voucherId: string, reversedBy: string, idempotencyKey: string): Promise<StorageResult<CustodyExpenseVoucher>>;

  saveDocumentAttachment(tenantId: string, attachment: DocumentAttachment): Promise<StorageResult<DocumentAttachment>>;
  listDocumentAttachments(tenantId: string, documentType: string, documentId: string): Promise<StorageResult<DocumentAttachment[]>>;

  saveItemPrice(tenantId: string, price: ItemPrice): Promise<StorageResult<ItemPrice>>;
  getItemPrices(tenantId: string, itemId: string): Promise<StorageResult<ItemPrice[]>>;

  // Tenant Scoping & Isolation
  withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
}

// ============================================================================
// Phase 7.6 Interfaces: Multi-Line Upgrades, Returns & Attachments
// ============================================================================
export type StockDocumentType = 'RECEIPT' | 'ISSUE' | 'RETURN_RECEIPT' | 'RETURN_ISSUE' | 'COUNT_ADJUSTMENT';

export interface StockDocumentLine {
  id: string;
  tenantId: string;
  companyId: string;
  documentId: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  uom: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  notes?: string;
}

// Phase 10 (STK-ATOMIC-001): everything needed to post one stock document in a single all-or-nothing transaction
// Phase 14 (ACC-AUTO-001)
export interface StockAccountingConfig {
  tenantId: string;
  autoPostEnabled: boolean;
  grirAccountCode: string;
  inTransitAccountCode: string;
  defaultInventoryAccountCode: string;
  defaultCogsAccountCode: string;
  /** FIX-J1: shortage / count loss expense (must exist in COA) */
  adjustmentExpenseAccountCode: string;
  /** FIX-J1: count surplus gain (must exist in COA) */
  adjustmentGainAccountCode: string;
  /** FIX-J1: clearing for purchase returns (typically trade payables) */
  purchaseReturnClearingAccountCode: string;
  updatedBy?: string;
  updatedAt?: string;
}
export function defaultStockAccountingConfig(tenantId: string): StockAccountingConfig {
  return {
    tenantId,
    autoPostEnabled: false,
    grirAccountCode: '2106',
    inTransitAccountCode: '1109',
    defaultInventoryAccountCode: '1105',
    defaultCogsAccountCode: '5101',
    adjustmentExpenseAccountCode: '5209',
    adjustmentGainAccountCode: '4203',
    purchaseReturnClearingAccountCode: '2101',
  };
}

// Phase 13 (COST-001): selectable inventory costing -------------------------------------------------
export interface InventorySettings {
  tenantId: string;
  defaultValuationMethod: 'WEIGHTED_AVERAGE' | 'FIFO' | 'SPECIFIC_LOT';
  allowNegativeStock: boolean;
  overReceiptTolerancePct: number;
  updatedBy?: string;
  updatedAt?: string;
}

export function defaultInventorySettings(tenantId: string): InventorySettings {
  return { tenantId, defaultValuationMethod: 'WEIGHTED_AVERAGE', allowNegativeStock: false, overReceiptTolerancePct: 0 };
}

export interface CostLayerRow { id: string; poNumber?: string | null; remainingQty: number; unitCost: number; }
export type CostLayerPlan =
  | { ok: true; takes: Array<{ layerId: string; qty: number; unitCost: number; newRemaining: number }>; totalCost: number; unitCost: number; code?: undefined; available?: undefined }
  | { ok: false; code: 'insufficient-stock' | 'insufficient-lot-stock'; available: number; takes?: undefined; totalCost?: undefined; unitCost?: undefined };

// Pure FIFO / SPECIFIC_LOT consumption plan. `layers` must already be in consumption order (oldest first).
// SPECIFIC_LOT with a PO number consumes ONLY the layers of that PO; without a PO number it behaves as FIFO.
export function planCostLayerConsumption(layers: CostLayerRow[], quantity: number, method: 'FIFO' | 'SPECIFIC_LOT', poNumber?: string | null): CostLayerPlan {
  const EPS = 0.00005;
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const qty = Math.abs(quantity);
  const lot = method === 'SPECIFIC_LOT' && !!poNumber;
  const pool = lot ? layers.filter(l => l.poNumber === poNumber) : layers;
  const available = r4(pool.reduce((s, l) => s + Math.max(0, Number(l.remainingQty)), 0));
  if (available + EPS < qty) return { ok: false, code: lot ? 'insufficient-lot-stock' : 'insufficient-stock', available };
  const takes: Array<{ layerId: string; qty: number; unitCost: number; newRemaining: number }> = [];
  let left = qty;
  let total = 0;
  for (const l of pool) {
    if (left <= EPS) break;
    const rem = Number(l.remainingQty);
    if (rem <= EPS) continue;
    const take = Math.min(rem, left);
    takes.push({ layerId: l.id, qty: take, unitCost: Number(l.unitCost), newRemaining: r4(rem - take) });
    total += take * Number(l.unitCost);
    left = r4(left - take);
  }
  total = r4(total);
  return { ok: true, takes, totalCost: total, unitCost: qty > 0 ? r4(total / qty) : 0 };
}

export interface PostStockDocumentAtomicInput {
  doc: StockDocument;            // doc.lines and doc.movements are filled, same order and count (line <-> movement)
  movements: StockMovement[];    // same elements as doc.movements
  batches?: ItemBatch[];
  serials?: ItemSerial[];
  allowNegative?: boolean;       // default false: an outgoing movement that would make the balance negative is rejected (422)
  // Deviation from the spec text (needed by returnStock): record the movement cost AS PROVIDED instead of the locked
  // weighted-average cost. The stock VALUE math is unchanged either way (it always uses the locked average).
  useProvidedCost?: boolean;
}

// Phase 11 (STK-ATOMIC-002): one all-or-nothing transfer step (send or receive)
export interface PostStockTransferAtomicInput {
  mode: 'DISPATCH' | 'RECEIVE';
  transfer: StockTransfer;       // DISPATCH: status IN_TRANSIT; RECEIVE: only transfer.id is used (the row is re-read under lock)
  lines: StockTransferLine[];    // DISPATCH: the new lines; RECEIVE: ignored (lines are read inside the transaction)
  actorId: string;
  actorName: string;
}

export interface StockDocument {
  id: string;
  tenantId: string;
  companyId: string;
  documentNumber: string;
  documentType: StockDocumentType;
  warehouseId: string;
  warehouseNameAr?: string;
  status: 'POSTED' | 'CANCELLED';
  totalQuantity: number;
  totalCost: number;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  notes?: string;
  lines: StockDocumentLine[];
  movements?: StockMovement[];
  performedBy: string;
  performedByName: string;
  idempotencyKey: string;
  createdAt: string;
  postedAt: string;
  // Phase 14 (ACC-AUTO-001)
  journalEntryId?: string;
  journalStatus?: 'NONE' | 'POSTED' | 'PENDING_RETRY';
}

export interface CustodyExpenseLine {
  id: string;
  tenantId: string;
  voucherId: string;
  lineNumber: number;
  expenseCategory: string;
  expenseAccountCode: string;
  amount: number;
  costCenterId?: string;
  description?: string;
  receiptNumber?: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface CustodyExpenseVoucher {
  id: string;
  tenantId: string;
  companyId: string;
  voucherNumber: string;
  custodyId: string;
  totalAmount: number;
  notes?: string;
  receiptNumber?: string;
  lines: CustodyExpenseLine[];
  journalEntryId?: string;
  recordedBy: string;
  recordedByName: string;
  status: 'POSTED' | 'REVERSED';
  createdAt: string;
  idempotencyKey: string;
}

export interface DocumentAttachment {
  id: string;
  tenantId: string;
  companyId: string;
  documentType:
    | 'JOURNAL_ENTRY'
    | 'CUSTODY_VOUCHER'
    | 'CUSTODY_SETTLEMENT'
    | 'EXPENSE_CLAIM'
    | 'STOCK_RECEIPT'
    | 'STOCK_ISSUE'
    | 'STOCK_TRANSFER'
    | 'STOCK_COUNT'
    | 'STOCK_RETURN';
  documentId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy: string;
  uploadedByName?: string;
  createdAt: string;
}

export interface ItemPrice {
  id: string;
  tenantId: string;
  itemId: string;
  priceType: 'DEFAULT_SELLING' | 'DEFAULT_PURCHASE' | 'MIN_SELLING' | 'WHOLESALE';
  amount: number;
  currency: string;
  isDefault: boolean;
  createdAt: string;
}

export interface ItemLedgerEntry {
  id: string;
  timestamp: string;
  documentType: string;
  documentNumber: string;
  warehouseId: string;
  warehouseNameAr?: string;
  movementType: string;
  quantityIn: number;
  quantityOut: number;
  unitCost: number;
  totalCost: number;
  runningQuantity: number;
  runningAverageCost: number;
  runningTotalValue: number;
  batchNumber?: string;
  notes?: string;
  performedByName?: string;
}

export interface ItemLedgerReport {
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  uom: string;
  warehouseId?: string;
  openingQty: number;
  openingAvgCost: number;
  openingTotalValue: number;
  entries: ItemLedgerEntry[];
  closingQty: number;
  closingAvgCost: number;
  closingTotalValue: number;
  fromDate?: string;
  toDate?: string;
}
