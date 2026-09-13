/**
 * @file MySQLSmokeAdapter.ts
 * @description MySQL Storage Adapter for A.N ERP (Phase 0 Smoke Test)
 * Uses official 'mysql2/promise' library.
 * Reads connection from process.env.MYSQL_URL.
 */

import mysql, { Pool } from 'mysql2/promise';

export interface SmokeTestResult {
  adapter: string;
  passed: boolean;
  message: string;
  evidence?: any;
  error?: string;
  missingSecrets?: string[];
}

export class MySQLSmokeAdapter {
  readonly adapterName = 'MySQL Adapter';
  private pool: Pool | null = null;

  constructor(private readonly connectionUrl?: string) {
    const url = connectionUrl || process.env.MYSQL_URL;
    if (url) {
      try {
        this.pool = mysql.createPool(url);
      } catch (e) {
        this.pool = null;
      }
    }
  }

  /**
   * Smoke Test Routine:
   * 1. Check MYSQL_URL from environment.
   * 2. Attempt live connection via official mysql2 library.
   * 3. Write 1 sample record to an_smoke_test table.
   * 4. Read record back and verify identity.
   * 5. Return explicit Pass/Fail with diagnostic summary.
   */
  public async runSmokeTest(): Promise<SmokeTestResult> {
    const envUrl = this.connectionUrl || process.env.MYSQL_URL;
    if (!envUrl) {
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'متغير البيئة MYSQL_URL غير متوفر في بيئة التشغيل.',
        missingSecrets: ['MYSQL_URL'],
      };
    }

    try {
      if (!this.pool) {
        this.pool = mysql.createPool(envUrl);
      }

      const conn = await this.pool.getConnection();

      // Ensure test table exists
      await conn.query(`
        CREATE TABLE IF NOT EXISTS an_smoke_test (
          id VARCHAR(64) PRIMARY KEY,
          payload VARCHAR(255) NOT NULL,
          tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const testId = `smoke-mysql-${Date.now()}`;
      const payload = 'A.N ERP Phase 0 Smoke Verification';

      // Write test record
      await conn.query(
        'INSERT INTO an_smoke_test (id, payload) VALUES (?, ?)',
        [testId, payload]
      );

      // Read test record
      const [rows]: any = await conn.query(
        'SELECT id, payload FROM an_smoke_test WHERE id = ?',
        [testId]
      );

      conn.release();

      if (rows && rows.length > 0 && rows[0].payload === payload) {
        return {
          adapter: this.adapterName,
          passed: true,
          message: 'نجح اختبار Smoke Test لـ MySQL بنجاح: تم الاتصال والكتابة والقراءة بمطابقة تامة.',
          evidence: { testId, payloadReceived: rows[0].payload },
        };
      } else {
        return {
          adapter: this.adapterName,
          passed: false,
          message: 'فشل اختبار Smoke Test: السجل المسترجع لا يطابق القيمة المكتوبة.',
        };
      }
    } catch (err: any) {
      return {
        adapter: this.adapterName,
        passed: false,
        message: 'فشل الاتصال بقاعدة بيانات MySQL عبر المكتبة الرسمية mysql2.',
        error: err.message,
      };
    }
  }
}
