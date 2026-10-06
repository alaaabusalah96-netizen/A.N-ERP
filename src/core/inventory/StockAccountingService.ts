/**
 * Phase 14 (ACC-AUTO-001): auto journal entries for stock receipt / issue / transfer.
 */
import {
  StoragePort, StorageResult, StockDocument, StockTransfer, StockTransferLine,
  StockItem, JournalEntry, JournalLine, StockAccountingConfig, defaultStockAccountingConfig,
} from '../storage/StoragePort';
import { PostingEngine } from '../engines/PostingEngine';
import { STANDARD_CHART_OF_ACCOUNTS } from '../accounting/defaultChartOfAccounts';

export type JournalStatusResult = 'NONE' | 'POSTED' | 'PENDING_RETRY';
export interface AutoJournalOutcome {
  journalStatus: JournalStatusResult;
  journalEntryId?: string;
  messageAr?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export class StockAccountingService {
  constructor(private storage: StoragePort, private postingEngine: PostingEngine) {}

  public async getConfig(tenantId: string): Promise<StockAccountingConfig> {
    const r = await this.storage.getStockAccountingConfig(tenantId);
    if (r.success && r.data) return r.data;
    return defaultStockAccountingConfig(tenantId);
  }

  public async ensureDefaultAccounts(tenantId: string, _actorId: string): Promise<StorageResult<void>> {
    for (const code of ['1109', '2106']) {
      const existing = await this.storage.getAccount(tenantId, code);
      if (existing.success && existing.data) continue;
      const tpl = STANDARD_CHART_OF_ACCOUNTS.find((a) => a.code === code);
      if (!tpl) continue;
      const save = await this.storage.saveAccount(tenantId, {
        code: tpl.code, tenantId, nameAr: tpl.nameAr, type: tpl.type as any,
        nature: (tpl as any).nature, currency: (tpl as any).currency, isActive: true,
        debitBalance: 0, creditBalance: 0, balance: 0,
      }, `p14-seed-acct-${code}-${tenantId}`);
      if (!save.success) return { success: false, error: save.error };
    }
    return { success: true, data: undefined as any };
  }

  public async validateConfigAccounts(tenantId: string, cfg: StockAccountingConfig): Promise<{ ok: true } | { ok: false; detail: string }> {
    const checks: Array<{ code: string; expectType: string; label: string }> = [
      { code: cfg.defaultInventoryAccountCode, expectType: 'ASSET', label: 'حساب المخزون الافتراضي' },
      { code: cfg.inTransitAccountCode, expectType: 'ASSET', label: 'حساب المخزون في الطريق' },
      { code: cfg.grirAccountCode, expectType: 'LIABILITY', label: 'حساب GR/IR' },
      { code: cfg.defaultCogsAccountCode, expectType: 'EXPENSE', label: 'حساب تكلفة البضاعة' },
    ];
    for (const c of checks) {
      const acc = await this.storage.getAccount(tenantId, c.code);
      if (!acc.success || !acc.data) return { ok: false, detail: `${c.label} (${c.code}) غير موجود في دليل الحسابات.` };
      if (acc.data.isActive === false || acc.data.status === 'INACTIVE') return { ok: false, detail: `${c.label} (${c.code}) موقوف.` };
      if (acc.data.type && acc.data.type !== c.expectType) return { ok: false, detail: `${c.label} (${c.code}) يجب أن يكون من نوع ${c.expectType}.` };
    }
    return { ok: true };
  }

  public async assertOpenPeriod(tenantId: string, dateIso: string): Promise<{ ok: true } | { ok: false; detail: string; status: number; type: string }> {
    const day = dateIso.slice(0, 10);
    const per = await this.storage.getPeriodForDate(tenantId, day);
    if (per.success && per.data && per.data.status === 'CLOSED') {
      return { ok: false, detail: `الفترة المحاسبية (${per.data.code}) مقفلة؛ لا يمكن ترحيل قيود المخزون الآلية.`, status: 422, type: 'https://api.an-erp.local/errors/closed-fiscal-period' };
    }
    return { ok: true };
  }

  private aggregate(pairs: Array<{ debitAccount: string; creditAccount: string; amount: number; desc: string }>): JournalLine[] {
    const map = new Map<string, { debit: number; credit: number; desc: string }>();
    for (const p of pairs) {
      const amt = r2(p.amount);
      if (amt <= 0) continue;
      const d = map.get(p.debitAccount) || { debit: 0, credit: 0, desc: p.desc };
      d.debit = r2(d.debit + amt); map.set(p.debitAccount, d);
      const c = map.get(p.creditAccount) || { debit: 0, credit: 0, desc: p.desc };
      c.credit = r2(c.credit + amt); map.set(p.creditAccount, c);
    }
    const lines: JournalLine[] = [];
    let i = 0;
    for (const [code, v] of map) {
      if (v.debit <= 0 && v.credit <= 0) continue;
      lines.push({ id: `JL-${++i}`, accountCode: code, debit: v.debit, credit: v.credit, description: v.desc });
    }
    return lines;
  }

  public buildReceiptEntry(doc: StockDocument, items: Map<string, StockItem>, cfg: StockAccountingConfig): JournalEntry | null {
    const pairs: Array<{ debitAccount: string; creditAccount: string; amount: number; desc: string }> = [];
    for (const line of doc.lines || []) {
      const item = items.get(line.itemId);
      const inv = (item?.inventoryAccountCode || cfg.defaultInventoryAccountCode || '1105').trim();
      const amt = r2(Number(line.totalCost) || Number(line.quantity) * Number(line.unitCost) || 0);
      if (amt <= 0) continue;
      pairs.push({ debitAccount: inv, creditAccount: cfg.grirAccountCode, amount: amt, desc: `استلام ${doc.documentNumber}` });
    }
    const lines = this.aggregate(pairs);
    if (lines.length < 2) return null;
    const total = r2(lines.reduce((s, l) => s + l.debit, 0));
    if (total <= 0) return null;
    return { id: `JE-STK-RCV-${doc.id}`.slice(0, 64), code: `STK-RCV-${doc.documentNumber}`.slice(0, 32), tenantId: doc.tenantId, date: (doc.postedAt || doc.createdAt || new Date().toISOString()).slice(0, 10), type: 'قيد آلي لاستلام بضاعة', description: `قيد آلي لاستلام بضاعة — مستند ${doc.documentNumber}`, lines, totalAmount: total, status: 'APPROVED', createdBy: doc.performedBy || 'system' };
  }

  public buildIssueEntry(doc: StockDocument, items: Map<string, StockItem>, cfg: StockAccountingConfig): JournalEntry | null {
    const pairs: Array<{ debitAccount: string; creditAccount: string; amount: number; desc: string }> = [];
    for (const line of doc.lines || []) {
      const item = items.get(line.itemId);
      const inv = (item?.inventoryAccountCode || cfg.defaultInventoryAccountCode || '1105').trim();
      const cogs = (item?.cogsAccountCode || cfg.defaultCogsAccountCode || '5101').trim();
      const amt = r2(Number(line.totalCost) || Number(line.quantity) * Number(line.unitCost) || 0);
      if (amt <= 0) continue;
      pairs.push({ debitAccount: cogs, creditAccount: inv, amount: amt, desc: `صرف ${doc.documentNumber}` });
    }
    const lines = this.aggregate(pairs);
    if (lines.length < 2) return null;
    const total = r2(lines.reduce((s, l) => s + l.debit, 0));
    if (total <= 0) return null;
    return { id: `JE-STK-ISS-${doc.id}`.slice(0, 64), code: `STK-ISS-${doc.documentNumber}`.slice(0, 32), tenantId: doc.tenantId, date: (doc.postedAt || doc.createdAt || new Date().toISOString()).slice(0, 10), type: 'قيد آلي لصرف بضاعة', description: `قيد آلي لصرف بضاعة — مستند ${doc.documentNumber}`, lines, totalAmount: total, status: 'APPROVED', createdBy: doc.performedBy || 'system' };
  }

  public buildTransferDispatchEntry(transfer: StockTransfer, lines: StockTransferLine[], items: Map<string, StockItem>, cfg: StockAccountingConfig): JournalEntry | null {
    const pairs: Array<{ debitAccount: string; creditAccount: string; amount: number; desc: string }> = [];
    for (const line of lines || []) {
      const item = items.get(line.itemId);
      const inv = (item?.inventoryAccountCode || cfg.defaultInventoryAccountCode || '1105').trim();
      const amt = r2(Number(line.totalCost) || Number(line.quantity) * Number(line.unitCost) || 0);
      if (amt <= 0) continue;
      pairs.push({ debitAccount: cfg.inTransitAccountCode, creditAccount: inv, amount: amt, desc: `إرسال تحويل ${transfer.transferNumber}` });
    }
    const jl = this.aggregate(pairs);
    if (jl.length < 2) return null;
    const total = r2(jl.reduce((s, l) => s + l.debit, 0));
    if (total <= 0) return null;
    return { id: `JE-STK-TD-${transfer.id}`.slice(0, 64), code: `STK-TD-${transfer.transferNumber}`.slice(0, 32), tenantId: transfer.tenantId, date: (transfer.dispatchedAt || transfer.updatedAt || new Date().toISOString()).slice(0, 10), type: 'قيد آلي لإرسال تحويل مخزني', description: `قيد آلي لإرسال تحويل — ${transfer.transferNumber}`, lines: jl, totalAmount: total, status: 'APPROVED', createdBy: transfer.dispatchedBy || transfer.requestedBy || 'system' };
  }

  public buildTransferReceiveEntry(transfer: StockTransfer, lines: StockTransferLine[], items: Map<string, StockItem>, cfg: StockAccountingConfig): JournalEntry | null {
    const pairs: Array<{ debitAccount: string; creditAccount: string; amount: number; desc: string }> = [];
    for (const line of lines || []) {
      const item = items.get(line.itemId);
      const inv = (item?.inventoryAccountCode || cfg.defaultInventoryAccountCode || '1105').trim();
      const amt = r2(Number(line.totalCost) || Number(line.quantity) * Number(line.unitCost) || 0);
      if (amt <= 0) continue;
      pairs.push({ debitAccount: inv, creditAccount: cfg.inTransitAccountCode, amount: amt, desc: `استلام تحويل ${transfer.transferNumber}` });
    }
    const jl = this.aggregate(pairs);
    if (jl.length < 2) return null;
    const total = r2(jl.reduce((s, l) => s + l.debit, 0));
    if (total <= 0) return null;
    return { id: `JE-STK-TR-${transfer.id}`.slice(0, 64), code: `STK-TR-${transfer.transferNumber}`.slice(0, 32), tenantId: transfer.tenantId, date: (transfer.receivedAt || transfer.updatedAt || new Date().toISOString()).slice(0, 10), type: 'قيد آلي لاستلام تحويل مخزني', description: `قيد آلي لاستلام تحويل — ${transfer.transferNumber}`, lines: jl, totalAmount: total, status: 'APPROVED', createdBy: transfer.receivedBy || transfer.requestedBy || 'system' };
  }

  public async postForDocument(tenantId: string, doc: StockDocument, items: Map<string, StockItem>, mode: 'RECEIPT' | 'ISSUE', idempotencyKey: string): Promise<AutoJournalOutcome> {
    const cfg = await this.getConfig(tenantId);
    if (!cfg.autoPostEnabled) return { journalStatus: 'NONE' };
    const entry = mode === 'RECEIPT' ? this.buildReceiptEntry(doc, items, cfg) : this.buildIssueEntry(doc, items, cfg);
    if (!entry) { await this.storage.setStockDocumentJournal(tenantId, doc.id, null, 'NONE'); return { journalStatus: 'NONE' }; }
    const draft = await this.postingEngine.draftEntry(tenantId, entry, `${idempotencyKey}-je-draft`);
    if (!draft.success || !draft.data) {
      await this.storage.setStockDocumentJournal(tenantId, doc.id, null, 'PENDING_RETRY');
      return { journalStatus: 'PENDING_RETRY', messageAr: 'تم تسجيل حركة المخزون لكن القيد المحاسبي لم يُرحَّل بعد؛ أعد المحاولة من شاشة المستند' };
    }
    const posted = await this.postingEngine.postEntry(tenantId, draft.data.id, `${idempotencyKey}-je-post`);
    if (!posted.success || !posted.data) {
      await this.storage.setStockDocumentJournal(tenantId, doc.id, draft.data.id, 'PENDING_RETRY');
      return { journalStatus: 'PENDING_RETRY', journalEntryId: draft.data.id, messageAr: 'تم تسجيل حركة المخزون لكن القيد المحاسبي لم يُرحَّل بعد؛ أعد المحاولة من شاشة المستند' };
    }
    await this.storage.setStockDocumentJournal(tenantId, doc.id, posted.data.id, 'POSTED');
    return { journalStatus: 'POSTED', journalEntryId: posted.data.id };
  }

  public async postForTransfer(tenantId: string, transfer: StockTransfer, lines: StockTransferLine[], items: Map<string, StockItem>, which: 'DISPATCH' | 'RECEIVE', idempotencyKey: string): Promise<AutoJournalOutcome> {
    const cfg = await this.getConfig(tenantId);
    if (!cfg.autoPostEnabled) return { journalStatus: 'NONE' };
    const entry = which === 'DISPATCH' ? this.buildTransferDispatchEntry(transfer, lines, items, cfg) : this.buildTransferReceiveEntry(transfer, lines, items, cfg);
    if (!entry) { await this.storage.setStockTransferJournal(tenantId, transfer.id, which, null, 'NONE'); return { journalStatus: 'NONE' }; }
    const draft = await this.postingEngine.draftEntry(tenantId, entry, `${idempotencyKey}-je-draft`);
    if (!draft.success || !draft.data) {
      await this.storage.setStockTransferJournal(tenantId, transfer.id, which, null, 'PENDING_RETRY');
      return { journalStatus: 'PENDING_RETRY', messageAr: 'تم تسجيل حركة المخزون لكن القيد المحاسبي لم يُرحَّل بعد؛ أعد المحاولة من شاشة المستند' };
    }
    const posted = await this.postingEngine.postEntry(tenantId, draft.data.id, `${idempotencyKey}-je-post`);
    if (!posted.success || !posted.data) {
      await this.storage.setStockTransferJournal(tenantId, transfer.id, which, draft.data.id, 'PENDING_RETRY');
      return { journalStatus: 'PENDING_RETRY', journalEntryId: draft.data.id, messageAr: 'تم تسجيل حركة المخزون لكن القيد المحاسبي لم يُرحَّل بعد؛ أعد المحاولة من شاشة المستند' };
    }
    await this.storage.setStockTransferJournal(tenantId, transfer.id, which, posted.data.id, 'POSTED');
    return { journalStatus: 'POSTED', journalEntryId: posted.data.id };
  }

  public async retryDocumentJournal(tenantId: string, docId: string, idempotencyKey: string): Promise<StorageResult<AutoJournalOutcome & { doc?: StockDocument }>> {
    const docRes = await this.storage.getStockDocument(tenantId, docId);
    if (!docRes.success || !docRes.data) return { success: false, error: docRes.error || { type: 'not-found', title: 'مستند', status: 404, detail: 'المستند غير موجود' } };
    const doc = docRes.data;
    if (doc.journalStatus === 'POSTED' && doc.journalEntryId) return { success: true, data: { journalStatus: 'POSTED', journalEntryId: doc.journalEntryId, doc } };
    const items = new Map<string, StockItem>();
    for (const line of doc.lines || []) {
      const ir = await this.storage.getStockItem(tenantId, line.itemId);
      if (ir.success && ir.data) items.set(line.itemId, ir.data);
    }
    const mode: 'RECEIPT' | 'ISSUE' = (doc.documentType === 'RECEIPT' || (doc as any).documentType === 'RETURN_IN') ? 'RECEIPT' : 'ISSUE';
    const outcome = await this.postForDocument(tenantId, doc, items, mode, idempotencyKey);
    return { success: true, data: { ...outcome, doc: { ...doc, journalStatus: outcome.journalStatus, journalEntryId: outcome.journalEntryId } } };
  }
}
