import { CompaniesModule } from './companies';
import { StationsModule } from './stations';
import { StorageEngine } from './storage';
import { UsersModule } from './users';
import { OrganizationEngine } from './organizationEngine';
import { CustodyEngine } from './custody';
import { DEFAULT_TRANSACTIONS } from './defaults';

export class TransactionsReconciliationModule {
  static getReconciliation(stationId?: string, regionId?: string, org_unit_id?: string) {
    const targetCompanyId = CompaniesModule.getSelectedCompanyId();
    const stations = StationsModule.getStations().filter(s => s.company_id === targetCompanyId);
    const transactions = StorageEngine.getStored<any[]>('transactions', DEFAULT_TRANSACTIONS).filter(t => t.company_id === targetCompanyId);
    const user = UsersModule.getActiveUser();

    let targetStationIds: string[] = [];
    let custodyValue = 0;

    if (org_unit_id && org_unit_id !== 'ALL' && org_unit_id !== 'all') {
      const validOrgUnitIds = new Set(OrganizationEngine.getSubtreeUnitIds(org_unit_id, targetCompanyId));
      const orgStations = stations.filter(s => s.org_unit_id && validOrgUnitIds.has(s.org_unit_id));
      targetStationIds = orgStations.map(s => s.id);
      custodyValue = orgStations.reduce((sum, s) => sum + s.custody_amount, 0);

      // If no station is directly linked to the org unit, check if any transactions are linked directly
      const orgTxs = transactions.filter(t => (t.org_unit_id && validOrgUnitIds.has(t.org_unit_id)) || (t.station_id && targetStationIds.includes(t.station_id)));
      
      const pendingTotal = orgTxs.filter(t => t.status === 'Pending').reduce((sum, t) => sum + t.amount, 0);
      const underSettlementTotal = orgTxs.filter(t => t.status === 'Under Settlement').reduce((sum, t) => sum + t.amount, 0);
      const settledTotal = orgTxs.filter(t => t.status === 'Settled').reduce((sum, t) => sum + t.amount, 0);

      const cashAvailable = custodyValue - underSettlementTotal - pendingTotal;

      const pendingCount = orgTxs.filter(t => t.status === 'Pending').length;
      const underSettlementCount = orgTxs.filter(t => t.status === 'Under Settlement').length;
      const settledCount = orgTxs.filter(t => t.status === 'Settled').length;

      return {
        custodyValue,
        originalCustodyValue: custodyValue + settledTotal,
        cashAvailable,
        pendingTotal,
        underSettlementTotal,
        settledTotal,
        pendingCount,
        underSettlementCount,
        settledCount
      };
    } else if (stationId) {
      targetStationIds = [stationId];
      const st = stations.find(s => s.id === stationId);
      custodyValue = st ? st.custody_amount : 0;
    } else if (regionId) {
      const regionStations = stations.filter(s => {
        if (regionId === 'none' || regionId === 'unassigned') {
          return !s.region_id || s.region_id === '' || s.region_id === 'none' || s.region_id === 'unassigned';
        }
        return s.region_id === regionId;
      });
      targetStationIds = regionStations.map(s => s.id);
      custodyValue = regionStations.reduce((sum, s) => sum + s.custody_amount, 0);
    } else if (user) {
      if (user.role === 'Admin' || user.role === 'SystemAdmin') {
        targetStationIds = stations.map(s => s.id);
        custodyValue = stations.reduce((sum, s) => sum + s.custody_amount, 0);
      } else if (user.org_unit_id || (user.assigned_org_unit_ids && user.assigned_org_unit_ids.length > 0)) {
        const primaryUnitId = user.org_unit_id || user.assigned_org_unit_ids![0];
        const validOrgUnitIds = new Set(OrganizationEngine.getSubtreeUnitIds(primaryUnitId, targetCompanyId));
        if (user.assigned_org_unit_ids) {
          user.assigned_org_unit_ids.forEach(id => {
            OrganizationEngine.getSubtreeUnitIds(id, targetCompanyId).forEach(subId => validOrgUnitIds.add(subId));
          });
        }
        const orgStations = stations.filter(s => s.org_unit_id && validOrgUnitIds.has(s.org_unit_id));
        targetStationIds = orgStations.map(s => s.id);
        custodyValue = orgStations.reduce((sum, s) => sum + s.custody_amount, 0);

        const orgTxs = transactions.filter(t => 
          (t.org_unit_id && validOrgUnitIds.has(t.org_unit_id)) || 
          (t.station_id && targetStationIds.includes(t.station_id))
        );

        const pendingTotal = orgTxs.filter(t => t.status === 'Pending').reduce((sum, t) => sum + t.amount, 0);
        const underSettlementTotal = orgTxs.filter(t => t.status === 'Under Settlement').reduce((sum, t) => sum + t.amount, 0);
        const settledTotal = orgTxs.filter(t => t.status === 'Settled').reduce((sum, t) => sum + t.amount, 0);
        const cashAvailable = custodyValue - underSettlementTotal - pendingTotal;

        return {
          custodyValue,
          originalCustodyValue: custodyValue + settledTotal,
          cashAvailable,
          pendingTotal,
          underSettlementTotal,
          settledTotal,
          pendingCount: orgTxs.filter(t => t.status === 'Pending').length,
          underSettlementCount: orgTxs.filter(t => t.status === 'Under Settlement').length,
          settledCount: orgTxs.filter(t => t.status === 'Settled').length
        };
      } else if (user.role === 'RegionalManager') {
        const regionStations = stations.filter(s => {
          if (!user.region_id || user.region_id === 'none' || user.region_id === '') {
            return !s.region_id || s.region_id === '' || s.region_id === 'none';
          }
          return s.region_id === user.region_id;
        });
        targetStationIds = regionStations.map(s => s.id);
        custodyValue = regionStations.reduce((sum, s) => sum + s.custody_amount, 0);
      } else {
        const userStationId = user.station_id || 'stn-1-1-1';
        targetStationIds = [userStationId];
        const st = stations.find(s => s.id === userStationId);
        custodyValue = st ? st.custody_amount : 0;
      }
    } else {
      targetStationIds = [stations[0]?.id || 'stn-1-1-1'];
      const st = stations.find(s => s.id === (stations[0]?.id || 'stn-1-1-1'));
      custodyValue = st ? st.custody_amount : 0;
    }

    const filteredTxs = transactions.filter(t => t.station_id && targetStationIds.includes(t.station_id));

    const pendingTotal = filteredTxs
      .filter(t => t.status === 'Pending')
      .reduce((sum, t) => sum + t.amount, 0);

    const underSettlementTotal = filteredTxs
      .filter(t => t.status === 'Under Settlement')
      .reduce((sum, t) => sum + t.amount, 0);

    const settledTotal = filteredTxs
      .filter(t => t.status === 'Settled')
      .reduce((sum, t) => sum + t.amount, 0);

    // Unified Cash Available calculation matching CashReconciliation.tsx:
    // Remaining liquid cash = custodyValue - underSettlementTotal - pendingTotal
    const cashAvailable = custodyValue - underSettlementTotal - pendingTotal;

    const pendingCount = filteredTxs.filter(t => t.status === 'Pending').length;
    const underSettlementCount = filteredTxs.filter(t => t.status === 'Under Settlement').length;
    const settledCount = filteredTxs.filter(t => t.status === 'Settled').length;

    const originalCustodyValue = custodyValue + settledTotal;
    const adjustedCustodyValue = custodyValue;

    return {
      custodyValue: adjustedCustodyValue,
      originalCustodyValue,
      cashAvailable,
      pendingTotal,
      underSettlementTotal,
      settledTotal,
      pendingCount,
      underSettlementCount,
      settledCount
    };
  }

  static getStationDeductedCustody(stationId: string): number {
    return CustodyEngine.getBalances(stationId).nominal;
  }

  static getCompanyDeductedCustody(companyId: string): number {
    const companies = CompaniesModule.getCompanies();
    const comp = companies.find(c => c.id === companyId);
    if (!comp) return 0;
    return comp.custody_value || 0;
  }
}
