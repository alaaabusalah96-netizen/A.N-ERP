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


/** Phase 17 (ATT-001): HTTPS-only public URL, no credentials, no loopback/private hosts. */
export function parseSafeFileUrl(v: unknown): ParseResult<string> {
  if (typeof v !== 'string') return { ok: false, detail: 'رابط الملف يجب أن يكون نصًا.' };
  const s = v.trim();
  if (s.length < 1 || s.length > 2048) return { ok: false, detail: 'رابط الملف يجب أن يكون بطول من 1 إلى 2048 حرفًا.' };
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, detail: 'رابط الملف غير صالح.' }; }
  if (u.protocol !== 'https:') return { ok: false, detail: 'رابط الملف يجب أن يستخدم بروتوكول https فقط.' };
  if (u.username || u.password) return { ok: false, detail: 'رابط الملف لا يجوز أن يحتوي بيانات مصادقة.' };
  const host = (u.hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '::1') {
    return { ok: false, detail: 'رابط الملف لا يجوز أن يشير إلى مضيف محلي.' };
  }
  // IPv4 private / loopback / link-local
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = m.slice(1).map(Number);
    if (a.some((n) => n > 255)) return { ok: false, detail: 'رابط الملف يحتوي عنوان IP غير صالح.' };
    const [o1, o2] = a;
    if (o1 === 127 || o1 === 10 || o1 === 0 || (o1 === 192 && o2 === 168) || (o1 === 169 && o2 === 254) || (o1 === 172 && o2 >= 16 && o2 <= 31)) {
      return { ok: false, detail: 'رابط الملف لا يجوز أن يشير إلى شبكة خاصة أو حلقة محلية.' };
    }
  }
  // IPv6 private-ish prefixes (fc/fd unique local, fe80 link-local)
  if (host.includes(':') && (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host === '::1')) {
    return { ok: false, detail: 'رابط الملف لا يجوز أن يشير إلى عنوان IPv6 خاص.' };
  }
  return { ok: true, value: s };
}

const SAFE_FILE_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip']);
const SAFE_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
  'application/zip',
]);
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

/** Sanitize file name: strip path segments, control chars; keep a safe basename with allowed extension. */
export function parseSafeFileName(v: unknown): ParseResult<string> {
  if (typeof v !== 'string') return { ok: false, detail: 'اسم الملف يجب أن يكون نصًا.' };
  let s = v.trim();
  if (!s) return { ok: false, detail: 'اسم الملف مطلوب.' };
  // strip path traversal
  s = s.replace(/\\/g, '/');
  const parts = s.split('/');
  s = parts[parts.length - 1] || '';
  s = s.replace(/\0/g, '').replace(/[\u0000-\u001f]/g, '').trim();
  if (!s || s === '.' || s === '..') return { ok: false, detail: 'اسم الملف غير صالح.' };
  if (s.length > 200) return { ok: false, detail: 'اسم الملف طويل جدًا (الحد 200 حرفًا).' };
  const dot = s.lastIndexOf('.');
  if (dot <= 0 || dot === s.length - 1) return { ok: false, detail: 'اسم الملف يجب أن يحتوي امتدادًا مسموحًا.' };
  const ext = s.slice(dot + 1).toLowerCase();
  if (!SAFE_FILE_EXT.has(ext)) return { ok: false, detail: `امتداد الملف (.${ext}) غير مسموح.` };
  return { ok: true, value: s };
}

export function parseSafeMimeType(v: unknown): ParseResult<string> {
  if (typeof v !== 'string') return { ok: false, detail: 'نوع الملف (MIME) يجب أن يكون نصًا.' };
  const s = v.trim().toLowerCase();
  if (!SAFE_MIME.has(s)) return { ok: false, detail: `نوع الملف (${s}) غير مسموح.` };
  return { ok: true, value: s };
}

/** Positive file size in bytes, ≤ 20 MB. */
export function parseAttachmentSize(v: unknown): ParseResult<number> {
  if (typeof v !== 'number' && typeof v !== 'string') return { ok: false, detail: 'حجم الملف يجب أن يكون رقمًا.' };
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return { ok: false, detail: 'حجم الملف يجب أن يكون عددًا صحيحًا أكبر من صفر.' };
  if (n > MAX_ATTACHMENT_BYTES) return { ok: false, detail: 'حجم الملف يتجاوز الحد الأقصى 20 ميجابايت.' };
  return { ok: true, value: n };
}

export const ATTACHMENT_LIMITS = { maxPerDocument: 50, maxBytes: MAX_ATTACHMENT_BYTES } as const;

/**
 * Phase 9 (VAL-001): shared check for the journal-entry creation routes.
 * `date` is optional (validated when sent); `lines` must be a non-empty array of objects whose debit/credit are
 * non-negative money (missing/null/'' count as 0) and never both > 0 on the same line.
 * Returns parsed numbers so callers can use them instead of the raw input.
 */
export function validateJournalInput(
  date: unknown,
  lines: unknown
): { ok: true; date?: string; amounts: Array<{ debit: number; credit: number }> } | { ok: false; detail: string } {
  let parsedDate: string | undefined;
  if (date !== undefined && date !== null && date !== '') {
    const d = parseIsoDate(date, 'تاريخ القيد (date)');
    if (!d.ok) return { ok: false, detail: d.detail };
    parsedDate = d.value;
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, detail: 'أسطر القيد (lines) مطلوبة ويجب أن تحتوي على سطر واحد على الأقل.' };
  }
  const amounts: Array<{ debit: number; credit: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const l: any = lines[i];
    if (l === null || typeof l !== 'object') return { ok: false, detail: `السطر رقم ${i + 1} من القيد (lines[${i}]) غير صالح.` };
    const amt = (v: unknown, label: string): ParseResult<number> =>
      v === undefined || v === null || v === '' ? { ok: true, value: 0 } : parseNonNegativeMoney(v, label);
    const d = amt(l.debit, `المدين (debit) في السطر رقم ${i + 1}`);
    if (!d.ok) return { ok: false, detail: d.detail };
    const c = amt(l.credit, `الدائن (credit) في السطر رقم ${i + 1}`);
    if (!c.ok) return { ok: false, detail: c.detail };
    if (d.value > 0 && c.value > 0) {
      return { ok: false, detail: `السطر رقم ${i + 1} يحتوي على مدين ودائن معًا؛ يجب أن يكون أحدهما صفرًا.` };
    }
    amounts.push({ debit: d.value as number, credit: c.value as number });
  }
  return { ok: true, date: parsedDate, amounts };
}
