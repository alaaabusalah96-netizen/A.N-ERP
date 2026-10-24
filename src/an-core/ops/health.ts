/**
 * @file health.ts
 * @description OPS-1: readiness check used by GET /api/health?ready=1 (liveness stays a plain GET /api/health).
 */

export interface ReadinessResult {
  ready: boolean;
  database: 'ok' | 'down' | 'skipped';
}

/** True for ?ready=1 / ?ready=true (a repeated parameter arrives as an array: only the first value counts). */
export function isReadinessRequest(value: unknown): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === '1' || v === 'true';
}

/**
 * With a database configured the ping must answer true within timeoutMs; otherwise the service is not ready.
 * Without a database (InMemory dev mode) the check is skipped and the service is ready.
 */
export async function checkReadiness(opts: {
  hasDatabase: boolean;
  ping: () => Promise<boolean>;
  timeoutMs?: number;
}): Promise<ReadinessResult> {
  if (!opts.hasDatabase) return { ready: true, database: 'skipped' };
  const timeoutMs = opts.timeoutMs ?? 2000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ok = await Promise.race<boolean>([
      Promise.resolve().then(() => opts.ping()).then(v => v === true).catch(() => false),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
    return { ready: ok, database: ok ? 'ok' : 'down' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
