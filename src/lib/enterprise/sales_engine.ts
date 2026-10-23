import { StorageEngine } from '../../db/storage';
import { syncWriteWithOfflineFallback } from '../../db/offlineQueue';
import { DocumentNumberEngine } from '../../db/documentNumberEngine';
import { CostCenterEngine } from '../../db/costCenterEngine';
import { OrganizationEngine } from '../../db/organizationEngine';
import { AccountingBusinessEngine } from './accounting_engine';
import { InventoryModule } from '../../db/inventory';
import { Customer, SalesInvoice, POSTransaction, DeliveryNote } from '../../types/sales';

export const SALES_COLLECTIONS = {
  CUSTOMERS: 'customers',
  SALES_INVOICES: 'sales_invoices',
  POS_TRANSACTIONS: 'pos_transactions',
  DELIVERY_NOTES: 'delivery_notes'
} as const;

export class SalesBusinessEngine {
  /**
   * Retrieves all customers filtered by company, supporting organizational subtree filtering
   */
  public static getCustomersByOrgUnit(companyId: string, org_unit_id?: string): Customer[] {
    const all = StorageEngine.getStored<Customer[]>('customers', []);
    const companyCustomers = all.filter(c => c.company_id === companyId);
    
    if (!org_unit_id || org_unit_id === 'ALL') {
      return companyCustomers;
    }

    const validSubtreeIds = new Set(OrganizationEngine.getSubtreeUnitIds(org_unit_id, companyId));
    return companyCustomers.filter(c => c.org_unit_id && validSubtreeIds.has(c.org_unit_id));
  }

  /**
   * Retrieves all sales invoices filtered by company, supporting organizational subtree filtering
   */
  public static getSalesInvoicesByOrgUnit(companyId: string, org_unit_id?: string): SalesInvoice[] {
    const all = StorageEngine.getStored<SalesInvoice[]>('sales_invoices', []);
    const companyInvoices = all.filter(i => i.company_id === companyId);

    if (!org_unit_id || org_unit_id === 'ALL') {
      return companyInvoices;
    }

    const validSubtreeIds = new Set(OrganizationEngine.getSubtreeUnitIds(org_unit_id, companyId));
    return companyInvoices.filter(i => i.org_unit_id && validSubtreeIds.has(i.org_unit_id));
  }

  /**
   * Retrieves all POS transactions filtered by company, supporting organizational subtree filtering
   */
  public static getPOSTransactionsByOrgUnit(companyId: string, org_unit_id?: string): POSTransaction[] {
    const all = StorageEngine.getStored<POSTransaction[]>('pos_transactions', []);
    const companyPOS = all.filter(p => p.company_id === companyId);

    if (!org_unit_id || org_unit_id === 'ALL') {
      return companyPOS;
    }

    const validSubtreeIds = new Set(OrganizationEngine.getSubtreeUnitIds(org_unit_id, companyId));
    return companyPOS.filter(p => p.org_unit_id && validSubtreeIds.has(p.org_unit_id));
  }

