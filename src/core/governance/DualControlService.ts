/**
 * @file DualControlService.ts
 * @description Master Data Dual-Control Governance Service for A.N ERP (v7.1 / Phase 2)
 * Strictly conforms to Section 2F & 7 (SoD & Master Data Governance).
 * Enforces two-person rule (Dual-Control) for items, customers, and vendors.
 * Entities are created in PENDING_APPROVAL and cannot be self-approved by the initiator.
 */

import { StoragePort, MasterItem, MasterPartner, StorageResult } from '../storage/StoragePort';

export interface UserContext {
  id: string;
  fullName: string;
  role: string;
}

export class DualControlService {
  private readonly port: StoragePort;

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * Creates a new inventory master item in status PENDING_APPROVAL.
   */
  public async createMasterItem(
    tenantId: string,
    itemData: {
      code: string;
      nameAr: string;
      category: string;
      unitPrice: number;
      costPrice: number;
    },
    creator: UserContext,
    idempotencyKey: string
  ): Promise<StorageResult<MasterItem>> {
    const item: MasterItem = {
      id: `ITM-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      code: itemData.code.trim().toUpperCase(),
      nameAr: itemData.nameAr.trim(),
      category: itemData.category.trim(),
      unitPrice: Number(itemData.unitPrice) || 0,
      costPrice: Number(itemData.costPrice) || 0,
      status: 'PENDING_APPROVAL',
      createdBy: creator.id,
      createdAt: new Date().toISOString(),
    };

    return this.port.saveMasterItem(tenantId, item, idempotencyKey);
  }

  /**
   * Approves a master item.
   * REJECTS self-approval by initiator under SoD rules.
   */
  public async approveMasterItem(
    tenantId: string,
    itemId: string,
    approver: UserContext,
    idempotencyKey: string
  ): Promise<StorageResult<MasterItem>> {
    const existing = await this.port.getMasterItem(tenantId, itemId);
    if (!existing.success || !existing.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/not-found',
          title: 'الصنف غير موجود',
          status: 404,
          detail: `تعذر العثور على الصنف برقم ${itemId}`,
        },
      };
    }

    const item = existing.data;

    // SoD Enforcement: Creator cannot approve their own master data entry
    if (item.createdBy === approver.id) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-conflict',
          title: 'تعارض في مبدأ فصل المهام (Dual-Control Violation)',
          status: 403,
          detail: 'ممنوع اعتماد الصنف بواسطة منشئه الأصلي تطبيقاً لمبدأ الرقابة الثنائية (Dual-Control). يتطلب اعتماد شخص مخوّل آخر.',
        },
      };
    }

    if (item.status === 'APPROVED') {
      return { success: true, data: item };
    }

    return this.port.approveMasterItem(tenantId, itemId, approver.id, idempotencyKey);
  }

  /**
   * Creates a business partner (Customer or Vendor) in status PENDING_APPROVAL.
   */
  public async createMasterPartner(
    tenantId: string,
    partnerData: {
      type: 'CUSTOMER' | 'VENDOR';
      code: string;
      nameAr: string;
      taxNumber?: string;
      phone?: string;
    },
    creator: UserContext,
    idempotencyKey: string
  ): Promise<StorageResult<MasterPartner>> {
    const partner: MasterPartner = {
      id: `PRT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      type: partnerData.type,
      code: partnerData.code.trim().toUpperCase(),
      nameAr: partnerData.nameAr.trim(),
      taxNumber: partnerData.taxNumber?.trim(),
      phone: partnerData.phone?.trim(),
      status: 'PENDING_APPROVAL',
      createdBy: creator.id,
      createdAt: new Date().toISOString(),
    };

    return this.port.saveMasterPartner(tenantId, partner, idempotencyKey);
  }

  /**
   * Approves a customer or vendor.
   * REJECTS self-approval by initiator under SoD rules.
   */
  public async approveMasterPartner(
    tenantId: string,
    partnerId: string,
    approver: UserContext,
    idempotencyKey: string
  ): Promise<StorageResult<MasterPartner>> {
    const existing = await this.port.getMasterPartner(tenantId, partnerId);
    if (!existing.success || !existing.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/not-found',
          title: 'الشريك التجاري غير موجود',
          status: 404,
          detail: `تعذر العثور على الشريك برقم ${partnerId}`,
        },
      };
    }

    const partner = existing.data;

    // SoD Enforcement: Creator cannot approve their own partner entry
    if (partner.createdBy === approver.id) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/sod-conflict',
          title: 'تعارض في مبدأ فصل المهام (Dual-Control Violation)',
          status: 403,
          detail: `ممنوع اعتماد ${partner.type === 'CUSTOMER' ? 'العميل' : 'المورد'} بواسطة منشئه تطبيقاً لقواعد الحوكمة المزدوجة.`,
        },
      };
    }

    if (partner.status === 'APPROVED') {
      return { success: true, data: partner };
    }

    return this.port.approveMasterPartner(tenantId, partnerId, approver.id, idempotencyKey);
  }

  /**
   * Verifies if an item or partner is approved before being used in financial transactions.
   */
  public static assertUsableInTransaction(entity: MasterItem | MasterPartner): { usable: boolean; errorDetail?: string } {
    if (entity.status !== 'APPROVED') {
      return {
        usable: false,
        errorDetail: `لا يمكن استخدام (${entity.nameAr}) في المعاملات المالية لأن حالته الحالية هي (${entity.status}). يتطلب اعتماد مخول أولاً.`,
      };
    }
    return { usable: true };
  }
}
