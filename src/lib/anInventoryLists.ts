/**
 * AN-INV-READ-LIST-1 — list warehouses/items from resolved company adapter.
 */
import type { StoragePort, Warehouse, StockItem } from '../an-core/storage/StoragePort';
import type { CompanyAdapterResolution } from './anResolveCompanyAdapter';

export interface InventoryListResult<T> {
  ok: boolean;
  companyId: string;
  count: number;
  items: T[];
  adapterResolution?: Pick<
    CompanyAdapterResolution,
    'source' | 'adapterType' | 'isolationLevel' | 'connectionRef'
  >;
  error?: string;
}

export async function listAnWarehouses(
  adapter: StoragePort,
  companyId: string,
  resolution?: CompanyAdapterResolution
): Promise<InventoryListResult<Pick<Warehouse, 'id' | 'code' | 'nameAr' | 'isActive'>>> {
  try {
    const res = await adapter.listWarehouses(companyId, { isActive: undefined });
    if (!res.success) {
      return {
        ok: false,
        companyId,
        count: 0,
        items: [],
        error: (res.error?.detail || res.error?.title || 'listWarehouses failed'),
        adapterResolution: resolution
          ? {
              source: resolution.source,
              adapterType: resolution.adapterType,
              isolationLevel: resolution.isolationLevel,
              connectionRef: resolution.connectionRef,
            }
          : undefined,
      };
    }
    const items = (res.data || []).map((w) => ({
      id: w.id,
      code: w.code,
      nameAr: w.nameAr,
      isActive: w.isActive,
    }));
    return {
      ok: true,
      companyId,
      count: items.length,
      items,
      adapterResolution: resolution
        ? {
            source: resolution.source,
            adapterType: resolution.adapterType,
            isolationLevel: resolution.isolationLevel,
            connectionRef: resolution.connectionRef,
          }
        : undefined,
    };
  } catch (e: any) {
    return {
      ok: false,
      companyId,
      count: 0,
      items: [],
      error: (e?.message || String(e)).slice(0, 200),
    };
  }
}

export async function listAnStockItems(
  adapter: StoragePort,
  companyId: string,
  resolution?: CompanyAdapterResolution
): Promise<InventoryListResult<Pick<StockItem, 'id' | 'itemCode' | 'nameAr' | 'isActive'>>> {
  try {
    const res = await adapter.listStockItems(companyId);
    if (!res.success) {
      return {
        ok: false,
        companyId,
        count: 0,
        items: [],
        error: (res.error?.detail || res.error?.title || 'listStockItems failed'),
        adapterResolution: resolution
          ? {
              source: resolution.source,
              adapterType: resolution.adapterType,
              isolationLevel: resolution.isolationLevel,
              connectionRef: resolution.connectionRef,
            }
          : undefined,
      };
    }
    const items = (res.data || []).map((it) => ({
      id: it.id,
      itemCode: it.itemCode,
      nameAr: it.nameAr,
      isActive: it.isActive,
    }));
    return {
      ok: true,
      companyId,
      count: items.length,
      items,
      adapterResolution: resolution
        ? {
            source: resolution.source,
            adapterType: resolution.adapterType,
            isolationLevel: resolution.isolationLevel,
            connectionRef: resolution.connectionRef,
          }
        : undefined,
    };
  } catch (e: any) {
    return {
      ok: false,
      companyId,
      count: 0,
      items: [],
      error: (e?.message || String(e)).slice(0, 200),
    };
  }
}
