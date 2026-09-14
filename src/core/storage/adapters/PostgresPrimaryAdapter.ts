/**
 * @file PostgresPrimaryAdapter.ts
 * @description PostgreSQL / Supabase Primary Storage Adapter for A.N ERP (Phase 0)
 * Uses official 'pg' library with connection pooling and atomic transactions.
 * Connection string is read from process.env.DATABASE_URL.
 */

import { Pool, PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  StoragePort,
  StorageResult,
  TenantCompany,
  User,
  Account,
  JournalEntry,
  SequenceResult,
  ApprovalRequest,
  SystemChangeLogEntry,
  RFC7807Problem,
  TokenFamily,
  RefreshTokenRecord,
} from '../StoragePort';

export class PostgresPrimaryAdapter implements StoragePort {
  readonly adapterName = 'PostgreSQL (Supabase Primary)';
  private pool: Pool | null = null;
  private isInitialized = false;
  private asyncLocalStorage = new AsyncLocalStorage<{ client: PoolClient; tenantId?: string }>();

  private urlFormatError: string | null = null;

  constructor(private readonly connectionString?: string) {
    let url = (connectionString || process.env.DATABASE_URL || '').trim();
    // Remove accidental wrapping quotes or accidental leading char like lpostgresql://
    if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
      url = url.slice(1, -1).trim();
    }
    if (url.startsWith('lpostgresql://')) {
      url = url.slice(1);
    }

