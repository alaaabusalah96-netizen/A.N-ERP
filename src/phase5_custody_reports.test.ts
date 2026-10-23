import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { CustodyEngine } from './db/custody';
import { StationsModule } from './db/stations';
import { UsersModule } from './db/users';
import { TransactionsModule } from './db/transactions';
import { Station, AppUser, Transaction, CustodyMovement } from './types';

describe('Phase 5: Custody Period Reports & Settlement Integration Tests', () => {
  const compId = 'comp-test-p5';
  const regionA = 'reg-p5-north';
  const regionB = 'reg-p5-south';

  const station1: Station = {
    id: 'stn-p5-1',
    station_name: 'Cairo Central Hub',
    station_code: 'CAI-01',
    custody_amount: 50000,
    is_active: true,
    company_id: compId,
    region_id: regionA
  };

  const station2: Station = {
    id: 'stn-p5-2',
    station_name: 'Giza Branch',
    station_code: 'GZA-01',
    custody_amount: 25000,
    is_active: true,
    company_id: compId,
    region_id: regionB
  };

  const companyAdmin: AppUser = {
    id: 'user-p5-admin',
    email: 'admin@p5-company.com',
    full_name: 'Chief Accountant Admin',
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

  const cashierUser: AppUser = {
    id: 'user-p5-cashier',
    email: 'cashier@p5-company.com',
    full_name: 'Station Cashier',
    role: 'StationAdmin',
    company_id: compId,
    region_id: regionA,
    station_id: station1.id,
    is_active: true,
    permissions: {
      create_expense: true,
      create_voucher: true,
      create_custody: false,
      edit_custody: false,
      replace_custody: false,
      settle_voucher: false,
      view_reports: true,
      manage_users: false
    }
  };

  beforeEach(() => {
    StorageEngine.setStored('companies', [{
      id: compId,
      name: 'P5 Test Enterprise',
      is_active: true
    }]);
    StorageEngine.setStored('categories', [{
      id: 'cat-maint',
      category_name: 'Maintenance',
      name: 'Maintenance',
      company_id: compId,
      is_active: true
    }]);
    StorageEngine.setStored('stations', [{ ...station1 }, { ...station2 }]);
    StorageEngine.setStored('users', [companyAdmin, cashierUser]);
    StorageEngine.setStored('custody_movements', []);
    StorageEngine.setStored('logs', []);
    StorageEngine.setStored('transactions', []);
    UsersModule.setActiveUser(companyAdmin);
  });

  it('1. getBalanceAt calculates point-in-time balances with chronological precision', async () => {
    // Initial balance before any movements is nominal custody_amount (50,000)
    const initialBal = CustodyEngine.getBalanceAt(station1.id, new Date('2026-09-01T00:00:00Z'));
    expect(initialBal).toBe(50000);

    // Record movements at specific dates
    // Movement 1: 2026-09-02T10:00:00Z -> Replenish +20,000 (New bal: 70,000)
    await CustodyEngine.replenish({
      stationId: station1.id,
      amount: 20000,
      bankAccount: 'Bank Misr',
      transferRef: 'TRF-001',
      date: '2026-09-02T10:00:00Z',
      notes: 'Initial test recharge'
    });

    // Movement 2: 2026-09-04T12:00:00Z -> Replenish +10,000 (New bal: 80,000)
    await CustodyEngine.replenish({
      stationId: station1.id,
      amount: 10000,
      bankAccount: 'Bank Misr',
      transferRef: 'TRF-002',
      date: '2026-09-04T12:00:00Z',
      notes: 'Mid-week recharge'
    });

    // Check balance before movement 1: 2026-09-01
    expect(CustodyEngine.getBalanceAt(station1.id, '2026-09-01T23:59:59Z')).toBe(50000);

    // Check balance between movement 1 and 2: 2026-09-03
    expect(CustodyEngine.getBalanceAt(station1.id, '2026-09-03T12:00:00Z')).toBe(70000);

    // Check balance after movement 2: 2026-09-05
    expect(CustodyEngine.getBalanceAt(station1.id, '2026-09-05T00:00:00Z')).toBe(80000);
  });

  it('2. getPeriodReport answers "who recharged what in this period" with full audit trace', async () => {
    // Admin recharges station 1
    await CustodyEngine.replenish({
      stationId: station1.id,
      amount: 15000,
      bankAccount: 'CIB Account',
      transferRef: 'CIB-991',
      date: '2026-09-03T09:30:00Z',
      notes: 'Morning recharge by Admin'
    });

    // Another movement: Count adjustment (e.g. cash surplus +500)
    await CustodyEngine.count_adjust({
      stationId: station1.id,
      variance: 500,
      countedAmount: 65500,
      expectedAmount: 65000,
      date: '2026-09-04T15:00:00Z',
      notes: 'Surplus found during count'
    });

    // Recharging station 2 in region B
    await CustodyEngine.replenish({
      stationId: station2.id,
      amount: 8000,
      bankAccount: 'QNB Account',
      transferRef: 'QNB-104',
      date: '2026-09-04T11:00:00Z',
      notes: 'Giza station recharge'
    });

    // Generate Period Report for station 1 from 2026-09-01 to 2026-09-05
    const reportStn1 = CustodyEngine.getPeriodReport({
      from: '2026-09-01',
      to: '2026-09-05',
      stationId: station1.id,
      companyId: compId
    });

    expect(reportStn1.opening).toBe(50000);
    expect(reportStn1.total_in).toBe(15500); // 15,000 replenish + 500 surplus
    expect(reportStn1.total_out).toBe(0);
    expect(reportStn1.closing).toBe(65500);
    expect(reportStn1.opening + reportStn1.total_in - reportStn1.total_out).toBe(reportStn1.closing);

    // Verify "who recharged what":
    expect(reportStn1.movements.length).toBe(2);
    const replenishMov = reportStn1.movements.find(m => m.type === 'replenish');
    expect(replenishMov).toBeDefined();
    expect(replenishMov?.actor_id).toBe(companyAdmin.id);
    expect(replenishMov?.actor_name).toBe(companyAdmin.full_name);
    expect(replenishMov?.amount).toBe(15000);
    expect(replenishMov?.ref).toBe('CIB-991');

    // Filter by movement type 'replenish'
    const reportReplenishOnly = CustodyEngine.getPeriodReport({
      from: '2026-09-01',
      to: '2026-09-05',
      stationId: station1.id,
      companyId: compId,
      type: 'replenish'
    });
    expect(reportReplenishOnly.movements.length).toBe(1);
    expect(reportReplenishOnly.movements[0].type).toBe('replenish');

    // Filter by Region A (should include station 1, exclude station 2)
    const reportRegionA = CustodyEngine.getPeriodReport({
      from: '2026-09-01',
      to: '2026-09-05',
      regionId: regionA,
      companyId: compId
    });
    expect(reportRegionA.movements.every(m => m.station_id === station1.id)).toBe(true);
    expect(reportRegionA.movements.length).toBe(2);

    // Filter by Region B (should only include station 2)
    const reportRegionB = CustodyEngine.getPeriodReport({
      from: '2026-09-01',
      to: '2026-09-05',
      regionId: regionB,
      companyId: compId
    });
    expect(reportRegionB.movements.length).toBe(1);
    expect(reportRegionB.movements[0].station_id).toBe(station2.id);
    expect(reportRegionB.movements[0].amount).toBe(8000);
  });

  it('3. CustodyEngine.consume and rollbackConsume track expense voucher settlements', async () => {
    // Initial balance: 50,000
    // Consume 3,500 for settled voucher
    await CustodyEngine.consume({
      stationId: station1.id,
      amount: 3500,
      voucherNo: 'VCH-7701',
      transactionNo: 'TX-1001',
      actorId: companyAdmin.id,
      actorName: companyAdmin.full_name,
      notes: 'Fuel voucher settled'
    });

    const balAfterConsume = CustodyEngine.getBalances(station1.id);
    expect(balAfterConsume.available).toBe(46500);

    const movements = CustodyEngine.getMovements(station1.id);
    const consumeMov = movements.find(m => m.type === 'consume');
    expect(consumeMov).toBeDefined();
    expect(consumeMov?.amount).toBe(-3500);
    expect(consumeMov?.ref).toBe('VCH-7701');
    expect(consumeMov?.actor_name).toBe(companyAdmin.full_name);

    // Rollback the settlement
    await CustodyEngine.rollbackConsume({
      stationId: station1.id,
      amount: 3500,
      voucherNo: 'VCH-7701',
      transactionNo: 'TX-1001',
      actorId: companyAdmin.id,
      actorName: companyAdmin.full_name,
      notes: 'Voucher settlement reverted'
    });

    const balAfterRollback = CustodyEngine.getBalances(station1.id);
    expect(balAfterRollback.available).toBe(50000);

    // Check period report reflects the consume and reversal
    const report = CustodyEngine.getPeriodReport({
      from: '2026-01-01',
      to: '2026-12-31',
      stationId: station1.id,
      companyId: compId
    });

    expect(report.total_out).toBe(3500); // the consume
    expect(report.total_in).toBe(3500);  // the rollback
    expect(report.closing).toBe(50000);
  });

  it('4. TransactionsModule.updateTransaction triggers CustodyEngine.consume on settlement', async () => {
    // Setup a pending voucher transaction
    const voucherTx: Transaction = {
      id: 'tx-vch-p5-01',
      transaction_no: 'TX-VCH-01',
      voucher_no: 'V-001',
      date: '2026-09-04',
      company_id: compId,
      station_id: station1.id,
      category_id: 'cat-maint',
      amount: 4200,
      category: 'Maintenance',
      description: 'Air conditioning fix',
      status: 'Pending',
      created_by: cashierUser.id,
      created_at: '2026-09-04T08:00:00Z',
      updated_at: '2026-09-04T08:00:00Z'
    };

    StorageEngine.setStored('transactions', [voucherTx]);

    // Admin settles the transaction
    const updateResult = await TransactionsModule.updateTransaction(
      voucherTx.id,
      { status: 'Settled' }
    );

    expect(updateResult.success).toBe(true);

    // Verify custody movement was automatically logged by CustodyEngine
    const movements = CustodyEngine.getMovements(station1.id);
    const consumeMov = movements.find(m => m.ref === voucherTx.voucher_no);
    expect(consumeMov).toBeDefined();
    expect(consumeMov?.amount).toBe(-4200);
    expect(consumeMov?.type).toBe('consume');
    expect(consumeMov?.actor_name).toBe(companyAdmin.full_name);

    // Verify balance adjusted
    const bal = CustodyEngine.getBalances(station1.id);
    expect(bal.available).toBe(50000 - 4200);
  });
});
