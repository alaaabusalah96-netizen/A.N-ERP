import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { CustodyEngine } from './db/custody';
import { StationsModule } from './db/stations';
import { UsersModule } from './db/users';
import { Station, AppUser, Transaction, CustodyMovement } from './types';

describe('Phase 4: CustodyEngine Unit & Security Tests', () => {
  const compId = 'comp-test-p4';
  const regionA = 'reg-test-north';
  const regionB = 'reg-test-south';

  const station1: Station = {
    id: 'stn-p4-1',
    station_name: 'Alexandria Hub',
    station_code: 'ALX-01',
    custody_amount: 100000,
    is_active: true,
    company_id: compId,
    region_id: regionA
  };

  const station2: Station = {
    id: 'stn-p4-2',
    station_name: 'Aswan Branch',
    station_code: 'ASW-01',
    custody_amount: 50000,
    is_active: true,
    company_id: compId,
    region_id: regionB
  };

  const companyAdmin: AppUser = {
    id: 'user-p4-admin',
    email: 'admin@company.com',
    full_name: 'Company Admin',
    role: 'Admin',
    company_id: compId,
    is_active: true,
    permissions: {
      create_expense: true,
      create_voucher: true,
      create_custody: true,
      edit_custody: true,
      replace_custody: true,
      settle_voucher: true,
      view_reports: true,
      manage_users: true
    }
  };

  const regionalManagerNorth: AppUser = {
    id: 'user-p4-rm-north',
    email: 'rm.north@company.com',
    full_name: 'RM North',
    role: 'RegionalManager',
    company_id: compId,
    region_id: regionA,
    is_active: true,
    permissions: {
      create_expense: true,
      create_voucher: true,
      create_custody: true,
      edit_custody: true,
      replace_custody: true,
      settle_voucher: true,
      view_reports: true,
      manage_users: false
    }
  };

  const stationUserSouth: AppUser = {
    id: 'user-p4-station-south',
    email: 'stn.south@company.com',
    full_name: 'Station Admin South',
    role: 'StationAdmin',
    company_id: compId,
    region_id: regionB,
    station_id: station2.id,
    is_active: true,
    permissions: {
      create_expense: true,
      create_voucher: true,
      create_custody: false,
      edit_custody: false,
      replace_custody: false, // deny-by-default
      settle_voucher: false,
      view_reports: false,
      manage_users: false
    }
  };

  beforeEach(() => {
    StorageEngine.setStored('stations', [{ ...station1 }, { ...station2 }]);
    StorageEngine.setStored('users', [companyAdmin, regionalManagerNorth, stationUserSouth]);
    StorageEngine.setStored('custody_movements', []);
    StorageEngine.setStored('logs', []);
    StorageEngine.setStored('transactions', []);
    UsersModule.setActiveUser(companyAdmin);
  });

  it('1. getBalances correctly computes nominal, deducted, and available', () => {
    // Setup transactions for station1
    const txs: Partial<Transaction>[] = [
      { id: 'tx-1', station_id: station1.id, company_id: compId, amount: 15000, status: 'Pending' },
      { id: 'tx-2', station_id: station1.id, company_id: compId, amount: 25000, status: 'Under Settlement' },
      { id: 'tx-3', station_id: station1.id, company_id: compId, amount: 10000, status: 'Settled' } // settled is already replenished or finalized
    ];
    StorageEngine.setStored('transactions', txs);

    const balances = CustodyEngine.getBalances(station1.id);
    expect(balances.nominal).toBe(100000);
    expect(balances.deducted).toBe(40000); // 15000 + 25000
    expect(balances.available).toBe(60000); // 100000 - 40000
  });

  it('2. replenish writes custody_movement and updates station custody_amount atomically', async () => {
    const replenishAmount = 25000;
    const res = await CustodyEngine.replenish({
      stationId: station1.id,
      amount: replenishAmount,
      ref: 'CHK-12345',
      notes: 'Weekly cash replenishment',
      actorId: companyAdmin.id,
      actorName: companyAdmin.full_name
    });

    expect(res.success).toBe(true);
    expect(res.balance_after).toBe(125000);

    // Verify station updated in storage
    const updatedStation = StationsModule.getStations().find(s => s.id === station1.id);
    expect(updatedStation?.custody_amount).toBe(125000);

    // Verify custody_movement record
    const movements = CustodyEngine.getMovements(station1.id);
    expect(movements.length).toBe(1);
    const m = movements[0];
    expect(m.station_id).toBe(station1.id);
    expect(m.company_id).toBe(compId);
    expect(m.region_id).toBe(regionA);
    expect(m.type).toBe('replenish');
    expect(m.amount).toBe(replenishAmount);
    expect(m.actor_id).toBe(companyAdmin.id);
    expect(m.actor_name).toBe(companyAdmin.full_name);
    expect(m.ref).toBe('CHK-12345');
    expect(m.notes).toBe('Weekly cash replenishment');
    expect(m.balance_after).toBe(125000);
    expect(m.at).toBeDefined();

    // Verify balance after
    const balances = CustodyEngine.getBalances(station1.id);
    expect(balances.nominal).toBe(125000);
    expect(balances.available).toBe(125000);
  });

  it('3. reverseReplenishment deducts balance and creates reverse movement', async () => {
    // First replenish
    await CustodyEngine.replenish({
      stationId: station1.id,
      amount: 30000,
      actorId: companyAdmin.id,
      actorName: companyAdmin.full_name
    });

    // Now reverse it
    const revRes = await CustodyEngine.reverseReplenishment({
      stationId: station1.id,
      amount: 30000,
      reason: 'Duplicate check deposit error',
      actorId: companyAdmin.id,
      actorName: companyAdmin.full_name
    });

    expect(revRes.success).toBe(true);
    expect(revRes.balance_after).toBe(100000);

    const updatedStation = StationsModule.getStations().find(s => s.id === station1.id);
    expect(updatedStation?.custody_amount).toBe(100000);

    const movements = CustodyEngine.getMovements(station1.id);
    expect(movements.length).toBe(2);
    const revMovement = movements[0]; // sorted newest first
    expect(revMovement.type).toBe('reverse_replenish');
    expect(revMovement.amount).toBe(-30000);
    expect(revMovement.notes).toBe('Duplicate check deposit error');
    expect(revMovement.balance_after).toBe(100000);
  });

  it('4. count_adjust handles count sheet variances (surplus / deficit)', async () => {
    // Deficit of 2,000 EGP
    const deficitRes = await CustodyEngine.count_adjust({
      stationId: station1.id,
      variance: -2000,
      countedAmount: 98000,
      expectedAmount: 100000,
      notes: 'Minor shortage at end of shift',
      actorId: companyAdmin.id,
      actorName: companyAdmin.full_name
    });

    expect(deficitRes.success).toBe(true);
    expect(deficitRes.balance_after).toBe(98000);

    const updatedStation = StationsModule.getStations().find(s => s.id === station1.id);
    expect(updatedStation?.custody_amount).toBe(98000);

    const movements = CustodyEngine.getMovements(station1.id);
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe('count_adjust');
    expect(movements[0].amount).toBe(-2000);
    expect(movements[0].metadata?.variance).toBe(-2000);
    expect(movements[0].metadata?.countedAmount).toBe(98000);
  });

  it('5. Unauthorized station access is blocked by visibility rules', async () => {
    // RM North trying to replenish station2 (which is in South region)
    const unauthorizedRes = await CustodyEngine.replenish({
      stationId: station2.id,
      amount: 10000,
      actorId: regionalManagerNorth.id,
      actorName: regionalManagerNorth.full_name
    });

    expect(unauthorizedRes.success).toBe(false);
    expect(unauthorizedRes.error).toMatch(/Unauthorized/i);

    // Verify station2 was not modified
    const stn2 = StationsModule.getStations().find(s => s.id === station2.id);
    expect(stn2?.custody_amount).toBe(50000);

    // Verify no movement was recorded
    const movements = CustodyEngine.getMovements(station2.id);
    expect(movements.length).toBe(0);
  });

  it('6. Station user without replace_custody permission cannot access custody operations on foreign station', async () => {
    const unauthCount = await CustodyEngine.count_adjust({
      stationId: station1.id,
      variance: -500,
      actorId: stationUserSouth.id,
      actorName: stationUserSouth.full_name
    });

    expect(unauthCount.success).toBe(false);
    expect(unauthCount.error).toMatch(/Unauthorized/i);
  });
});
