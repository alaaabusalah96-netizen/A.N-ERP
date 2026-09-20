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

export interface RecordExpensePayload {
  companyId?: string;
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
   * Each expense requires proof attachment (receipt/invoice) and immediately deducts from available balance.
   */
  public async recordExpense(
    tenantId: string,
    payload: RecordExpensePayload
  ): Promise<StorageResult<CashCustodyTransaction>> {
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

    if (!payload.receiptNumber || !payload.receiptNumber.trim()) {
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

    if (!payload.attachmentUrl || !payload.attachmentUrl.trim()) {
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

    if (!payload.amount || payload.amount <= 0) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'مبلغ المصروف غير صالح',
          status: 400,
          detail: 'يجب أن يكون مبلغ المصروف المسجل قيمة موجبة أكبر من صفر.',
        },
      };
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

    if (payload.amount > custody.currentBalance) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/insufficient-balance',
          title: 'رصيد العهدة غير كافٍ',
          status: 400,
          detail: `الرصيد المتاح حالياً بالعهدة (${custody.currentBalance} ر.س) لا يكفي لتغطية مبلغ المصروف (${payload.amount} ر.س).`,
        },
      };
    }

    const txId = `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const txCode = `CTX-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const transaction: CashCustodyTransaction = {
      id: txId,
      tenantId,
      companyId: payload.companyId || custody.companyId || tenantId,
      transactionCode: txCode,
      custodyId: custody.id,
      amount: payload.amount,
      expenseCategory: payload.expenseCategory || 'نثريات وضيافة',
      expenseAccountCode: payload.expenseAccountCode || '5040',
      description: payload.description || 'صرف من العهدة النقدية',
      receiptNumber: payload.receiptNumber.trim(),
      attachmentUrl: payload.attachmentUrl.trim(),
      attachmentName: payload.attachmentName || 'فاتورة_مرفقة.pdf',
      costCenterId: payload.costCenterId || custody.costCenterId,
      recordedBy: payload.recordedBy,
      recordedByName: payload.recordedByName,
      status: 'RECORDED',
      transactionDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      idempotencyKey: payload.idempotencyKey,
    };

    // Save transaction and deduct available balance via StoragePort
    const recordRes = await this.port.recordCustodyExpense(
      tenantId,
      transaction,
      payload.idempotencyKey
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
          amount: recordRes.data.amount,
          receiptNumber: recordRes.data.receiptNumber,
        },
        idempotencyKey: payload.idempotencyKey,
      });
    }

    return recordRes;
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
      entryId: string;
      accountCode: string;
      accountNameAr?: string;
      debit: number;
      credit: number;
      descriptionAr: string;
      dimension1Id?: string;
    }> = [];

    // Debit expense accounts
    let lineIdx = 1;
    expenseGroups.forEach((amount, accCode) => {
      journalLines.push({
        id: `line-${entryId}-${lineIdx++}`,
        entryId,
        accountCode: accCode,
        accountNameAr: 'مصروفات تشغيلية مسواة من العهدة',
        debit: amount,
        credit: 0,
        descriptionAr: `إثبات مصروفات عهدة ${custody.custodyCode} - ${custody.employeeName}`,
        dimension1Id: custody.costCenterId,
      });
    });

    // Handle variance lines if any
    if (varianceType === 'DEFICIT' && varianceAmount > 0) {
      journalLines.push({
        id: `line-${entryId}-${lineIdx++}`,
        entryId,
        accountCode: '5050',
        accountNameAr: 'فروق وعجز تسوية العهد النقدية',
        debit: varianceAmount,
        credit: 0,
        descriptionAr: `إثبات عجز في عهدة ${custody.custodyCode}`,
        dimension1Id: custody.costCenterId,
      });
    } else if (varianceType === 'SURPLUS' && varianceAmount > 0) {
      journalLines.push({
        id: `line-${entryId}-${lineIdx++}`,
        entryId,
        accountCode: '4010',
        accountNameAr: 'فروق وزيادة تسوية العهد النقدية',
        debit: 0,
        credit: varianceAmount,
        descriptionAr: `إثبات زيادة في عهدة ${custody.custodyCode}`,
        dimension1Id: custody.costCenterId,
      });
    }

    // Credit replenishment account (الصندوق الرئيسي أو الحساب البنكي)
    journalLines.push({
      id: `line-${entryId}-${lineIdx++}`,
      entryId,
      accountCode: replenishmentAccount,
      accountNameAr:
        replenishmentAccount === '1010'
          ? 'الصندوق والنقدية بالخزينة'
          : 'الحسابات الجارية بالبنوك',
      debit: 0,
      credit: replenishmentAmount,
      descriptionAr: `صرف شيك / نقدية استعاضة وتجديد عهدة ${custody.custodyCode}`,
      dimension1Id: custody.costCenterId,
    });

    const journalEntry: JournalEntry = {
      id: entryId,
      tenantId,
      entryNumber: `JE-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      descriptionAr: `قيد تسوية واستعاضة عهدة نقدية: ${custody.custodyCode} (${custody.employeeName})`,
      status: 'APPROVED',
      lines: journalLines,
      metadata: {
        moduleId: 'custody',
        custodyId: custody.id,
        custodyCode: custody.custodyCode,
        settlementType: 'PERIODIC_REPLENISHMENT',
        totalExpenses,
        replenishmentAmount,
      },
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
}
