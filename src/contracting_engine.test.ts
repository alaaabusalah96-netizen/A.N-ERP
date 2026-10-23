import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContractingEngine, CONTRACTING_COLLECTIONS } from './db/contracting';
import { StorageEngine } from './db/storage';
import * as offlineQueue from './db/offlineQueue';
import { PaymentVoucherLine } from './types/contracting';

describe('ContractingEngine Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('should initialize projects and return seeded projects', () => {
    const projects = ContractingEngine.getProjects('COMP-EGY-01');
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].name).toContain('العاصمة الإدارية');
  });

  it('should calculate voucher breakdown with previous, current, advance, and retention deductions', () => {
    const lines: PaymentVoucherLine[] = [
      {
        id: '1',
        voucher_id: 'v1',
        item_number: '1.1',
        description: 'أعمال حفر',
        unit: 'م3',
        unit_price: 100,
        previous_qty: 10,
        current_qty: 20,
        total_qty: 30,
        current_amount: 2000,
        total_amount: 3000,
        completion_percentage: 100
      }
    ];

    const previousWorkCompleted = 1000;
    const advanceRate = 10; // 10%
    const retentionRate = 5; // 5%
    const taxRate = 1; // 1%
    const otherDeductions = 100;

    const breakdown = ContractingEngine.calculateVoucherBreakdown(
      lines,
      previousWorkCompleted,
      advanceRate,
      retentionRate,
      taxRate,
      otherDeductions
    );

    // Total work = 30 * 100 = 3000
    expect(breakdown.total_work_completed).toBe(3000);
    // Current work = 3000 - 1000 = 2000
    expect(breakdown.current_work_completed).toBe(2000);
    // Advance deduction = 10% of 2000 = 200
    expect(breakdown.advance_deduction).toBe(200);
    // Retention deduction = 5% of 2000 = 100
    expect(breakdown.retention_deduction).toBe(100);
    // Tax deduction = 1% of 2000 = 20
    expect(breakdown.tax_deduction).toBe(20);
    // Net = 2000 - 200 - 100 - 20 - 100 = 1580
    expect(breakdown.net_amount).toBe(1580);
  });

  it('should calculate worker daily wage accurately including overtime and bonuses', () => {
    const wage = ContractingEngine.calculateWorkerWage(300, 1, 2, 40, 50, 20);
    // 300*1 + 2*40 + 50 - 20 = 300 + 80 + 50 - 20 = 410
    expect(wage).toBe(410);
  });

  it('should process daily labor payout batch and mark attendance logs as paid when cloud sync succeeds', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: true,
      syncedToFirestore: true,
      queuedOffline: false
    });

    const project = ContractingEngine.getProjects()[0];
    
    // Add unpaid attendance log
    const saveRes = await ContractingEngine.saveAttendanceLog({
      id: 'ATT-TEST-1',
      company_id: project.company_id,
      project_id: project.id,
      date: '2026-08-11',
      worker_id: 'WRK-01',
      worker_name: 'علي حسن',
      trade: 'حداد',
      daily_rate: 300,
      days_worked: 1,
      overtime_hours: 0,
      overtime_rate_per_hour: 0,
      bonus_amount: 0,
      deduction_amount: 0,
      total_wage: 300,
      payment_status: 'UNPAID',
      created_at: new Date().toISOString()
    });
    expect(saveRes.success).toBe(true);

    const res = await ContractingEngine.processDailyLaborPayoutBatch(
      project.company_id,
      project.id,
      '2026-08-01',
      '2026-08-31',
      'صرف أجور عمالة الأسبوع الأول'
    );

    expect(res.success).toBe(true);
    expect(res.batch).toBeDefined();
    expect(res.batch!.worker_count).toBeGreaterThan(0);
    expect(res.batch!.total_amount).toBeGreaterThan(0);

    const logs = ContractingEngine.getAttendanceLogs(project.id, '2026-08-11');
    const testLog = logs.find(l => l.id === 'ATT-TEST-1');
    expect(testLog?.payment_status).toBe('PAID');
    expect(testLog?.payout_voucher_id).toBe(res.batch!.id);
  });

  it('should not update local storage when syncWriteWithOfflineFallback fails', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Device is offline'
    });

    const newPrj = {
      id: 'PRJ-OFFLINE-TEST',
      company_id: 'COMP-EGY-01',
      code: 'PRJ-OFF-01',
      name: 'مشروع فاشل المزامنة',
      client_name: 'عميل تجريبي',
      location: 'موقع تجريبي',
      contract_value: 100000,
      advance_payment_rate: 10,
      retention_rate: 5,
      status: 'IN_PROGRESS' as const,
      start_date: '2026-08-01',
      end_date: '2026-12-31',
      created_at: new Date().toISOString()
    };

    const res = await ContractingEngine.saveProject(newPrj);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Device is offline');

    const prjs = ContractingEngine.getProjects('COMP-EGY-01');
    expect(prjs.some(p => p.id === 'PRJ-OFFLINE-TEST')).toBe(false);
  });
});
