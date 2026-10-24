/**
 * @file publicError.ts
 * @description What an unexpected exception may tell the client (SEC-A). Internal/technical messages (database, network,
 * JS runtime, file paths) are replaced by a reference id and logged server-side. Arabic business messages written by our
 * own code are passed through. EXPOSE_ERROR_DETAILS=1 (local debugging only) returns the raw message.
 */
const ARABIC = /[\u0600-\u06FF]/;
const INTERNAL_MARKERS = /(relation "|column "|constraint|syntax error|SQLSTATE|violates|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|pg_|node_modules|\/home\/|\/app\/|\.tsx?:\d+|\bat\s+\S+\s+\(|Cannot read prop|is not a function|is not defined|undefined|\[object |JSON\.parse|Unexpected token|password|secret|token=)/i;

export function isClientSafeMessage(msg: string): boolean {
  return msg.length > 0 && msg.length <= 400 && !/[\r\n]/.test(msg) && ARABIC.test(msg) && !INTERNAL_MARKERS.test(msg);
}

export function publicErrorMessage(err: unknown, opts?: { expose?: boolean; log?: (line: string) => void }): string {
  const raw = String((err as any)?.message ?? err ?? '');
  if ((err as any)?.expose === true || isClientSafeMessage(raw)) return raw;
  if (opts?.expose ?? process.env.EXPOSE_ERROR_DETAILS === '1') return raw || 'Unknown error';
  const ref = 'ERR-' + Math.random().toString(16).slice(2, 10).toUpperCase();
  (opts?.log ?? ((l: string) => console.error(l)))(`[internal-error ${ref}] ${raw}`);
  return `حدث خطأ داخلي غير متوقع. رمز المرجع: ${ref}`;
}
