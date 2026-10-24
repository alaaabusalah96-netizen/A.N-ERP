/**
 * @file PostingEngine.ts
 * @description Core Posting Engine for A.N ERP (v7.1)
 * Enforces fundamental accounting invariants and atomic posting.
 * Dependency injection of StoragePort only.
 * NO internal Map, Set, or in-memory state permitted in class.
 */

import { StoragePort, StorageResult, JournalEntry } from '../storage/StoragePort';

export class PostingEngine {
  private readonly port: StoragePort;

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * PRECONDITION:
   * 1. lines array must contain >= 2 lines.
   * 2. Total Debit must strictly equal Total Credit (zero difference).
   * 3. Total amount must be strictly positive (> 0).
   * 
   * POSTCONDITION:
   * Document is recorded via StoragePort in status DRAFT.
   */
  public async draftEntry(
    tenantId: string,
    entry: JournalEntry,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>> {
    const validationError = this.validateBalance(entry);
    if (validationError) {
      return { success: false, error: validationError };
    }

    return this.port.createJournalEntry(tenantId, entry, idempotencyKey);
  }

  /**
   * PRECONDITION:
   * 1. Entry exists in StoragePort for tenant.
   * 2. Status is APPROVED or PENDING_POST.
   * 3. Accounts are active and balanced.
   * 
   * POSTCONDITION:
   * 1. Entry status changed to POSTED.
   * 2. Account balances mutated atomically across ledger accounts.
   * 3. If any step fails, StoragePort guarantees transaction rollback.
   */
  public async postEntry(
    tenantId: string,
    entryId: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>> {
    if (!tenantId || !entryId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'معايير الترحيل غير مكتملة',
          status: 400,
          detail: 'معرف المستأجر ومعرف السند مطلوبان لتنفيذ الترحيل.',
        },
      };
    }

    // Verify entry exists and is balanced before committing
    const existingResult = await this.port.getJournalEntry(tenantId, entryId);
    if (!existingResult.success || !existingResult.data) {
      return {
        success: false,
        error: existingResult.error || {
          type: 'https://api.an-erp.local/errors/entry-not-found',
          title: 'السند غير موجود',
          status: 404,
          detail: `تعذر العثور على القيد المحاسبي برقم ${entryId}.`,
        },
      };
    }

    const entry = existingResult.data;
    if (entry.status === 'POSTED') {
      // Idempotency / already posted
      return { success: true, data: entry };
    }

    const validationError = this.validateBalance(entry);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // Wave 7.5E & Section 13.1: Fiscal Period Gating
    const periodRes = await this.port.getPeriodForDate(tenantId, entry.date);
    if (periodRes.success && periodRes.data && periodRes.data.status === 'CLOSED') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/closed-fiscal-period',
          title: 'الفترة المالية مقفلة',
          status: 422,
          detail: `لا يمكن ترحيل القيد في فترة محاسبية مقفلة (${periodRes.data.code}) إلا بعد إعادة فتحها رسمياً وتوثيق المبرر (بند 13.1).`,
        },
      };
    }

    // Atomic post in StoragePort
    return this.port.postJournalEntry(tenantId, entryId, idempotencyKey);
  }

  /**
   * Wave 7.5E & Section 13.1: Immutable Posted Entry Invariant
   * PRECONDITION:
   * Only DRAFT or non-posted entries can be deleted.
   * POSTED / REVERSED entries are strictly permanent. Correction is only via reverseEntry.
   */
  public async deleteEntry(
    tenantId: string,
    entryId: string
  ): Promise<StorageResult<void>> {
    const existingResult = await this.port.getJournalEntry(tenantId, entryId);
    if (!existingResult.success || !existingResult.data) {
      return {
        success: false,
        error: existingResult.error || {
          type: 'https://api.an-erp.local/errors/entry-not-found',
          title: 'السند غير موجود',
          status: 404,
          detail: `تعذر العثور على القيد المحاسبي برقم ${entryId}.`,
        },
      };
    }

    const entry = existingResult.data;
    if (entry.status === 'POSTED' || entry.status === 'REVERSED') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/immutable-posted-entry',
          title: 'حظر حذف القيد المعتمد',
          status: 403,
          detail: 'ممنوع نظامياً: لا يجوز حذف أو تعديل قيد محاسبي مرحل (POSTED) بحكم الثوابت المحاسبية (بند 13.1). التصحيح يتم حصرًا عبر قيد عكسي.',
        },
      };
    }

    return this.port.deleteJournalEntry(tenantId, entryId);
  }

  /**
   * PRECONDITION:
   * Original entry is POSTED.
   * 
   * POSTCONDITION:
   * Generates inverse journal entry, posts it atomically, and marks original as REVERSED.
   */
  public async reverseEntry(
    tenantId: string,
    entryId: string,
    reason: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>> {
    return this.port.reverseJournalEntry(tenantId, entryId, reason, idempotencyKey);
  }

  /**
   * Fundamental Accounting Invariant: Sum(Debit) == Sum(Credit)
   */
  private validateBalance(entry: JournalEntry) {
    if (!entry.lines || entry.lines.length < 2) {
      return {
        type: 'https://api.an-erp.local/errors/invalid-lines',
        title: 'عدد أطراف القيد غير كافٍ',
        status: 422,
        detail: 'يجب أن يحتوي القيد المحاسبي على طرفين على الأقل (مدين ودائن).',
      };
    }

    const totalDebit = entry.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const totalCredit = entry.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);

    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.0001) {
      return {
        type: 'https://api.an-erp.local/errors/unbalanced-entry',
        title: 'القيد غير متوازن محاسبياً',
        status: 422,
        detail: `مجموع المدين (${totalDebit}) لا يساوي مجموع الدائن (${totalCredit}). الفارق: ${diff}`,
      };
    }

    if (totalDebit <= 0) {
      return {
        type: 'https://api.an-erp.local/errors/zero-amount',
        title: 'قيمة القيد صفرية',
        status: 422,
        detail: 'لا يمكن إنشاء قيد محاسبي بمبلغ إجمالي يساوي صفراً.',
      };
    }

    return null;
  }
}
