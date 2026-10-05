/**
 * @file src/core/utils/validation.ts
 * @description Phase 9 (VAL-001) — dependency-free input validators.
 * Every parser returns `{ ok: true; value } | { ok: false; detail }` (detail is Arabic and names the field).
 * Pure functions: no I/O, no globals. `validationError(detail)` builds the RFC7807 body used by services and routes.
 */

export type ParseResult<T> =
  | { ok: true; value: T; detail?: string }
  | { ok: false; detail: string; value?: T };

const MAX_QUANTITY = 1_000_000_000;
const MAX_MONEY = 1_000_000_000_000;
const DECIMAL_TEXT = /^\d+(\.\d{1,4})?$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_NO_NEWLINE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

/** Number, or a plain decimal text ("12.25", no sign / exponent / spaces / separators); finite; ≤ 4 decimals. */
function toDecimal(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') {
    n = v;
  } else if (typeof v === 'string') {
    if (!DECIMAL_TEXT.test(v)) return null;
    n = Number(v);
  } else {
    return null;
  }
  if (!Number.isFinite(n)) return null;
  const rounded = Number(n.toFixed(4));
  if (Math.abs(n - rounded) > 1e-9) return null; // more than 4 decimals (float noise below 1e-9 is tolerated)
  return rounded;
}

export function parsePositiveQuantity(v: unknown, label: string): ParseResult<number> {
  const n = toDecimal(v);
  if (n === null || n <= 0 || n > MAX_QUANTITY) {
    return { ok: false, detail: `${label} يجب أن تكون رقمًا أكبر من صفر وحتى 1,000,000,000 بحد أقصى 4 خانات عشرية.` };
  }
  return { ok: true, value: n };
}

/** Same bounds as parsePositiveQuantity but zero is allowed (e.g. a counted quantity of 0). */
export function parseNonNegativeQuantity(v: unknown, label: string): ParseResult<number> {
  const n = toDecimal(v);
  if (n === null || n < 0 || n > MAX_QUANTITY) {
    return { ok: false, detail: `${label} يجب أن تكون رقمًا صفرًا أو أكبر وحتى 1,000,000,000 بحد أقصى 4 خانات عشرية.` };
  }
  return { ok: true, value: n };
}

export function parseNonNegativeMoney(v: unknown, label: string): ParseResult<number> {
  const n = toDecimal(v);
  if (n === null || n < 0 || n > MAX_MONEY) {
    return { ok: false, detail: `${label} يجب أن يكون مبلغًا صفرًا أو أكبر وحتى 1,000,000,000,000 بحد أقصى 4 خانات عشرية.` };
  }
  return { ok: true, value: n };
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** `YYYY-MM-DD` or a full ISO timestamp that is a real calendar date (no rolling: 2026-02-31 is rejected), 2000-01-01..2100-12-31. */
export function parseIsoDate(v: unknown, label: string): ParseResult<string> {
  const bad = (): ParseResult<string> => ({ ok: false, detail: `${label} يجب أن يكون تاريخًا صالحًا بصيغة YYYY-MM-DD أو ISO كاملة بين 2000-01-01 و2100-12-31.` });
  if (typeof v !== 'string') return bad();
  const s = v.trim();
  let m = DATE_ONLY.exec(s);
  let hh = 0, mi = 0, ss = 0;
  if (!m) {
    m = DATE_TIME.exec(s);
    if (!m) return bad();
    hh = Number(m[4]); mi = Number(m[5]); ss = m[6] !== undefined ? Number(m[6]) : 0;
    if (hh > 23 || mi > 59 || ss > 59) return bad();
  }
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 2000 || y > 2100) return bad();
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return bad();
  if (DATE_TIME.test(s) && Number.isNaN(Date.parse(s))) return bad();
  return { ok: true, value: s };
}

export function parseBoundedString(
  v: unknown,
  label: string,
  opts: { min?: number; max: number; allowNewlines?: boolean }
): ParseResult<string> {
  const min = opts.min ?? 0;
  const bad = (): ParseResult<string> => ({ ok: false, detail: `${label} يجب أن يكون نصًا بطول من ${min} إلى ${opts.max} حرفًا وبلا محارف تحكم.` });
  if (typeof v !== 'string') return bad();
  const s = v.trim();
  if (s.length < min || s.length > opts.max) return bad();
  if ((opts.allowNewlines ? CONTROL_CHARS_NO_NEWLINE : CONTROL_CHARS).test(s)) return bad();
  return { ok: true, value: s };
}

export function parseEnum<T extends string>(v: unknown, label: string, allowed: readonly T[]): ParseResult<T> {
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return { ok: true, value: v as T };
  return { ok: false, detail: `${label} يجب أن يكون إحدى القيم: ${allowed.join(' | ')}.` };
}

export function validationError(detail: string): { type: string; title: string; status: number; detail: string } {
  return {
    type: 'https://api.an-erp.local/errors/validation-failed',
    title: 'بيانات غير صالحة',
    status: 400,
    detail,
  };
}
