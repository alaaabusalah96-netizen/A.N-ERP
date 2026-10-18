/**
 * @file GroupReportService.ts
 * @description RPT-GROUP-1 — pure aggregation of per-tenant KPIs for a company group.
 */
export interface TenantKpiSlice {
  tenantId: string;
  tenantNameAr?: string;
  itemCount: number;
  warehouseCount: number;
  stockValue: number;
  openXcompanyOut: number;
  openXcompanyIn: number;
  entityBooksStatus: 'OPEN' | 'CLOSED' | 'UNKNOWN';
}

export interface GroupReportSummary {
  groupId: string;
  groupCode?: string;
  groupNameAr?: string;
  memberCount: number;
  totals: {
    itemCount: number;
    warehouseCount: number;
    stockValue: number;
    openXcompany: number;
    entitiesClosed: number;
    entitiesOpen: number;
  };
  members: TenantKpiSlice[];
  generatedAt: string;
}

export function aggregateGroupKpis(input: {
  groupId: string;
  groupCode?: string;
  groupNameAr?: string;
  members: TenantKpiSlice[];
}): GroupReportSummary {
  const members = input.members || [];
  let itemCount = 0, warehouseCount = 0, stockValue = 0, openXcompany = 0, entitiesClosed = 0, entitiesOpen = 0;
  for (const m of members) {
    itemCount += Number(m.itemCount) || 0;
    warehouseCount += Number(m.warehouseCount) || 0;
    stockValue += Number(m.stockValue) || 0;
    openXcompany += (Number(m.openXcompanyOut) || 0) + (Number(m.openXcompanyIn) || 0);
    if (m.entityBooksStatus === 'CLOSED') entitiesClosed += 1;
    else if (m.entityBooksStatus === 'OPEN') entitiesOpen += 1;
  }
  return {
    groupId: input.groupId,
    groupCode: input.groupCode,
    groupNameAr: input.groupNameAr,
    memberCount: members.length,
    totals: {
      itemCount,
      warehouseCount,
      stockValue: Math.round(stockValue * 100) / 100,
      openXcompany,
      entitiesClosed,
      entitiesOpen,
    },
    members,
    generatedAt: new Date().toISOString(),
  };
}

/** Sum warehouse stock totalValue for a tenant (read-only KPI). */
export function sumStockValue(rows: Array<{ totalValue?: number } | null | undefined>): number {
  let s = 0;
  for (const r of rows || []) {
    s += Number(r?.totalValue) || 0;
  }
  return Math.round(s * 100) / 100;
}
