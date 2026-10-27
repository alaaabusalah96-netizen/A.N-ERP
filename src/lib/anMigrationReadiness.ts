/**
 * AN-READY-D3 — compute migration readiness without performing migration.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import { probeDefaultProcessPlane, liveCheckDefaultProcess } from './anDataPlane';
import { listEntityMap } from './anEntityMap';
import { readModulesOverview } from './anModulesOverview';
import { resolveAuthPolicyServer } from './authPolicy';

export type GateVerdict = 'PASS' | 'WAIT' | 'FAIL';

export interface ReadyGate {
  id: string;
  verdict: GateVerdict;
  detail: string;
  detailAr: string;
}

export async function buildMigrationReadiness(
  router: StorageRouter,
  opts?: { companyId?: string; env?: NodeJS.ProcessEnv }
) {
  const env = opts?.env || process.env;
  const companyId = (opts?.companyId || 'default').trim() || 'default';
  const processPlane = probeDefaultProcessPlane(env);
  const live = await liveCheckDefaultProcess(env);
  const map = listEntityMap();
  const modules = await readModulesOverview(router, { companyId, env });
  const auth = resolveAuthPolicyServer({ auth_driver: 'firebase' }, env);

  const gates: ReadyGate[] = [];

  gates.push({
    id: 'G1_DUAL_PATH_DECLARED',
    verdict: 'PASS',
    detail: 'Shadow dual-path is declared; cutoverApproved stays false',
    detailAr: 'المسار المزدوج معلن؛ cutoverApproved ما زال false',
  });

  gates.push({
    id: 'G2_LOGIN_FIREBASE',
    verdict: auth.activePath === 'firebase-session' ? 'PASS' : 'WAIT',
    detail: `activePath=${auth.activePath}`,
    detailAr: `مسار الدخول=${auth.activePath}`,
  });

  gates.push({
    id: 'G3_PROCESS_PLANE',
    verdict: processPlane.ok ? 'PASS' : 'WAIT',
    detail: processPlane.certifiedNote,
    detailAr: processPlane.errorAr || processPlane.certifiedNote,
  });

  gates.push({
    id: 'G4_LIVE_SQL',
    verdict: live.live.ok ? 'PASS' : live.live.skipped ? 'WAIT' : 'WAIT',
    detail: live.live.detail,
    detailAr: live.live.detailAr,
  });

  gates.push({
    id: 'G5_ENTITY_MAP',
    verdict: map.counts.mappedRead >= 3 ? 'PASS' : 'WAIT',
    detail: `mappedRead=${map.counts.mappedRead} deferred=${map.counts.deferred}`,
    detailAr: `mapped-read=${map.counts.mappedRead} مؤجل=${map.counts.deferred}`,
  });

  gates.push({
    id: 'G6_AN_MODULE_READS',
    verdict: modules.ok ? 'PASS' : 'WAIT',
    detail: 'modules overview reachable',
    detailAr: 'ملخص الوحدات متاح',
  });

  gates.push({
    id: 'G7_NO_CUTOVER_FLAG',
    verdict: 'PASS',
    detail: 'cutoverApproved must remain false until dedicated cutover package',
    detailAr: 'يُمنع تفعيل القطع إلا بحزمة cutover صريحة لاحقة',
  });

  // Hard rule: readiness never becomes GO_MIGRATE in D3
  const hasFail = gates.some((g) => g.verdict === 'FAIL');
  const hasWait = gates.some((g) => g.verdict === 'WAIT');
  const readiness: 'NOT_READY' | 'BLOCKED' = hasFail ? 'BLOCKED' : 'NOT_READY';

  return {
    ok: true,
    plane: 'an-ready-d3' as const,
    readiness,
    /** Explicit: D3 never authorizes migration */
    migrateAuthorized: false,
    cutoverApproved: false,
    dualPath: true,
    companyId,
    gates,
    summary: {
      pass: gates.filter((g) => g.verdict === 'PASS').length,
      wait: gates.filter((g) => g.verdict === 'WAIT').length,
      fail: gates.filter((g) => g.verdict === 'FAIL').length,
    },
    nextStepAr:
      'لا ترحيل الآن. عالج بوابات WAIT (خصوصًا G4_LIVE_SQL إن لزم DATABASE_URL)، ثم حزم ترحيل تجريبي لاحقة.',
    nextStepEn:
      'No migration now. Resolve WAIT gates (especially live SQL if needed), then later dry-run migrate packages.',
  };
}
