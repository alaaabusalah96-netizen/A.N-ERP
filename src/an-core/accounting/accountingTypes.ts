/**
 * @file accountingTypes.ts
 * @description Domain types for Phase 4 — Accounting Core
 * All models adhere to the A.N ERP business rules, multi-tenancy, and invariant guarantees.
 */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountNature = 'DEBIT' | 'CREDIT';

export interface ChartAccount {
  code: string;
  parentCode?: string | null;
  tenantId: string;
  nameAr: string;
  nameEn?: string;
  type: AccountType;
  nature: AccountNature;
  currency: string;
  debitBalance: number;
  creditBalance: number;
  balance: number;
  isActive: boolean;
  isParent: boolean;
  level: number;
  notes?: string;
}

export interface FiscalPeriod {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  isClosed: boolean;
  closedAt?: string;
  closedBy?: string;
  closingEntryId?: string;
  reopenReason?: string;
  createdAt?: string;
}

export type DimensionType = 'BRANCH' | 'COST_CENTER' | 'PROJECT' | 'SITE' | 'SEASON';

export interface AccountingDimension {
  id: string;
  tenantId: string;
  type: DimensionType;
  code: string;
  nameAr: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
}

export interface ItemUnit {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  symbol: string;
  conversionFactor: number;
  baseUnitId?: string | null;
  createdAt?: string;
}

export interface AccountingItem {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  type: 'STOCK' | 'SERVICE';
  unitId?: string;
  unitNameAr?: string;
  averageCost: number;
  salePrice: number;
  incomeAccountCode?: string;
  expenseAccountCode?: string;
  assetAccountCode?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
}

export interface BudgetPlan {
  id: string;
  tenantId: string;
  fiscalYear: number;
  accountCode: string;
  accountNameAr?: string;
  monthlyAllocations: Record<number, number>; // month 1-12 => amount
  totalBudget: number;
  actualSpent: number;
  variance: number;
  variancePercentage: number;
  policy: 'WARN' | 'BLOCK';
  createdAt?: string;
}

export interface RecurringEntry {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  nextRunDate: string;
  isActive: boolean;
  autoPost: boolean;
  entryPayload: {
    description: string;
    type: string;
    lines: Array<{
      accountCode: string;
      description: string;
      costCenter?: string;
      debit: number;
      credit: number;
      dimensionBranch?: string;
      dimensionProject?: string;
    }>;
  };
  lastRunDate?: string;
  createdAt?: string;
}

export interface BalanceCheckLog {
  id: string;
  tenantId: string;
  timestamp: string;
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  discrepancy: number;
  checkedAccountsCount: number;
  checkedEntriesCount: number;
  status: 'BALANCED' | 'DISCREPANCY_DETECTED' | 'SIMULATED_TEST';
  details?: Record<string, any>;
}

// 4F: Three Financial Statements Contract
export interface FinancialStatementLine {
  code: string;
  nameAr: string;
  amount: number;
  isTotal?: boolean;
  isSubtotal?: boolean;
  level?: number;
}

export interface IncomeStatement {
  tenantId: string;
  tenantNameAr: string;
  periodId?: string;
  periodNameAr: string;
  currency: string;
  asOfDate: string;
  operatingRevenues: FinancialStatementLine[];
  totalOperatingRevenues: number;
  costOfRevenues: FinancialStatementLine[];
  totalCostOfRevenues: number;
  grossProfit: number;
  operatingExpenses: FinancialStatementLine[];
  totalOperatingExpenses: number;
  operatingProfit: number;
  otherIncomesAndExpenses: FinancialStatementLine[];
  netProfit: number;
}

export interface BalanceSheet {
  tenantId: string;
  tenantNameAr: string;
  periodId?: string;
  periodNameAr: string;
  currency: string;
  asOfDate: string;
  currentAssets: FinancialStatementLine[];
  totalCurrentAssets: number;
  nonCurrentAssets: FinancialStatementLine[];
  totalNonCurrentAssets: number;
  totalAssets: number;
  currentLiabilities: FinancialStatementLine[];
  totalCurrentLiabilities: number;
  nonCurrentLiabilities: FinancialStatementLine[];
  totalNonCurrentLiabilities: number;
  totalLiabilities: number;
  equityItems: FinancialStatementLine[];
  currentPeriodProfit: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  discrepancy: number; // Must be strictly 0.0000
}

export interface CashFlowStatement {
  tenantId: string;
  tenantNameAr: string;
  periodId?: string;
  periodNameAr: string;
  currency: string;
  asOfDate: string;
  operatingActivities: {
    netIncome: number;
    adjustmentsNonCash: FinancialStatementLine[];
    workingCapitalChanges: FinancialStatementLine[];
    netCashFromOperating: number;
  };
  investingActivities: {
    items: FinancialStatementLine[];
    netCashFromInvesting: number;
  };
  financingActivities: {
    items: FinancialStatementLine[];
    netCashFromFinancing: number;
  };
  netChangeInCash: number;
  beginningCash: number;
  endingCash: number;
  verifiedWithTrialBalanceCash: boolean;
}

export interface TrialBalanceReport {
  tenantId: string;
  tenantNameAr: string;
  periodNameAr: string;
  asOfDate: string;
  currency: string;
  rows: Array<{
    code: string;
    nameAr: string;
    type: AccountType;
    debitBalance: number;
    creditBalance: number;
    netBalance: number;
    nature: AccountNature;
  }>;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  difference: number;
}
