/**
 * AN-SHADOW-D1 — explicit dual-path status for merge governance.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import { probeDefaultProcessPlane } from './anDataPlane';
import { readModulesOverview } from './anModulesOverview';
import { resolveAuthPolicyServer } from './authPolicy';

export async function buildShadowStatus(
  router: StorageRouter,
  opts?: { companyId?: string; env?: NodeJS.ProcessEnv }
) {
  const env = opts?.env || process.env;
  const companyId = (opts?.companyId || 'default').trim() || 'default';
  const processPlane = probeDefaultProcessPlane(env);
  const auth = resolveAuthPolicyServer({ auth_driver: 'firebase' }, env);
  const modules = await readModulesOverview(router, { companyId, env });

  return {
    ok: true,
    plane: 'an-shadow-d1' as const,
    dualPath: true,
    cutoverApproved: false,
    operational: {
      uiShell: 'kemit-custodyflow',
      loginPath: '/api/auth/verify-credentials',
      authPath: auth.activePath,
      dataStore: 'firestore',
      noteAr: 'الشاشات التشغيلية تعتمد Firestore/CustodyDB',
      noteEn: 'Operational screens use Firestore/CustodyDB',
    },
    anReadPlane: {
      processPlane: {
        ok: processPlane.ok,
        adapterType: processPlane.adapterType,
        envRefPresent: processPlane.envRefPresent,
        certifiedNote: processPlane.certifiedNote,
      },
      modules,
      noteAr: 'طبقة A.N للقراءة/الربط فقط في هذه المرحلة',
      noteEn: 'A.N is read/bind plane only at this stage',
    },
    nextGates: [
      'Do not cut Firestore until migration dry-run passes',
      'Module write path on A.N requires dedicated packages after D-wave',
      'Login remains firebase-session until explicit auth cutover',
    ],
  };
}
