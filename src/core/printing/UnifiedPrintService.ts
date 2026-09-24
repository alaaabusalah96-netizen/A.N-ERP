/**
 * @file UnifiedPrintService.ts
 * @description Phase 7.6C: Unified Print Service and Templates for Modules 4–7.
 * Generates standard, professional, printable documents and PDF views with unified headers,
 * item tables, totals, signature blocks, and product footer "A.N ERP".
 */

import { StoragePort } from '../storage/StoragePort';

export interface PrintDocumentHeader {
  companyNameAr: string;
  companyNameEn?: string;
  taxNumber?: string;
  crNumber?: string;
  documentTitleAr: string;
  documentNumber: string;
  documentDate: string;
  statusBadge: string;
}

export interface PrintTableColumn {
  key: string;
  labelAr: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface PrintDocumentData {
  header: PrintDocumentHeader;
  metaFields: Array<{ labelAr: string; value: string }>;
  columns: PrintTableColumn[];
  rows: Array<Record<string, any>>;
  totals: Array<{ labelAr: string; value: string; isBold?: boolean }>;
  notes?: string;
  signatures: Array<{ roleAr: string; nameAr: string; date?: string }>;
}

export class UnifiedPrintService {
  constructor(private storage: StoragePort) {}

  /**
   * Helper: Wrap data into a standard A.N ERP printable HTML document.
   */
  public renderHtml(data: PrintDocumentData): string {
    const metaRows = data.metaFields
      .map(
        m => `
        <div class="meta-item">
          <span class="meta-label">${m.labelAr}:</span>
          <span class="meta-value">${m.value}</span>
        </div>`
      )
      .join('');

    const ths = data.columns
      .map(
        c => `<th style="text-align: ${c.align || 'right'}; width: ${c.width || 'auto'};">${c.labelAr}</th>`
      )
      .join('');

    const trs = data.rows
      .map(
        (r, idx) => `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          ${data.columns
            .slice(1)
            .map(
              c =>
                `<td style="text-align: ${c.align || 'right'};">${r[c.key] !== undefined ? r[c.key] : '-'}</td>`
            )
            .join('')}
        </tr>`
      )
      .join('');

    const totalsRows = data.totals
      .map(
        t => `
        <div class="total-row ${t.isBold ? 'bold' : ''}">
          <span class="total-label">${t.labelAr}:</span>
          <span class="total-val">${t.value}</span>
        </div>`
      )
      .join('');

    const sigs = data.signatures
      .map(
        s => `
        <div class="sig-box">
          <div class="sig-role">${s.roleAr}</div>
          <div class="sig-name">${s.nameAr || '...................'}</div>
          <div class="sig-line">التوقيع: ...................</div>
          ${s.date ? `<div class="sig-date">${s.date}</div>` : ''}
        </div>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${data.header.documentTitleAr} - ${data.header.documentNumber}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
      margin: 0;
      padding: 20px;
      color: #1e293b;
      background: #ffffff;
      font-size: 13px;
      line-height: 1.5;
    }
    .print-container {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #e2e8f0;
      padding: 30px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .company-title {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
    }
    .company-sub {
      font-size: 12px;
      color: #64748b;
    }
    .doc-badge {
      text-align: left;
    }
    .doc-title {
      font-size: 18px;
      font-weight: 700;
      color: #2563eb;
    }
    .doc-num {
      font-family: monospace;
      font-size: 14px;
      font-weight: 600;
    }
    .status-tag {
      display: inline-block;
      padding: 2px 8px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      background: #f8fafc;
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 20px;
      border: 1px solid #f1f5f9;
    }
    .meta-label {
      font-weight: 600;
      color: #475569;
    }
    .meta-value {
      color: #0f172a;
      font-weight: 500;
      margin-right: 6px;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    table.data-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid #0f172a;
    }
    table.data-table td {
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      font-size: 12px;
    }
    table.data-table tr:nth-child(even) {
      background: #f8fafc;
    }
    .summary-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .notes-box {
      width: 55%;
      border: 1px dashed #cbd5e1;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      color: #475569;
    }
    .totals-box {
      width: 40%;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    .total-row.bold {
      font-weight: 700;
      font-size: 14px;
      color: #0f172a;
      border-top: 1px solid #cbd5e1;
      border-bottom: none;
      padding-top: 6px;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: repeat(${data.signatures.length || 3}, 1fr);
      gap: 15px;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      margin-top: 30px;
    }
    .sig-box {
      text-align: center;
      padding: 10px;
    }
    .sig-role {
      font-weight: 600;
      color: #334155;
      margin-bottom: 6px;
    }
    .sig-name {
      color: #64748b;
      margin-bottom: 12px;
    }
    .sig-line {
      font-size: 11px;
      color: #94a3b8;
    }
    .doc-footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #f1f5f9;
      font-size: 11px;
      color: #64748b;
    }
    @media print {
      body { padding: 0; }
      .print-container { border: none; box-shadow: none; padding: 0; width: 100%; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="print-container">
    <table class="header-table">
      <tr>
        <td style="width: 60%; vertical-align: top;">
          <div class="company-title">${data.header.companyNameAr}</div>
          ${data.header.companyNameEn ? `<div class="company-sub">${data.header.companyNameEn}</div>` : ''}
          ${data.header.taxNumber ? `<div class="company-sub">الرقم الضريبي: ${data.header.taxNumber}</div>` : ''}
          ${data.header.crNumber ? `<div class="company-sub">السجل التجاري: ${data.header.crNumber}</div>` : ''}
        </td>
        <td style="width: 40%; vertical-align: top; text-align: left;" class="doc-badge">
          <div class="doc-title">${data.header.documentTitleAr}</div>
          <div class="doc-num">${data.header.documentNumber}</div>
          <div style="margin-top: 4px;"><span class="status-tag">${data.header.statusBadge}</span></div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">التاريخ: ${data.header.documentDate}</div>
        </td>
      </tr>
    </table>

    <div class="meta-grid">
      ${metaRows}
    </div>

    <table class="data-table">
      <thead>
        <tr>
          ${ths}
        </tr>
      </thead>
      <tbody>
        ${trs}
      </tbody>
    </table>

    <div class="summary-section">
      <div class="notes-box">
        <strong>ملاحظات وتعليمات:</strong>
        <p style="margin: 4px 0 0 0;">${data.notes || 'لا توجد ملاحظات إضافية مسجلة على هذا المستند.'}</p>
      </div>
      <div class="totals-box">
        ${totalsRows}
      </div>
    </div>

    <div class="signatures-grid">
      ${sigs}
    </div>

    <div class="doc-footer">
      تم استخراج هذا المستند إلكترونياً عبر نظام <strong>A.N ERP</strong> — أي كشط أو تعديل يدوي يلغي صلاحيته الرسمية.
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * 1. طباعة قيد محاسبي (Module 4)
   */
  public async renderJournalEntry(tenantId: string, entryId: string): Promise<string | null> {
    const entryRes = await this.storage.getJournalEntry(tenantId, entryId);
    if (!entryRes.success || !entryRes.data) return null;
    const entry = entryRes.data;

    const tenantRes = await this.storage.getTenant(tenantId);
    const tenant = tenantRes.success && tenantRes.data ? tenantRes.data : { nameAr: 'A.N ERP Tenant' };

    const totalDebit = entry.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = entry.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

    return this.renderHtml({
      header: {
        companyNameAr: tenant.nameAr,
        taxNumber: (tenant as any).taxNumber || '',
        documentTitleAr: 'سند قيد محاسبي يومية عامة',
        documentNumber: entry.code || entry.id,
        documentDate: entry.date.split('T')[0],
        statusBadge: entry.status === 'POSTED' ? 'مرحل ومعتمد' : entry.status,
      },
      metaFields: [
        { labelAr: 'البيان العام', value: entry.description },
        { labelAr: 'نوع العملية', value: entry.type || 'عام' },
      ],
      columns: [
        { key: 'index', labelAr: '#', width: '30px', align: 'center' },
        { key: 'accountCode', labelAr: 'رقم الحساب', width: '90px' },
        { key: 'accountName', labelAr: 'اسم الحساب' },
        { key: 'description', labelAr: 'البيان التفصيلي' },
        { key: 'debit', labelAr: 'مدين', width: '80px', align: 'left' },
        { key: 'credit', labelAr: 'دائن', width: '80px', align: 'left' },
      ],
      rows: entry.lines.map(l => ({
        accountCode: l.accountCode,
        accountName: l.accountCode,
        description: l.description || entry.description,
        debit: l.debit ? Number(l.debit).toLocaleString('ar-SA', { minimumFractionDigits: 2 }) : '0.00',
        credit: l.credit ? Number(l.credit).toLocaleString('ar-SA', { minimumFractionDigits: 2 }) : '0.00',
      })),
      totals: [
        { labelAr: 'إجمالي المدين', value: `${totalDebit.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س` },
        { labelAr: 'إجمالي الدائن', value: `${totalCredit.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س` },
        {
          labelAr: 'فارق التوازن',
          value: `${(totalDebit - totalCredit).toFixed(2)} ر.س`,
          isBold: true,
        },
      ],
      notes: 'القيد متوازن محاسبياً ومرحل آلياً عبر محرك الترحيل المركزي PostingEngine.',
      signatures: [
        { roleAr: 'المحاسب المعد', nameAr: entry.createdBy || 'المحاسب' },
        { roleAr: 'المراجع المالي', nameAr: 'المراجع الداخلي' },
        { roleAr: 'المدير المالي', nameAr: entry.approvedBy || 'المدير المالي' },
      ],
    });
  }

  /**
   * 2. طباعة سند صرف عهدة متعدد البنود (Module 5)
   */
  public async renderCustodyVoucher(tenantId: string, voucherId: string): Promise<string | null> {
    const voucherRes = await this.storage.getCustodyExpenseVoucher(tenantId, voucherId);
    if (!voucherRes.success || !voucherRes.data) return null;
    const v = voucherRes.data;

    const custodyRes = await this.storage.getCashCustody(tenantId, v.custodyId);
    const custody = custodyRes.success ? custodyRes.data : null;

    const tenantRes = await this.storage.getTenant(tenantId);
    const tenant = tenantRes.success && tenantRes.data ? tenantRes.data : { nameAr: 'A.N ERP Tenant' };

    return this.renderHtml({
      header: {
        companyNameAr: tenant.nameAr,
        taxNumber: (tenant as any).taxNumber || '',
        documentTitleAr: 'سند صرف من العهدة النقدية',
        documentNumber: v.voucherNumber,
        documentDate: v.createdAt.split('T')[0],
        statusBadge: v.status === 'POSTED' ? 'معتمد ومسجل' : 'معكوس',
      },
      metaFields: [
        { labelAr: 'كود العهدة', value: custody?.id || v.custodyId },
        { labelAr: 'مسؤول العهدة', value: custody?.employeeName || 'أمين العهدة' },
        { labelAr: 'المسجل الفعلي', value: v.recordedByName },
        { labelAr: 'رقم الفاتورة/الإيصال', value: v.receiptNumber || 'متعدد الفواتير' },
      ],
      columns: [
        { key: 'index', labelAr: '#', width: '30px', align: 'center' },
        { key: 'category', labelAr: 'تصنيف المصروف' },
        { key: 'accountCode', labelAr: 'رقم الحساب', width: '80px' },
        { key: 'desc', labelAr: 'الوصف والبيان' },
        { key: 'receiptNo', labelAr: 'رقم الإيصال' },
        { key: 'amount', labelAr: 'المبلغ (ر.س)', width: '85px', align: 'left' },
      ],
      rows: v.lines.map(l => ({
        category: l.expenseCategory,
        accountCode: l.expenseAccountCode,
        desc: l.description || '-',
        receiptNo: l.receiptNumber || '-',
        amount: Number(l.amount).toLocaleString('ar-SA', { minimumFractionDigits: 2 }),
      })),
      totals: [
        {
          labelAr: 'إجمالي سند الصرف',
          value: `${v.totalAmount.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`,
          isBold: true,
        },
      ],
      notes: v.notes || 'تم خصم قيمة السند من الرصيد المتاح للعهدة النقدية بصورة ذرية.',
      signatures: [
        { roleAr: 'مستلم النقد / المستفيد', nameAr: 'المستفيد' },
        { roleAr: 'أمين العهدة', nameAr: custody?.employeeName || v.recordedByName },
        { roleAr: 'المعتمد المالي', nameAr: 'المدير المالي' },
      ],
    });
  }

  /**
   * 3. طباعة إذن توريد مخزني متعدد البنود (Module 7)
   */
  public async renderStockReceipt(tenantId: string, documentId: string): Promise<string | null> {
    const docRes = await this.storage.getStockDocument(tenantId, documentId);
    if (!docRes.success || !docRes.data) return null;
    const doc = docRes.data;

    const tenantRes = await this.storage.getTenant(tenantId);
    const tenant = tenantRes.success && tenantRes.data ? tenantRes.data : { nameAr: 'A.N ERP Tenant' };

    return this.renderHtml({
      header: {
        companyNameAr: tenant.nameAr,
        taxNumber: (tenant as any).taxNumber || '',
        documentTitleAr: doc.documentType === 'RETURN_RECEIPT' ? 'إذن مرتجع توريد مخزني' : 'إذن توريد مخزني رسمي',
        documentNumber: doc.documentNumber,
        documentDate: doc.createdAt.split('T')[0],
        statusBadge: doc.status === 'POSTED' ? 'مستلم ومضاف للمخزون' : 'ملغي',
      },
      metaFields: [
        { labelAr: 'المستودع المستلم', value: doc.warehouseNameAr || doc.warehouseId },
        { labelAr: 'أمين المستودع', value: doc.performedByName },
        { labelAr: 'مستند المصدر', value: doc.referenceNumber || doc.referenceType || 'توريد مباشر' },
        { labelAr: 'تاريخ الإدخال', value: doc.postedAt.split('T')[0] },
      ],
      columns: [
        { key: 'index', labelAr: '#', width: '30px', align: 'center' },
        { key: 'code', labelAr: 'كود الصنف', width: '90px' },
        { key: 'name', labelAr: 'اسم الصنف' },
        { key: 'uom', labelAr: 'الوحدة', width: '60px', align: 'center' },
        { key: 'qty', labelAr: 'الكمية', width: '70px', align: 'center' },
        { key: 'unitCost', labelAr: 'سعر الوحدة', width: '80px', align: 'left' },
        { key: 'total', labelAr: 'القيمة الإجمالية', width: '90px', align: 'left' },
        { key: 'batch', labelAr: 'التشغيلة / الصلاحية' },
      ],
      rows: doc.lines.map(l => ({
        code: l.itemCode,
        name: l.itemNameAr,
        uom: l.uom,
        qty: l.quantity,
        unitCost: Number(l.unitCost).toLocaleString('ar-SA', { minimumFractionDigits: 2 }),
        total: Number(l.totalCost).toLocaleString('ar-SA', { minimumFractionDigits: 2 }),
        batch: l.batchNumber ? `${l.batchNumber} (${l.expiryDate || 'بلا صلاحية'})` : '-',
      })),
      totals: [
        { labelAr: 'إجمالي الكميات الموردة', value: `${doc.totalQuantity} وحدة` },
        {
          labelAr: 'إجمالي قيمة التوريد',
          value: `${doc.totalCost.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`,
          isBold: true,
        },
      ],
      notes: doc.notes || 'تمت إضافة الأصناف إلى الرصيد المتاح وتحديث المتوسط المرجح للتكلفة آلياً.',
      signatures: [
        { roleAr: 'أمين المستودع المستلم', nameAr: doc.performedByName },
        { roleAr: 'مراقب الجودة / الفاحص', nameAr: 'الفحص والاستلام' },
        { roleAr: 'مدير المستودعات', nameAr: 'مدير سلاسل الإمداد' },
      ],
    });
  }

  /**
   * 4. طباعة إذن صرف مخزني متعدد البنود (Module 7)
   */
  public async renderStockIssue(tenantId: string, documentId: string): Promise<string | null> {
    const docRes = await this.storage.getStockDocument(tenantId, documentId);
    if (!docRes.success || !docRes.data) return null;
    const doc = docRes.data;

    const tenantRes = await this.storage.getTenant(tenantId);
    const tenant = tenantRes.success && tenantRes.data ? tenantRes.data : { nameAr: 'A.N ERP Tenant' };

    return this.renderHtml({
      header: {
        companyNameAr: tenant.nameAr,
        taxNumber: (tenant as any).taxNumber || '',
        documentTitleAr: doc.documentType === 'RETURN_ISSUE' ? 'إذن مرتجع صرف مخزني' : 'إذن صرف مخزني رسمي',
        documentNumber: doc.documentNumber,
        documentDate: doc.createdAt.split('T')[0],
        statusBadge: doc.status === 'POSTED' ? 'مصروف ومرحل' : 'ملغي',
      },
      metaFields: [
        { labelAr: 'المستودع المصدر', value: doc.warehouseNameAr || doc.warehouseId },
        { labelAr: 'أمين المستودع القائم بالصرف', value: doc.performedByName },
        { labelAr: 'المستند المرجعي', value: doc.referenceNumber || doc.referenceType || 'صرف داخلي' },
        { labelAr: 'تاريخ الصرف', value: doc.postedAt.split('T')[0] },
      ],
      columns: [
        { key: 'index', labelAr: '#', width: '30px', align: 'center' },
        { key: 'code', labelAr: 'كود الصنف', width: '90px' },
        { key: 'name', labelAr: 'اسم الصنف' },
        { key: 'uom', labelAr: 'الوحدة', width: '60px', align: 'center' },
        { key: 'qty', labelAr: 'الكمية المنصرفة', width: '80px', align: 'center' },
        { key: 'unitCost', labelAr: 'متوسط التكلفة', width: '85px', align: 'left' },
        { key: 'total', labelAr: 'إجمالي التكلفة', width: '90px', align: 'left' },
      ],
      rows: doc.lines.map(l => ({
        code: l.itemCode,
        name: l.itemNameAr,
        uom: l.uom,
        qty: l.quantity,
        unitCost: Number(l.unitCost).toLocaleString('ar-SA', { minimumFractionDigits: 2 }),
        total: Number(l.totalCost).toLocaleString('ar-SA', { minimumFractionDigits: 2 }),
      })),
      totals: [
        { labelAr: 'إجمالي الكميات المنصرفة', value: `${doc.totalQuantity} وحدة` },
        {
          labelAr: 'إجمالي تكلفة المنصرف',
          value: `${doc.totalCost.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`,
          isBold: true,
        },
      ],
      notes: doc.notes || 'تم خصم الكميات المنصرفة من الرصيد المتاح وتحديث تكلفة البضاعة المباعة/المصروفة.',
      signatures: [
        { roleAr: 'المستلم / طالب الصرف', nameAr: 'المستلم' },
        { roleAr: 'أمين المستودع', nameAr: doc.performedByName },
        { roleAr: 'الاعتماد المخزني', nameAr: 'مدير المستودعات' },
      ],
    });
  }

  /**
   * 5. طباعة محضر جرد مخزني (Module 7)
   */
  public async renderStockCount(tenantId: string, countId: string): Promise<string | null> {
    const countRes = await this.storage.getStockCount(tenantId, countId);
    if (!countRes.success || !countRes.data) return null;
    const { count, lines } = countRes.data;

    const tenantRes = await this.storage.getTenant(tenantId);
    const tenant = tenantRes.success && tenantRes.data ? tenantRes.data : { nameAr: 'A.N ERP Tenant' };

    return this.renderHtml({
      header: {
        companyNameAr: tenant.nameAr,
        taxNumber: (tenant as any).taxNumber || '',
        documentTitleAr: `محضر جرد مخزني ${count.countType === 'PERIODIC' ? 'دوري' : 'مفاجئ'}`,
        documentNumber: count.countNumber,
        documentDate: count.performedAt.split('T')[0],
        statusBadge: count.status === 'POSTED' ? 'معتمد ومرحل دفترياً' : count.status,
      },
      metaFields: [
        { labelAr: 'المستودع الخاضع للجرد', value: count.warehouseNameAr },
        { labelAr: 'القائم بالجرد الفعلي', value: count.performedByName },
        { labelAr: 'معتمد محضر الجرد', value: count.approvedByName || 'بانتظار الاعتماد' },
        { labelAr: 'قيد التسوية الدفتري', value: count.journalEntryId || 'لا يوجد فروقات' },
      ],
      columns: [
        { key: 'index', labelAr: '#', width: '30px', align: 'center' },
        { key: 'code', labelAr: 'كود الصنف', width: '90px' },
        { key: 'name', labelAr: 'اسم الصنف' },
        { key: 'sysQty', labelAr: 'الرصيد الدفتري', width: '80px', align: 'center' },
        { key: 'cntQty', labelAr: 'الرصيد الفعلي', width: '80px', align: 'center' },
        { key: 'varQty', labelAr: 'فرق الكمية', width: '75px', align: 'center' },
        { key: 'varAmount', labelAr: 'قيمة الفرق (ر.س)', width: '85px', align: 'left' },
      ],
      rows: lines.map(l => ({
        code: l.itemCode,
        name: l.itemNameAr,
        sysQty: l.systemQty,
        cntQty: l.countedQty,
        varQty: l.varianceQty > 0 ? `+${l.varianceQty}` : `${l.varianceQty}`,
        varAmount: Number(l.varianceAmount).toLocaleString('ar-SA', { minimumFractionDigits: 2 }),
      })),
      totals: [
        { labelAr: 'عدد الأصناف المجرودة', value: `${lines.length} أصناف` },
        {
          labelAr: 'صافي فروقات الجرد',
          value: `${count.netVarianceAmount.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`,
          isBold: true,
        },
      ],
      notes: count.notes || 'تمت مطابقة الأرصدة الفعلية مع السجلات الدفترية وترحيل قيود التسوية طبقاً للأصول المحاسبية.',
      signatures: [
        { roleAr: 'عضو لجنة الجرد الفعلي', nameAr: count.performedByName },
        { roleAr: 'أمين المستودع المسؤول', nameAr: 'أمين المستودع' },
        { roleAr: 'رئيس لجنة الجرد والاعتماد', nameAr: count.approvedByName || 'المدير المالي' },
      ],
    });
  }

  /**
   * 6. طباعة طلب واعتماد مصروف (Module 6)
   */
  public async renderExpenseClaim(tenantId: string, requestId: string): Promise<string | null> {
    const expRes = await this.storage.getExpenseRequest(tenantId, requestId);
    if (!expRes.success || !expRes.data) return null;
    const { request, lines } = expRes.data;

    const tenantRes = await this.storage.getTenant(tenantId);
    const tenant = tenantRes.success && tenantRes.data ? tenantRes.data : { nameAr: 'A.N ERP Tenant' };

    return this.renderHtml({
      header: {
        companyNameAr: tenant.nameAr,
        taxNumber: (tenant as any).taxNumber || '',
        documentTitleAr: 'طلب واستعاضة مصروفات أعمال',
        documentNumber: request.requestCode,
        documentDate: request.submittedAt.split('T')[0],
        statusBadge: request.status === 'APPROVED' ? 'معتمد' : request.status,
      },
      metaFields: [
        { labelAr: 'عنوان الطلب', value: request.titleAr },
        { labelAr: 'الموظف مقدم الطلب', value: request.employeeName },
        { labelAr: 'طريقة الصرف', value: request.paymentMethod },
        { labelAr: 'رقم القيد الدفتري', value: request.journalEntryId || 'غير مرحل' },
      ],
      columns: [
        { key: 'index', labelAr: '#', width: '30px', align: 'center' },
        { key: 'category', labelAr: 'بند المصروف' },
        { key: 'desc', labelAr: 'البيان والغرض' },
        { key: 'invNo', labelAr: 'رقم الفاتورة' },
        { key: 'amount', labelAr: 'المبلغ (ر.س)', width: '90px', align: 'left' },
      ],
      rows: lines.map(l => ({
        category: l.categoryNameAr,
        desc: l.description,
        invNo: l.invoiceNumber || '-',
        amount: Number(l.amount).toLocaleString('ar-SA', { minimumFractionDigits: 2 }),
      })),
      totals: [
        {
          labelAr: 'إجمالي المصروفات المعتمدة',
          value: `${request.totalAmount.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`,
          isBold: true,
        },
      ],
      notes: request.notes || 'تم التحقق من كافة الفواتير والمرفقات المرفقة وصرف المبلغ طبقاً لسياسة المصروفات.',
      signatures: [
        { roleAr: 'مقدم الطلب', nameAr: request.employeeName },
        { roleAr: 'المشرف المباشر', nameAr: request.approvedL1ByName || 'المشرف' },
        { roleAr: 'المدير المالي', nameAr: request.approvedByName || 'المدير المالي' },
      ],
    });
  }

  /**
   * 7. طباعة كارت الصنف (Module 7 - 7.6E)
   */
  public renderItemLedgerHtml(tenantName: string, report: any): string {
    const rows = report.entries.map((e: any, idx: number) => ({
      index: idx + 1,
      date: e.timestamp.split('T')[0],
      type: e.movementType,
      docNum: e.documentNumber,
      qtyIn: e.quantityIn > 0 ? e.quantityIn : '-',
      qtyOut: e.quantityOut > 0 ? e.quantityOut : '-',
      balance: e.runningQuantity,
      unitCost: Number(e.unitCost).toFixed(2),
      avgCost: Number(e.runningAverageCost).toFixed(2),
      totalValue: Number(e.runningTotalValue).toFixed(2),
    }));

    return this.renderHtml({
      header: {
        companyNameAr: tenantName,
        documentTitleAr: 'بطاقة حركة صنف مخزني (كارت الصنف)',
        documentNumber: report.itemCode,
        documentDate: new Date().toISOString().split('T')[0],
        statusBadge: 'سجل حركات حي',
      },
      metaFields: [
        { labelAr: 'اسم الصنف', value: report.itemNameAr },
        { labelAr: 'كود الصنف', value: report.itemCode },
        { labelAr: 'وحدة القياس', value: report.uom },
        { labelAr: 'الرصيد الافتتاحي', value: `${report.openingQty} ${report.uom}` },
      ],
      columns: [
        { key: 'index', labelAr: '#', width: '30px', align: 'center' },
        { key: 'date', labelAr: 'التاريخ', width: '75px' },
        { key: 'type', labelAr: 'نوع الحركة' },
        { key: 'docNum', labelAr: 'رقم المستند' },
        { key: 'qtyIn', labelAr: 'وارد', width: '55px', align: 'center' },
        { key: 'qtyOut', labelAr: 'منصرف', width: '55px', align: 'center' },
        { key: 'balance', labelAr: 'الرصيد الجاري', width: '70px', align: 'center' },
        { key: 'avgCost', labelAr: 'متوسط التكلفة', width: '75px', align: 'left' },
        { key: 'totalValue', labelAr: 'قيمة الرصيد', width: '80px', align: 'left' },
      ],
      rows,
      totals: [
        { labelAr: 'الرصيد الختامي الحالي', value: `${report.closingQty} ${report.uom}` },
        { labelAr: 'متوسط التكلفة الجاري', value: `${Number(report.closingAvgCost).toFixed(2)} ر.س` },
        {
          labelAr: 'إجمالي القيمة المخزنية',
          value: `${Number(report.closingTotalValue).toFixed(2)} ر.س`,
          isBold: true,
        },
      ],
      notes: 'كارت الصنف يعرض الرصيد التراكمي وتطور متوسط التكلفة المرجح طبقاً لمعيار المخزون الدولي IAS 2.',
      signatures: [
        { roleAr: 'أمين المستودع المسؤول', nameAr: 'أمين المستودع' },
        { roleAr: 'محاسب تكاليف المخزون', nameAr: 'محاسب التكاليف' },
        { roleAr: 'المدير المالي', nameAr: 'المدير المالي' },
      ],
    });
  }

  /**
   * Alias for renderExpenseClaim
   */
  public async renderExpenseRequest(tenantId: string, requestId: string): Promise<string | null> {
    return this.renderExpenseClaim(tenantId, requestId);
  }

  /**
   * 8. طباعة إذن تحويل مخزني (Module 7)
   */
  public async renderStockTransfer(tenantId: string, transferId: string): Promise<string | null> {
    const trfRes = await this.storage.getStockTransfer(tenantId, transferId);
    if (!trfRes.success || !trfRes.data) return null;
    const { transfer, lines } = trfRes.data;

    const tenantRes = await this.storage.getTenant(tenantId);
    const tenant = tenantRes.success && tenantRes.data ? tenantRes.data : { nameAr: 'A.N ERP Tenant' };

    return this.renderHtml({
      header: {
        companyNameAr: tenant.nameAr,
        taxNumber: (tenant as any).taxNumber || '',
        documentTitleAr: 'إذن تحويل بضاعة بين مستودعين',
        documentNumber: transfer.transferNumber,
        documentDate: transfer.requestedAt.split('T')[0],
        statusBadge: transfer.status === 'RECEIVED' ? 'مستلم ومكتمل' : transfer.status,
      },
      metaFields: [
        { labelAr: 'مستودع الإرسال', value: transfer.sourceWarehouseNameAr },
        { labelAr: 'مستودع الاستلام', value: transfer.targetWarehouseNameAr },
        { labelAr: 'طالب التحويل', value: transfer.requestedByName },
        { labelAr: 'حالة الشحنة', value: transfer.status },
      ],
      columns: [
        { key: 'index', labelAr: '#', width: '30px', align: 'center' },
        { key: 'code', labelAr: 'كود الصنف', width: '90px' },
        { key: 'name', labelAr: 'اسم الصنف' },
        { key: 'qty', labelAr: 'الكمية المحولة', width: '80px', align: 'center' },
        { key: 'cost', labelAr: 'التكلفة', width: '80px', align: 'left' },
        { key: 'total', labelAr: 'الإجمالي', width: '90px', align: 'left' },
      ],
      rows: lines.map(l => ({
        code: l.itemCode,
        name: l.itemNameAr,
        qty: l.quantity,
        cost: Number(l.unitCost).toLocaleString('ar-SA', { minimumFractionDigits: 2 }),
        total: Number(l.totalCost).toLocaleString('ar-SA', { minimumFractionDigits: 2 }),
      })),
      totals: [
        { labelAr: 'إجمالي الكمية المحولة', value: `${transfer.totalQuantity} وحدة` },
        { labelAr: 'إجمالي تكلفة الشحنة', value: `${transfer.totalCost.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`, isBold: true },
      ],
      notes: transfer.notes || 'تم نقل البضاعة بين المستودعين مع الحفاظ على الأثر المخزني والتكاليف.',
      signatures: [
        { roleAr: 'المسؤول عن الإرسال', nameAr: transfer.requestedByName },
        { roleAr: 'سائق الشحنة / الناقل', nameAr: 'السائق المعتمد' },
        { roleAr: 'المسؤول عن الاستلام', nameAr: transfer.receivedByName || 'أمين مستودع الوصول' },
      ],
    });
  }

  /**
   * 9. طباعة تسوية عهدة نقدية (Module 5)
   */
  public async renderCustodySettlement(tenantId: string, custodyId: string): Promise<string | null> {
    const custodyRes = await this.storage.getCashCustody(tenantId, custodyId);
    if (!custodyRes.success || !custodyRes.data) return null;
    const custody = custodyRes.data;

    const tenantRes = await this.storage.getTenant(tenantId);
    const tenant = tenantRes.success && tenantRes.data ? tenantRes.data : { nameAr: 'A.N ERP Tenant' };

    return this.renderHtml({
      header: {
        companyNameAr: tenant.nameAr,
        taxNumber: (tenant as any).taxNumber || '',
        documentTitleAr: 'محضر تسوية واستعاضة عهدة نقدية',
        documentNumber: `SETTLE-${custody.id}`,
        documentDate: new Date().toISOString().split('T')[0],
        statusBadge: custody.status === 'SETTLED' ? 'تمت التسوية' : custody.status,
      },
      metaFields: [
        { labelAr: 'كود العهدة', value: custody.id },
        { labelAr: 'أمين العهدة', value: custody.employeeName },
        { labelAr: 'المبلغ الأصلي المخصص', value: `${custody.allocatedAmount.toLocaleString('ar-SA')} ر.س` },
        { labelAr: 'الرصيد المتبقي بالعهدة', value: `${custody.currentBalance.toLocaleString('ar-SA')} ر.س` },
      ],
      columns: [
        { key: 'index', labelAr: '#', width: '30px', align: 'center' },
        { key: 'field', labelAr: 'بيان بند التسوية' },
        { key: 'val', labelAr: 'المبلغ (ر.س)', width: '120px', align: 'left' },
      ],
      rows: [
        { field: 'المبلغ الأصلي المخصص للعهدة', val: Number(custody.allocatedAmount).toLocaleString('ar-SA', { minimumFractionDigits: 2 }) },
        { field: 'إجمالي المنصرف من العهدة بموجب الفواتير', val: Number(custody.allocatedAmount - custody.currentBalance).toLocaleString('ar-SA', { minimumFractionDigits: 2 }) },
        { field: 'الرصيد النقدي المتبقي بالصندوق', val: Number(custody.currentBalance).toLocaleString('ar-SA', { minimumFractionDigits: 2 }) },
      ],
      totals: [
        { labelAr: 'مبلغ الاستعاضة المطلوب', value: `${(custody.allocatedAmount - custody.currentBalance).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`, isBold: true },
      ],
      notes: 'تمت مراجعة جميع المستندات وسندات الصرف المؤيدة للعهدة وإقفال التسوية.',
      signatures: [
        { roleAr: 'أمين العهدة', nameAr: custody.employeeName },
        { roleAr: 'المراجع الداخلي', nameAr: 'المراجع المالي' },
        { roleAr: 'المدير المالي', nameAr: 'المدير المالي' },
      ],
    });
  }

  /**
   * 10. طباعة كارت الصنف بالـ ID والخيارات (Module 7)
   */
  public async renderStockCard(tenantId: string, itemId: string, options?: { warehouseId?: string; fromDate?: string; toDate?: string }): Promise<string | null> {
    const tenantRes = await this.storage.getTenant(tenantId);
    const tenantName = tenantRes.success && tenantRes.data?.nameAr ? tenantRes.data.nameAr : 'A.N ERP Tenant';

    // We can fetch item ledger through storage or construct it
    const itemRes = await this.storage.getStockItem(tenantId, itemId);
    if (!itemRes.success || !itemRes.data) return null;
    const item = itemRes.data;

    const stocks = await this.storage.listWarehouseStock(tenantId, options?.warehouseId, itemId);
    const totalQty = stocks.success && stocks.data ? stocks.data.reduce((s: number, st: any) => s + (st.availableQty || 0), 0) : 0;
    const avgCost = stocks.success && stocks.data && stocks.data[0] ? stocks.data[0].averageCost : item.averageCost;

    const movementsRes = await this.storage.listStockMovements(tenantId, { itemId });
    const movements = movementsRes.success && movementsRes.data ? movementsRes.data : [];

    const report = {
      itemId: item.id,
      itemCode: item.itemCode,
      itemNameAr: item.nameAr,
      uom: item.uom,
      openingQty: 0,
      closingQty: totalQty,
      closingAvgCost: avgCost,
      closingTotalValue: totalQty * avgCost,
      entries: movements.map((m: any) => ({
        timestamp: m.timestamp,
        movementType: m.movementType,
        documentNumber: m.movementNumber || m.id,
        quantityIn: m.quantity > 0 ? m.quantity : 0,
        quantityOut: m.quantity < 0 ? Math.abs(m.quantity) : 0,
        runningQuantity: m.balanceAfterQty,
        unitCost: m.unitCost,
        runningAverageCost: m.unitCost,
        runningTotalValue: m.balanceAfterQty * m.unitCost,
      })),
    };

    return this.renderItemLedgerHtml(tenantName, report);
  }
}
