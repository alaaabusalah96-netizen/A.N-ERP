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
  allowFirebaseLogin: boolean; // AN_ALLOW_FIREBASE_LOGIN=1|true
  nextPackage: 'G2' | 'G3' | 'G4' | 'G5';
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
  const allowFirebaseLogin =
    env.AN_ALLOW_FIREBASE_LOGIN === '1' || env.AN_ALLOW_FIREBASE_LOGIN === 'true';
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
    allowFirebaseLogin,
    interimAuth,
    capabilities: {
      tokenServicePresent,
      platformAdminBootstrapPresent,
      permissionMatrixPresent,
    },
    nextPackage: 'G5',
    noteEn:
      'G4: Prefer A.N login UI when AN_ENABLE_AN_LOGIN=1; Firebase login UI requires AN_ALLOW_FIREBASE_LOGIN=1. Server Firebase routes remain.',
    noteAr:
      'G4: تفضيل واجهة دخول A.N عند تفعيل AN_ENABLE_AN_LOGIN؛ يتطلب إظهار خيار Firebase تفعيل AN_ALLOW_FIREBASE_LOGIN=1. مسارات Firebase على الخادم باقية.',
    cutoverApproved: false,
  };
}
