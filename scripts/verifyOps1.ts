/**
 * OPS-1 — readiness check, graceful shutdown, health body, container files (no database, no server, no Docker needed).
 * Run: npx tsx scripts/verifyOps1.ts
 */
import fs from 'fs';
import { checkReadiness, isReadinessRequest } from '../src/core/ops/health';
import { createShutdownHandler } from '../src/core/ops/shutdown';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`[PASS] ${label}`); }
  else { fail++; console.log(`[FAIL] ${label}${extra ? ' | ' + extra : ''}`); }
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const read = (p: string) => fs.readFileSync(p, 'utf8');

async function main() {
  // ---- readiness
  check('R1 ?ready=1 and ?ready=true are readiness requests', isReadinessRequest('1') && isReadinessRequest('true') && isReadinessRequest(['1', '0']));
  check('R2 absent / other values are not readiness requests', !isReadinessRequest(undefined) && !isReadinessRequest('0') && !isReadinessRequest('yes') && !isReadinessRequest(['0', '1']));
  const noDb = await checkReadiness({ hasDatabase: false, ping: async () => { throw new Error('must not be called'); } });
  check('R3 no database configured => ready, database skipped', noDb.ready === true && noDb.database === 'skipped');
  const up = await checkReadiness({ hasDatabase: true, ping: async () => true });
  check('R4 database answers => ready', up.ready === true && up.database === 'ok');
  const dn = await checkReadiness({ hasDatabase: true, ping: async () => false });
  check('R5 database says not connected => not ready', dn.ready === false && dn.database === 'down');
  const th = await checkReadiness({ hasDatabase: true, ping: async () => { throw new Error('boom'); } });
  check('R6 ping throws => not ready (no exception escapes)', th.ready === false && th.database === 'down');
  const t0 = Date.now();
  const hang = await checkReadiness({ hasDatabase: true, ping: () => new Promise<boolean>(() => {}), timeoutMs: 60 });
  check('R7 ping that never answers => not ready after the timeout', hang.ready === false && Date.now() - t0 < 1000, `${Date.now() - t0}ms`);

  // ---- shutdown
  const mk = (closeBehaviour: 'ok' | 'never', storage: 'ok' | 'throws' = 'ok', timeoutMs = 500) => {
    const events: string[] = [];
    const exits: number[] = [];
    const server = {
      close: (cb: (e?: Error) => void) => { events.push('server.close'); if (closeBehaviour === 'ok') setTimeout(() => cb(), 5); },
      closeIdleConnections: () => { events.push('closeIdle'); },
    };
    const handler = createShutdownHandler({
      server,
      closeStorage: async () => { events.push('storage.close'); if (storage === 'throws') throw new Error('pool'); },
      exit: (c) => { exits.push(c); },
      timeoutMs,
      log: () => {},
    });
    return { handler, events, exits };
  };
  const a = mk('ok');
  await a.handler('SIGTERM');
  check('S1 server is closed before storage', a.events.indexOf('server.close') >= 0 && a.events.indexOf('server.close') < a.events.indexOf('storage.close'), a.events.join(','));
  check('S2 clean shutdown exits with 0 exactly once', a.exits.length === 1 && a.exits[0] === 0, a.exits.join(','));
  const b = mk('ok');
  await Promise.all([b.handler('SIGTERM'), b.handler('SIGINT'), b.handler('SIGTERM')]);
  check('S3 repeated signals run the shutdown once', b.events.filter(e => e === 'server.close').length === 1 && b.exits.length === 1);
  const c = mk('ok', 'throws');
  await c.handler('SIGTERM');
  check('S4 a failing storage close still exits (0) and does not throw', c.exits.length === 1 && c.exits[0] === 0);
  const d = mk('never', 'ok', 60);
  void d.handler('SIGTERM');
  await sleep(250);
  check('S5 a server that never drains is force-exited with 1 after the timeout', d.exits.length === 1 && d.exits[0] === 1, d.exits.join(','));

  // ---- server.ts wiring (static)
  const server = read('server.ts');
  check('W1 SIGTERM and SIGINT handlers are registered', /process\.once\('SIGTERM'/.test(server) && /process\.once\('SIGINT'/.test(server));
  check('W2 shutdown closes storage through StorageRouter.closeAll', /closeStorage:\s*\(\)\s*=>\s*globalStorageRouter\.closeAll\(\)/.test(server));
  check('W3 keep-alive timeouts are set above the load-balancer idle time', /keepAliveTimeout\s*=\s*65_?000/.test(server) && /headersTimeout\s*=\s*66_?000/.test(server));
  const hs = server.indexOf("app.get('/api/health'");
  const healthBlock = server.slice(hs, server.indexOf('\n  });\n', hs));
  check('W4 public health body no longer exposes environment / storage engine', hs > 0 && !/environment:|storageEngine:/.test(healthBlock));
  check('W5 health readiness answers 503 when not ready', /status\(503\)/.test(healthBlock) && /isReadinessRequest\(req\.query\?\.ready\)/.test(healthBlock));
  check('W6 liveness does not call the database unless readiness is requested', /if \(isReadinessRequest/.test(healthBlock) && healthBlock.indexOf('checkHealth') > healthBlock.indexOf('if (isReadinessRequest'));
  check('W7 no new route was added (route matrix stays valid)', (server.match(/app\.get\('\/api\/health/g) || []).length === 1);
  const router = read('src/core/storage/StorageRouter.ts');
  check('W8 StorageRouter.closeAll stops the timer and closes dedicated + primary adapters', /closeAll\(\)/.test(router) && /clearInterval\(this\.evictionTimer\)/.test(router) && /evictIdleAdapters\(0\)/.test(router) && /primaryAdapter\.close\(\)/.test(router));

  // ---- container files (static)
  const df = read('Dockerfile');
  const di = read('.dockerignore').split('\n').map((s: string) => s.trim());
  const pkg = JSON.parse(read('package.json'));
  check('C1 Dockerfile runs as a non-root user in production mode', /^USER node$/m.test(df) && /^ENV NODE_ENV=production$/m.test(df));
  check('C2 Dockerfile CMD matches package.json start', pkg.scripts.start === 'node dist/server.cjs' && /^CMD \["node", "dist\/server\.cjs"\]$/m.test(df));
  check('C3 Dockerfile builds with npm run build and ships only dist + production modules', /npm run build && npm prune --omit=dev/.test(df) && /COPY --from=build \/app\/dist/.test(df) && /COPY --from=build \/app\/node_modules/.test(df));
  check('C4 Dockerfile never copies .env or secrets', !/^(COPY|ADD)\s+[^\n]*\.env/m.test(df) && !/(JWT_SECRET|PASSWORD)\s*=/.test(df.replace(/^#.*$/gm, '')));
  check('C5 Dockerfile HEALTHCHECK uses the readiness probe', /HEALTHCHECK[\s\S]*\/api\/health\?ready=1/.test(df));
  check('C6 .dockerignore excludes .env, node_modules, .git and keeps .env.example', di.includes('.env') && di.includes('.env.*') && di.includes('!.env.example') && di.includes('node_modules') && di.includes('.git'));
  check('C7 .dockerignore does not exclude files the build needs', !['src', 'index.html', 'server.ts', 'package.json', 'vite.config.ts', 'tsconfig.json'].some(f => di.includes(f)));
  check('C8 node engine in package.json matches the image major (>=20, image 22)', /^>=20/.test(pkg.engines?.node || '') && /FROM node:22/.test(df));

  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
