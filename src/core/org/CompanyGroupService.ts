/**
 * @file CompanyGroupService.ts
 * @description ORG-GROUP-1 — pure validation for company groups (no I/O).
 */
import type { CompanyGroup, TenantCompany } from '../storage/StoragePort';

export type GroupFail = { ok: false; status: number; type: string; title: string; detail: string };
export type GroupOk = { ok: true };
export type GroupResult = GroupOk | GroupFail;

const fail = (code: string, title: string, detail: string, status = 400): GroupFail => ({
  ok: false,
  status,
  type: `https://api.an-erp.local/errors/${code}`,
  title,
  detail,
});

export function validateNewGroupInput(body: any): GroupResult & { code?: string; nameAr?: string; nameEn?: string } {
  const code = String(body?.code || '').trim().toUpperCase();
  const nameAr = String(body?.nameAr || '').trim();
  const nameEn = body?.nameEn != null ? String(body.nameEn).trim() : undefined;
  if (!code || code.length < 2 || code.length > 32) {
    return fail('group-code-invalid', 'رمز المجموعة غير صالح', 'الرمز مطلوب (2–32 حرفًا).');
  }
  if (!nameAr || nameAr.length < 2) {
    return fail('group-name-invalid', 'اسم المجموعة غير صالح', 'الاسم العربي مطلوب.');
  }
  return { ok: true, code, nameAr, nameEn };
}

export function assertTenantCanJoin(
  tenantId: string,
  tenants: TenantCompany[],
  group: CompanyGroup,
): GroupResult {
  if (!tenantId) {
    return fail('tenant-id-required', 'معرّف الشركة مطلوب', 'tenantId مطلوب.');
  }
  if (!tenants.some((t) => t.id === tenantId)) {
    return fail('tenant-not-found', 'الشركة غير موجودة', 'لا يمكن إضافة شركة غير مسجّلة للمجموعة.', 404);
  }
  if (group.memberTenantIds.includes(tenantId)) {
    return fail('tenant-already-member', 'الشركة عضو بالفعل', 'هذه الشركة منضمّة للمجموعة.');
  }
  return { ok: true };
}

export function buildCompanyGroup(input: {
  code: string;
  nameAr: string;
  nameEn?: string;
  memberTenantIds?: string[];
}): CompanyGroup {
  const now = new Date().toISOString();
  return {
    id: `GRP-${input.code}`,
    code: input.code,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    status: 'ACTIVE',
    memberTenantIds: [...(input.memberTenantIds || [])],
    createdAt: now,
    updatedAt: now,
  };
}