    if (url) {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        this.urlFormatError =
          'صيغة DATABASE_URL تبدأ بـ https:// (رابط مشروع Supabase REST API) بدلاً من صيغة اتصال PostgreSQL المباشرة (postgresql://user:password@host:port/database أو Pooler URI).';
      } else if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
        this.urlFormatError = 'صيغة DATABASE_URL غير صالحة. يجب أن تبدأ بـ postgresql:// أو postgres://';
      } else {
        try {
          const u = new URL(url);
          let cleanPassword = u.password ? decodeURIComponent(u.password) : '';
          if (cleanPassword.startsWith('[') && cleanPassword.endsWith(']')) {
            cleanPassword = cleanPassword.slice(1, -1);
          }
          if (cleanPassword.startsWith('%5B') && cleanPassword.endsWith('%5D')) {
            cleanPassword = cleanPassword.slice(3, -3);
          }

          const dbName = u.pathname ? u.pathname.replace(/^\//, '') : undefined;

          this.pool = new Pool({
            host: u.hostname || undefined,
            port: u.port ? parseInt(u.port, 10) : 5432,
            user: u.username ? decodeURIComponent(u.username) : undefined,
            password: cleanPassword,
            database: dbName || 'postgres',
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            ssl: url.includes('supabase') || url.includes('neon') || url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
          });
        } catch (e: any) {
          this.urlFormatError = `فشل إنشاء مجمع اتصالات Pool: ${e.message}`;
        }
      }
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  public async checkHealth(): Promise<{ connected: boolean; message: string; error?: string }> {
    if (this.urlFormatError) {
      return {
        connected: false,
        message: 'صيغة DATABASE_URL غير متوافقة مع اتصال PostgreSQL المباشر.',
        error: this.urlFormatError,
      };
    }

    if (!this.pool) {
      return {
        connected: false,
        message: 'DATABASE_URL غير معرّف في متغيرات البيئة.',
      };
    }

    try {
      const client = await this.pool.connect();
      const res = await client.query('SELECT NOW() as current_time');
      client.release();
      return {
        connected: true,
        message: `تم الاتصال بنجاح بـ PostgreSQL: ${res.rows[0].current_time}`,
      };
    } catch (err: any) {
      // Sanitize any password or full URL from error message
      let sanitizedError = (err.message || 'خطأ اتصال غير معروف').replace(/\/\/([^:]+):([^@]+)@/g, '//$1:***@');
      if (sanitizedError.includes('ECONNREFUSED') && (sanitizedError.includes('2a05:') || sanitizedError.includes('5432'))) {
        sanitizedError += ' | ملاحظة فنية: خادم db.[ref].supabase.co يدعم اتصالات IPv6 فقط؛ يرجى نسخ رابط Connection Pooler (من تبويب URI في لوحة Supabase مع تفعيل Connection Pooling) لدعم شبكات IPv4 السحابية.';
      }
      return {
        connected: false,
        message: 'فشل الاتصال بقاعدة بيانات PostgreSQL / Supabase.',
        error: sanitizedError,
      };
    }
  }

  public async initializeSchema(): Promise<StorageResult<boolean>> {
    if (!this.pool) {
      return this.missingConnError();
    }

    const ddl = `
      -- Tenants / Companies Table
      CREATE TABLE IF NOT EXISTS an_tenants (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(32) NOT NULL UNIQUE,
        name_ar VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        tax_number VARCHAR(64),
        backend_config JSONB NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Users Table
      CREATE TABLE IF NOT EXISTS an_users (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        username VARCHAR(64) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
      );

      -- Chart of Accounts
      CREATE TABLE IF NOT EXISTS an_accounts (
        code VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        name_ar VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL,
        currency VARCHAR(16) NOT NULL DEFAULT 'SAR',
        debit_balance NUMERIC(18, 4) NOT NULL DEFAULT 0,
        credit_balance NUMERIC(18, 4) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        PRIMARY KEY (tenant_id, code)
      );

      -- Atomic Sequences
      CREATE TABLE IF NOT EXISTS an_sequences (
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        sequence_key VARCHAR(64) NOT NULL,
        current_val BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, sequence_key)
      );

      -- Idempotency Records
      CREATE TABLE IF NOT EXISTS an_idempotency_keys (
        idempotency_key VARCHAR(128) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        operation VARCHAR(64) NOT NULL,
        response_payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Journal Entries
      CREATE TABLE IF NOT EXISTS an_journal_entries (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        date DATE NOT NULL,
        type VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        total_amount NUMERIC(18, 4) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        created_by VARCHAR(64) NOT NULL,
        approved_by VARCHAR(64),
        posted_at TIMESTAMPTZ,
        reversed_by_entry_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Journal Lines
      CREATE TABLE IF NOT EXISTS an_journal_lines (
        id VARCHAR(64) PRIMARY KEY,
        entry_id VARCHAR(64) NOT NULL REFERENCES an_journal_entries(id) ON DELETE CASCADE,
        tenant_id VARCHAR(64) NOT NULL,
        account_code VARCHAR(64) NOT NULL,
        cost_center VARCHAR(64),
        debit NUMERIC(18, 4) NOT NULL DEFAULT 0,
        credit NUMERIC(18, 4) NOT NULL DEFAULT 0,
        description TEXT NOT NULL
      );

      -- Approval Requests
      CREATE TABLE IF NOT EXISTS an_approval_requests (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        document_type VARCHAR(64) NOT NULL,
        document_id VARCHAR(64) NOT NULL,
        document_code VARCHAR(64) NOT NULL,
        initiator_id VARCHAR(64) NOT NULL,
        current_step INT NOT NULL DEFAULT 1,
        steps JSONB NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- System Change Log (Immutable Ledger)
      CREATE TABLE IF NOT EXISTS an_system_changelog (
        id VARCHAR(64) PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor VARCHAR(64) NOT NULL,
        change_type VARCHAR(64) NOT NULL,
        module VARCHAR(64) NOT NULL,
        entities_affected TEXT[] NOT NULL,
        summary_ar TEXT NOT NULL,
        before_state JSONB,
        after_state JSONB,
        evidence_ref VARCHAR(255),
        version VARCHAR(32) NOT NULL
      );

      -- Token Families
      CREATE TABLE IF NOT EXISTS an_token_families (
        family_id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        is_invalidated BOOLEAN NOT NULL DEFAULT FALSE,
        invalidation_reason TEXT,
        created_at BIGINT NOT NULL
      );

      -- Refresh Tokens
      CREATE TABLE IF NOT EXISTS an_refresh_tokens (
        token_hash VARCHAR(128) PRIMARY KEY,
        family_id VARCHAR(64) NOT NULL REFERENCES an_token_families(family_id) ON DELETE CASCADE,
        sequence INT NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        expires_at BIGINT NOT NULL,
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        revoked_at BIGINT
      );

      -- Alter an_users for credentials and 2FA
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS backup_codes JSONB;

      -- Insert default tenant company if not present
      INSERT INTO an_tenants (id, code, name_ar, name_en, backend_config, status)
      VALUES (
        'tenant-main',
        'HQ-001',
        'شركة أ.ن للحلول المتقدمة',
        'A.N ERP Co.',
        '{"adapterType":"postgresql","connectionRef":"DATABASE_URL","isolationLevel":"Shared"}'::jsonb,
        'ACTIVE'
      )
      ON CONFLICT (id) DO NOTHING;

      -- Enable and Force Row Level Security (RLS) on all tenant-isolated tables
      DO $$
      DECLARE
        tbl text;
        tables text[] := ARRAY[
          'an_users',
          'an_accounts',
          'an_sequences',
          'an_idempotency_keys',
          'an_journal_entries',
          'an_journal_lines',
          'an_approval_requests',
          'an_token_families',
          'an_refresh_tokens'
        ];
      BEGIN
        FOREACH tbl IN ARRAY tables LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I FOR ALL USING (tenant_id = current_setting(''app.current_tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true));', tbl);
        END LOOP;
      END $$;
    `;

    try {
      const client = await this.pool.connect();
      await client.query(ddl);
      client.release();
      this.isInitialized = true;
      return { success: true, data: true };
    } catch (err: any) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/db-init-failed',
          title: 'فشل تهيئة جداول PostgreSQL',
          status: 500,
          detail: err.message,
        },
      };
    }
  }

  // Tenant operations
  public async getTenant(tenantId: string): Promise<StorageResult<TenantCompany>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.pool.query('SELECT * FROM an_tenants WHERE id = $1', [tenantId]);
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/tenant-not-found',
            title: 'المستأجر غير موجود',
            status: 404,
            detail: `تعذر العثور على الشركة برقم ${tenantId}`,
          },
        };
      }
      const row = res.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          code: row.code,
          nameAr: row.name_ar,
          nameEn: row.name_en,
          taxNumber: row.tax_number,
          backendConfig: row.backend_config,
          status: row.status,
          createdAt: row.created_at.toISOString(),
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveTenant(tenant: TenantCompany, idempotencyKey: string): Promise<StorageResult<TenantCompany>> {
    if (!this.pool) return this.missingConnError();
    const existingKey = await this.checkIdempotency(tenant.id, idempotencyKey, 'saveTenant');
    if (existingKey) return { success: true, data: existingKey };

    try {
      const query = `
        INSERT INTO an_tenants (id, code, name_ar, name_en, tax_number, backend_config, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name_ar = EXCLUDED.name_ar,
          name_en = EXCLUDED.name_en,
          tax_number = EXCLUDED.tax_number,
          backend_config = EXCLUDED.backend_config,
          status = EXCLUDED.status
        RETURNING *;
      `;
      const res = await this.pool.query(query, [
        tenant.id,
        tenant.code,
        tenant.nameAr,
        tenant.nameEn || null,
        tenant.taxNumber || null,
        JSON.stringify(tenant.backendConfig),
        tenant.status,
        tenant.createdAt || new Date().toISOString(),
      ]);

      await this.recordIdempotency(tenant.id, idempotencyKey, 'saveTenant', tenant);
      return { success: true, data: tenant };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Users & RBAC
  public async getUser(tenantId: string, userId: string): Promise<StorageResult<User>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query('SELECT * FROM an_users WHERE tenant_id = $1 AND id = $2', [tenantId, userId]);
        if (res.rows.length === 0) {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/user-not-found',
              title: 'المستخدم غير موجود',
              status: 404,
              detail: `المستخدم ${userId} غير مسجل للشركة ${tenantId}`,
            },
          };
        }
        const r = res.rows[0];
        return {
          success: true,
          data: {
            id: r.id,
            tenantId: r.tenant_id,
            username: r.username,
            fullName: r.full_name,
            email: r.email,
            role: r.role,
            status: r.status,
            passwordHash: r.password_hash || undefined,
            twoFactorSecret: r.two_factor_secret || undefined,
            twoFactorEnabled: r.two_factor_enabled === true,
            backupCodes: Array.isArray(r.backup_codes) ? r.backup_codes : undefined,
          },
        };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async saveUser(user: User, idempotencyKey: string): Promise<StorageResult<User>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(user.tenantId, async () => {
      try {
        const query = `
          INSERT INTO an_users (
            id, tenant_id, username, full_name, email, role, status,
            password_hash, two_factor_secret, two_factor_enabled, backup_codes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            password_hash = COALESCE(EXCLUDED.password_hash, an_users.password_hash),
            two_factor_secret = COALESCE(EXCLUDED.two_factor_secret, an_users.two_factor_secret),
            two_factor_enabled = EXCLUDED.two_factor_enabled,
            backup_codes = COALESCE(EXCLUDED.backup_codes, an_users.backup_codes);
        `;
        await this.query(query, [
          user.id,
          user.tenantId,
          user.username,
          user.fullName,
          user.email,
          user.role,
          user.status,
          user.passwordHash || null,
          user.twoFactorSecret || null,
          user.twoFactorEnabled || false,
          user.backupCodes ? JSON.stringify(user.backupCodes) : null,
        ]);
        return { success: true, data: user };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  // Chart of Accounts & Balances
  public async getAccount(tenantId: string, accountCode: string): Promise<StorageResult<Account>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query('SELECT * FROM an_accounts WHERE tenant_id = $1 AND code = $2', [tenantId, accountCode]);
        if (res.rows.length === 0) {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/account-not-found',
              title: 'الحساب غير موجود',
              status: 404,
              detail: `تعذر العثور على الحساب برمز ${accountCode}`,
            },
          };
        }
        const r = res.rows[0];
        return {
          success: true,
          data: {
            code: r.code,
            tenantId: r.tenant_id,
            nameAr: r.name_ar,
            type: r.type,
            currency: r.currency,
            debitBalance: Number(r.debit_balance),
            creditBalance: Number(r.credit_balance),
            isActive: r.is_active,
          },
        };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async saveAccount(tenantId: string, account: Account, idempotencyKey: string): Promise<StorageResult<Account>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const query = `
          INSERT INTO an_accounts (code, tenant_id, name_ar, type, currency, debit_balance, credit_balance, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (tenant_id, code) DO UPDATE SET
            name_ar = EXCLUDED.name_ar,
            type = EXCLUDED.type,
            currency = EXCLUDED.currency,
            is_active = EXCLUDED.is_active;
        `;
        await this.query(query, [
          account.code,
          tenantId,
          account.nameAr,
          account.type,
          account.currency,
          account.debitBalance,
          account.creditBalance,
          account.isActive,
        ]);
        return { success: true, data: account };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async getAccountBalance(
    tenantId: string,
    accountCode: string
  ): Promise<StorageResult<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number }>> {
    const accResult = await this.getAccount(tenantId, accountCode);
    if (!accResult.success || !accResult.data) {
      return { success: false, error: accResult.error };
    }
    const acc = accResult.data;
    const balance = acc.debitBalance - acc.creditBalance;
    return {
      success: true,
      data: {
        accountCode: acc.code,
        debitTotal: acc.debitBalance,
        creditTotal: acc.creditBalance,
        balance,
      },
    };
  }

  // Atomic Posting
  public async createJournalEntry(
    tenantId: string,
    entry: JournalEntry,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>> {
    if (!this.pool) return this.missingConnError();
    const existing = await this.checkIdempotency(tenantId, idempotencyKey, 'createJournalEntry');
    if (existing) return { success: true, data: existing };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const entryQuery = `
        INSERT INTO an_journal_entries (id, code, tenant_id, date, type, description, total_amount, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `;
      await client.query(entryQuery, [
        entry.id,
        entry.code,
        tenantId,
        entry.date,
        entry.type,
        entry.description,
        entry.totalAmount,
        entry.status,
        entry.createdBy,
      ]);

      for (const line of entry.lines) {
        const lineQuery = `
          INSERT INTO an_journal_lines (id, entry_id, tenant_id, account_code, cost_center, debit, credit, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `;
        await client.query(lineQuery, [
          line.id,
          entry.id,
          tenantId,
          line.accountCode,
          line.costCenter || null,
          line.debit,
          line.credit,
          line.description,
        ]);
      }

      await client.query('COMMIT');
      await this.recordIdempotency(tenantId, idempotencyKey, 'createJournalEntry', entry);
      return { success: true, data: entry };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async postJournalEntry(
    tenantId: string,
    entryId: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>> {
    if (!this.pool) return this.missingConnError();

    // Idempotency check: prevent double post
    const existing = await this.checkIdempotency(tenantId, idempotencyKey, 'postJournalEntry');
    if (existing) return { success: true, data: existing };

    const entryRes = await this.getJournalEntry(tenantId, entryId);
    if (!entryRes.success || !entryRes.data) {
      return { success: false, error: entryRes.error };
    }
    const entry = entryRes.data;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update each account balance
      for (const line of entry.lines) {
        const updateAccountQuery = `
          UPDATE an_accounts 
          SET debit_balance = debit_balance + $1,
              credit_balance = credit_balance + $2
          WHERE tenant_id = $3 AND code = $4;
        `;
        const res = await client.query(updateAccountQuery, [line.debit, line.credit, tenantId, line.accountCode]);
        if (res.rowCount === 0) {
          throw new Error(`تعذر ترحيل السند: الحساب ${line.accountCode} غير موجود بالدليل المحاسبي.`);
        }
      }

      // 2. Mark entry as POSTED
      const postedAt = new Date().toISOString();
      const updateEntryQuery = `
        UPDATE an_journal_entries
        SET status = 'POSTED', posted_at = $1
        WHERE tenant_id = $2 AND id = $3;
      `;
      await client.query(updateEntryQuery, [postedAt, tenantId, entryId]);

      await client.query('COMMIT');

      entry.status = 'POSTED';
      entry.postedAt = postedAt;

      await this.recordIdempotency(tenantId, idempotencyKey, 'postJournalEntry', entry);
      return { success: true, data: entry };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async reverseJournalEntry(
    tenantId: string,
    entryId: string,
    reason: string,
    idempotencyKey: string
  ): Promise<StorageResult<JournalEntry>> {
    if (!this.pool) return this.missingConnError();
    const origRes = await this.getJournalEntry(tenantId, entryId);
    if (!origRes.success || !origRes.data) return origRes;

    const original = origRes.data;
    const reversalLines = original.lines.map((line, idx) => ({
      ...line,
      id: `${original.id}-REV-${idx}`,
      debit: line.credit, // Invert
      credit: line.debit,
      description: `قيد عكسي: ${reason} - ${line.description}`,
    }));

    const reversalEntry: JournalEntry = {
      id: `REV-${Date.now()}`,
      code: `REV-${original.code}`,
      tenantId,
      date: new Date().toISOString().split('T')[0],
      type: 'قيد عكسي',
      description: `قيد تسوية وعكس للسند رقم ${original.code}. السبب: ${reason}`,
      lines: reversalLines,
      totalAmount: original.totalAmount,
      status: 'APPROVED',
      createdBy: 'SYSTEM_REVERSAL',
    };

    const createRes = await this.createJournalEntry(tenantId, reversalEntry, `${idempotencyKey}-create`);
    if (!createRes.success) return createRes;

    const postRes = await this.postJournalEntry(tenantId, reversalEntry.id, `${idempotencyKey}-post`);
    if (!postRes.success) return postRes;

    // Mark original as REVERSED
    await this.pool.query(
      "UPDATE an_journal_entries SET status = 'REVERSED', reversed_by_entry_id = $1 WHERE tenant_id = $2 AND id = $3",
      [reversalEntry.id, tenantId, entryId]
    );

    return postRes;
  }

  public async getJournalEntry(tenantId: string, entryId: string): Promise<StorageResult<JournalEntry>> {
    if (!this.pool) return this.missingConnError();
    try {
      const entryRes = await this.pool.query(
        'SELECT * FROM an_journal_entries WHERE tenant_id = $1 AND id = $2',
        [tenantId, entryId]
      );
      if (entryRes.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/entry-not-found',
            title: 'السند غير موجود',
            status: 404,
            detail: `تعذر العثور على القيد المحاسبي برقم ${entryId}`,
          },
        };
      }
      const row = entryRes.rows[0];
      const linesRes = await this.pool.query(
        'SELECT * FROM an_journal_lines WHERE tenant_id = $1 AND entry_id = $2',
        [tenantId, entryId]
      );

      const lines = linesRes.rows.map((l: any) => ({
        id: l.id,
        accountCode: l.account_code,
        costCenter: l.cost_center,
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description,
      }));

      return {
        success: true,
        data: {
          id: row.id,
          code: row.code,
          tenantId: row.tenant_id,
          date: row.date.toISOString().split('T')[0],
          type: row.type,
          description: row.description,
          lines,
          totalAmount: Number(row.total_amount),
          status: row.status,
          createdBy: row.created_by,
          approvedBy: row.approved_by,
          postedAt: row.posted_at ? row.posted_at.toISOString() : undefined,
          reversedByEntryId: row.reversed_by_entry_id,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listJournalEntries(tenantId: string): Promise<StorageResult<JournalEntry[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.pool.query(
        'SELECT * FROM an_journal_entries WHERE tenant_id = $1 ORDER BY created_at DESC',
        [tenantId]
      );
      const entries: JournalEntry[] = [];
      for (const row of res.rows) {
        entries.push({
          id: row.id,
          code: row.code,
          tenantId: row.tenant_id,
          date: row.date.toISOString().split('T')[0],
          type: row.type,
          description: row.description,
          lines: [],
          totalAmount: Number(row.total_amount),
          status: row.status,
          createdBy: row.created_by,
          approvedBy: row.approved_by,
          postedAt: row.posted_at ? row.posted_at.toISOString() : undefined,
          reversedByEntryId: row.reversed_by_entry_id,
        });
      }
      return { success: true, data: entries };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Atomic Sequence
  public async nextSequence(
    tenantId: string,
    sequenceKey: string,
    prefix: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>> {
    if (!this.pool) return this.missingConnError();
    try {
      const query = `
        INSERT INTO an_sequences (tenant_id, sequence_key, current_val, updated_at)
        VALUES ($1, $2, 1, NOW())
        ON CONFLICT (tenant_id, sequence_key)
        DO UPDATE SET current_val = an_sequences.current_val + 1, updated_at = NOW()
        RETURNING current_val;
      `;
      const res = await this.pool.query(query, [tenantId, sequenceKey]);
      const seq = Number(res.rows[0].current_val);
      const formattedCode = `${prefix}-${String(seq).padStart(6, '0')}`;
      return {
        success: true,
        data: { sequenceNumber: seq, formattedCode },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Approval Workflow
  public async createApprovalRequest(
    tenantId: string,
    request: ApprovalRequest,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    if (!this.pool) return this.missingConnError();
    try {
      const query = `
        INSERT INTO an_approval_requests (id, tenant_id, document_type, document_id, document_code, initiator_id, current_step, steps, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      await this.pool.query(query, [
        request.id,
        tenantId,
        request.documentType,
        request.documentId,
        request.documentCode,
        request.initiatorId,
        request.currentStep,
        JSON.stringify(request.steps),
        request.status,
      ]);
      return { success: true, data: request };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async approveStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.pool.query(
        'SELECT * FROM an_approval_requests WHERE tenant_id = $1 AND id = $2',
        [tenantId, requestId]
      );
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/request-not-found',
            title: 'طلب الاعتماد غير موجود',
            status: 404,
            detail: `تعذر العثور على طلب الاعتماد ${requestId}`,
          },
        };
      }
      const req = res.rows[0];
      const steps = req.steps;
      if (steps[0]) {
        steps[0].status = 'APPROVED';
        steps[0].approverId = approverId;
        steps[0].actionTimestamp = new Date().toISOString();
      }

      await this.pool.query(
        "UPDATE an_approval_requests SET status = 'APPROVED', steps = $1 WHERE tenant_id = $2 AND id = $3",
        [JSON.stringify(steps), tenantId, requestId]
      );

      return {
        success: true,
        data: {
          id: req.id,
          tenantId: req.tenant_id,
          documentType: req.document_type,
          documentId: req.document_id,
          documentCode: req.document_code,
          initiatorId: req.initiator_id,
          currentStep: req.current_step,
          steps,
          status: 'APPROVED',
          createdAt: req.created_at.toISOString(),
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // System Change Log
  public async appendSystemChangeLog(entry: SystemChangeLogEntry): Promise<StorageResult<SystemChangeLogEntry>> {
    if (!this.pool) return this.missingConnError();
    try {
      const query = `
        INSERT INTO an_system_changelog (id, timestamp, actor, change_type, module, entities_affected, summary_ar, before_state, after_state, evidence_ref, version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
      `;
      await this.pool.query(query, [
        entry.id,
        entry.timestamp,
        entry.actor,
        entry.changeType,
        entry.module,
        entry.entitiesAffected,
        entry.summaryAr,
        entry.beforeState ? JSON.stringify(entry.beforeState) : null,
        entry.afterState ? JSON.stringify(entry.afterState) : null,
        entry.evidenceRef || null,
        entry.version,
      ]);
      return { success: true, data: entry };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getSystemChangeLogs(): Promise<StorageResult<SystemChangeLogEntry[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.pool.query('SELECT * FROM an_system_changelog ORDER BY timestamp DESC');
      const logs = res.rows.map((r: any) => ({
        id: r.id,
        timestamp: r.timestamp.toISOString(),
        actor: r.actor,
        changeType: r.change_type,
        module: r.module,
        entitiesAffected: r.entities_affected,
        summaryAr: r.summary_ar,
        beforeState: r.before_state,
        afterState: r.after_state,
        evidenceRef: r.evidence_ref,
        version: r.version,
      }));
      return { success: true, data: logs };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Session & Refresh Tokens (Zero internal memory Map)
  public async saveTokenFamily(family: TokenFamily): Promise<StorageResult<TokenFamily>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(family.tenantId, async () => {
      try {
        const query = `
          INSERT INTO an_token_families (family_id, user_id, tenant_id, is_invalidated, invalidation_reason, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (family_id) DO UPDATE SET
            is_invalidated = EXCLUDED.is_invalidated,
            invalidation_reason = EXCLUDED.invalidation_reason;
        `;
        await this.query(query, [
          family.familyId,
          family.userId,
          family.tenantId,
          family.isInvalidated,
          family.invalidationReason || null,
          family.createdAt,
        ]);
        return { success: true, data: family };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async getTokenFamily(familyId: string): Promise<StorageResult<TokenFamily>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_token_families WHERE family_id = $1', [familyId]);
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/token-family-not-found',
            title: 'عائلة التوكن غير موجودة',
            status: 404,
            detail: `تعذر العثور على عائلة الجلسة ${familyId}`,
          },
        };
      }
      const r = res.rows[0];
      return {
        success: true,
        data: {
          familyId: r.family_id,
          userId: r.user_id,
          tenantId: r.tenant_id,
          isInvalidated: r.is_invalidated,
          invalidationReason: r.invalidation_reason,
          createdAt: Number(r.created_at),
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(record.tenantId, async () => {
      try {
        const query = `
          INSERT INTO an_refresh_tokens (token_hash, family_id, sequence, user_id, tenant_id, session_id, expires_at, is_used, revoked_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (token_hash) DO NOTHING;
        `;
        await this.query(query, [
          record.tokenHash,
          record.familyId,
          record.sequence,
          record.userId,
          record.tenantId,
          record.sessionId,
          record.expiresAt,
          record.isUsed,
          record.revokedAt || null,
        ]);
        return { success: true, data: record };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async getRefreshToken(tokenHash: string): Promise<StorageResult<RefreshTokenRecord>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_refresh_tokens WHERE token_hash = $1', [tokenHash]);
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/refresh-token-not-found',
            title: 'رمز التحديث غير موجود',
            status: 404,
            detail: 'رمز التحديث غير مسجل أو منتهي',
          },
        };
      }
      const r = res.rows[0];
      return {
        success: true,
        data: {
          tokenHash: r.token_hash,
          familyId: r.family_id,
          sequence: r.sequence,
          userId: r.user_id,
          tenantId: r.tenant_id,
          sessionId: r.session_id,
          expiresAt: Number(r.expires_at),
          isUsed: r.is_used,
          revokedAt: r.revoked_at ? Number(r.revoked_at) : undefined,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async updateRefreshToken(record: RefreshTokenRecord): Promise<StorageResult<RefreshTokenRecord>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(record.tenantId, async () => {
      try {
        await this.query(
          'UPDATE an_refresh_tokens SET is_used = $1, revoked_at = $2 WHERE token_hash = $3',
          [record.isUsed, record.revokedAt || null, record.tokenHash]
        );
        return { success: true, data: record };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async invalidateTokenFamily(familyId: string, reason: string): Promise<StorageResult<boolean>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        'UPDATE an_token_families SET is_invalidated = TRUE, invalidation_reason = $1 WHERE family_id = $2',
        [reason, familyId]
      );
      return { success: true, data: true };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  /**
   * Real Row Level Security (RLS) Tenant Scoping
   * Enforces SELECT set_config('app.current_tenant_id', $1, true) inside transaction.
   */
  public async withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    if (!this.pool) return await fn();

    const store = this.asyncLocalStorage.getStore();
    if (store?.client && store.tenantId === tenantId) {
      return await fn();
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const result = await this.asyncLocalStorage.run({ client, tenantId }, fn);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw err;
    } finally {
      client.release();
    }
  }

  public getCurrentTenantScope(): string | null {
    return this.asyncLocalStorage.getStore()?.tenantId || null;
  }

  public getDdlScript(): string {
    return `
      CREATE TABLE IF NOT EXISTS an_tenants (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(32) NOT NULL UNIQUE,
        name_ar VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        tax_number VARCHAR(64),
        backend_config JSONB NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS an_users (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        username VARCHAR(64) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        password_hash TEXT,
        two_factor_secret TEXT,
        two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        backup_codes JSONB
      );

      CREATE TABLE IF NOT EXISTS an_accounts (
        code VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        name_ar VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL,
        currency VARCHAR(16) NOT NULL DEFAULT 'SAR',
        debit_balance NUMERIC(18, 4) NOT NULL DEFAULT 0,
        credit_balance NUMERIC(18, 4) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        PRIMARY KEY (tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS an_sequences (
        tenant_id VARCHAR(64) NOT NULL,
        sequence_type VARCHAR(32) NOT NULL,
        year INT NOT NULL,
        last_value BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, sequence_type, year)
      );

      CREATE TABLE IF NOT EXISTS an_idempotency_keys (
        idempotency_key VARCHAR(128) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        operation VARCHAR(64) NOT NULL,
        response_payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, idempotency_key, operation)
      );

      CREATE TABLE IF NOT EXISTS an_journal_entries (
        id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        entry_number VARCHAR(64) NOT NULL,
        date VARCHAR(32) NOT NULL,
        description VARCHAR(500) NOT NULL,
        reference_type VARCHAR(64) NOT NULL,
        reference_id VARCHAR(64) NOT NULL,
        total_debit NUMERIC(18, 4) NOT NULL,
        total_credit NUMERIC(18, 4) NOT NULL,
        is_posted BOOLEAN NOT NULL DEFAULT TRUE,
        posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        idempotency_key VARCHAR(128) NOT NULL,
        is_reversal BOOLEAN NOT NULL DEFAULT FALSE,
        reversal_of VARCHAR(64),
        PRIMARY KEY (tenant_id, id)
      );

      CREATE TABLE IF NOT EXISTS an_journal_lines (
        id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        entry_id VARCHAR(64) NOT NULL,
        account_code VARCHAR(64) NOT NULL,
        debit NUMERIC(18, 4) NOT NULL DEFAULT 0,
        credit NUMERIC(18, 4) NOT NULL DEFAULT 0,
        description VARCHAR(500),
        PRIMARY KEY (tenant_id, id)
      );

      CREATE TABLE IF NOT EXISTS an_token_families (
        family_id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
        revocation_reason VARCHAR(255),
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS an_refresh_tokens (
        token_hash VARCHAR(128) PRIMARY KEY,
        family_id VARCHAR(64) NOT NULL REFERENCES an_token_families(family_id) ON DELETE CASCADE,
        sequence INT NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        expires_at BIGINT NOT NULL,
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        revoked_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS an_company_profiles (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        name_ar VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        cr_number VARCHAR(64),
        tax_number VARCHAR(64),
        base_currency VARCHAR(16) NOT NULL DEFAULT 'SAR',
        audit_retention_policy_years INT NOT NULL DEFAULT 10
      );

      CREATE TABLE IF NOT EXISTS an_custom_fields (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        module VARCHAR(64) NOT NULL,
        field_key VARCHAR(64) NOT NULL,
        field_label_ar VARCHAR(255) NOT NULL,
        field_type VARCHAR(32) NOT NULL,
        is_required BOOLEAN NOT NULL DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS an_audit_trail (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        actor_id VARCHAR(64) NOT NULL,
        actor_name VARCHAR(255) NOT NULL,
        action VARCHAR(64) NOT NULL,
        entity_type VARCHAR(64) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        details JSONB,
        ip_address VARCHAR(64),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Row Level Security (RLS) enforcement
      ALTER TABLE an_users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE an_users FORCE ROW LEVEL SECURITY;
      CREATE POLICY an_users_tenant_isolation_policy ON an_users FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

      ALTER TABLE an_accounts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE an_accounts FORCE ROW LEVEL SECURITY;
      CREATE POLICY an_accounts_tenant_isolation_policy ON an_accounts FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

      ALTER TABLE an_journal_entries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE an_journal_entries FORCE ROW LEVEL SECURITY;
      CREATE POLICY an_journal_entries_tenant_isolation_policy ON an_journal_entries FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

      ALTER TABLE an_journal_lines ENABLE ROW LEVEL SECURITY;
      ALTER TABLE an_journal_lines FORCE ROW LEVEL SECURITY;
      CREATE POLICY an_journal_lines_tenant_isolation_policy ON an_journal_lines FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

      ALTER TABLE an_token_families ENABLE ROW LEVEL SECURITY;
      ALTER TABLE an_token_families FORCE ROW LEVEL SECURITY;
      CREATE POLICY an_token_families_tenant_isolation_policy ON an_token_families FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

      ALTER TABLE an_refresh_tokens ENABLE ROW LEVEL SECURITY;
      ALTER TABLE an_refresh_tokens FORCE ROW LEVEL SECURITY;
      CREATE POLICY an_refresh_tokens_tenant_isolation_policy ON an_refresh_tokens FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

      ALTER TABLE an_company_profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE an_company_profiles FORCE ROW LEVEL SECURITY;
      CREATE POLICY an_company_profiles_tenant_isolation_policy ON an_company_profiles FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

      ALTER TABLE an_custom_fields ENABLE ROW LEVEL SECURITY;
      ALTER TABLE an_custom_fields FORCE ROW LEVEL SECURITY;
      CREATE POLICY an_custom_fields_tenant_isolation_policy ON an_custom_fields FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

      ALTER TABLE an_audit_trail ENABLE ROW LEVEL SECURITY;
      ALTER TABLE an_audit_trail FORCE ROW LEVEL SECURITY;
      CREATE POLICY an_audit_trail_tenant_isolation_policy ON an_audit_trail FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
    `;
  }

  private async query(text: string, params?: any[]): Promise<any> {
    const store = this.asyncLocalStorage.getStore();
    if (store?.client) {
      return await store.client.query(text, params);
    }
    if (!this.pool) throw new Error('Database pool not connected');
    return await this.pool.query(text, params);
  }

  private async checkIdempotency(tenantId: string, key: string, operation: string): Promise<any | null> {
    if (!this.pool || !key) return null;
    try {
      const res = await this.pool.query(
        'SELECT response_payload FROM an_idempotency_keys WHERE idempotency_key = $1 AND tenant_id = $2 AND operation = $3',
        [key, tenantId, operation]
      );
      if (res.rows.length > 0) {
        return res.rows[0].response_payload;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async recordIdempotency(tenantId: string, key: string, operation: string, payload: any): Promise<void> {
    if (!this.pool || !key) return;
    try {
      await this.pool.query(
        'INSERT INTO an_idempotency_keys (idempotency_key, tenant_id, operation, response_payload) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [key, tenantId, operation, JSON.stringify(payload)]
      );
    } catch {
      // Ignored
    }
  }

  private missingConnError(): StorageResult<any> {
    return {
      success: false,
      error: {
        type: 'https://api.an-erp.local/errors/missing-database-url',
        title: this.urlFormatError ? 'صيغة DATABASE_URL غير متوافقة' : 'DATABASE_URL غير مهيأ',
        status: 503,
        detail: this.urlFormatError || 'قاعدة بيانات PostgreSQL / Supabase الأساسية غير متصلة لعدم توفر سر البيئة DATABASE_URL.',
      },
    };
  }

  private dbError(err: any): StorageResult<any> {
    return {
      success: false,
      error: {
        type: 'https://api.an-erp.local/errors/db-error',
        title: 'خطأ في قاعدة بيانات PostgreSQL',
        status: 500,
        detail: err.message || 'حدث خطأ أثناء تنفيذ عملية التخزين.',
      },
    };
  }
}
