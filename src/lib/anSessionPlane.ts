/**
 * AN-AUTH-PLANE-B1 — combine auth policy + company data-plane probe for UI/server callers.
 */
import { resolveAuthPolicyServer } from './authPolicy';
import {
  probeCompanyPlane,
  liveCheckBackend,
  type CompanyPlaneResult,
  type LiveCheckResult,
} from './anDataPlane';
import type { AuthPolicy } from './authPolicy';

export interface SessionPlaneResult {
  ok: boolean;
  companyId: string;
  auth: AuthPolicy;
  companyPlane: CompanyPlaneResult;
  live?: LiveCheckResult;
  loginPath: string;
  firestoreOperationalPath: 'unchanged';
}

export async function buildSessionPlane(input: {
  companyId: string;
  companyRecord?: Record<string, unknown> | null;
  companySource?: CompanyPlaneResult['companySource'];
  runLive?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<SessionPlaneResult> {
  const env = input.env || process.env;
  const companyId = (input.companyId || '').trim() || 'unknown';
  const source = input.companySource || (input.companyRecord ? 'firestore' : 'process-default');
  const companyPlane = probeCompanyPlane(companyId, input.companyRecord || null, source, env);
  const auth = resolveAuthPolicyServer(
    { auth_driver: companyPlane.settings.auth_driver as 'firebase' | 'an-jwt' },
    env
  );
  let live: LiveCheckResult | undefined;
  if (input.runLive) {
    live = await liveCheckBackend(
      {
        db_backend: companyPlane.settings.db_backend as any,
        isolation_level: companyPlane.settings.isolation_level as any,
        connection_ref: companyPlane.settings.connection_ref,
        auth_driver: companyPlane.settings.auth_driver as any,
      },
      env
    );
  }
  return {
    ok: companyPlane.probe.ok && auth.activePath === 'firebase-session',
    companyId,
    auth,
    companyPlane,
    live,
    loginPath: '/api/auth/verify-credentials',
    firestoreOperationalPath: 'unchanged',
  };
}
