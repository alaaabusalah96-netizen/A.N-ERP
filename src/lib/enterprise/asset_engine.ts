import { StorageEngine } from '../../db/storage';
import { syncWriteWithOfflineFallback } from '../../db/offlineQueue';
import { DocumentNumberEngine } from '../../db/documentNumberEngine';
import { CostCenterEngine } from '../../db/costCenterEngine';
import { OrganizationEngine } from '../../db/organizationEngine';
import { AccountingBusinessEngine } from './accounting_engine';
import { FixedAsset, AssetCategory, DepreciationRunLog } from '../../types/asset';

export class AssetBusinessEngine {
  /**
   * Retrieves all fixed assets filtered by company and optional organization unit subtree
   */
  public static getAssetsByOrgUnit(companyId: string, org_unit_id?: string): FixedAsset[] {
    const all = StorageEngine.getStored<FixedAsset[]>('fixed_assets_items', []);
    const companyAssets = all.filter(a => a.company_id === companyId);

    if (!org_unit_id || org_unit_id === 'ALL') {
      return companyAssets;
    }

    const validSubtreeIds = new Set(OrganizationEngine.getSubtreeUnitIds(org_unit_id, companyId));
    return companyAssets.filter(a => a.org_unit_id && validSubtreeIds.has(a.org_unit_id));
  }

