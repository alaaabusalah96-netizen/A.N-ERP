/**
 * @file EntityCloseService.ts
 * @description ACC-ENTITY-CLOSE-1 — pure rules for legal-entity books close/reopen.
 */
import type { EntityBooksState } from '../storage/StoragePort';

// FiscalPeriod may live in accountingTypes — re-export shape for pure checks
export type PeriodLike = { id: string; code: string; isClosed: boolean; nameAr?: string };

export type EcFail = { ok: false; status: number; type: string; title: string; detail: string };
export type EcOk = { ok: true };
export type EcResult = EcOk | EcFail;

const fail = (code: string, title: string, detail: string, status = 400): EcFail => ({
  ok: false, status, type: `https://api.an-erp.local/errors/${code}`, title, detail,
});

export function assertCanCloseEntity(args: {
  current?: EntityBooksState | null;
  period?: PeriodLike | null;
}): EcResult {
  if (args.current?.status === 'CLOSED') {
    return fail('entity-already-closed', 'الكيان مقفل', 'دفاتر هذه الشركة مقفلة بالفعل.', 409);
  }
  if (!args.period) {
    return fail('period-required', 'الفترة مطلوبة', 'حدد فترة محاسبية مقفلة لإسناد إقفال الكيان.');
  }
  if (!args.period.isClosed) {
    return fail('period-not-closed', 'الفترة غير مقفلة', 'يجب إقفال الفترة المحاسبية أولًا قبل إقفال الكيان.', 409);
  }
  return { ok: true };
}

export function assertCanReopenEntity(args: {
  current?: EntityBooksState | null;
  reason?: string;
}): EcResult {
  if (!args.current || args.current.status !== 'CLOSED') {
    return fail('entity-not-closed', 'الكيان غير مقفل', 'لا يمكن إعادة الفتح إلا لكيان مقفل.', 409);
  }
  const reason = String(args.reason || '').trim();
  if (reason.length < 5) {
    return fail('reopen-reason-required', 'سبب إعادة الفتح مطلوب', 'أدخل سببًا واضحًا (5 أحرف على الأقل).');
  }
  return { ok: true };
}

export function assertEntityOpenForStockMove(state?: EntityBooksState | null, role: 'source' | 'target' = 'source'): EcResult {
  if (state?.status === 'CLOSED') {
    const side = role === 'source' ? 'المصدر' : 'الوجهة';
    return fail(
      'entity-books-closed',
      `دفاتر شركة ${side} مقفلة`,
      'لا يُسمح بتحويل بين الشركات بينما دفاتر أحد الطرفين مقفلة على مستوى الكيان.',
      409,
    );
  }
  return { ok: true };
}

export function buildClosedState(tenantId: string, period: PeriodLike, userId: string): EntityBooksState {
  const now = new Date().toISOString();
  return {
    tenantId,
    status: 'CLOSED',
    closedPeriodCode: period.code,
    closedPeriodId: period.id,
    closedAt: now,
    closedBy: userId,
    updatedAt: now,
  };
}

export function buildReopenedState(tenantId: string, reason: string): EntityBooksState {
  const now = new Date().toISOString();
  return {
    tenantId,
    status: 'OPEN',
    reopenReason: reason.trim(),
    updatedAt: now,
  };
}
