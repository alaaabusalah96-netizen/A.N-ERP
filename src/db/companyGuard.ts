export const REQUIRE_COMPANY_ID_ERROR = 'يجب اختيار شركة قبل الحفظ. / Please select a company before saving.';

export function isValidCompanyId(companyId?: string | null): companyId is string {
  return typeof companyId === 'string' && companyId.trim().length > 0;
}

export function requireCompanyId(companyId?: string | null, customErrorMessage?: string): string {
  if (!isValidCompanyId(companyId)) {
    throw new Error(customErrorMessage || REQUIRE_COMPANY_ID_ERROR);
  }
  return companyId;
}