  /**
   * Registers a new fixed asset with automatic sequence numbering and cost-center resolution
   */
  public static async createAsset(
    companyId: string,
    data: {
      name: string;
      category: AssetCategory;
      purchaseDate: string;
      originalCost: number;
      depreciationRate: number; // e.g. 10 for 10%
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<FixedAsset> {
    const allAssets = StorageEngine.getStored<FixedAsset[]>('fixed_assets_items', []);
    const targetOrgUnit = data.org_unit_id || undefined;

    let targetCostCenter = data.cost_center_id;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    // Code generation
    let code = '';
    try {
      const genResult = await DocumentNumberEngine.generateNextNumberAsync({
        companyId,
        documentType: 'ASSET',
        org_unit_id: targetOrgUnit
      });
      code = genResult.documentNumber;
    } catch {
      const nextCodeNo = 3001 + allAssets.filter(a => a.company_id === companyId).length;
      code = `AST-${data.category}-${nextCodeNo}`;
    }

    const newAsset: FixedAsset = {
      id: `asset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company_id: companyId,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      name: data.name,
      code,
      category: data.category,
      purchaseDate: data.purchaseDate,
      originalCost: Number(data.originalCost),
      depreciationRate: Number(data.depreciationRate) / 100, // percentage e.g. 10 -> 0.10
      accumulatedDepreciation: 0,
      netBookValue: Number(data.originalCost),
      createdAt: new Date().toISOString()
    };

    const updated = [...allAssets, newAsset];
    const syncRes = await syncWriteWithOfflineFallback('fixed_assets_items', newAsset.id, newAsset);
    if (!syncRes.success) {
      throw new Error(syncRes.error || `فشل تسجيل الأصل ${newAsset.name} في قاعدة البيانات.`);
    }
    StorageEngine.setStored('fixed_assets_items', updated);

    return newAsset;
  }

  /**
   * Calculates monthly straight-line depreciation for a given set of assets
   */
  public static calculateMonthlyDepreciation(assets: FixedAsset[]): DepreciationRunLog[] {
    return assets.map(a => {
      const exp = (a.originalCost * a.depreciationRate) / 12;
      return {
        assetName: a.name,
        code: a.code,
        expense: Math.min(exp, a.netBookValue),
        org_unit_id: a.org_unit_id,
        cost_center_id: a.cost_center_id
      };
    }).filter(log => log.expense > 0);
  }

  /**
   * Posts depreciation run entries to storage, firestore, and General Ledger double-entry
   */
  public static async postDepreciationRun(
    companyId: string,
    operatorId: string,
    depreciationDate: string,
    runLogs: DepreciationRunLog[],
    org_unit_id?: string,
    costCenterId?: string
  ): Promise<void> {
    if (runLogs.length === 0) return;

    const allAssets = StorageEngine.getStored<FixedAsset[]>('fixed_assets_items', []);
    const updated = allAssets.map(a => {
      const log = runLogs.find(rl => rl.code === a.code);
      if (log) {
        const newAccum = a.accumulatedDepreciation + log.expense;
        const newBook = Math.max(0, a.originalCost - newAccum);
        return {
          ...a,
          accumulatedDepreciation: newAccum,
          netBookValue: newBook
        };
      }
      return a;
    });

    // Sync to firebase cloud-first
    for (const item of updated) {
      if (item.company_id === companyId) {
        const syncRes = await syncWriteWithOfflineFallback('fixed_assets_items', item.id, item);
        if (!syncRes.success) {
          throw new Error(syncRes.error || `فشل تحديث إهلاك الأصل ${item.code} في قاعدة البيانات.`);
        }
      }
    }

    StorageEngine.setStored('fixed_assets_items', updated);

    const totalExp = runLogs.reduce((sum, rl) => sum + rl.expense, 0);
    const targetOrgUnit = org_unit_id || undefined;

    let targetCostCenter = costCenterId;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    // Post Accounting Double-Entry with Organizational Metadata
    try {
      const statementAr = `قيد استهلاك الأصول الثابتة الشهري للفترة المنتهية في ${depreciationDate}`;
      const statementEn = `Monthly fixed assets depreciation run for period ending ${depreciationDate}`;

      await AccountingBusinessEngine.postOperationalDoubleEntry(
        companyId,
        operatorId,
        `DEP-${Date.now()}`,
        statementAr,
        statementEn,
        [
          // Debit Depreciation Expense (510501)
          { accountCode: '510501', debit: totalExp, credit: 0, notes: `مصروف إهلاك أصول الشركة` },
          // Credit Accumulated Depreciation (130201)
          { accountCode: '130201', debit: 0, credit: totalExp, notes: `إلى حساب مجمع إهلاك الأصول الثابتة` }
        ],
        {
          org_unit_id: targetOrgUnit,
          cost_center_id: targetCostCenter
        }
      );
    } catch (glError) {
      console.error('Asset depreciation GL double entry posting error:', glError);
    }
  }

  /**
   * Disposes of a fixed asset (sale/scrap) and posts double-entry journal entry
   */
  public static async disposeAsset(
    companyId: string,
    operatorId: string,
    data: {
      assetId: string;
      disposalPrice: number;
      disposalDate: string;
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<FixedAsset> {
    const allAssets = StorageEngine.getStored<FixedAsset[]>('fixed_assets_items', []);
    const asset = allAssets.find(a => a.id === data.assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    const salePrice = Number(data.disposalPrice) || 0;
    const gainLoss = salePrice - asset.netBookValue;

    const updatedAsset: FixedAsset = {
      ...asset,
      status: 'DISPOSED',
      disposalDate: data.disposalDate,
      disposalPrice: salePrice,
      gainLoss,
      netBookValue: 0
    };

    const updatedList = allAssets.map(a => a.id === asset.id ? updatedAsset : a);
    const syncRes = await syncWriteWithOfflineFallback('fixed_assets_items', updatedAsset.id, updatedAsset);
    if (!syncRes.success) {
      throw new Error(syncRes.error || `فشل تسجيل استبعاد الأصل ${updatedAsset.name} في قاعدة البيانات.`);
    }
    StorageEngine.setStored('fixed_assets_items', updatedList);

    // Double-entry GL Post for Asset Disposal
    const targetOrgUnit = data.org_unit_id || asset.org_unit_id;
    let targetCostCenter = data.cost_center_id || asset.cost_center_id;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    try {
      const entries: Array<{ accountCode: string; debit: number; credit: number; notes?: string }> = [];

      // 1. Debit Cash/Bank for Sale Proceeds
      if (salePrice > 0) {
        entries.push({ accountCode: '110101', debit: salePrice, credit: 0, notes: `تحصيل ثمن بيع الأصل ${asset.code}` });
      }

      // 2. Debit Accumulated Depreciation
      if (asset.accumulatedDepreciation > 0) {
        entries.push({ accountCode: '130201', debit: asset.accumulatedDepreciation, credit: 0, notes: `إغلاق مجمع استهلاك الأصل ${asset.code}` });
      }

      // 3. Credit Asset Historical Cost
      entries.push({ accountCode: '130101', debit: 0, credit: asset.originalCost, notes: `استبعاد التكلفة التاريخية للأصل ${asset.code}` });

      // 4. Gain or Loss on Disposal
      if (gainLoss > 0) {
        // Gain (Credit 420101)
        entries.push({ accountCode: '420101', debit: 0, credit: gainLoss, notes: `أرباح رأسمالية عن بيع الأصل ${asset.code}` });
      } else if (gainLoss < 0) {
        // Loss (Debit 520101)
        entries.push({ accountCode: '520101', debit: Math.abs(gainLoss), credit: 0, notes: `خسائر رأسمالية عن استبعاد الأصل ${asset.code}` });
      }

      await AccountingBusinessEngine.postOperationalDoubleEntry(
        companyId,
        operatorId,
        `DISP-${Date.now()}`,
        `قيد استبعاد أصل ثابت (${asset.name} - ${asset.code})`,
        `Fixed asset disposal entry (${asset.name} - ${asset.code})`,
        entries,
        {
          org_unit_id: targetOrgUnit,
          cost_center_id: targetCostCenter
        }
      );
    } catch (glError) {
      console.error('Asset disposal GL post error:', glError);
    }

    return updatedAsset;
  }
}
