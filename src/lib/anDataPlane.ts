/**
 * @file anDataPlane.ts
 * @description AN-DATAPLANE-A1 — server-side A.N data plane helpers.
 * Resolves BackendConfig from company binding, checks env refs exist (never returns secrets),
 * and reports whether a non-memory adapter can be considered "wired" at process level.
 * Does NOT replace Firestore/KEMIT operational path.
 */
import type { AdapterType, BackendConfig, IsolationLevel } from '../an-core/storage/StoragePort';
import {
  companyToBackendConfig,
  getCompanyBackendSettings,
  validateCompanyBackendSettings,
  type CompanyBackendSettings,
} from './anBridge';

export interface DataPlaneProbe {
  ok: boolean;
  adapterType: AdapterType;
  isolationLevel: IsolationLevel;
  connectionRef: string;
  /** True only when process.env[connectionRef] is a non-empty string (value never exposed). */
  envRefPresent: boolean;
  /** inmemory/firebase do not require SQL env; postgresql/mysql/mongodb do. */
  requiresEnvRef: boolean;
  certifiedNote: string;
  errorAr?: string;
  errorEn?: string;
}

const SQL_LIKE: AdapterType[] = ['postgresql', 'mysql', 'mongodb'];

export function settingsToBackendConfig(settings: CompanyBackendSettings): BackendConfig {
  return {
    adapterType: settings.db_backend,
    connectionRef: settings.connection_ref || 'DATABASE_URL',
    isolationLevel: settings.isolation_level,
  };
}

/** Probe binding without opening DB pools when possible — env presence only for SQL-like. */
export function probeBackendBinding(
  partial?: Partial<CompanyBackendSettings>,
  env: NodeJS.ProcessEnv = process.env
): DataPlaneProbe {
  const settings = getCompanyBackendSettings({
    auth_driver: partial?.auth_driver,
    db_backend: partial?.db_backend,
    isolation_level: partial?.isolation_level,
    connection_ref: partial?.connection_ref,
  });
  const v = validateCompanyBackendSettings(settings);
  const cfg = settingsToBackendConfig(settings);
  const requiresEnvRef = SQL_LIKE.includes(settings.db_backend);
  const ref = (cfg.connectionRef || '').trim();
  const envRefPresent = !!(ref && typeof env[ref] === 'string' && env[ref]!.trim().length > 0);

  if (!v.valid) {
    return {
      ok: false,
      adapterType: settings.db_backend,
      isolationLevel: settings.isolation_level,
      connectionRef: ref,
      envRefPresent,
      requiresEnvRef,
      certifiedNote: 'validation_failed',
      errorAr: v.errorAr,
      errorEn: v.errorEn,
    };
  }

  if (requiresEnvRef && !envRefPresent) {
    return {
      ok: false,
      adapterType: settings.db_backend,
      isolationLevel: settings.isolation_level,
      connectionRef: ref,
      envRefPresent: false,
      requiresEnvRef: true,
      certifiedNote: 'env_ref_missing',
      errorAr: `مرجع الاتصال ${ref} غير موجود في أسرار/بيئة العملية`,
      errorEn: `Env ref ${ref} is not set in process environment`,
    };
  }

  return {
    ok: true,
    adapterType: settings.db_backend,
    isolationLevel: settings.isolation_level,
    connectionRef: ref || '(none)',
    envRefPresent: requiresEnvRef ? envRefPresent : true,
    requiresEnvRef,
    certifiedNote:
      settings.db_backend === 'postgresql'
        ? 'postgresql_env_wired'
        : settings.db_backend === 'inmemory'
          ? 'inmemory_ok'
          : settings.db_backend === 'firebase'
            ? 'firebase_binding_contract_only'
            : `${settings.db_backend}_env_wired`,
  };
}

export function probeDefaultProcessPlane(env: NodeJS.ProcessEnv = process.env): DataPlaneProbe {
  // Default process plane prefers postgresql when DATABASE_URL exists, else inmemory.
  if (env.DATABASE_URL && env.DATABASE_URL.trim()) {
    return probeBackendBinding(
      {
        db_backend: 'postgresql',
        isolation_level: 'Shared',
        connection_ref: 'DATABASE_URL',
        auth_driver: 'firebase',
      },
      env
    );
  }
  return probeBackendBinding(
    {
      db_backend: 'inmemory',
      isolation_level: 'Shared',
      connection_ref: '',
      auth_driver: 'firebase',
    },
    env
  );
}
