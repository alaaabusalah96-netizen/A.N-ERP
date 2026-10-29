/**
 * AN-AUTH-ROLE-MAP-1 — explicit A.N / KEMIT UI role mapping (no regex elevation).
 */
export type AppUiRole = 'SystemAdmin' | 'Admin' | 'StationAdmin' | 'Accountant' | 'Auditor' | 'WarehouseKeeper';

const ROLE_MAP: Record<string, AppUiRole> = {
  // platform / system
  systemadmin: 'SystemAdmin',
  system_admin: 'SystemAdmin',
  super_admin: 'SystemAdmin',
  superadmin: 'SystemAdmin',
  platform_admin: 'SystemAdmin',
  platformadmin: 'SystemAdmin',
  // company admin
  admin: 'Admin',
  company_admin: 'Admin',
  companyadmin: 'Admin',
  // finance
  accountant: 'Accountant',
  accounting: 'Accountant',
  finance: 'Accountant',
  // audit
  auditor: 'Auditor',
  audit: 'Auditor',
  // warehouse
  warehouse_keeper: 'WarehouseKeeper',
  warehousekeeper: 'WarehouseKeeper',
  storekeeper: 'WarehouseKeeper',
  inventory: 'WarehouseKeeper',
  // station / default operational
  stationadmin: 'StationAdmin',
  station_admin: 'StationAdmin',
  operator: 'StationAdmin',
  user: 'StationAdmin',
};

export function mapAnRoleToAppUiRole(raw: string | null | undefined): AppUiRole {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!key) return 'StationAdmin';
  if (ROLE_MAP[key]) return ROLE_MAP[key];
  // exact known UI roles already
  const asIs = String(raw || '').trim();
  const allowed: AppUiRole[] = [
    'SystemAdmin',
    'Admin',
    'StationAdmin',
    'Accountant',
    'Auditor',
    'WarehouseKeeper',
  ];
  if (allowed.includes(asIs as AppUiRole)) return asIs as AppUiRole;
  return 'StationAdmin';
}

export function defaultPermissionsForRole(role: AppUiRole): Record<string, boolean> {
  switch (role) {
    case 'SystemAdmin':
      return { platform: true, admin: true };
    case 'Admin':
      return { admin: true };
    case 'Accountant':
      return { accounting: true };
    case 'Auditor':
      return { audit: true };
    case 'WarehouseKeeper':
      return { inventory: true };
    default:
      return {};
  }
}
