/**
 * @file HistoricalQueryService.ts
 * @description Historical Financial "As Of" Query Service for A.N ERP (v7.1 / Phase 2)
 * Strictly conforms to Section 2D.
 * Retrieves point-in-time account balances and statements as of a past date,
 * completely ignoring subsequent posted entries. Runs exclusively via StoragePort.
 */

import { StoragePort, StorageResult } from '../storage/StoragePort';

export interface AsOfBalanceResult {
  tenantId: string;
  accountCode: string;
  accountNameAr: string;
  asOfDate: string;
  debitTotal: number;
  creditTotal: number;
  netBalance: number;
  currency: string;
}

export interface AsOfStatementLine {
  date: string;
  entryCode: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface AsOfStatementResult {
  tenantId: string;
  accountCode: string;
  accountNameAr: string;
  asOfDate: string;
  openingBalance: number;
  closingBalance: number;
  lines: AsOfStatementLine[];
}

export class HistoricalQueryService {
  private readonly port: StoragePort;

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * Retrieves account balance strictly as of specified date (ignoring subsequent entries).
   */
  public async getAccountBalanceAsOf(
    tenantId: string,
    accountCode: string,
    asOfDate: string
  ): Promise<StorageResult<AsOfBalanceResult>> {
    // 1. Fetch account metadata
    const accountRes = await this.port.getAccount(tenantId, accountCode);
    if (!accountRes.success || !accountRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/account-not-found',
          title: 'الحساب غير موجود',
          status: 404,
          detail: `تعذر العثور على الحساب (${accountCode}) في دليل الحسابات.`,
        },
      };
    }

    const account = accountRes.data;

    // 2. Query balance as of date via StoragePort
    const balanceRes = await this.port.getAccountBalanceAsOf(tenantId, accountCode, asOfDate);
    if (!balanceRes.success || !balanceRes.data) {
      return {
        success: false,
        error: balanceRes.error,
      };
    }

    return {
      success: true,
      data: {
        tenantId,
        accountCode,
        accountNameAr: account.nameAr,
        asOfDate,
        debitTotal: balanceRes.data.debitTotal,
        creditTotal: balanceRes.data.creditTotal,
        netBalance: balanceRes.data.balance,
        currency: account.currency || 'SAR',
      },
    };
  }

  /**
   * Generates a detailed statement of movements up to the asOfDate.
   */
  public async getStatementAsOf(
    tenantId: string,
    accountCode: string,
    asOfDate: string
  ): Promise<StorageResult<AsOfStatementResult>> {
    const accountRes = await this.port.getAccount(tenantId, accountCode);
    if (!accountRes.success || !accountRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/account-not-found',
          title: 'الحساب غير موجود',
          status: 404,
          detail: `تعذر العثور على الحساب (${accountCode}) في دليل الحسابات.`,
        },
      };
    }

    const entriesRes = await this.port.listJournalEntries(tenantId);
    if (!entriesRes.success || !entriesRes.data) {
      return {
        success: false,
        error: entriesRes.error,
      };
    }

    const targetDate = new Date(asOfDate).getTime();

    // Filter only posted entries on or before asOfDate that touch this account
    const matchingLines: AsOfStatementLine[] = [];
    let running = 0;

    const sortedEntries = entriesRes.data
      .filter((e) => e.status === 'POSTED' && new Date(e.date).getTime() <= targetDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const entry of sortedEntries) {
      for (const line of entry.lines) {
        if (line.accountCode === accountCode) {
          const debit = Number(line.debit) || 0;
          const credit = Number(line.credit) || 0;
          running += debit - credit;
          matchingLines.push({
            date: entry.date,
            entryCode: entry.code,
            description: line.description || entry.description,
            debit,
            credit,
            runningBalance: running,
          });
        }
      }
    }

    return {
      success: true,
      data: {
        tenantId,
        accountCode,
        accountNameAr: accountRes.data.nameAr,
        asOfDate,
        openingBalance: 0,
        closingBalance: running,
        lines: matchingLines,
      },
    };
  }
}