  /**
   * Registers a new customer with auto-cost-center assignment
   */
  public static async createCustomer(
    companyId: string,
    data: {
      nameAr: string;
      nameEn: string;
      phone?: string;
      email?: string;
      taxNo?: string;
      address?: string;
      openingBalance?: number;
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<Customer> {
    const allCustomers = StorageEngine.getStored<Customer[]>('customers', []);
    const targetOrgUnit = data.org_unit_id || undefined;

    let targetCostCenter = data.cost_center_id;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    const newCustomer: Customer = {
      id: `cust-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company_id: companyId,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      code: `CUST-${1001 + allCustomers.filter(c => c.company_id === companyId).length}`,
      phone: data.phone || '',
      email: data.email || '',
      taxNo: data.taxNo || '',
      address: data.address || '',
      balance: Number(data.openingBalance) || 0,
      createdAt: new Date().toISOString()
    };

    const syncRes = await syncWriteWithOfflineFallback(SALES_COLLECTIONS.CUSTOMERS, newCustomer.id, newCustomer);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync customer with cloud database');
    }

    const updated = [...allCustomers, newCustomer];
    StorageEngine.setStored('customers', updated);

    return newCustomer;
  }

  public static async saveCustomers(customers: Customer[]): Promise<{ success: boolean; error?: string }> {
    for (const c of customers) {
      const res = await syncWriteWithOfflineFallback(SALES_COLLECTIONS.CUSTOMERS, c.id, c);
      if (!res.success) {
        return { success: false, error: res.error || `Failed to sync customer ${c.nameAr} with cloud` };
      }
    }
    StorageEngine.setStored('customers', customers);
    return { success: true };
  }

  public static async saveSalesInvoices(invoices: SalesInvoice[]): Promise<{ success: boolean; error?: string }> {
    for (const inv of invoices) {
      const res = await syncWriteWithOfflineFallback(SALES_COLLECTIONS.SALES_INVOICES, inv.id, inv);
      if (!res.success) {
        return { success: false, error: res.error || `Failed to sync sales invoice ${inv.invoiceNo} with cloud` };
      }
    }
    StorageEngine.setStored('sales_invoices', invoices);
    return { success: true };
  }

  /**
   * Converts a CRM Lead into a registered Customer and optionally creates an initial Sales Invoice
   */
  public static async convertLeadToCustomerAndInvoice(
    companyId: string,
    operatorId: string,
    data: {
      leadId: string;
      leadName: string;
      phone?: string;
      email?: string;
      dealValue: number;
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<{ customer: Customer; invoice?: SalesInvoice }> {
    const existingCustomers = this.getCustomersByOrgUnit(companyId, data.org_unit_id);
    let customer = existingCustomers.find(
      c => c.nameAr.toLowerCase() === data.leadName.toLowerCase() || c.nameEn.toLowerCase() === data.leadName.toLowerCase()
    );

    if (!customer) {
      customer = await this.createCustomer(companyId, {
        nameAr: data.leadName,
        nameEn: data.leadName,
        phone: data.phone,
        email: data.email,
        org_unit_id: data.org_unit_id,
        cost_center_id: data.cost_center_id
      });
    }

    let invoice: SalesInvoice | undefined = undefined;
    if (data.dealValue > 0) {
      const subtotal = Math.round((data.dealValue / 1.14) * 100) / 100;
      const vatAmount = Math.round((data.dealValue - subtotal) * 100) / 100;
      invoice = await this.createSalesInvoice(companyId, operatorId, {
        customerId: customer.id,
        customerName: customer.nameAr || customer.nameEn,
        subtotal,
        taxAmount: vatAmount,
        netAmount: data.dealValue,
        items: [
          {
            id: `item-${Date.now()}`,
            productId: 'srv-crm',
            name: 'خدمات / توريدات العقد المحول من فرصة CRM',
            qty: 1,
            price: subtotal,
            total: subtotal
          }
        ],
        notes: `فاتورة صادرة تلقائياً بناءً على إغلاق فرصة CRM (#${data.leadId})`,
        org_unit_id: data.org_unit_id,
        cost_center_id: data.cost_center_id
      });
    }

    return { customer, invoice };
  }

  /**
   * Issues a sales invoice with automatic sequence numbering, cost center, stock deduction, and double-entry posting
   */
  public static async createSalesInvoice(
    companyId: string,
    operatorId: string,
    data: {
      customerId: string;
      customerName: string;
      items: any[];
      subtotal: number;
      taxAmount: number;
      discountAmount?: number;
      netAmount: number;
      dueDateOffset?: number;
      notes?: string;
      org_unit_id?: string;
      cost_center_id?: string;
      warehouseId?: string;
    }
  ): Promise<SalesInvoice> {
    const allInvoices = StorageEngine.getStored<SalesInvoice[]>('sales_invoices', []);
    const targetOrgUnit = data.org_unit_id || undefined;

    let targetCostCenter = data.cost_center_id;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    // Generate org-aware document number
    let invoiceNo = '';
    try {
      const genResult = await DocumentNumberEngine.generateNextNumberAsync({
        companyId,
        documentType: 'INVOICE',
        org_unit_id: targetOrgUnit
      });
      invoiceNo = genResult.documentNumber;
    } catch {
      invoiceNo = `SINV-${10001 + allInvoices.filter(i => i.company_id === companyId).length}`;
    }

    const invoiceDate = new Date().toISOString().split('T')[0];
    const dueDateObj = new Date();
    dueDateObj.setDate(dueDateObj.getDate() + (data.dueDateOffset || 30));
    const dueDateStr = dueDateObj.toISOString().split('T')[0];

    const newInvoice: SalesInvoice = {
      id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company_id: companyId,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      invoiceNo,
      customerId: data.customerId,
      customerName: data.customerName,
      items: data.items,
      subtotal: data.subtotal,
      taxAmount: data.taxAmount,
      discountAmount: Number(data.discountAmount) || 0,
      netAmount: data.netAmount,
      status: 'UNPAID',
      date: invoiceDate,
      dueDate: dueDateStr,
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };

    // Save Invoice to Cloud First
    const syncRes = await syncWriteWithOfflineFallback(SALES_COLLECTIONS.SALES_INVOICES, newInvoice.id, newInvoice);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync sales invoice with cloud database');
    }

    StorageEngine.setStored('sales_invoices', [...allInvoices, newInvoice]);

    // Update Customer Balance
    const allCustomers = StorageEngine.getStored<Customer[]>('customers', []);
    const targetCust = allCustomers.find(c => c.id === data.customerId);
    if (targetCust) {
      const updatedCust = { ...targetCust, balance: targetCust.balance + data.netAmount };
      const custSyncRes = await syncWriteWithOfflineFallback(SALES_COLLECTIONS.CUSTOMERS, targetCust.id, updatedCust);
      if (custSyncRes.success) {
        const updatedCustomers = allCustomers.map(c => c.id === targetCust.id ? updatedCust : c);
        StorageEngine.setStored('customers', updatedCustomers);
      }
    }

    // Deduct warehouse stock
    const warehouses = InventoryModule.getWarehouses();
    const activeWh = data.warehouseId || warehouses[0]?.id;
    if (activeWh) {
      for (let itemIdx = 0; itemIdx < data.items.length; itemIdx++) {
        const item = data.items[itemIdx];
        const idempotencyKey = `sales-inv-${newInvoice.id}-${item.productId}-${itemIdx}`;
        await InventoryModule.adjustStock(
          activeWh,
          item.productId,
          -item.qty,
          'Issue',
          operatorId,
          undefined,
          idempotencyKey
        );
      }
    }

    // Post GL Double Entry
    try {
      await AccountingBusinessEngine.postOperationalDoubleEntry(
        companyId,
        operatorId,
        newInvoice.invoiceNo,
        `فاتورة مبيعات رقم ${newInvoice.invoiceNo} للعميل ${data.customerName}`,
        `Sales invoice ${newInvoice.invoiceNo} for customer ${data.customerName}`,
        [
          { accountCode: '110301', debit: data.netAmount, credit: 0, notes: `مستحق على ${data.customerName}` },
          ...(data.taxAmount > 0 ? [{ accountCode: '210201', debit: 0, credit: data.taxAmount, notes: `ضريبة القيمة المضافة` }] : []),
          { accountCode: '410101', debit: 0, credit: data.subtotal - (Number(data.discountAmount) || 0), notes: `إيراد مبيعات السلع والخدمات` }
        ],
        {
          org_unit_id: targetOrgUnit,
          cost_center_id: targetCostCenter,
          warehouse_id: activeWh
        }
      );
    } catch (e) {
      console.error('Sales Invoice double-entry posting error:', e);
    }

    return newInvoice;
  }

