import { CustodyBalances, CustodyMovement, Station, AppUser, PeriodReportFilter, CustodyPeriodReport } from '../types';
import { StationsModule } from './stations';
import { StorageEngine } from './storage';
import { UsersModule } from './users';
import { LogsModule } from './logs';
import { syncWriteWithOfflineFallback } from './offlineQueue';

export interface ReplenishParams {
  stationId: string;
  amount: number;
  notes?: string;
  actorId?: string;
  actorName?: string;
  ref?: string;
  transferRef?: string;
  bankAccount?: string;
  date?: string;
}

export interface ReverseReplenishParams {
  stationId: string;
  amount: number;
  reason: string;
  actorId?: string;
  actorName?: string;
  movementId?: string;
  logId?: string;
  date?: string;
}

export interface CountAdjustParams {
  stationId: string;
  variance: number; // positive (surplus) or negative (deficit)
  countedAmount?: number;
  expectedAmount?: number;
  notes?: string;
  actorId?: string;
  actorName?: string;
  ref?: string;
  date?: string;
}

export interface UpdateReplenishParams {
  stationId: string;
  oldAmount: number;
  newAmount: number;
  notes?: string;
  actorId?: string;
  actorName?: string;
  movementId?: string;
  logId?: string;
  date?: string;
}

export interface ConsumeParams {
  stationId: string;
  amount: number;
  ref?: string;
  voucherNo?: string;
  transactionNo?: string;
  notes?: string;
  actorId?: string;
  actorName?: string;
  at?: string;
  date?: string;
  metadata?: Record<string, any>;
}

export interface OpeningBalanceParams {
  stationId: string;
  amount: number;
  notes?: string;
  actorId?: string;
  actorName?: string;
  at?: string;
  date?: string;
  ref?: string;
}

export class CustodyEngine {
  /**
   * Centralized balance computation:
   * nominal: authorized custody amount (station.custody_amount)
   * deducted: expenses under settlement + pending expenses
   * available: nominal - deducted
   */
  static getBalances(stationId: string): CustodyBalances {
    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === stationId);
    const nominal = station ? (station.custody_amount || 0) : 0;

    const allTxs = StorageEngine.getStored<any[]>('transactions', []);
    const txs = allTxs.filter(t => t.station_id === stationId);
    const pendingTotal = txs
      .filter(t => t.status === 'Pending')
      .reduce((sum, t) => sum + t.amount, 0);
    const underSettlementTotal = txs
      .filter(t => t.status === 'Under Settlement')
      .reduce((sum, t) => sum + t.amount, 0);

    const deducted = pendingTotal + underSettlementTotal;
    const available = nominal - deducted;

