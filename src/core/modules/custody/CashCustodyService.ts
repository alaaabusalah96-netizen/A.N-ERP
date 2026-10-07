/**
 * @file CashCustodyService.ts
 * @description Core Domain Service for Cash Custody Module (Phase 5 - Module 1 of 15)
 * Handles Open, Expense Recording, Periodic Settlement via PostingEngine, and HR Clearance Check.
 * Strictly adheres to SoD (Section 7.1), Idempotency (8.1), and Engine Integration rules.
 */

import {
  StoragePort,
  StorageResult,
  CashCustody,
  CashCustodyTransaction,
  CashCustodySettlement,
  JournalEntry,
  JournalLine,
  CustodyExpenseVoucher,
  CustodyExpenseLine,
} from '../../storage/StoragePort';
import { PostingEngine } from '../../engines/PostingEngine';
import { DomainEventBus } from '../../events/DomainEventBus';
import { CashCustodyModuleManifest } from './CashCustodyManifest';

export interface OpenCustodyPayload {
  companyId?: string;
  employeeId: string;
  employeeName: string;
  branchId?: string;
  branchName?: string;
  costCenterId: string;
  costCenterName?: string;
  allocatedAmount: number;
  currency?: string;
  roleLimit?: number;
  employeeRole?: string;
  openedBy: string;
  openedByName: string;
  notes?: string;
  idempotencyKey: string;
}

export interface CustodyExpenseLineInput {
  expenseCategory: string;
  expenseAccountCode?: string;
  description: string;
  amount: number;
  costCenterId?: string;
  costCenterName?: string;
  receiptNumber?: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface RecordExpensePayload {
  companyId?: string;
  custodyId: string;
  amount?: number;
  expenseCategory?: string;
  expenseAccountCode?: string;
  description?: string;
  receiptNumber?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  costCenterId?: string;
  lines?: CustodyExpenseLineInput[];
  recordedBy: string;
  recordedByName: string;
  idempotencyKey: string;
}

export interface SettleCustodyPayload {
  companyId?: string;
  custodyId: string;
  transactionIds?: string[];
  replenishmentAccountCode?: string; // Default '1010' (الصندوق) or '1020' (البنك)
  varianceAmount?: number; // 0, or difference
  varianceType?: 'NONE' | 'SURPLUS' | 'DEFICIT';
  settledBy: string;
  settledByName: string;
  notes?: string;
  idempotencyKey: string;
}

export class CashCustodyService {
  private readonly port: StoragePort;
  private readonly postingEngine: PostingEngine;

  constructor(port: StoragePort, postingEngine?: PostingEngine) {
    this.port = port;
    this.postingEngine = postingEngine || new PostingEngine(port);
  }

  /**
   * 5E — Check if Cash Custody module is enabled for tenant
   */
  public async isModuleEnabled(tenantId: string): Promise<boolean> {
    const modulesRes = await this.port.getTenantModules(tenantId);
    if (!modulesRes.success || !modulesRes.data) {
      return true; // Default fallback for basic tenants
    }
    const custodyMod = modulesRes.data.find(
      (m) => m.moduleId === 'custody' && m.isEnabled
    );
    return !!custodyMod;
  }