  /**
   * Processes a POS Sale Checkout with automatic sequence numbering, stock deduction, and double entry GL posting
   */
  public static async processPOSCheckout(
    companyId: string,
    operatorId: string,
    cashierName: string,
    data: {
      items: any[];
      subtotal: number;
      vatAmount: number;
      grandTotal: number;
      paymentMethod: 'CASH' | 'CARD' | 'WALLET';
      org_unit_id?: string;
      cost_center_id?: string;
      warehouseId?: string;
    }
  ): Promise<POSTransaction> {
    const allPOSSales = StorageEngine.getStored<POSTransaction[]>('pos_transactions', []);
    const targetOrgUnit = data.org_unit_id || undefined;

    let targetCostCenter = data.cost_center_id;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    // Generate sequence number
    let receiptNo = '';
    try {
      const genResult = await DocumentNumberEngine.generateNextNumberAsync({
        companyId,
        documentType: 'RECEIPT',
        org_unit_id: targetOrgUnit
      });
      receiptNo = genResult.documentNumber;
    } catch {
      receiptNo = `POS-${10001 + allPOSSales.filter(p => p.company_id === companyId).length}`;
    }

    const saleRecord: POSTransaction = {
      id: `pos-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company_id: companyId,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      receiptNo,
      items: data.items,
      subtotal: data.subtotal,
      vatAmount: data.vatAmount,
      grandTotal: data.grandTotal,
      paymentMethod: data.paymentMethod,
      cashier: cashierName,
      timestamp: new Date().toISOString()
    };

    // Deduct quantity from warehouse
    const warehouses = InventoryModule.getWarehouses();
    const activeWh = data.warehouseId || warehouses[0]?.id;
    if (activeWh) {
      for (let itemIdx = 0; itemIdx < data.items.length; itemIdx++) {
        const item = data.items[itemIdx];
        const idempotencyKey = `sales-pos-${saleRecord.id}-${item.productId}-${itemIdx}`;
        await InventoryModule.adjustStock(
          activeWh,
          item.productId,
          -item.qty,
          'Issue',
          operatorId,
          undefined,
          idempotencyKey
        );
      }
    }

    // Save POS Sale to Cloud First
    const syncRes = await syncWriteWithOfflineFallback(SALES_COLLECTIONS.POS_TRANSACTIONS, saleRecord.id, saleRecord);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync POS transaction with cloud database');
    }

    StorageEngine.setStored('pos_transactions', [...allPOSSales, saleRecord]);

    // Post Double Entry GL
    try {
      const debitAccount = data.paymentMethod === 'CASH' ? '110101' : '110201';
      await AccountingBusinessEngine.postOperationalDoubleEntry(
        companyId,
        operatorId,
        saleRecord.receiptNo,
        `مبيعات نقطة البيع رقم ${saleRecord.receiptNo} - ${data.paymentMethod}`,
        `POS sale ${saleRecord.receiptNo} - ${data.paymentMethod}`,
        [
          { accountCode: debitAccount, debit: data.grandTotal, credit: 0, notes: `تحصيل مبيعات POS` },
          ...(data.vatAmount > 0 ? [{ accountCode: '210201', debit: 0, credit: data.vatAmount, notes: `ضريبة مبيعات POS` }] : []),
          { accountCode: '410101', debit: 0, credit: data.subtotal, notes: `إيراد مبيعات POS` }
        ],
        {
          org_unit_id: targetOrgUnit,
          cost_center_id: targetCostCenter,
          warehouse_id: activeWh
        }
      );
    } catch (e) {
      console.error('POS GL posting error:', e);
    }

    return saleRecord;
  }

  /**
   * Creates a Delivery Note for Sales Orders / Invoices
   */
  public static async createDeliveryNote(
    companyId: string,
    data: {
      customerId: string;
      customerName: string;
      salesInvoiceId?: string;
      items: any[];
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<DeliveryNote> {
    const allNotes = StorageEngine.getStored<DeliveryNote[]>('delivery_notes', []);
    const targetOrgUnit = data.org_unit_id || undefined;

    let targetCostCenter = data.cost_center_id;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    let deliveryNo = '';
    try {
      const genResult = await DocumentNumberEngine.generateNextNumberAsync({
        companyId,
        documentType: 'TRANSFER',
        org_unit_id: targetOrgUnit
      });
      deliveryNo = genResult.documentNumber;
    } catch {
      deliveryNo = `DN-${10001 + allNotes.filter(d => d.company_id === companyId).length}`;
    }

    const note: DeliveryNote = {
      id: `dn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company_id: companyId,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      deliveryNo,
      salesInvoiceId: data.salesInvoiceId,
      customerId: data.customerId,
      customerName: data.customerName,
      items: data.items,
      status: 'DISPATCHED',
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };

    const syncRes = await syncWriteWithOfflineFallback(SALES_COLLECTIONS.DELIVERY_NOTES, note.id, note);
    if (!syncRes.success) {
      throw new Error(syncRes.error || 'Failed to sync delivery note with cloud database');
    }

    StorageEngine.setStored('delivery_notes', [...allNotes, note]);

    return note;
  }
}