    return {
      nominal,
      deducted,
      available
    };
  }

  /**
   * Helper to verify station accessibility for the given actor.
   * Returns true if accessible, false otherwise.
   */
  static isStationAccessibleToActor(stationId: string, actorId: string): boolean {
    const users = UsersModule.getUsers();
    const actor = users.find(u => u.id === actorId) || UsersModule.getActiveUser();
    if (!actor) {
      return false;
    }

    // SystemAdmin has global access
    if (actor.role === 'SystemAdmin') {
      return true;
    }

    const visibleStations = StationsModule.getStationsForUser(actor);
    return visibleStations.some(s => s.id === stationId);
  }

  /**
   * Get all movements, optionally filtered by stationId and/or companyId
   */
  static getMovements(stationId?: string, companyId?: string): CustodyMovement[] {
    const movements = StorageEngine.getStored<CustodyMovement[]>('custody_movements', []);
    let filtered = movements;

    if (stationId && stationId !== 'all') {
      filtered = filtered.filter(m => m.station_id === stationId);
    }
    if (companyId) {
      filtered = filtered.filter(m => m.company_id === companyId);
    }

    return filtered.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  /**
   * Save movement record and sync
   */
  private static async recordMovement(movement: CustodyMovement): Promise<void> {
    const movements = StorageEngine.getStored<CustodyMovement[]>('custody_movements', []);
    movements.unshift(movement);
    StorageEngine.setStored('custody_movements', movements);

    try {
      await syncWriteWithOfflineFallback('custody_movements', movement.id, movement);
    } catch (err) {
      console.warn('[CustodyEngine] Movement sync warning:', err);
    }
  }

  /**
   * Replenish custody for a station
   */
  static async replenish(params: ReplenishParams): Promise<{
    success: boolean;
    movement?: CustodyMovement;
    balance_after?: number;
    error?: string;
  }> {
    if (!params.stationId) {
      return { success: false, error: 'Station ID is required' };
    }
    if (typeof params.amount !== 'number' || isNaN(params.amount) || params.amount <= 0) {
      return { success: false, error: 'Replenishment amount must be a positive number' };
    }

    // Visibility & Authorization Guard
    if (params.actorId && !this.isStationAccessibleToActor(params.stationId, params.actorId)) {
      return { success: false, error: 'Unauthorized: Station is not accessible to this user' };
    }

    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === params.stationId);
    if (!station) {
      return { success: false, error: 'Station not found' };
    }

    const currentNominal = station.custody_amount || 0;
    const nextNominal = currentNominal + params.amount;

    // Single source of truth for updating station custody balance
    StationsModule.updateStation(station.id, {
      custody_amount: nextNominal
    });

    const activeUser = UsersModule.getActiveUser();
    const actorId = params.actorId || activeUser?.id;
    const actorName = params.actorName || activeUser?.full_name || 'Anonymous';

    const movement: CustodyMovement = {
      id: `cm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      station_id: station.id,
      company_id: station.company_id,
      region_id: station.region_id,
      type: 'replenish',
      amount: params.amount,
      at: params.date ? new Date(params.date).toISOString() : new Date().toISOString(),
      actor_id: actorId,
      actor_name: actorName,
      ref: params.ref || params.transferRef || `REP-${Date.now()}`,
      notes: params.notes || '',
      balance_after: nextNominal
    };

    await this.recordMovement(movement);

    // Audit and activity log
    LogsModule.addLog(
      actorId,
      actorName,
      'Custody Replenishment',
      `Replenished custody balance of ${station.station_name} with +${params.amount.toLocaleString()} EGP (Nominal custody updated from ${currentNominal.toLocaleString()} to ${nextNominal.toLocaleString()} EGP). Notes: ${params.notes || '-'}`,
      station.id,
      station.company_id,
      params.amount,
      params.notes
    );

    return {
      success: true,
      movement,
      balance_after: nextNominal
    };
  }

  /**
   * Reverse or undo a replenishment
   */
  static async reverseReplenishment(params: ReverseReplenishParams): Promise<{
    success: boolean;
    movement?: CustodyMovement;
    balance_after?: number;
    error?: string;
  }> {
    if (!params.stationId) {
      return { success: false, error: 'Station ID is required' };
    }
    if (typeof params.amount !== 'number' || isNaN(params.amount) || params.amount <= 0) {
      return { success: false, error: 'Reverse amount must be a positive number' };
    }
    if (!params.reason || !params.reason.trim()) {
      return { success: false, error: 'Reversal reason is required' };
    }

    // Visibility & Authorization Guard
    if (params.actorId && !this.isStationAccessibleToActor(params.stationId, params.actorId)) {
      return { success: false, error: 'Unauthorized: Station is not accessible to this user' };
    }

    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === params.stationId);
    if (!station) {
      return { success: false, error: 'Station not found' };
    }

    const currentNominal = station.custody_amount || 0;
    const nextNominal = Math.max(0, currentNominal - params.amount);

    StationsModule.updateStation(station.id, {
      custody_amount: nextNominal
    });

    const activeUser = UsersModule.getActiveUser();
    const actorId = params.actorId || activeUser?.id;
    const actorName = params.actorName || activeUser?.full_name || 'Anonymous';

    const movement: CustodyMovement = {
      id: `cm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      station_id: station.id,
      company_id: station.company_id,
      region_id: station.region_id,
      type: 'reverse_replenish',
      amount: -params.amount,
      at: params.date ? new Date(params.date).toISOString() : new Date().toISOString(),
      actor_id: actorId,
      actor_name: actorName,
      ref: params.movementId || params.logId || `REV-${Date.now()}`,
      notes: params.reason,
      balance_after: nextNominal
    };

    await this.recordMovement(movement);

    if (params.logId) {
      LogsModule.deleteLog(params.logId);
    }

    LogsModule.addLog(
      actorId,
      actorName,
      'Custody Reversal',
      `Reversed replenishment of ${params.amount.toLocaleString()} EGP for ${station.station_name}. Reason: ${params.reason}. (Nominal custody updated from ${currentNominal.toLocaleString()} to ${nextNominal.toLocaleString()} EGP)`,
      station.id,
      station.company_id,
      -params.amount,
      params.reason
    );

    return {
      success: true,
      movement,
      balance_after: nextNominal
    };
  }

  /**
   * Adjust custody from count sheet variances (surplus / deficit)
   */
  static async count_adjust(params: CountAdjustParams): Promise<{
    success: boolean;
    movement?: CustodyMovement;
    balance_after?: number;
    error?: string;
  }> {
    if (!params.stationId) {
      return { success: false, error: 'Station ID is required' };
    }
    if (typeof params.variance !== 'number' || isNaN(params.variance)) {
      return { success: false, error: 'Valid variance number is required' };
    }

    // Visibility & Authorization Guard
    if (params.actorId && !this.isStationAccessibleToActor(params.stationId, params.actorId)) {
      return { success: false, error: 'Unauthorized: Station is not accessible to this user' };
    }

    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === params.stationId);
    if (!station) {
      return { success: false, error: 'Station not found' };
    }

    const currentNominal = station.custody_amount || 0;
    const nextNominal = Math.max(0, currentNominal + params.variance);

    StationsModule.updateStation(station.id, {
      custody_amount: nextNominal
    });

    const defaultNote = params.variance === 0
      ? 'Physical count matched nominal balance'
      : params.variance < 0
        ? `Physical count deficit: ${Math.abs(params.variance).toLocaleString()} EGP`
        : `Physical count surplus: +${params.variance.toLocaleString()} EGP`;

    const activeUser = UsersModule.getActiveUser();
    const actorId = params.actorId || activeUser?.id;
    const actorName = params.actorName || activeUser?.full_name || 'Anonymous';

    const movement: CustodyMovement = {
      id: `cm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      station_id: station.id,
      company_id: station.company_id,
      region_id: station.region_id,
      type: 'count_adjust',
      amount: params.variance,
      at: params.date ? new Date(params.date).toISOString() : new Date().toISOString(),
      actor_id: actorId,
      actor_name: actorName,
      ref: params.ref || `COUNT-${Date.now()}`,
      notes: params.notes || defaultNote,
      balance_after: nextNominal,
      metadata: {
        countedAmount: params.countedAmount,
        expectedAmount: params.expectedAmount,
        variance: params.variance
      }
    };

    await this.recordMovement(movement);

    LogsModule.addLog(
      actorId,
      actorName,
      'Count Sheet Adjustment',
      `Audited custody of ${station.station_name}. Variance: ${params.variance >= 0 ? '+' : ''}${params.variance.toLocaleString()} EGP. (Nominal custody updated from ${currentNominal.toLocaleString()} to ${nextNominal.toLocaleString()} EGP). Notes: ${params.notes || defaultNote}`,
      station.id,
      station.company_id,
      params.variance,
      params.notes || defaultNote
    );

    return {
      success: true,
      movement,
      balance_after: nextNominal
    };
  }

  /**
   * Update an existing replenishment amount (diff applied to station custody)
   */
  static async updateReplenishment(params: UpdateReplenishParams): Promise<{
    success: boolean;
    movement?: CustodyMovement;
    balance_after?: number;
    error?: string;
  }> {
    if (!params.stationId) {
      return { success: false, error: 'Station ID is required' };
    }
    if (typeof params.newAmount !== 'number' || isNaN(params.newAmount) || params.newAmount <= 0) {
      return { success: false, error: 'New amount must be positive' };
    }

    if (params.actorId && !this.isStationAccessibleToActor(params.stationId, params.actorId)) {
      return { success: false, error: 'Unauthorized: Station is not accessible to this user' };
    }

    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === params.stationId);
    if (!station) {
      return { success: false, error: 'Station not found' };
    }

    const diff = params.newAmount - params.oldAmount;
    const currentNominal = station.custody_amount || 0;
    const nextNominal = Math.max(0, currentNominal + diff);

    StationsModule.updateStation(station.id, {
      custody_amount: nextNominal
    });

    const movement: CustodyMovement = {
      id: `cm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      station_id: station.id,
      company_id: station.company_id,
      region_id: station.region_id,
      type: diff >= 0 ? 'replenish' : 'reverse_replenish',
      amount: diff,
      at: new Date().toISOString(),
      actor_id: params.actorId,
      actor_name: params.actorName || 'Anonymous',
      ref: params.movementId || params.logId || `MOD-${Date.now()}`,
      notes: params.notes || `Replenishment updated: ${params.oldAmount} -> ${params.newAmount}`,
      balance_after: nextNominal
    };

    await this.recordMovement(movement);

    if (params.logId) {
      const detailsMsg = `Replenished custody balance of ${station.station_name} with +${params.newAmount.toLocaleString()} EGP (Total custody updated). Notes: ${params.notes || '-'}`;
      LogsModule.updateReplenishmentLog(params.logId, params.newAmount, params.notes || '', detailsMsg);
    }

    LogsModule.addLog(
      params.actorId,
      params.actorName || 'Anonymous',
      'Replenishment Updated',
      `Updated replenishment for ${station.station_name}: amount ${params.oldAmount} -> ${params.newAmount}. Notes: ${params.notes || '-'}`,
      station.id,
      station.company_id,
      diff,
      params.notes
    );

    return {
      success: true,
      movement,
      balance_after: nextNominal
    };
  }

  /**
   * Consume custody upon expense/voucher settlement
   */
  static async consume(params: ConsumeParams): Promise<{
    success: boolean;
    movement?: CustodyMovement;
    balance_after?: number;
    error?: string;
  }> {
    if (!params.stationId) {
      return { success: false, error: 'Station ID is required' };
    }
    if (typeof params.amount !== 'number' || isNaN(params.amount) || params.amount <= 0) {
      return { success: false, error: 'Consumption amount must be a positive number' };
    }

    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === params.stationId);
    if (!station) {
      return { success: false, error: 'Station not found' };
    }

    const currentNominal = station.custody_amount || 0;
    const nextNominal = Math.max(0, currentNominal - params.amount);

    StationsModule.updateStation(station.id, {
      custody_amount: nextNominal
    });

    const movement: CustodyMovement = {
      id: `cm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      station_id: station.id,
      company_id: station.company_id || '',
      region_id: station.region_id,
      type: 'consume',
      amount: -params.amount,
      at: params.at || new Date().toISOString(),
      actor_id: params.actorId || 'system',
      actor_name: params.actorName || 'System',
      ref: params.ref || params.voucherNo || params.transactionNo || `SETTLE-${Date.now()}`,
      notes: params.notes || `Custody consumed by settlement: -${params.amount.toLocaleString()} EGP`,
      balance_after: nextNominal,
      metadata: {
        ...params.metadata,
        voucherNo: params.voucherNo,
        transactionNo: params.transactionNo
      }
    };

    await this.recordMovement(movement);

    LogsModule.addLog(
      params.actorId || 'system',
      params.actorName || 'System',
      'Custody Consumption',
      `Settlement reduced custody for ${station.station_name} by -${params.amount.toLocaleString()} EGP. Ref: ${movement.ref}`,
      station.id,
      station.company_id,
      -params.amount,
      params.notes
    );

    return {
      success: true,
      movement,
      balance_after: nextNominal
    };
  }

  /**
   * Rollback custody consumption if settlement is reverted
   */
  static async rollbackConsume(params: ConsumeParams): Promise<{
    success: boolean;
    movement?: CustodyMovement;
    balance_after?: number;
    error?: string;
  }> {
    if (!params.stationId) {
      return { success: false, error: 'Station ID is required' };
    }
    if (typeof params.amount !== 'number' || isNaN(params.amount) || params.amount <= 0) {
      return { success: false, error: 'Rollback amount must be a positive number' };
    }

    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === params.stationId);
    if (!station) {
      return { success: false, error: 'Station not found' };
    }

    const currentNominal = station.custody_amount || 0;
    const nextNominal = currentNominal + params.amount;

    StationsModule.updateStation(station.id, {
      custody_amount: nextNominal
    });

    const movement: CustodyMovement = {
      id: `cm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      station_id: station.id,
      company_id: station.company_id || '',
      region_id: station.region_id,
      type: 'rollback_consume',
      amount: params.amount,
      at: params.at || new Date().toISOString(),
      actor_id: params.actorId || 'system',
      actor_name: params.actorName || 'System',
      ref: params.ref || params.voucherNo || params.transactionNo || `REVERT-${Date.now()}`,
      notes: params.notes || `Settlement reversed, custody restored: +${params.amount.toLocaleString()} EGP`,
      balance_after: nextNominal,
      metadata: {
        ...params.metadata,
        voucherNo: params.voucherNo,
        transactionNo: params.transactionNo
      }
    };

    await this.recordMovement(movement);

    LogsModule.addLog(
      params.actorId || 'system',
      params.actorName || 'System',
      'Custody Restored',
      `Settlement rollback restored custody for ${station.station_name} by +${params.amount.toLocaleString()} EGP. Ref: ${movement.ref}`,
      station.id,
      station.company_id,
      params.amount,
      params.notes
    );

    return {
      success: true,
      movement,
      balance_after: nextNominal
    };
  }

  /**
   * Set or initialize opening balance (start at zero or set initial amount)
   */
  static async openingBalance(params: OpeningBalanceParams): Promise<{
    success: boolean;
    movement?: CustodyMovement;
    balance_after?: number;
    error?: string;
  }> {
    if (!params.stationId) {
      return { success: false, error: 'Station ID is required' };
    }
    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === params.stationId);
    if (!station) {
      return { success: false, error: 'Station not found' };
    }

    const nextNominal = Math.max(0, params.amount);
    StationsModule.updateStation(station.id, {
      custody_amount: nextNominal
    });

    const movement: CustodyMovement = {
      id: `cm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      station_id: station.id,
      company_id: station.company_id || '',
      region_id: station.region_id,
      type: 'opening_balance',
      amount: nextNominal,
      at: params.at || new Date().toISOString(),
      actor_id: params.actorId || 'system',
      actor_name: params.actorName || 'System',
      ref: params.ref || `OPEN-${Date.now()}`,
      notes: params.notes || `Initial / Opening custody balance established: ${nextNominal.toLocaleString()} EGP`,
      balance_after: nextNominal
    };

    await this.recordMovement(movement);

    return {
      success: true,
      movement,
      balance_after: nextNominal
    };
  }

  /**
   * Returns the exact station balance at a given point in time (timestamp or Date)
   */
  static getBalanceAt(stationId: string, at: Date | string, inclusive: boolean = true): number {
    const targetDate = at instanceof Date ? at : new Date(at);
    const targetTime = targetDate.getTime();
    if (isNaN(targetTime)) {
      return this.getBalances(stationId).nominal;
    }

    const allMovements = this.getMovements(stationId);
    if (allMovements.length === 0) {
      const station = StationsModule.getStations().find(s => s.id === stationId);
      return station ? (station.custody_amount || 0) : 0;
    }

    // Sort ascending by timestamp
    const sorted = [...allMovements].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    // Movements up to targetTime
    const upToTarget = sorted.filter(m => {
      const mTime = new Date(m.at).getTime();
      return inclusive ? mTime <= targetTime : mTime < targetTime;
    });

    if (upToTarget.length > 0) {
      const last = upToTarget[upToTarget.length - 1];
      if (last.balance_after !== undefined) {
        return last.balance_after;
      }
    }

    // If targetTime is before the earliest recorded movement:
    const earliest = sorted[0];
    if (earliest.balance_after !== undefined) {
      return Math.max(0, earliest.balance_after - earliest.amount);
    }

    const station = StationsModule.getStations().find(s => s.id === stationId);
    return station ? (station.custody_amount || 0) : 0;
  }

  /**
   * Generates period report with opening, total_in, total_out, closing, and movements
   */
  static getPeriodReport(filter: PeriodReportFilter): CustodyPeriodReport {
    let fromDate: Date;
    if (filter.from instanceof Date) {
      fromDate = filter.from;
    } else if (typeof filter.from === 'string' && filter.from.trim().length === 10) {
      fromDate = new Date(`${filter.from.trim()}T00:00:00.000Z`);
    } else {
      fromDate = new Date(filter.from);
    }

    let toDate: Date;
    if (filter.to instanceof Date) {
      toDate = filter.to;
    } else if (typeof filter.to === 'string' && filter.to.trim().length === 10) {
      toDate = new Date(`${filter.to.trim()}T23:59:59.999Z`);
    } else {
      toDate = new Date(filter.to);
    }

    const fromTime = fromDate.getTime();
    const toTime = toDate.getTime();

    const allMovements = this.getMovements(
      filter.stationId && filter.stationId !== 'all' ? filter.stationId : undefined,
      filter.companyId
    );

    // Filter by region if specified
    let scopedMovements = allMovements;
    if (filter.regionId && filter.regionId !== 'all') {
      const regionStations = StationsModule.getStations().filter(s => s.region_id === filter.regionId);
      const stationIdSet = new Set(regionStations.map(s => s.id));
      scopedMovements = scopedMovements.filter(m => stationIdSet.has(m.station_id));
    }

    // Filter by time window
    const inPeriodMovements = scopedMovements.filter(m => {
      const mTime = new Date(m.at).getTime();
      return mTime >= fromTime && mTime <= toTime;
    });

    // Filter by type if requested
    const filteredMovements = (filter.type && filter.type !== 'all')
      ? inPeriodMovements.filter(m => m.type === filter.type)
      : inPeriodMovements;

    // Determine relevant stations for opening/closing balances
    let targetStations: Station[] = [];
    const allStations = StationsModule.getStations();

    if (filter.stationId && filter.stationId !== 'all') {
      targetStations = allStations.filter(s => s.id === filter.stationId);
    } else if (filter.regionId && filter.regionId !== 'all') {
      targetStations = allStations.filter(s => s.region_id === filter.regionId);
    } else if (filter.companyId) {
      targetStations = allStations.filter(s => s.company_id === filter.companyId);
    } else {
      targetStations = allStations;
    }

    const opening = targetStations.reduce((sum, s) => sum + this.getBalanceAt(s.id, fromDate, false), 0);
    const closing = targetStations.reduce((sum, s) => sum + this.getBalanceAt(s.id, toDate, true), 0);

    const total_in = filteredMovements
      .filter(m => m.amount > 0)
      .reduce((sum, m) => sum + m.amount, 0);

    const total_out = filteredMovements
      .filter(m => m.amount < 0)
      .reduce((sum, m) => sum + Math.abs(m.amount), 0);

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      opening,
      total_in,
      total_out,
      closing,
      movements: filteredMovements
    };
  }
}
