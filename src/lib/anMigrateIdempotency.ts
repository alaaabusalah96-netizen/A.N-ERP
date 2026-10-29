/**
 * AN-MIG-IDEM-1 — batch idempotency key helpers for migrate writes.
 */
export function extractIdempotencyKey(req: {
  headers?: Record<string, unknown>;
  body?: any;
}): string {
  const h =
    (req.headers?.['idempotency-key'] as string) ||
    (req.headers?.['Idempotency-Key'] as string) ||
    '';
  const fromHeader = String(h || '').trim();
  if (fromHeader) return fromHeader.slice(0, 128);
  const fromBody = String(req.body?.idempotencyKey || '').trim();
  return fromBody.slice(0, 128);
}

export function requireIdempotencyKey(key: string): {
  ok: true;
  key: string;
} | {
  ok: false;
  status: 400;
  code: string;
  message: string;
  messageAr: string;
} {
  if (!key) {
    return {
      ok: false,
      status: 400,
      code: 'idempotency_key_required',
      message: 'Idempotency-Key header or body.idempotencyKey required',
      messageAr: 'مفتاح عدم التكرار مطلوب لإعادة المحاولة الآمنة',
    };
  }
  return { ok: true, key };
}

/** Stable per-row key: batchKey + entity id */
export function rowIdempotencyKey(batchKey: string, entityId: string): string {
  return `${batchKey}:${entityId}`.slice(0, 160);
}
