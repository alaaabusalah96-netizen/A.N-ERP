/**
 * AN-AUTH-G1 — describe A.N login target vs interim Firebase path.
 */
import fs from 'fs';
import path from 'path';
import { resolveAuthPolicyServer, type AuthPolicy } from './authPolicy';

export interface AnLoginTargetStatus {
  ok: boolean;
  plane: 'an-auth-g1';
  /** Approved product target */
  target: 'an-style-session';
  /** What the live app uses today */
  interimOperational: 'firebase-session';
  /** Env flag: intent to build/enable A.N login series */
  anLoginFlag: boolean;
  /** Legacy JWT flag from M3 */
  anJwtFlag: boolean;
  interimAuth: AuthPolicy;
  capabilities: {
    tokenServicePresent: boolean;
    platformAdminBootstrapPresent: boolean;
    permissionMatrixPresent: boolean;
  };
  nextPackage: 'G2';
  noteEn: string;
  noteAr: string;
  cutoverApproved: false;
}

export function resolveAnLoginFlag(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AN_ENABLE_AN_LOGIN === '1' || env.AN_ENABLE_AN_LOGIN === 'true';
}

export function buildAnLoginTargetStatus(
  env: NodeJS.ProcessEnv = process.env,
  rootDir: string = process.cwd()
): AnLoginTargetStatus {
  const anLoginFlag = resolveAnLoginFlag(env);
  const anJwtFlag = env.AN_ENABLE_AN_JWT === '1' || env.AN_ENABLE_AN_JWT === 'true';
  const interimAuth = resolveAuthPolicyServer(null, env);

  const tokenServicePresent = fs.existsSync(
    path.join(rootDir, 'src/an-core/auth/TokenService.ts')
  );
  const platformAdminBootstrapPresent = fs.existsSync(
    path.join(rootDir, 'src/an-core/auth/platformAdminBootstrap.ts')
  );
  const permissionMatrixPresent = fs.existsSync(
    path.join(rootDir, 'src/an-core/auth/PermissionMatrix.ts')
  );

  return {
    ok: true,
    plane: 'an-auth-g1',
    target: 'an-style-session',
    interimOperational: 'firebase-session',
    anLoginFlag,
    anJwtFlag,
    interimAuth,
    capabilities: {
      tokenServicePresent,
      platformAdminBootstrapPresent,
      permissionMatrixPresent,
    },
    nextPackage: 'G2',
    noteEn:
      'G1 status only. Firebase login remains operational. G2 will add A.N credential verify endpoint behind flags.',
    noteAr:
      'G1 حالة فقط. دخول Firebase ما زال تشغيليًا. G2 يضيف مسار تحقق بيانات A.N خلف الأعلام.',
    cutoverApproved: false,
  };
}
