/**
 * @file CrossCompanyTransferService.ts
 * @description STK-XCOMPANY-1 — pure rules for inter-company stock moves within a group.
 */
import type { CompanyGroup, CrossCompanyTransfer } from '../storage/StoragePort';

export type XcFail = { ok: false; status: number; type: string; title: string; detail: string };
export type XcOk = { ok: true };
export type XcResult = XcOk | XcFail;

const fail = (code: string, title: string, detail: string, status = 400): XcFail => ({
  ok: false, status, type: `https://api.an-erp.local/errors/${code}`, title, detail,
});

export function validateCrossCompanyCreate(input: {
  group?: CompanyGroup | null;
  sourceTenantId?: string;
  targetTenantId?: string;
  sourceWarehouseId?: string;
  targetWarehouseId?: string;
  itemCode?: string;
  quantity?: number;
}): XcResult {
  if (!input.group) return fail('group-required', 'المجموعة مطلوبة', 'حدد مجموعة الشركات.', 404);
  const src = String(input.sourceTenantId || '').trim();
  const tgt = String(input.targetTenantId || '').trim();
  if (!src || !tgt) return fail('tenants-required', 'الشركتان مطلوبتان', 'مصدر ووجهة مطلوبان.');
  if (src === tgt) return fail('same-tenant', 'نفس الشركة', 'التحويل بين شركتين مختلفتين فقط.');
  if (!input.group.memberTenantIds.includes(src) || !input.group.memberTenantIds.includes(tgt)) {
    return fail('not-group-members', 'ليستا في المجموعة', 'الشركتان يجب أن تكونا أعضاء في نفس المجموعة.', 403);
  }
  if (!input.sourceWarehouseId || !input.targetWarehouseId) {
    return fail('warehouses-required', 'المستودعان مطلوبان', 'حدد مستودع المصدر والوجهة.');
  }
  const code = String(input.itemCode || '').trim();
  if (!code) return fail('item-required', 'الصنف مطلوب', 'كود الصنف مطلوب.');
  const qty = Number(input.quantity);
  if (!(qty > 0)) return fail('qty-invalid', 'كمية غير صالحة', 'الكمية يجب أن تكون أكبر من صفر.');
  return { ok: true };
}

export function buildCrossCompanyTransfer(input: {
  groupId: string;
  sourceTenantId: string;
  targetTenantId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  itemCode: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
}): CrossCompanyTransfer {
  const now = new Date().toISOString();
  const id = `XCT-${Date.now().toString(36).toUpperCase()}`;
  return {
    id,
    groupId: input.groupId,
    sourceTenantId: input.sourceTenantId,
    targetTenantId: input.targetTenantId,
    sourceWarehouseId: input.sourceWarehouseId,
    targetWarehouseId: input.targetWarehouseId,
    itemCode: String(input.itemCode).trim().toUpperCase(),
    quantity: Number(input.quantity),
    unitCost: Number(input.unitCost || 0),
    status: 'REQUESTED',
    notes: input.notes,
    createdAt: now,
  };
}

export function assertCanDispatch(tr: CrossCompanyTransfer): XcResult {
  if (tr.status !== 'REQUESTED') {
    return fail('invalid-status', 'حالة غير صالحة للإرسال', 'يُرسل فقط التحويل بحالة REQUESTED.', 409);
  }
  return { ok: true };
}

export function assertCanReceive(tr: CrossCompanyTransfer): XcResult {
  if (tr.status !== 'IN_TRANSIT') {
    return fail('invalid-status', 'حالة غير صالحة للاستلام', 'يُستلم فقط التحويل في الطريق.', 409);
  }
  return { ok: true };
}