  /**
   * 5A — فتح عهدة (Open Cash Custody)
   * Allocates custody amount to employee/branch, linked to a cost center, with role limit enforcement.
   */
  public async openCustody(
    tenantId: string,
    payload: OpenCustodyPayload
  ): Promise<StorageResult<CashCustody>> {
    if (!payload.employeeId || !payload.employeeName) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'بيانات الموظف غير مكتملة',
          status: 400,
          detail: 'يجب تحديد معرف واسم الموظف المسؤول عن العهدة النقدية.',
        },
      };
    }

    if (!payload.costCenterId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'مركز التكلفة إلزامي',
          status: 400,
          detail: 'فتح العهدة النقدية يتطلب ربطها بمركز تكلفة معتمد (بُعد من 4C).',
        },
      };
    }

    if (!payload.allocatedAmount || payload.allocatedAmount <= 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'المبلغ غير صالح',
          status: 400,
          detail: 'يجب أن يكون مبلغ العهدة المخصص قيمة موجبة أكبر من صفر.',
        },
      };
    }

    // Role Limit Check (5A)
    const role = payload.employeeRole || 'accountant';
    const configuredLimit =
      payload.roleLimit ||
      CashCustodyModuleManifest.defaultRoleLimits[role] ||
      15000;

    if (payload.allocatedAmount > configuredLimit) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/role-limit-exceeded',
          title: 'تجاوز الحد الأقصى لدور الموظف',
          status: 400,
          detail: `مبلغ العهدة المطلوب (${payload.allocatedAmount}) يتجاوز السقف المسموح به للدور (${role}: ${configuredLimit} ر.س).`,
        },
      };
    }

    const custodyId = `cst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const custodyCode = `CST-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newCustody: CashCustody = {
      id: custodyId,
      tenantId,
      companyId: payload.companyId || tenantId,
      custodyCode,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      branchId: payload.branchId,
      branchName: payload.branchName,
      costCenterId: payload.costCenterId,
      costCenterName: payload.costCenterName || 'المركز العام',
      currency: payload.currency || 'SAR',
      allocatedAmount: payload.allocatedAmount,
      currentBalance: payload.allocatedAmount,
      maxLimitPerRole: configuredLimit,
      status: 'OPEN',
      openedBy: payload.openedBy,
      openedByName: payload.openedByName,
      openedAt: new Date().toISOString(),
      notes: payload.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saveRes = await this.port.createCashCustody(
      tenantId,
      newCustody,
      payload.idempotencyKey
    );

    if (saveRes.success && saveRes.data) {
      await DomainEventBus.publish({
        eventType: 'CUSTODY_OPENED',
        tenantId,
        actorId: payload.openedBy,
        actorName: payload.openedByName,
        payload: {
          custodyId: saveRes.data.id,
          custodyCode: saveRes.data.custodyCode,
          employeeId: saveRes.data.employeeId,
          allocatedAmount: saveRes.data.allocatedAmount,
        },
        idempotencyKey: payload.idempotencyKey,
      });
    }

    return saveRes;
  }

  /**
   * 5B — تسجيل مصروفات من العهدة (Record Expense from Custody)
   * Phase 7.6B Upgrade: Multi-line expense voucher with atomic balance validation and single balanced journal entry.
   */
  public async recordExpense(
    tenantId: string,
    payload: RecordExpensePayload
  ): Promise<StorageResult<CashCustodyTransaction & { voucher?: CustodyExpenseVoucher }>> {
    if (!payload.custodyId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'معرف العهدة مطلوب',
          status: 400,
          detail: 'يجب تحديد العهدة النقدية المراد تسجيل المصروف عليها.',
        },
      };
    }

    // Resolve lines (either payload.lines or single expense converted to lines[1])
    const lines: CustodyExpenseLineInput[] =
      payload.lines && payload.lines.length > 0
        ? payload.lines
        : [
            {
              expenseCategory: payload.expenseCategory || 'نثريات وضيافة',
              expenseAccountCode: payload.expenseAccountCode || '5040',
              description: payload.description || 'صرف من العهدة النقدية',
              amount: payload.amount || 0,
              costCenterId: payload.costCenterId,
              receiptNumber: payload.receiptNumber,
              attachmentUrl: payload.attachmentUrl,
              attachmentName: payload.attachmentName,
            },
          ];

    if (lines.length === 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/empty-lines',
          title: 'بنود المصروف فارغة',
          status: 400,
          detail: 'يجب تحديد بند مصروف واحد على الأقل.',
        },
      };
    }

    // Validate each line
    for (const line of lines) {
      if (!line.amount || line.amount <= 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/invalid-parameter',
            title: 'مبلغ المصروف غير صالح',
            status: 400,
            detail: 'يجب أن يكون مبلغ كل بند في المصروف أكبر من صفر.',
          },
        };
      }
      const receiptNo = line.receiptNumber || payload.receiptNumber;
      if (!receiptNo || !receiptNo.trim()) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/proof-required',
            title: 'رقم الفاتورة أو الإيصال إلزامي',
            status: 400,
            detail: 'لا يمكن تسجيل صرف من العهدة دون رقم فاتورة أو إيصال رسمي مطابق للمستند (بند 5B).',
          },
        };
      }
      const attUrl = line.attachmentUrl || payload.attachmentUrl;
      if (!attUrl || !attUrl.trim()) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/proof-required',
            title: 'مرفق إثبات الصرف إلزامي',
            status: 400,
            detail: 'كل صرف من العهدة النقدية يُسجَّل بمرفق إثبات (فاتورة/إيصال) وفق متطلبات الامتثال (بند 5B).',
          },
        };
      }
    }

    // Load custody from storage to verify state and available balance
    const custodyRes = await this.port.getCashCustody(tenantId, payload.custodyId);
    if (!custodyRes.success || !custodyRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/not-found',
          title: 'العهدة غير موجودة',
          status: 404,
          detail: 'لم يتم العثور على سجل العهدة النقدية المحددة.',
        },
      };
    }

    const custody = custodyRes.data;
    if (custody.status !== 'OPEN') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-state',
          title: 'العهدة ليست بحالة مفتوحة',
          status: 400,
          detail: `لا يمكن الصرف من عهدة بحالة (${custody.status}).`,
        },
      };
    }

    const totalAmount = lines.reduce((acc, l) => acc + l.amount, 0);

    // ATOMIC CHECK: Check if totalAmount > custody.currentBalance
    if (totalAmount > custody.currentBalance) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/insufficient-balance',
          title: 'رصيد العهدة غير كافٍ',
          status: 400,
          detail: `الرصيد المتاح حالياً بالعهدة (${custody.currentBalance} ر.س) لا يكفي لتغطية إجمالي مبلغ المصروف (${totalAmount} ر.س). تم إلغاء المعاملة ذرياً.`,
        },
      };
    }

    const voucherId = `cvch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const voucherNumber = `VCH-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const voucherLines: CustodyExpenseLine[] = lines.map((l, idx) => ({
      id: `cvl-${Date.now()}-${idx}`,
      tenantId,
      companyId: payload.companyId || custody.companyId || tenantId,
      voucherId,
      lineNumber: idx + 1,
      expenseCategory: l.expenseCategory,
      expenseAccountCode: l.expenseAccountCode || '5040',
      description: l.description,
      amount: l.amount,
      costCenterId: l.costCenterId || custody.costCenterId,
      costCenterName: l.costCenterName || custody.costCenterName,
      receiptNumber: (l.receiptNumber || payload.receiptNumber || '').trim(),
      attachmentUrl: (l.attachmentUrl || payload.attachmentUrl || '').trim(),
      attachmentName: l.attachmentName || payload.attachmentName || 'فاتورة_مرفقة.pdf',
    }));

    // Post balanced journal entry via PostingEngine for all lines in one entry (7.6B)
    let journalEntryId: string | undefined;
    if (this.postingEngine && totalAmount > 0) {
      const journalLines: JournalLine[] = [];
      let idx = 1;
      // Debit line for each expense line
      for (const vl of voucherLines) {
        journalLines.push({
          id: `line-${idx++}-${voucherId}`,
          accountCode: vl.expenseAccountCode,
          debit: vl.amount,
          credit: 0,
          costCenter: vl.costCenterId,
          description: vl.description,
        });
      }
      // Credit custody account (try 110202, fallback to 1106 or 1010 if not present)
      const custodyAcc = await this.resolveCustodyAccount(tenantId);
      journalLines.push({
        id: `line-${idx}-${voucherId}`,
        accountCode: custodyAcc,
        debit: 0,
        credit: totalAmount,
        costCenter: custody.costCenterId,
        description: `صرف بموجب سند صرف عهدة متعدد البنود ${voucherNumber}`,
      });

      const entryId = `je-cst-${voucherId}`;
      const draftRes = await this.postingEngine.draftEntry(
        tenantId,
        {
          id: entryId,
          code: `JE-CST-${voucherNumber}`,
          tenantId,
          date: new Date().toISOString().split('T')[0],
          type: 'سند صرف عهدة',
          description: `إثبات سند صرف عهدة رقم ${voucherNumber} للموظف ${custody.employeeName}`,
          lines: journalLines,
          totalAmount,
          status: 'APPROVED',
          createdBy: payload.recordedBy,
        },
        `cst-draft-${payload.idempotencyKey}`
      );
      // Repair batch 1 (DEF-P1-003): a voucher is never saved (and never gets a journalEntryId) unless the journal really posted
      if (!draftRes.success || !draftRes.data) {
        return {
          success: false,
          error: draftRes.error || {
            type: 'https://api.an-erp.local/errors/draft-failed',
            title: 'فشل إنشاء مسودة قيد سند الصرف',
            status: 500,
            detail: 'لم يُسجَّل سند الصرف لأن مسودة القيد المحاسبي تعذّر إنشاؤها.',
          },
        };
      }
      const postRes = await this.postingEngine.postEntry(tenantId, entryId, `cst-post-${payload.idempotencyKey}`);
      if (!postRes.success || !postRes.data) {
        return {
          success: false,
          error: postRes.error || {
            type: 'https://api.an-erp.local/errors/posting-failed',
            title: 'فشل ترحيل قيد سند الصرف',
            status: 500,
            detail: 'لم يُسجَّل سند الصرف لأن ترحيل القيد المحاسبي فشل.',
          },
        };
      }
      journalEntryId = entryId;
    }

    const voucher: CustodyExpenseVoucher = {
      id: voucherId,
      tenantId,
      companyId: payload.companyId || custody.companyId || tenantId,
      voucherNumber,
      custodyId: custody.id,
      totalAmount,
      status: 'POSTED',
      receiptNumber: lines[0]?.receiptNumber || payload.receiptNumber,
      notes: lines.map(l => l.description).join(' / '),
      lines: voucherLines,
      journalEntryId,
      recordedBy: payload.recordedBy,
      recordedByName: payload.recordedByName,
      idempotencyKey: payload.idempotencyKey,
      createdAt: new Date().toISOString(),
    };

    await this.port.saveCustodyExpenseVoucher(tenantId, voucher, payload.idempotencyKey);

    // Also record transaction into custody storage so current balance is deducted
    const txId = `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const txCode = `CTX-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const transaction: CashCustodyTransaction & { voucher?: CustodyExpenseVoucher } = {
      id: txId,
      tenantId,
      companyId: payload.companyId || custody.companyId || tenantId,
      transactionCode: txCode,
      custodyId: custody.id,
      amount: totalAmount,
      expenseCategory: voucherLines[0]?.expenseCategory || 'نثريات وضيافة',
      expenseAccountCode: voucherLines[0]?.expenseAccountCode || '5040',
      description: voucher.notes || 'صرف من العهدة النقدية',
      receiptNumber: voucher.receiptNumber || 'REC',
      attachmentUrl: voucherLines[0]?.attachmentUrl || '/attachments/default.pdf',
      attachmentName: voucherLines[0]?.attachmentName || 'فاتورة_مرفقة.pdf',
      costCenterId: custody.costCenterId,
      recordedBy: payload.recordedBy,
      recordedByName: payload.recordedByName,
      status: 'RECORDED',
      transactionDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      idempotencyKey: payload.idempotencyKey,
      voucher,
    };

    const recordRes = await this.port.recordCustodyExpense(
      tenantId,
      transaction,
      payload.idempotencyKey,
      true // voucher was already saved and custody balance deducted atomically once for the document
    );

    if (recordRes.success && recordRes.data) {
      await DomainEventBus.publish({
        eventType: 'CUSTODY_TRANSACTION_RECORDED',
        tenantId,
        actorId: payload.recordedBy,
        actorName: payload.recordedByName,
        payload: {
          custodyId: custody.id,
          transactionId: recordRes.data.id,
          amount: totalAmount,
          receiptNumber: transaction.receiptNumber,
          voucherNumber,
        },
        idempotencyKey: payload.idempotencyKey,
      });
      return { success: true, data: { ...recordRes.data, voucher } };
    }

    return recordRes;
  }

  /**
   * 7.6D — مرتجع مصروف العهدة بقيد عكسي
   */
  public async returnCustodyExpense(
    tenantId: string,
    input: {
      voucherId: string;
      reason?: string;
      performedBy: string;
      performedByName: string;
      idempotencyKey: string;
    }
  ): Promise<StorageResult<CustodyExpenseVoucher>> {
    const vRes = await this.port.getCustodyExpenseVoucher(tenantId, input.voucherId);
    if (!vRes.success || !vRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/voucher-not-found',
          title: 'سند الصرف غير موجود',
          status: 404,
          detail: 'تعذر العثور على سند صرف العهدة المراد إلغاؤه/إرجاعه.',
        },
      };
    }
    const voucher = vRes.data;
    if (voucher.status === 'REVERSED') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/already-cancelled',
          title: 'السند ملغى بالفعل',
          status: 400,
          detail: 'تم إلغاء سند الصرف مسبقاً بقيد عكسي.',
        },
      };
    }

    // Reversal journal entry via PostingEngine
    // Repair batch 1 (DEF-P1-003): runs BEFORE the custody balance is restored, and its result is checked
    if (this.postingEngine && voucher.totalAmount > 0) {
      const journalLines: JournalLine[] = [];
      let idx = 1;
      // Debit custody account
      const custodyAcc = await this.resolveCustodyAccount(tenantId);
      journalLines.push({
        id: `rev-line-${idx++}-${voucher.id}`,
        accountCode: custodyAcc,
        debit: voucher.totalAmount,
        credit: 0,
        description: `إلغاء سند صرف العهدة ${voucher.voucherNumber}`,
      });
      // Credit each expense account
      for (const vl of voucher.lines) {
        journalLines.push({
          id: `rev-line-${idx++}-${voucher.id}`,
          accountCode: vl.expenseAccountCode,
          debit: 0,
          credit: vl.amount,
          costCenter: vl.costCenterId,
          description: `عكس صرف ${vl.description}`,
        });
      }

      const revEntryId = `je-cst-rev-${voucher.id}`;
      const draftRes = await this.postingEngine.draftEntry(
        tenantId,
        {
          id: revEntryId,
          code: `JE-CST-REV-${voucher.voucherNumber}`,
          tenantId,
          date: new Date().toISOString().split('T')[0],
          type: 'عكس سند صرف عهدة',
          description: `قيد عكسي لإلغاء سند صرف عهدة ${voucher.voucherNumber} - ${input.reason || 'إلغاء الصرف'}`,
          lines: journalLines,
          totalAmount: voucher.totalAmount,
          status: 'APPROVED',
          createdBy: input.performedBy,
        },
        `cst-rev-draft-${input.idempotencyKey}`
      );
      if (!draftRes.success || !draftRes.data) {
        return {
          success: false,
          error: draftRes.error || {
            type: 'https://api.an-erp.local/errors/draft-failed',
            title: 'فشل إنشاء مسودة القيد العكسي',
            status: 500,
            detail: 'لم يُلغَ سند الصرف لأن مسودة القيد العكسي تعذّر إنشاؤها.',
          },
        };
      }
      const revPost = await this.postingEngine.postEntry(tenantId, revEntryId, `cst-rev-post-${input.idempotencyKey}`);
      if (!revPost.success || !revPost.data) {
        return {
          success: false,
          error: revPost.error || {
            type: 'https://api.an-erp.local/errors/posting-failed',
            title: 'فشل ترحيل القيد العكسي',
            status: 500,
            detail: 'لم يُلغَ سند الصرف لأن ترحيل القيد العكسي فشل.',
          },
        };
      }
    }

    // Load custody to restore balance (only after the reversal journal really posted)
    const custodyRes = await this.port.getCashCustody(tenantId, voucher.custodyId);
    if (custodyRes.success && custodyRes.data) {
      const custody = custodyRes.data;
      await this.port.updateCashCustody(tenantId, custody.id, {
        currentBalance: custody.currentBalance + voucher.totalAmount,
      });
    }

    return this.port.reverseCustodyExpenseVoucher(tenantId, voucher.id, input.performedBy, input.idempotencyKey);
  }

  /**
   * 5C — التسوية الدورية (Periodic Custody Settlement via PostingEngine)
   * Reconciles actual expenses, posts variance via PostingEngine, and replenishes custody balance.
   * STRICT SoD MANDATE (7.1): Evaluated using database-loaded record; creator cannot settle.
   */
  public async settleCustody(
    tenantId: string,
    payload: SettleCustodyPayload
  ): Promise<
    StorageResult<{
      settlement: CashCustodySettlement;
      journalEntry: JournalEntry;
    }>
  > {
    if (!payload.custodyId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'معرف العهدة مطلوب',
          status: 400,
          detail: 'يجب تحديد العهدة النقدية المراد تسويتها دورياً.',
        },
      };
    }

    // 1. Fetch persistent custody record from StoragePort
    const custodyRes = await this.port.getCashCustody(tenantId, payload.custodyId);
    if (!custodyRes.success || !custodyRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/not-found',
          title: 'العهدة غير موجودة',
          status: 404,
          detail: 'لم يتم العثور على سجل العهدة النقدية المطلوب تسويتها.',
        },
      };
    }
    const custody = custodyRes.data;

    // 1.1 Idempotency Check (Clause 8.1): If this settlement was already processed, return idempotent result
    const existingSettlements = await this.port.listCustodySettlements(tenantId, custody.id);
    if (existingSettlements.success && existingSettlements.data) {
      const alreadySettled = existingSettlements.data.find(
        (s) => s.idempotencyKey === payload.idempotencyKey
      );
      if (alreadySettled) {
        let cachedJe: JournalEntry | undefined;
        if (alreadySettled.journalEntryId) {
          const jeRes = await this.port.getJournalEntry(tenantId, alreadySettled.journalEntryId);
          if (jeRes.success && jeRes.data) {
            cachedJe = jeRes.data;
          }
        }
        return {
          success: true,
          data: {
            settlement: alreadySettled,
            journalEntry: cachedJe || {
              id: alreadySettled.journalEntryId || 'je-cached',
              code: `JE-${alreadySettled.settlementCode}`,
              tenantId,
              date: alreadySettled.settlementDate,
              type: 'قيد تسوية عهدة',
              description: `قيد تسوية عهدة مستعاد عبر الإدهنية: ${alreadySettled.settlementCode}`,
              totalAmount: alreadySettled.totalExpenses,
              status: 'POSTED',
              createdBy: alreadySettled.settledBy,
              lines: [],
            },
          },
        };
      }
    }

    // 2. SO D CHECK (Clause 7.1): Evaluated against the database-loaded record!
    if (custody.openedBy === payload.settledBy) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-conflict',
          title: 'تعارض صلاحيات الرقابة الثنائية (SoD)',
          status: 403,
          detail: `لا يجوز للمستخدم نفسه (${custody.openedByName}) الذي قام بفتح وتخصيص العهدة أن يعتمد تسويتها النهائية (بند 7.1). يتطلب الاعتماد معتمداً مالياً مستقلاً.`,
        },
      };
    }

    // 3. Fetch transactions to include in this settlement
    const allTxRes = await this.port.listCustodyTransactions(tenantId, custody.id);
    if (!allTxRes.success || !allTxRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/storage-error',
          title: 'تعذر جلب حركات العهدة',
          status: 500,
          detail: 'حدث خطأ أثناء تحميل مصروفات العهدة.',
        },
      };
    }

    let pendingTransactions = allTxRes.data.filter((t) => t.status === 'RECORDED');
    if (payload.transactionIds && payload.transactionIds.length > 0) {
      pendingTransactions = pendingTransactions.filter((t) =>
        payload.transactionIds!.includes(t.id)
      );
    }

    if (pendingTransactions.length === 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/no-transactions',
          title: 'لا توجد حركات مصروفات للتسوية',
          status: 400,
          detail: 'العهدة النقدية لا تحتوي على حركات صرف معلقة للتسوية.',
        },
      };
    }

    // Calculate total expenses
    const totalExpenses = pendingTransactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );

    const varianceAmount = Math.abs(Number(payload.varianceAmount || 0));
    const varianceType = payload.varianceType || 'NONE';

    // Calculate replenishment amount needed to restore custody to its original allocated amount
    let replenishmentAmount = totalExpenses;
    if (varianceType === 'DEFICIT') {
      replenishmentAmount += varianceAmount;
    } else if (varianceType === 'SURPLUS') {
      replenishmentAmount -= varianceAmount;
    }

    // 4. Construct atomic balanced Journal Entry for PostingEngine
    const entryId = `je-cst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const replenishmentAccount = payload.replenishmentAccountCode || '1010'; // الصندوق أو البنك

    // Group expense transactions by expenseAccountCode
    const expenseGroups = new Map<string, number>();
    for (const tx of pendingTransactions) {
      const code = tx.expenseAccountCode || '5040';
      const current = expenseGroups.get(code) || 0;
      expenseGroups.set(code, current + Number(tx.amount));
    }

    const journalLines: Array<{
      id: string;
      accountCode: string;
      costCenter?: string;
      debit: number;
      credit: number;
      description: string;
      descriptionAr?: string;
    }> = [];

    // Debit expense accounts
    let lineIdx = 1;
    expenseGroups.forEach((amount, accCode) => {
      journalLines.push({
        id: `line-${entryId}-${lineIdx++}`,
        accountCode: accCode,
        costCenter: custody.costCenterId,
        debit: amount,
        credit: 0,
        description: `إثبات مصروفات عهدة ${custody.custodyCode} - ${custody.employeeName}`,
        descriptionAr: `إثبات مصروفات عهدة ${custody.custodyCode} - ${custody.employeeName}`,
      });
    });

    // Handle variance lines if any
    if (varianceType === 'DEFICIT' && varianceAmount > 0) {
      journalLines.push({
        id: `line-${entryId}-${lineIdx++}`,
        accountCode: '5050',
        costCenter: custody.costCenterId,
        debit: varianceAmount,
        credit: 0,
        description: `إثبات عجز في عهدة ${custody.custodyCode}`,
        descriptionAr: `إثبات عجز في عهدة ${custody.custodyCode}`,
      });
    } else if (varianceType === 'SURPLUS' && varianceAmount > 0) {
      journalLines.push({
        id: `line-${entryId}-${lineIdx++}`,
        accountCode: '4010',
        costCenter: custody.costCenterId,
        debit: 0,
        credit: varianceAmount,
        description: `إثبات زيادة في عهدة ${custody.custodyCode}`,
        descriptionAr: `إثبات زيادة في عهدة ${custody.custodyCode}`,
      });
    }

    // Credit replenishment account (الصندوق الرئيسي أو الحساب البنكي)
    journalLines.push({
      id: `line-${entryId}-${lineIdx++}`,
      accountCode: replenishmentAccount,
      costCenter: custody.costCenterId,
      debit: 0,
      credit: replenishmentAmount,
      description: `صرف شيك / نقدية استعاضة وتجديد عهدة ${custody.custodyCode}`,
      descriptionAr: `صرف شيك / نقدية استعاضة وتجديد عهدة ${custody.custodyCode}`,
    });

    const journalEntry: JournalEntry = {
      id: entryId,
      code: `JE-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
      tenantId,
      date: new Date().toISOString().split('T')[0],
      type: 'قيد تسوية عهدة',
      description: `قيد تسوية واستعاضة عهدة نقدية: ${custody.custodyCode} (${custody.employeeName})`,
      totalAmount: totalExpenses,
      status: 'APPROVED',
      createdBy: payload.settledBy,
      lines: journalLines,
    };

    // 5. Post journal entry via PostingEngine (Draft -> Post)
    const draftRes = await this.postingEngine.draftEntry(
      tenantId,
      journalEntry,
      `${payload.idempotencyKey}-draft`
    );
    if (!draftRes.success || !draftRes.data) {
      return {
        success: false,
        error: draftRes.error || {
          type: 'https://api.an-erp.local/errors/posting-failed',
          title: 'فشل إعداد قيد التسوية',
          status: 500,
          detail: 'تعذر إنشاء مسودة القيد المحاسبي للتسوية.',
        },
      };
    }

    const postRes = await this.postingEngine.postEntry(
      tenantId,
      journalEntry.id,
      `${payload.idempotencyKey}-post`
    );
    if (!postRes.success || !postRes.data) {
      return {
        success: false,
        error: postRes.error || {
          type: 'https://api.an-erp.local/errors/posting-failed',
          title: 'فشل ترحيل قيد التسوية المحاسبي',
          status: 500,
          detail: 'تعذر ترحيل القيد المالي للتسوية عبر محرك الترحيل.',
        },
      };
    }

    // 6. Record Settlement in StoragePort
    const settlementId = `cst-set-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const settlementCode = `SET-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const settlement: CashCustodySettlement = {
      id: settlementId,
      tenantId,
      companyId: payload.companyId || custody.companyId || tenantId,
      settlementCode,
      custodyId: custody.id,
      settlementDate: new Date().toISOString(),
      totalExpenses,
      replenishmentAmount,
      varianceAmount,
      varianceType,
      journalEntryId: postRes.data.id,
      status: 'APPROVED',
      settledBy: payload.settledBy,
      settledByName: payload.settledByName,
      notes: payload.notes,
      createdAt: new Date().toISOString(),
      idempotencyKey: payload.idempotencyKey,
    };

    const saveSettlementRes = await this.port.saveCustodySettlement(
      tenantId,
      settlement,
      payload.idempotencyKey
    );
    if (!saveSettlementRes.success || !saveSettlementRes.data) {
      return {
        success: false,
        error: saveSettlementRes.error || {
          type: 'https://api.an-erp.local/errors/storage-error',
          title: 'فشل حفظ سجل التسوية',
          status: 500,
          detail: 'تعذر حفظ بيانات التسوية في قاعدة البيانات.',
        },
      };
    }

    // 7. Update Custody Balance to Replenished (Back to allocatedAmount)
    await this.port.updateCashCustody(tenantId, custody.id, {
      currentBalance: custody.allocatedAmount,
      status: 'OPEN',
      updatedAt: new Date().toISOString(),
    });

    // 8. Publish Domain Event
    await DomainEventBus.publish({
      eventType: 'CUSTODY_SETTLED',
      tenantId,
      actorId: payload.settledBy,
      actorName: payload.settledByName,
      payload: {
        custodyId: custody.id,
        settlementId: settlement.id,
        journalEntryId: postRes.data.id,
        totalExpenses,
        replenishmentAmount,
      },
      idempotencyKey: payload.idempotencyKey,
    });

    return {
      success: true,
      data: {
        settlement: saveSettlementRes.data,
        journalEntry: postRes.data,
      },
    };
  }

  /**
   * 5D — فحص تصفية العهد عند إنهاء الخدمة (HR Custody Clearance Check)
   * Zero-tolerance rule: No employee termination allowed while an open custody exists.
   */
  public async checkEmployeeClearance(
    tenantId: string,
    employeeId: string
  ): Promise<{
    canTerminate: boolean;
    openCustodiesCount: number;
    openCustodies: CashCustody[];
    totalAllocatedAmount: number;
    reasonAr?: string;
  }> {
    const custodiesRes = await this.port.listCashCustodies(tenantId, {
      employeeId,
      status: 'OPEN',
    });

    const openCustodies =
      custodiesRes.success && custodiesRes.data ? custodiesRes.data : [];

    const totalAllocated = openCustodies.reduce(
      (sum, c) => sum + Number(c.allocatedAmount),
      0
    );

    if (openCustodies.length > 0) {
      return {
        canTerminate: false,
        openCustodiesCount: openCustodies.length,
        openCustodies,
        totalAllocatedAmount: totalAllocated,
        reasonAr: `لا يمكن إنهاء خدمة الموظف لوجود (${openCustodies.length}) عهدة نقدية مفتوحة بمبلغ إجمالي (${totalAllocated} ر.س). يجب تصفيتها أو نقل مسؤوليتها أولاً (بند 5D).`,
      };
    }

    return {
      canTerminate: true,
      openCustodiesCount: 0,
      openCustodies: [],
      totalAllocatedAmount: 0,
    };
  }

  /**
   * 5D — تصفية العهدة وإقفالها (Liquidate & Close Custody)
   */
  public async liquidateCustody(
    tenantId: string,
    custodyId: string,
    liquidatorId: string,
    liquidatorName: string,
    idempotencyKey: string
  ): Promise<StorageResult<CashCustody>> {
    const custodyRes = await this.port.getCashCustody(tenantId, custodyId);
    if (!custodyRes.success || !custodyRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/not-found',
          title: 'العهدة غير موجودة',
          status: 404,
          detail: 'لم يتم العثور على العهدة لتصفيتها.',
        },
      };
    }

    const custody = custodyRes.data;
    if (custody.status === 'CLOSED' || custody.status === 'LIQUIDATED') {
      return {
        success: true,
        data: custody,
      };
    }

    const updated = await this.port.updateCashCustody(tenantId, custodyId, {
      status: 'LIQUIDATED',
      currentBalance: 0,
      closedAt: new Date().toISOString(),
      closedBy: liquidatorId,
      updatedAt: new Date().toISOString(),
    });

    if (updated.success && updated.data) {
      await DomainEventBus.publish({
        eventType: 'CUSTODY_CLOSED',
        tenantId,
        actorId: liquidatorId,
        actorName: liquidatorName,
        payload: {
          custodyId: custody.id,
          employeeId: custody.employeeId,
          action: 'LIQUIDATED',
        },
        idempotencyKey,
      });
    }

    return updated;
  }

  /**
   * 5D — نقل مسؤولية العهدة لموظف آخر (Transfer Custody Responsibility)
   */
  public async transferCustody(
    tenantId: string,
    custodyId: string,
    newEmployeeId: string,
    newEmployeeName: string,
    transferredBy: string,
    transferredByName: string,
    idempotencyKey: string
  ): Promise<StorageResult<CashCustody>> {
    const custodyRes = await this.port.getCashCustody(tenantId, custodyId);
    if (!custodyRes.success || !custodyRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/not-found',
          title: 'العهدة غير موجودة',
          status: 404,
          detail: 'لم يتم العثور على العهدة لنقل مسؤوليتها.',
        },
      };
    }

    const custody = custodyRes.data;
    const prevEmployee = custody.employeeName;

    const updated = await this.port.updateCashCustody(tenantId, custodyId, {
      employeeId: newEmployeeId,
      employeeName: newEmployeeName,
      notes: `${custody.notes || ''} [تم تحويل المسؤولية من ${prevEmployee} إلى ${newEmployeeName} بواسطة ${transferredByName}]`.trim(),
      updatedAt: new Date().toISOString(),
    });

    return updated;
  }

  private async resolveCustodyAccount(tenantId: string): Promise<string> {
    try {
      const acc110202 = await this.port.getAccount(tenantId, '110202');
      if (acc110202.success && acc110202.data && acc110202.data.isActive) {
        return '110202';
      }
      const acc1106 = await this.port.getAccount(tenantId, '1106');
      if (acc1106.success && acc1106.data && acc1106.data.isActive) {
        return '1106';
      }
      const acc1010 = await this.port.getAccount(tenantId, '1010');
      if (acc1010.success && acc1010.data && acc1010.data.isActive) {
        return '1010';
      }
    } catch {
      // intentional: fallback to 110202 if port inspection throws
    }
    return '110202';
  }
}
