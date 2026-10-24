/**
 * Production PostgreSQL application-role guard (SEC-PROD-ROLE).
 * RLS is meaningless if the connection role is SUPERUSER or BYPASSRLS.
 */
export type PgAppRoleProbe = {
  user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  subjectToRls: boolean;
};

export function interpretPgAppRoleRow(row: {
  u?: string;
  user?: string;
  rolsuper?: boolean;
  rolbypassrls?: boolean;
}): PgAppRoleProbe {
  const user = String(row.u ?? row.user ?? '');
  const rolsuper = row.rolsuper === true;
  const rolbypassrls = row.rolbypassrls === true;
  return {
    user,
    rolsuper,
    rolbypassrls,
    subjectToRls: !rolsuper && !rolbypassrls,
  };
}

/** When enforce=true, unsafe roles must fail closed. */
export function assertPgAppRoleSafe(
  probe: PgAppRoleProbe,
  opts: { enforce: boolean },
): { ok: true } | { ok: false; detail: string } {
  if (probe.subjectToRls) return { ok: true };
  const detail =
    `DB role "${probe.user || '?'}" is not safe for multi-tenant production ` +
    `(rolsuper=${probe.rolsuper}, rolbypassrls=${probe.rolbypassrls}). ` +
    `Use NOSUPERUSER NOBYPASSRLS (see docs/ops/PROD-PG-ROLE.md).`;
  if (opts.enforce) return { ok: false, detail };
  return { ok: true }; // soft mode: caller may WARN
}

export const PG_APP_ROLE_SQL =
  `SELECT current_user AS u, rolsuper, rolbypassrls, rolcanlogin
   FROM pg_roles WHERE rolname = current_user`;

/**
 * Normalizes PostgreSQL connection string by stripping accidental bracket wrappers around passwords.
 */
export function cleanPgConnectionString(rawUrl?: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1).trim();
  }
  if (url.startsWith('lpostgresql://')) {
    url = url.slice(1);
  }
  try {
    const u = new URL(url);
    if (u.password) {
      let pwd = decodeURIComponent(u.password);
      if (pwd.startsWith('[') && pwd.endsWith(']')) {
        pwd = pwd.slice(1, -1);
      }
      if (pwd.startsWith('%5B') && pwd.endsWith('%5D')) {
        pwd = pwd.slice(3, -3);
      }
      u.password = encodeURIComponent(pwd);
      return u.toString();
    }
  } catch {}
  return url;
}

