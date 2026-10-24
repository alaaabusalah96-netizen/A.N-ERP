/**
 * @file GroupMasterItemService.ts
 * @description MASTER-ITEM-GROUP-1 — pure validation for group-level item masters.
 */
import type { GroupMasterItem, StockItem } from '../storage/StoragePort';

export type GmiFail = { ok: false; status: number; type: string; title: string; detail: string };
export type GmiOk = { ok: true };
export type GmiResult = GmiOk | GmiFail;

const fail = (code: string, title: string, detail: string, status = 400): GmiFail => ({
  ok: false,
  status,
  type: `https://api.an-erp.local/errors/${code}`,
  title,
  detail,
});

export function validateGroupMasterItemInput(body: any): GmiResult & {
  itemCode?: string;
  nameAr?: string;
  nameEn?: string;
  category?: string;
  uom?: string;
} {
  const itemCode = String(body?.itemCode || body?.code || '').trim().toUpperCase();
  const nameAr = String(body?.nameAr || '').trim();
  const nameEn = body?.nameEn != null ? String(body.nameEn).trim() : undefined;
  const category = String(body?.category || '').trim();
  const uom = String(body?.uom || 'قطعة').trim() || 'قطعة';
  if (!itemCode || itemCode.length < 1 || itemCode.length > 64) {
    return fail('group-item-code-invalid', 'كود الصنف غير صالح', 'كود الصنف مطلوب (حتى 64 حرفًا).');
  }
  if (!nameAr || nameAr.length < 2) {
    return fail('group-item-name-invalid', 'اسم الصنف غير صالح', 'الاسم العربي مطلوب.');
  }
  if (!category) {
    return fail('group-item-category-invalid', 'التصنيف مطلوب', 'أدخل تصنيف الصنف.');
  }
  return { ok: true, itemCode, nameAr, nameEn, category, uom };
}

export function assertUniqueItemCodeInGroup(
  itemCode: string,
  existing: GroupMasterItem[],
  exceptId?: string,
): GmiResult {
  const clash = existing.find((i) => i.itemCode === itemCode && i.id !== exceptId);
  if (clash) {
    return fail('group-item-code-exists', 'كود الصنف مستخدم في المجموعة', 'اختر كودًا آخر.', 409);
  }
  return { ok: true };
}

export function buildGroupMasterItem(input: {
  groupId: string;
  itemCode: string;
  nameAr: string;
  nameEn?: string;
  category: string;
  uom: string;
}): GroupMasterItem {
  const now = new Date().toISOString();
  return {
    id: `GMI-${input.groupId}-${input.itemCode}`.slice(0, 80),
    groupId: input.groupId,
    itemCode: input.itemCode,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    category: input.category,
    uom: input.uom,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
}

/** Build a tenant StockItem shell from a group master (zero qty; accounts filled by caller defaults). */
export function stockItemShellFromGroupMaster(
  tenantId: string,
  gmi: GroupMasterItem,
  accounts: {
    inventoryAccountCode: string;
    cogsAccountCode: string;
    adjustmentExpenseAccountCode: string;
    adjustmentGainAccountCode: string;
  },
): StockItem {
  const now = new Date().toISOString();
  return {
    id: `ITM-${gmi.itemCode}`,
    tenantId,
    companyId: tenantId,
    itemCode: gmi.itemCode,
    nameAr: gmi.nameAr,
    nameEn: gmi.nameEn,
    category: gmi.category,
    uom: gmi.uom,
    inventoryAccountCode: accounts.inventoryAccountCode,
    cogsAccountCode: accounts.cogsAccountCode,
    adjustmentExpenseAccountCode: accounts.adjustmentExpenseAccountCode,
    adjustmentGainAccountCode: accounts.adjustmentGainAccountCode,
    valuationMethod: 'WEIGHTED_AVERAGE',
    standardCost: 0,
    averageCost: 0,
    sellingPrice: 0,
    reorderPoint: 0,
    minStockLevel: 0,
    maxStockLevel: 0,
    trackBatch: false,
    trackSerial: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as StockItem;
}
