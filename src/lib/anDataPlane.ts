/**
 * @file anDataPlane.ts
 * @description AN-DATAPLANE-A1 — server-side A.N data plane helpers.
 * A4: company backend fields are persisted on Firestore companies/{id} via POST company-backend (merge).
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

export interface CompanyPlaneResult {
  companyId: string;
  companyFound: boolean;
  companySource: 'firestore' | 'request-body' | 'process-default' | 'unavailable';
  settings: {
    auth_driver: string;
    db_backend: string;
    isolation_level: string;
    connection_ref: string;
  };
  probe: DataPlaneProbe;
}

/** Map a loose company record (Firestore doc / body) into probe settings. */
export function companyRecordToPartial(record: Record<string, unknown> | null | undefined): Partial<CompanyBackendSettings> {
  if (!record) return {};
  const out: Partial<CompanyBackendSettings> = {};
  const auth = record.auth_driver;
  const db = record.db_backend;
  const iso = record.isolation_level;
  const ref = record.connection_ref;
  if (auth === 'firebase' || auth === 'an-jwt') out.auth_driver = auth;
  if (
    db === 'postgresql' ||
    db === 'mysql' ||
    db === 'mongodb' ||
    db === 'firebase' ||
    db === 'inmemory'
  ) {
    out.db_backend = db;
  }
  if (iso === 'Shared' || iso === 'Dedicated') out.isolation_level = iso;
  if (typeof ref === 'string') out.connection_ref = ref;
  return out;
}

export function probeCompanyPlane(
  companyId: string,
  record: Record<string, unknown> | null | undefined,
  source: CompanyPlaneResult['companySource'],
  env: NodeJS.ProcessEnv = process.env
): CompanyPlaneResult {
  const partial = companyRecordToPartial(record);
  const hasBinding =
    partial.db_backend != null ||
    partial.connection_ref != null ||
    partial.isolation_level != null ||
    partial.auth_driver != null;
  const probe = hasBinding
    ? probeBackendBinding(partial, env)
    : probeDefaultProcessPlane(env);
  const settings = getCompanyBackendSettings({
    id: companyId,
    ...partial,
  } as any);
  return {
    companyId,
    companyFound: source === 'firestore' || source === 'request-body',
    companySource: hasBinding ? source : source === 'firestore' && !hasBinding ? 'firestore' : source,
    settings: {
      auth_driver: settings.auth_driver,
      db_backend: settings.db_backend,
      isolation_level: settings.isolation_level,
      connection_ref: settings.connection_ref,
    },
    probe,
  };
}

export interface LiveCheckResult {
  attempted: boolean;
  skipped: boolean;
  ok: boolean;
  adapterType: AdapterType;
  connectionRef: string;
  latencyMs?: number;
  detail: string;
  detailAr: string;
}

/**
 * Live probe: postgresql uses pg Client + SELECT 1.
 * mysql/mongodb: report not_implemented_in_a3 (no fake success).
 * firebase/inmemory: skipped.
 */
export async function liveCheckBackend(
  partial?: Partial<CompanyBackendSettings>,
  env: NodeJS.ProcessEnv = process.env
): Promise<LiveCheckResult> {
  const probe = probeBackendBinding(partial, env);
  const adapterType = probe.adapterType;
  const connectionRef = probe.connectionRef;

  if (adapterType === 'firebase' || adapterType === 'inmemory') {
    return {
      attempted: false,
      skipped: true,
      ok: true,
      adapterType,
      connectionRef,
      detail: 'skipped_non_sql_adapter',
      detailAr: 'تم التخطي: المحول ليس SQL مباشر في A3',
    };
  }

  if (!probe.ok || (probe.requiresEnvRef && !probe.envRefPresent)) {
    return {
      attempted: false,
      skipped: false,
      ok: false,
      adapterType,
      connectionRef,
      detail: probe.certifiedNote || 'env_not_ready',
      detailAr: probe.errorAr || 'البيئة غير جاهزة للفحص الحي',
    };
  }

  if (adapterType === 'mysql' || adapterType === 'mongodb') {
    return {
      attempted: false,
      skipped: false,
      ok: false,
      adapterType,
      connectionRef,
      detail: 'live_check_not_implemented_a3',
      detailAr: 'الفحص الحي لـ mysql/mongodb غير مفعّل في A3',
    };
  }

  // postgresql
  const conn = env[connectionRef];
  if (!conn || !String(conn).trim()) {
    return {
      attempted: false,
      skipped: false,
      ok: false,
      adapterType,
      connectionRef,
      detail: 'env_ref_empty',
      detailAr: 'مرجع الاتصال فارغ',
    };
  }

  const started = Date.now();
  try {
    const pg = await import('pg');
    const client = new pg.Client({
      connectionString: String(conn),
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
    try {
      await client.connect();
      await client.query('SELECT 1 AS ok');
      const latencyMs = Date.now() - started;
      return {
        attempted: true,
        skipped: false,
        ok: true,
        adapterType: 'postgresql',
        connectionRef,
        latencyMs,
        detail: 'select_1_ok',
        detailAr: 'نجح SELECT 1',
      };
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  } catch (e: any) {
    const latencyMs = Date.now() - started;
    const msg = typeof e?.message === 'string' ? e.message : 'connect_failed';
    // Strip potential credential fragments from driver messages
    const safe = msg.replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]').slice(0, 180);
    return {
      attempted: true,
      skipped: false,
      ok: false,
      adapterType: 'postgresql',
      connectionRef,
      latencyMs,
      detail: `connect_failed:${safe}`,
      detailAr: `فشل الاتصال: ${safe}`,
    };
  }
}

export async function liveCheckDefaultProcess(
  env: NodeJS.ProcessEnv = process.env
): Promise<{ probe: DataPlaneProbe; live: LiveCheckResult }> {
  const probe = probeDefaultProcessPlane(env);
  const live = await liveCheckBackend(
    {
      db_backend: probe.adapterType,
      isolation_level: probe.isolationLevel,
      connection_ref: probe.connectionRef === '(none)' ? '' : probe.connectionRef,
      auth_driver: 'firebase',
    },
    env
  );
  return { probe, live };
}


