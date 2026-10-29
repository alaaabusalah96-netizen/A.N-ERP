/**
 * AN-AUTH-G5 — run platform admin bootstrap against A.N primary storage.
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import { bootstrapPlatformAdmin } from '../an-core/auth/platformAdminBootstrap';

export function shouldBootstrapPlatformAdmin(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.AN_BOOTSTRAP_PLATFORM_ADMIN === '0' || env.AN_BOOTSTRAP_PLATFORM_ADMIN === 'false') {
    return false;
  }
  const u = (env.PLATFORM_ADMIN_USERNAME || '').trim();
  const p = env.PLATFORM_ADMIN_PASSWORD || '';
  return u.length > 0 && p.length > 0;
}

export async function runPlatformAdminBootstrapOnStart(
  router: StorageRouter,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ ran: boolean; outcome?: string; code?: string; message?: string }> {
  if (!shouldBootstrapPlatformAdmin(env)) {
    return { ran: false, outcome: 'skipped_no_secrets_or_flag_off' };
  }

  const tenantId = (env.PLATFORM_ADMIN_TENANT_ID || 'default').trim() || 'default';
  const username = (env.PLATFORM_ADMIN_USERNAME || '').trim();
  const password = env.PLATFORM_ADMIN_PASSWORD || '';

  const adapter = router.getPrimaryAdapter();

  // Ensure PG schema if adapter supports it
  try {
    if (typeof (adapter as any).initializeSchema === 'function') {
      const init = await (adapter as any).initializeSchema();
      if (init && init.success === false) {
        return {
          ran: true,
          outcome: 'schema_init_failed',
          code: 'schema_init_failed',
          message: init.error?.message || 'initializeSchema failed',
        };
      }
    }
    // Ensure tenant exists
    if (typeof adapter.saveTenant === 'function') {
      await adapter.saveTenant(
        {
          id: tenantId,
          code: tenantId,
          nameAr: 'المنشأة الافتراضية',
          status: 'ACTIVE',
          backendConfig: {
            db_backend: 'postgresql',
            isolation_level: 'Shared',
            connection_ref: 'DATABASE_URL',
          },
        },
        'seed-tenant-' + tenantId,
        true
      );
    }
  } catch (e: any) {
    return {
      ran: true,
      outcome: 'schema_init_threw',
      code: 'schema_init_threw',
      message: (e?.message || String(e)).slice(0, 200),
    };
  }

  try {
    const result = await bootstrapPlatformAdmin(adapter, tenantId, username, password);
    if (result.ok) {
      return { ran: true, outcome: result.outcome };
    }
    return {
      ran: true,
      outcome: 'failed',
      code: result.code,
      message: result.message,
    };
  } catch (e: any) {
    return {
      ran: true,
      outcome: 'threw',
      code: 'bootstrap_threw',
      message: (e?.message || String(e)).slice(0, 200),
    };
  }
}
