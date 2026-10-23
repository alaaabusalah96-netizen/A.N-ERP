export type AssetCategory = 'BUILDINGS' | 'VEHICLES' | 'MACHINERY' | 'EQUIPMENT' | 'COMPUTERS' | 'FURNITURE';

export interface FixedAsset {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  name: string;
  code: string;
  category: AssetCategory;
  purchaseDate: string;
  originalCost: number;
  depreciationRate: number; // e.g. 0.10 for 10%
  accumulatedDepreciation: number;
  netBookValue: number;
  status?: 'ACTIVE' | 'DISPOSED';
  disposalDate?: string;
  disposalPrice?: number;
  gainLoss?: number;
  createdAt: string;
}

export interface DepreciationRunLog {
  assetName: string;
  code: string;
  expense: number;
  org_unit_id?: string;
  cost_center_id?: string;
}
