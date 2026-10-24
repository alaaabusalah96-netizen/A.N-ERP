/**
 * @file shutdown.ts
 * @description OPS-1: graceful shutdown. Stop accepting connections, let in-flight requests finish,
 * close the database pools, then exit; a hard timer guarantees the process never hangs.
 */

export interface ShutdownDeps {
  server: { close(cb: (err?: Error) => void): unknown; closeIdleConnections?: () => void };
  closeStorage: () => Promise<void>;
  exit: (code: number) => void;
  timeoutMs?: number;
  log?: (message: string) => void;
}

/** Returns a handler that runs the shutdown once; later calls are ignored. */
export function createShutdownHandler(deps: ShutdownDeps): (signal: string) => Promise<void> {
  const log = deps.log ?? (() => {});
  const timeoutMs = deps.timeoutMs ?? 8000;
  let started = false;
  return async (signal: string) => {
    if (started) return;
    started = true;
    log(`${signal} received: closing HTTP server`);
    let forced = false;
    const timer = setTimeout(() => {
      forced = true;
      log(`timeout after ${timeoutMs}ms: forcing exit`);
      deps.exit(1);
    }, timeoutMs);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();
    try {
      await new Promise<void>(resolve => {
        try {
          deps.server.close(() => resolve());
          deps.server.closeIdleConnections?.();
        } catch (e: any) {
          log(`server.close failed: ${e?.message}`);
          resolve();
        }
      });
      log('HTTP server closed: closing storage');
      await deps.closeStorage();
    } catch (e: any) {
      log(`storage close failed: ${e?.message}`);
    }
    clearTimeout(timer);
    if (!forced) deps.exit(0);
  };
}
