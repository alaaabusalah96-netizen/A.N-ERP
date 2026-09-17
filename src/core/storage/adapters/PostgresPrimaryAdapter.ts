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
  CountryTaxRule,
  TenantModuleManifest,
  MasterItem,
  MasterPartner,
  AuditChainEntry,
  GeoLocation,
  LoginAttemptRecord,
  FailedAttemptRecord,
  ActiveSessionRecord,
  OrgNode,
  BreakGlassDetails,
} from '../StoragePort';
import { AuditChainService, GENESIS_PREVIOUS_HASH } from '../../audit/AuditChainService';

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
        actor VARCHAR(255) NOT NULL,
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

      -- Alter an_users for credentials, 2FA, PII, and RBAC
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS backup_codes JSONB;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS hashed_backup_codes JSONB;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS role_title_ar VARCHAR(255);
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS branch_name VARCHAR(255);
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS encrypted_pii JSONB;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS permissions JSONB;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS requires_password_change BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      -- Security Tracking Tables (Anomaly Detection, Lockout, and Active Sessions)
      CREATE TABLE IF NOT EXISTS an_last_successful_logins (
        user_id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64),
        location JSONB NOT NULL,
        ip VARCHAR(64) NOT NULL,
        timestamp BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS an_failed_login_attempts (
        user_id VARCHAR(64) PRIMARY KEY,
        count INT NOT NULL DEFAULT 0,
        locked_until BIGINT,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS an_active_sessions (
        session_id VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        username VARCHAR(64) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(64) NOT NULL,
        device_type VARCHAR(128) NOT NULL,
        ip_address VARCHAR(64) NOT NULL,
        location JSONB NOT NULL,
        family_id VARCHAR(128),
        created_at BIGINT NOT NULL,
        last_active_at BIGINT NOT NULL
      );

      -- Phase 2 Tables:
      CREATE TABLE IF NOT EXISTS an_tax_rules (
        country_code VARCHAR(8) PRIMARY KEY,
        country_name_ar VARCHAR(255) NOT NULL,
        standard_vat_rate NUMERIC(6, 4) NOT NULL,
        currency_code VARCHAR(16) NOT NULL,
        tax_authority_name VARCHAR(255) NOT NULL,
        tax_id_format_regex VARCHAR(255) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS an_tenant_modules (
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        module_id VARCHAR(64) NOT NULL,
        module_name_ar VARCHAR(255) NOT NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        config JSONB,
        activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, module_id)
      );

      CREATE TABLE IF NOT EXISTS an_master_items (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        code VARCHAR(64) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        category VARCHAR(128) NOT NULL,
        unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
        cost_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL',
        created_by VARCHAR(64) NOT NULL,
        approved_by VARCHAR(64),
        rejection_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS an_master_partners (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        type VARCHAR(32) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        tax_number VARCHAR(64),
        phone VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL',
        created_by VARCHAR(64) NOT NULL,
        approved_by VARCHAR(64),
        rejection_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS an_audit_chain (
        id VARCHAR(64) PRIMARY KEY,
        sequence_number BIGINT NOT NULL,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor_id VARCHAR(64) NOT NULL,
        actor_name VARCHAR(255) NOT NULL,
        action VARCHAR(64) NOT NULL,
        entity_type VARCHAR(64) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        before_state JSONB,
        after_state JSONB,
        ip_address VARCHAR(64),
        previous_hash VARCHAR(64) NOT NULL,
        entry_hash VARCHAR(64) NOT NULL
      );

      -- Phase 3A: Enterprise Organizational Hierarchy Table
      CREATE TABLE IF NOT EXISTS an_org_nodes (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        type VARCHAR(32) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        parent_id VARCHAR(64) REFERENCES an_org_nodes(id),
        manager_user_id VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_an_org_nodes_tenant ON an_org_nodes(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_an_org_nodes_parent ON an_org_nodes(parent_id);

      -- Schema migrations for Phase 3 fields
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS assigned_node_id VARCHAR(64);
      ALTER TABLE an_approval_requests ADD COLUMN IF NOT EXISTS break_glass JSONB;
      ALTER TABLE an_system_changelog ALTER COLUMN actor TYPE VARCHAR(255);

      -- Seed country tax rules if not exist
      INSERT INTO an_tax_rules (country_code, country_name_ar, standard_vat_rate, currency_code, tax_authority_name, tax_id_format_regex)
      VALUES 
        ('SA', 'المملكة العربية السعودية', 0.1500, 'SAR', 'هيئة الزكاة والضريبة والجمارك (ZATCA)', '^3[0-9]{13}3$'),
        ('EG', 'جمهورية مصر العربية', 0.1400, 'EGP', 'مصلحة الضرائب المصرية (ETA)', '^[0-9]{9}$'),
        ('AE', 'الإمارات العربية المتحدة', 0.0500, 'AED', 'الهيئة الاتحادية للضرائب (FTA)', '^100[0-9]{12}$'),
        ('OM', 'سلطنة عمان', 0.0500, 'OMR', 'جهاز الضرائب العماني (OTA)', '^[0-9]{8}$'),
        ('BH', 'مملكة البحرين', 0.1000, 'BHD', 'الجهاز الوطني للإيرادات (NBR)', '^[0-9]{15}$')
      ON CONFLICT (country_code) DO NOTHING;

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
          'an_refresh_tokens',
          'an_tenant_modules',
          'an_master_items',
          'an_master_partners',
          'an_audit_chain',
          'an_org_nodes'
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

  private mapUserRow(r: any): User {
    let backupCodes: string[] | undefined;
    let hashedBackupCodes: string[] | undefined;
    let permissions: string[] | undefined;
    let encryptedPii: any = undefined;

    try {
      if (r.backup_codes) {
        backupCodes = typeof r.backup_codes === 'string' ? JSON.parse(r.backup_codes) : r.backup_codes;
      }
    } catch { }

    try {
      if (r.hashed_backup_codes) {
        hashedBackupCodes = typeof r.hashed_backup_codes === 'string' ? JSON.parse(r.hashed_backup_codes) : r.hashed_backup_codes;
      }
    } catch { }

    try {
      if (r.permissions) {
        permissions = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions;
      }
    } catch { }

    try {
      if (r.encrypted_pii) {
        encryptedPii = typeof r.encrypted_pii === 'string' ? JSON.parse(r.encrypted_pii) : r.encrypted_pii;
      }
    } catch { }

    return {
      id: r.id,
      tenantId: r.tenant_id,
      username: r.username,
      fullName: r.full_name,
      email: r.email,
      role: r.role,
      roleTitleAr: r.role_title_ar || undefined,
      branchName: r.branch_name || undefined,
      status: r.status,
      passwordHash: r.password_hash || undefined,
      twoFactorSecret: r.two_factor_secret || undefined,
      twoFactorEnabled: r.two_factor_enabled === true,
      backupCodes,
      hashedBackupCodes,
      permissions,
      requiresPasswordChange: r.requires_password_change === true,
      assignedNodeId: r.assigned_node_id || undefined,
      encryptedPii,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    };
  }

  // Users & RBAC
  public async getUser(tenantId: string, userId: string): Promise<StorageResult<User>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query(
          'SELECT * FROM an_users WHERE (tenant_id = $1 OR $1 = \'tenant-main\') AND (id = $2 OR LOWER(username) = LOWER($2)) LIMIT 1',
          [tenantId, userId]
        );
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
        return {
          success: true,
          data: this.mapUserRow(res.rows[0]),
        };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async getUserByUsername(tenantId: string, username: string): Promise<StorageResult<User>> {
    if (!this.pool) return this.missingConnError();
    const effectiveTenantId = tenantId || 'tenant-main';
    return this.withTenantScope(effectiveTenantId, async () => {
      try {
        const res = await this.query(
          'SELECT * FROM an_users WHERE LOWER(username) = LOWER($1) AND (tenant_id = $2 OR $2 = \'tenant-main\') LIMIT 1',
          [username.trim(), effectiveTenantId]
        );
        if (res.rows.length === 0) {
          const fallbackRes = await this.query(
            'SELECT * FROM an_users WHERE LOWER(username) = LOWER($1) LIMIT 1',
            [username.trim()]
          );
          if (fallbackRes.rows.length === 0) {
            return {
              success: false,
              error: {
                type: 'https://api.an-erp.local/errors/user-not-found',
                title: 'المستخدم غير موجود',
                status: 404,
                detail: `المستخدم ${username} غير مسجل بالنظام`,
              },
            };
          }
          return { success: true, data: this.mapUserRow(fallbackRes.rows[0]) };
        }
        return { success: true, data: this.mapUserRow(res.rows[0]) };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async getUserById(userId: string): Promise<StorageResult<User>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        'SELECT * FROM an_users WHERE id = $1 OR LOWER(username) = LOWER($1) LIMIT 1',
        [userId]
      );
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/user-not-found',
            title: 'المستخدم غير موجود',
            status: 404,
            detail: `المستخدم بالمعرف ${userId} غير مسجل بالنظام`,
          },
        };
      }
      return { success: true, data: this.mapUserRow(res.rows[0]) };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listUsers(tenantId?: string): Promise<StorageResult<User[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = tenantId
        ? await this.query('SELECT * FROM an_users WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId])
        : await this.query('SELECT * FROM an_users ORDER BY created_at DESC');
      const list = res.rows.map((r: any) => this.mapUserRow(r));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveUser(user: User, idempotencyKey: string): Promise<StorageResult<User>> {
    if (!this.pool) return this.missingConnError();
    const effectiveTenantId = user.tenantId || 'tenant-main';
    return this.withTenantScope(effectiveTenantId, async () => {
      try {
        const query = `
          INSERT INTO an_users (
            id, tenant_id, username, full_name, email, role, status,
            password_hash, two_factor_secret, two_factor_enabled, backup_codes,
            hashed_backup_codes, role_title_ar, branch_name, encrypted_pii,
            permissions, requires_password_change, assigned_node_id, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (id) DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            username = EXCLUDED.username,
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            password_hash = COALESCE(EXCLUDED.password_hash, an_users.password_hash),
            two_factor_secret = COALESCE(EXCLUDED.two_factor_secret, an_users.two_factor_secret),
            two_factor_enabled = EXCLUDED.two_factor_enabled,
            backup_codes = COALESCE(EXCLUDED.backup_codes, an_users.backup_codes),
            hashed_backup_codes = COALESCE(EXCLUDED.hashed_backup_codes, an_users.hashed_backup_codes),
            role_title_ar = COALESCE(EXCLUDED.role_title_ar, an_users.role_title_ar),
            branch_name = COALESCE(EXCLUDED.branch_name, an_users.branch_name),
            encrypted_pii = COALESCE(EXCLUDED.encrypted_pii, an_users.encrypted_pii),
            permissions = COALESCE(EXCLUDED.permissions, an_users.permissions),
            requires_password_change = EXCLUDED.requires_password_change,
            assigned_node_id = COALESCE(EXCLUDED.assigned_node_id, an_users.assigned_node_id);
        `;
        await this.query(query, [
          user.id,
          effectiveTenantId,
          user.username,
          user.fullName,
          user.email,
          user.role,
          user.status || 'ACTIVE',
          user.passwordHash || null,
          user.twoFactorSecret || null,
          user.twoFactorEnabled || false,
          user.backupCodes ? JSON.stringify(user.backupCodes) : null,
          user.hashedBackupCodes ? JSON.stringify(user.hashedBackupCodes) : null,
          user.roleTitleAr || null,
          user.branchName || null,
          user.encryptedPii ? JSON.stringify(user.encryptedPii) : null,
          user.permissions ? JSON.stringify(user.permissions) : null,
          user.requiresPasswordChange || false,
          user.assignedNodeId || null,
          user.createdAt ? new Date(user.createdAt) : new Date(),
        ]);
        return { success: true, data: user };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async updateUser(userId: string, updates: Partial<User>): Promise<StorageResult<User>> {
    if (!this.pool) return this.missingConnError();
    try {
      const existingRes = await this.getUserById(userId);
      if (!existingRes.success || !existingRes.data) {
        return existingRes;
      }
      const existing = existingRes.data;
      const merged: User = { ...existing, ...updates };
      return await this.saveUser(merged, `update-user-${userId}-${Date.now()}`);
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Login Attempts & Security Tracking (Anomaly Detection & Lockout)
  public async getLastSuccessfulLogin(userId: string): Promise<StorageResult<LoginAttemptRecord | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_last_successful_logins WHERE user_id = $1', [userId]);
      if (res.rows.length === 0) return { success: true, data: null };
      const r = res.rows[0];
      return {
        success: true,
        data: {
          userId: r.user_id,
          tenantId: r.tenant_id,
          location: typeof r.location === 'string' ? JSON.parse(r.location) : r.location,
          ip: r.ip,
          timestamp: Number(r.timestamp),
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async recordSuccessfulLogin(record: LoginAttemptRecord): Promise<StorageResult<void>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_last_successful_logins (user_id, tenant_id, location, ip, timestamp)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           location = EXCLUDED.location,
           ip = EXCLUDED.ip,
           timestamp = EXCLUDED.timestamp`,
        [record.userId, record.tenantId || null, JSON.stringify(record.location), record.ip, record.timestamp]
      );
      await this.clearFailedLoginAttempts(record.userId);
      return { success: true, data: undefined };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getFailedLoginAttempts(userId: string): Promise<StorageResult<FailedAttemptRecord | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_failed_login_attempts WHERE user_id = $1', [userId]);
      if (res.rows.length === 0) return { success: true, data: null };
      const r = res.rows[0];
      return {
        success: true,
        data: {
          userId: r.user_id,
          count: Number(r.count),
          lockedUntil: r.locked_until ? Number(r.locked_until) : undefined,
          updatedAt: Number(r.updated_at),
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async recordFailedLoginAttempt(userId: string, count: number, lockedUntil?: number): Promise<StorageResult<void>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_failed_login_attempts (user_id, count, locked_until, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           count = EXCLUDED.count,
           locked_until = EXCLUDED.locked_until,
           updated_at = EXCLUDED.updated_at`,
        [userId, count, lockedUntil || null, Date.now()]
      );
      return { success: true, data: undefined };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async clearFailedLoginAttempts(userId: string): Promise<StorageResult<void>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query('DELETE FROM an_failed_login_attempts WHERE user_id = $1', [userId]);
      return { success: true, data: undefined };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Active Sessions
  public async saveActiveSession(session: ActiveSessionRecord): Promise<StorageResult<ActiveSessionRecord>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_active_sessions (
           session_id, user_id, username, full_name, role, device_type, ip_address, location, family_id, created_at, last_active_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (session_id) DO UPDATE SET
           last_active_at = EXCLUDED.last_active_at`,
        [
          session.sessionId,
          session.userId,
          session.username,
          session.fullName,
          session.role,
          session.deviceType,
          session.ipAddress,
          JSON.stringify(session.location),
          session.familyId || null,
          session.createdAt,
          session.lastActiveAt,
        ]
      );
      return { success: true, data: session };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getActiveSession(sessionId: string): Promise<StorageResult<ActiveSessionRecord | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_active_sessions WHERE session_id = $1', [sessionId]);
      if (res.rows.length === 0) return { success: true, data: null };
      const r = res.rows[0];
      return {
        success: true,
        data: {
          sessionId: r.session_id,
          userId: r.user_id,
          username: r.username,
          fullName: r.full_name,
          role: r.role,
          deviceType: r.device_type,
          ipAddress: r.ip_address,
          location: typeof r.location === 'string' ? JSON.parse(r.location) : r.location,
          familyId: r.family_id || undefined,
          createdAt: Number(r.created_at),
          lastActiveAt: Number(r.last_active_at),
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listActiveSessionsByUser(userId: string): Promise<StorageResult<ActiveSessionRecord[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_active_sessions WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
      const list = res.rows.map((r: any) => ({
        sessionId: r.session_id,
        userId: r.user_id,
        username: r.username,
        fullName: r.full_name,
        role: r.role,
        deviceType: r.device_type,
        ipAddress: r.ip_address,
        location: typeof r.location === 'string' ? JSON.parse(r.location) : r.location,
        familyId: r.family_id || undefined,
        createdAt: Number(r.created_at),
        lastActiveAt: Number(r.last_active_at),
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listAllActiveSessions(): Promise<StorageResult<ActiveSessionRecord[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_active_sessions ORDER BY created_at DESC');
      const list = res.rows.map((r: any) => ({
        sessionId: r.session_id,
        userId: r.user_id,
        username: r.username,
        fullName: r.full_name,
        role: r.role,
        deviceType: r.device_type,
        ipAddress: r.ip_address,
        location: typeof r.location === 'string' ? JSON.parse(r.location) : r.location,
        familyId: r.family_id || undefined,
        createdAt: Number(r.created_at),
        lastActiveAt: Number(r.last_active_at),
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async deleteActiveSession(sessionId: string): Promise<StorageResult<void>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query('DELETE FROM an_active_sessions WHERE session_id = $1', [sessionId]);
      return { success: true, data: undefined };
    } catch (err: any) {
      return this.dbError(err);
    }
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
          account.currency || 'SAR',
          account.debitBalance ?? 0,
          account.creditBalance ?? 0,
          account.isActive ?? true,
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
      const initiatorId = req.initiator_id;
      if (initiatorId === approverId) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/sod-violation',
            title: 'تعارض مصالح - فصل الصلاحيات والواجبات',
            status: 403,
            detail: 'ممنوع نظامياً: لا يجوز لمنشئ المستند اعتماده بنفسه (قاعدة فصل المهام والرقابة الثنائية).',
          },
        };
      }
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

  // Phase 2 Implementations

  public async listTenants(): Promise<StorageResult<TenantCompany[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_tenants ORDER BY created_at DESC');
      const tenants: TenantCompany[] = res.rows.map((row: any) => ({
        id: row.id,
        code: row.code,
        nameAr: row.name_ar,
        nameEn: row.name_en,
        taxNumber: row.tax_number,
        backendConfig: row.backend_config,
        status: row.status,
        createdAt: row.created_at ? row.created_at.toISOString() : undefined,
      }));
      return { success: true, data: tenants };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async overrideSequence(
    tenantId: string,
    sequenceKey: string,
    manualNumber: number,
    reason: string,
    authorizedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>> {
    if (!this.pool) return this.missingConnError();
    try {
      const queryText = `
        INSERT INTO an_sequences (tenant_id, sequence_key, current_val, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (tenant_id, sequence_key)
        DO UPDATE SET current_val = $3, updated_at = NOW()
        RETURNING current_val;
      `;
      const res = await this.query(queryText, [tenantId, sequenceKey, manualNumber]);
      const seq = Number(res.rows[0].current_val);
      const prefix = sequenceKey.toUpperCase().split('_')[0] || 'DOC';
      return {
        success: true,
        data: {
          sequenceNumber: seq,
          formattedCode: `${prefix}-${String(seq).padStart(6, '0')}`,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getAccountBalanceAsOf(
    tenantId: string,
    accountCode: string,
    asOfDate: string
  ): Promise<StorageResult<{ accountCode: string; debitTotal: number; creditTotal: number; balance: number; asOfDate: string }>> {
    if (!this.pool) return this.missingConnError();
    try {
      const q = `
        SELECT 
          COALESCE(SUM(l.debit), 0) as debit_total,
          COALESCE(SUM(l.credit), 0) as credit_total
        FROM an_journal_lines l
        JOIN an_journal_entries e ON l.entry_id = e.id AND l.tenant_id = e.tenant_id
        WHERE l.tenant_id = $1 
          AND l.account_code = $2 
          AND e.status = 'POSTED'
          AND e.date <= $3::date;
      `;
      const res = await this.query(q, [tenantId, accountCode, asOfDate]);
      const debitTotal = Number(res.rows[0].debit_total);
      const creditTotal = Number(res.rows[0].credit_total);
      return {
        success: true,
        data: {
          accountCode,
          debitTotal,
          creditTotal,
          balance: debitTotal - creditTotal,
          asOfDate,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getCountryTaxRule(countryCode: string): Promise<StorageResult<CountryTaxRule>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_tax_rules WHERE country_code = $1', [countryCode.toUpperCase()]);
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/tax-rule-not-found',
            title: 'قاعدة الضريبة غير موجودة',
            status: 404,
            detail: `لا توجد قاعدة ضريبية مسجلة للدولة (${countryCode})`,
          },
        };
      }
      const r = res.rows[0];
      return {
        success: true,
        data: {
          countryCode: r.country_code,
          countryNameAr: r.country_name_ar,
          standardVatRate: Number(r.standard_vat_rate),
          currencyCode: r.currency_code,
          taxAuthorityName: r.tax_authority_name,
          taxIdFormatRegex: r.tax_id_format_regex,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listCountryTaxRules(): Promise<StorageResult<CountryTaxRule[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_tax_rules ORDER BY country_code ASC');
      const list: CountryTaxRule[] = res.rows.map((r: any) => ({
        countryCode: r.country_code,
        countryNameAr: r.country_name_ar,
        standardVatRate: Number(r.standard_vat_rate),
        currencyCode: r.currency_code,
        taxAuthorityName: r.tax_authority_name,
        taxIdFormatRegex: r.tax_id_format_regex,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async upsertCountryTaxRule(rule: CountryTaxRule): Promise<StorageResult<CountryTaxRule>> {
    if (!this.pool) return this.missingConnError();
    try {
      const q = `
        INSERT INTO an_tax_rules (country_code, country_name_ar, standard_vat_rate, currency_code, tax_authority_name, tax_id_format_regex, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (country_code) DO UPDATE SET
          country_name_ar = EXCLUDED.country_name_ar,
          standard_vat_rate = EXCLUDED.standard_vat_rate,
          currency_code = EXCLUDED.currency_code,
          tax_authority_name = EXCLUDED.tax_authority_name,
          tax_id_format_regex = EXCLUDED.tax_id_format_regex,
          updated_at = NOW();
      `;
      await this.query(q, [
        rule.countryCode.toUpperCase(),
        rule.countryNameAr,
        rule.standardVatRate,
        rule.currencyCode,
        rule.taxAuthorityName,
        rule.taxIdFormatRegex,
      ]);
      return { success: true, data: rule };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getTenantModules(tenantId: string): Promise<StorageResult<TenantModuleManifest[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_tenant_modules WHERE tenant_id = $1', [tenantId]);
      const list: TenantModuleManifest[] = res.rows.map((r: any) => ({
        tenantId: r.tenant_id,
        moduleId: r.module_id,
        moduleNameAr: r.module_name_ar,
        isEnabled: r.is_enabled,
        config: r.config,
        activatedAt: r.activated_at ? r.activated_at.toISOString() : undefined,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async enableTenantModules(
    tenantId: string,
    modules: TenantModuleManifest[],
    idempotencyKey: string
  ): Promise<StorageResult<TenantModuleManifest[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      for (const m of modules) {
        const q = `
          INSERT INTO an_tenant_modules (tenant_id, module_id, module_name_ar, is_enabled, config, activated_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (tenant_id, module_id) DO UPDATE SET
            module_name_ar = EXCLUDED.module_name_ar,
            is_enabled = EXCLUDED.is_enabled,
            config = EXCLUDED.config;
        `;
        await this.query(q, [
          tenantId,
          m.moduleId,
          m.moduleNameAr,
          m.isEnabled ?? true,
          m.config ? JSON.stringify(m.config) : null,
        ]);
      }
      return this.getTenantModules(tenantId);
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveMasterItem(tenantId: string, item: MasterItem, idempotencyKey: string): Promise<StorageResult<MasterItem>> {
    if (!this.pool) return this.missingConnError();
    try {
      const q = `
        INSERT INTO an_master_items (id, tenant_id, code, name_ar, category, unit_price, cost_price, status, created_by, approved_by, rejection_reason, created_at, approved_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name_ar = EXCLUDED.name_ar,
          category = EXCLUDED.category,
          unit_price = EXCLUDED.unit_price,
          cost_price = EXCLUDED.cost_price,
          status = EXCLUDED.status,
          approved_by = EXCLUDED.approved_by,
          rejection_reason = EXCLUDED.rejection_reason,
          approved_at = EXCLUDED.approved_at
        RETURNING *;
      `;
      await this.query(q, [
        item.id,
        tenantId,
        item.code,
        item.nameAr,
        item.category,
        item.unitPrice,
        item.costPrice,
        item.status,
        item.createdBy,
        item.approvedBy || null,
        item.rejectionReason || null,
        item.createdAt || new Date().toISOString(),
        item.approvedAt ? new Date(item.approvedAt) : null,
      ]);
      return { success: true, data: item };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getMasterItem(tenantId: string, itemId: string): Promise<StorageResult<MasterItem>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        'SELECT * FROM an_master_items WHERE tenant_id = $1 AND (id = $2 OR code = $2)',
        [tenantId, itemId]
      );
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/item-not-found',
            title: 'الصنف غير موجود',
            status: 404,
            detail: `تعذر العثور على الصنف ${itemId}`,
          },
        };
      }
      const r = res.rows[0];
      return {
        success: true,
        data: {
          id: r.id,
          tenantId: r.tenant_id,
          code: r.code,
          nameAr: r.name_ar,
          category: r.category,
          unitPrice: Number(r.unit_price),
          costPrice: Number(r.cost_price),
          status: r.status,
          createdBy: r.created_by,
          approvedBy: r.approved_by,
          rejectionReason: r.rejection_reason,
          createdAt: r.created_at ? r.created_at.toISOString() : undefined,
          approvedAt: r.approved_at ? r.approved_at.toISOString() : undefined,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listMasterItems(tenantId: string): Promise<StorageResult<MasterItem[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query('SELECT * FROM an_master_items WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
      const list: MasterItem[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        code: r.code,
        nameAr: r.name_ar,
        category: r.category,
        unitPrice: Number(r.unit_price),
        costPrice: Number(r.cost_price),
        status: r.status,
        createdBy: r.created_by,
        approvedBy: r.approved_by,
        rejectionReason: r.rejection_reason,
        createdAt: r.created_at ? r.created_at.toISOString() : undefined,
        approvedAt: r.approved_at ? r.approved_at.toISOString() : undefined,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async approveMasterItem(
    tenantId: string,
    itemId: string,
    approvedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<MasterItem>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        "UPDATE an_master_items SET status = 'APPROVED', approved_by = $1, approved_at = NOW() WHERE tenant_id = $2 AND (id = $3 OR code = $3) RETURNING *",
        [approvedBy, tenantId, itemId]
      );
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/item-not-found',
            title: 'الصنف غير موجود',
            status: 404,
            detail: `تعذر العثور على الصنف ${itemId}`,
          },
        };
      }
      return this.getMasterItem(tenantId, itemId);
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveMasterPartner(tenantId: string, partner: MasterPartner, idempotencyKey: string): Promise<StorageResult<MasterPartner>> {
    if (!this.pool) return this.missingConnError();
    try {
      const q = `
        INSERT INTO an_master_partners (id, tenant_id, type, code, name_ar, tax_number, phone, status, created_by, approved_by, rejection_reason, created_at, approved_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name_ar = EXCLUDED.name_ar,
          tax_number = EXCLUDED.tax_number,
          phone = EXCLUDED.phone,
          status = EXCLUDED.status,
          approved_by = EXCLUDED.approved_by,
          rejection_reason = EXCLUDED.rejection_reason,
          approved_at = EXCLUDED.approved_at
        RETURNING *;
      `;
      await this.query(q, [
        partner.id,
        tenantId,
        partner.type,
        partner.code,
        partner.nameAr,
        partner.taxNumber || null,
        partner.phone || null,
        partner.status,
        partner.createdBy,
        partner.approvedBy || null,
        partner.rejectionReason || null,
        partner.createdAt || new Date().toISOString(),
        partner.approvedAt ? new Date(partner.approvedAt) : null,
      ]);
      return { success: true, data: partner };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getMasterPartner(tenantId: string, partnerId: string): Promise<StorageResult<MasterPartner>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        'SELECT * FROM an_master_partners WHERE tenant_id = $1 AND (id = $2 OR code = $2)',
        [tenantId, partnerId]
      );
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/partner-not-found',
            title: 'الشريك غير موجود',
            status: 404,
            detail: `تعذر العثور على الشريك التجاري ${partnerId}`,
          },
        };
      }
      const r = res.rows[0];
      return {
        success: true,
        data: {
          id: r.id,
          tenantId: r.tenant_id,
          type: r.type,
          code: r.code,
          nameAr: r.name_ar,
          taxNumber: r.tax_number,
          phone: r.phone,
          status: r.status,
          createdBy: r.created_by,
          approvedBy: r.approved_by,
          rejectionReason: r.rejection_reason,
          createdAt: r.created_at ? r.created_at.toISOString() : undefined,
          approvedAt: r.approved_at ? r.approved_at.toISOString() : undefined,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listMasterPartners(tenantId: string, type?: 'CUSTOMER' | 'VENDOR'): Promise<StorageResult<MasterPartner[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const q = type
        ? 'SELECT * FROM an_master_partners WHERE tenant_id = $1 AND type = $2 ORDER BY created_at DESC'
        : 'SELECT * FROM an_master_partners WHERE tenant_id = $1 ORDER BY created_at DESC';
      const params = type ? [tenantId, type] : [tenantId];
      const res = await this.query(q, params);
      const list: MasterPartner[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        type: r.type,
        code: r.code,
        nameAr: r.name_ar,
        taxNumber: r.tax_number,
        phone: r.phone,
        status: r.status,
        createdBy: r.created_by,
        approvedBy: r.approved_by,
        rejectionReason: r.rejection_reason,
        createdAt: r.created_at ? r.created_at.toISOString() : undefined,
        approvedAt: r.approved_at ? r.approved_at.toISOString() : undefined,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async approveMasterPartner(
    tenantId: string,
    partnerId: string,
    approvedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<MasterPartner>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        "UPDATE an_master_partners SET status = 'APPROVED', approved_by = $1, approved_at = NOW() WHERE tenant_id = $2 AND (id = $3 OR code = $3) RETURNING *",
        [approvedBy, tenantId, partnerId]
      );
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/partner-not-found',
            title: 'الشريك غير موجود',
            status: 404,
            detail: `تعذر العثور على الشريك التجاري ${partnerId}`,
          },
        };
      }
      return this.getMasterPartner(tenantId, partnerId);
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async appendAuditChain(
    tenantId: string,
    entry: Omit<AuditChainEntry, 'sequenceNumber' | 'previousHash' | 'entryHash'>
  ): Promise<StorageResult<AuditChainEntry>> {
    if (!this.pool) return this.missingConnError();
    try {
      const lastRes = await this.query(
        'SELECT sequence_number, entry_hash FROM an_audit_chain WHERE tenant_id = $1 ORDER BY sequence_number DESC LIMIT 1',
        [tenantId]
      );
      let seq = 1;
      let prevHash = GENESIS_PREVIOUS_HASH;
      if (lastRes.rows.length > 0) {
        seq = Number(lastRes.rows[0].sequence_number) + 1;
        prevHash = lastRes.rows[0].entry_hash;
      }

      const hash = AuditChainService.computeRecordHash(
        seq,
        tenantId,
        entry.timestamp,
        entry.actorId,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.beforeState,
        entry.afterState,
        prevHash
      );

      const fullRecord: AuditChainEntry = {
        ...entry,
        sequenceNumber: seq,
        previousHash: prevHash,
        entryHash: hash,
      };

      const q = `
        INSERT INTO an_audit_chain (id, sequence_number, tenant_id, timestamp, actor_id, actor_name, action, entity_type, entity_id, before_state, after_state, ip_address, previous_hash, entry_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);
      `;
      await this.query(q, [
        fullRecord.id,
        fullRecord.sequenceNumber,
        tenantId,
        fullRecord.timestamp,
        fullRecord.actorId,
        fullRecord.actorName,
        fullRecord.action,
        fullRecord.entityType,
        fullRecord.entityId,
        fullRecord.beforeState ? JSON.stringify(fullRecord.beforeState) : null,
        fullRecord.afterState ? JSON.stringify(fullRecord.afterState) : null,
        fullRecord.ipAddress || null,
        fullRecord.previousHash,
        fullRecord.entryHash,
      ]);

      return { success: true, data: fullRecord };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getAuditChain(tenantId: string, limit = 100): Promise<StorageResult<AuditChainEntry[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        'SELECT * FROM an_audit_chain WHERE tenant_id = $1 ORDER BY sequence_number ASC LIMIT $2',
        [tenantId, limit]
      );
      const list: AuditChainEntry[] = res.rows.map((r: any) => ({
        id: r.id,
        sequenceNumber: Number(r.sequence_number),
        tenantId: r.tenant_id,
        timestamp: r.timestamp.toISOString(),
        actorId: r.actor_id,
        actorName: r.actor_name,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        beforeState: r.before_state,
        afterState: r.after_state,
        ipAddress: r.ip_address,
        previousHash: r.previous_hash,
        entryHash: r.entry_hash,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async verifyAuditChain(
    tenantId: string
  ): Promise<StorageResult<{ isValid: boolean; verifiedRecordsCount: number; brokenAtSequence?: number; messageAr: string }>> {
    if (!this.pool) return this.missingConnError();
    try {
      const chainRes = await this.getAuditChain(tenantId, 10000);
      if (!chainRes.success || !chainRes.data) return chainRes as any;

      const chain = chainRes.data;
      if (chain.length === 0) {
        return {
          success: true,
          data: {
            isValid: true,
            verifiedRecordsCount: 0,
            messageAr: 'سلسلة التدقيق فارغة (لا توجد سجلات مسجلة بعد).',
          },
        };
      }

      let prev = GENESIS_PREVIOUS_HASH;
      for (const record of chain) {
        if (record.previousHash !== prev) {
          return {
            success: true,
            data: {
              isValid: false,
              verifiedRecordsCount: record.sequenceNumber - 1,
              brokenAtSequence: record.sequenceNumber,
              messageAr: `فشل التحقق: انقطاع في الهاش السابق عند السجل رقم ${record.sequenceNumber}.`,
            },
          };
        }

        const expected = AuditChainService.computeRecordHash(
          record.sequenceNumber,
          record.tenantId,
          record.timestamp,
          record.actorId,
          record.action,
          record.entityType,
          record.entityId,
          record.beforeState,
          record.afterState,
          record.previousHash
        );

        if (expected !== record.entryHash) {
          return {
            success: true,
            data: {
              isValid: false,
              verifiedRecordsCount: record.sequenceNumber - 1,
              brokenAtSequence: record.sequenceNumber,
              messageAr: `تم كشف تلاعب محتوى في السجل رقم ${record.sequenceNumber}. الهاش غير متطابق!`,
            },
          };
        }
        prev = record.entryHash;
      }

      return {
        success: true,
        data: {
          isValid: true,
          verifiedRecordsCount: chain.length,
          messageAr: 'تم التحقق المشفر من سلامة سلسلة سجلات التدقيق بالكامل (100% مطابقة وخالية من التلاعب).',
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
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

  // Phase 3A: Organizational Hierarchy
  public async saveOrgNode(tenantId: string, node: OrgNode, idempotencyKey: string): Promise<StorageResult<OrgNode>> {
    if (!this.pool) return this.missingConnError();
    const existingKey = await this.checkIdempotency(tenantId, idempotencyKey, 'saveOrgNode');
    if (existingKey) return { success: true, data: existingKey };

    return this.withTenantScope(tenantId, async () => {
      try {
        const query = `
          INSERT INTO an_org_nodes (id, tenant_id, type, code, name_ar, name_en, parent_id, manager_user_id, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            code = EXCLUDED.code,
            name_ar = EXCLUDED.name_ar,
            name_en = EXCLUDED.name_en,
            parent_id = EXCLUDED.parent_id,
            manager_user_id = EXCLUDED.manager_user_id,
            status = EXCLUDED.status
          RETURNING *;
        `;
        await this.query(query, [
          node.id,
          tenantId,
          node.type,
          node.code,
          node.nameAr,
          node.nameEn || null,
          node.parentId || null,
          node.managerUserId || null,
          node.status || 'ACTIVE',
          node.createdAt ? new Date(node.createdAt) : new Date(),
        ]);
        await this.recordIdempotency(tenantId, idempotencyKey, 'saveOrgNode', node);
        return { success: true, data: node };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async getOrgNode(tenantId: string, nodeId: string): Promise<StorageResult<OrgNode>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query('SELECT * FROM an_org_nodes WHERE tenant_id = $1 AND id = $2 LIMIT 1', [tenantId, nodeId]);
        if (res.rows.length === 0) {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/node-not-found',
              title: 'العقدة التنظيمية غير موجودة',
              status: 404,
              detail: `العقدة ${nodeId} غير مسجلة في هيكل المنشأة`,
            },
          };
        }
        const r = res.rows[0];
        return {
          success: true,
          data: {
            id: r.id,
            tenantId: r.tenant_id,
            type: r.type,
            code: r.code,
            nameAr: r.name_ar,
            nameEn: r.name_en || undefined,
            parentId: r.parent_id || null,
            managerUserId: r.manager_user_id || undefined,
            status: r.status,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
          },
        };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async listOrgHierarchy(tenantId: string, rootNodeId?: string): Promise<StorageResult<OrgNode[]>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        let query: string;
        let params: any[];
        if (rootNodeId) {
          query = `
            WITH RECURSIVE org_tree AS (
              SELECT * FROM an_org_nodes WHERE tenant_id = $1 AND id = $2
              UNION ALL
              SELECT c.* FROM an_org_nodes c
              INNER JOIN org_tree p ON c.parent_id = p.id
              WHERE c.tenant_id = $1
            )
            SELECT * FROM org_tree ORDER BY type, code;
          `;
          params = [tenantId, rootNodeId];
        } else {
          query = 'SELECT * FROM an_org_nodes WHERE tenant_id = $1 ORDER BY type, code';
          params = [tenantId];
        }
        const res = await this.query(query, params);
        const nodes: OrgNode[] = res.rows.map((r: any) => ({
          id: r.id,
          tenantId: r.tenant_id,
          type: r.type,
          code: r.code,
          nameAr: r.name_ar,
          nameEn: r.name_en || undefined,
          parentId: r.parent_id || null,
          managerUserId: r.manager_user_id || undefined,
          status: r.status,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
        }));
        return { success: true, data: nodes };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async getUserVisibleNodes(tenantId: string, userAssignedNodeId: string): Promise<StorageResult<OrgNode[]>> {
    return this.listOrgHierarchy(tenantId, userAssignedNodeId);
  }

  // Phase 3C: Break-Glass Approval Workflow
  public async approveBreakGlass(
    tenantId: string,
    requestId: string,
    breakGlass: BreakGlassDetails,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const getRes = await this.query(
          'SELECT * FROM an_approval_requests WHERE tenant_id = $1 AND id = $2 LIMIT 1',
          [tenantId, requestId]
        );
        if (getRes.rows.length === 0) {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/request-not-found',
              title: 'طلب الاعتماد غير موجود',
              status: 404,
              detail: `طلب الاعتماد ${requestId} غير مسجل`,
            },
          };
        }
        const req = getRes.rows[0];
        if (breakGlass.actor1Id === breakGlass.actor2Id) {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/break-glass-single-actor',
              title: 'رفض: التجاوز الطارئ يتطلب شخصين مختلفين',
              status: 403,
              detail: 'لا يجوز أن يكون الشخص الأول والثاني في التحكم المزدوج نفس الشخص.',
            },
          };
        }

        if (req.initiator_id === breakGlass.actor1Id || req.initiator_id === breakGlass.actor2Id) {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/break-glass-initiator-conflict',
              title: 'رفض: منشئ المستند لا يجوز أن يكون أحد أطراف التجاوز الطارئ',
              status: 403,
              detail: 'لا يجوز لمنشئ المستند أن يكون أحد الشخصين المنفّذين للتجاوز الطارئ على مستنده هو نفسه.',
            },
          };
        }

        const steps = typeof req.steps === 'string' ? JSON.parse(req.steps) : req.steps;
        for (const s of steps) {
          s.status = 'APPROVED';
          s.approverId = `${breakGlass.actor1Id}+${breakGlass.actor2Id}`;
          s.comment = `تجاوز طارئ Break-Glass: ${breakGlass.reasonAr}`;
          s.actionTimestamp = breakGlass.executedAt;
        }

        await this.query(
          "UPDATE an_approval_requests SET status = 'APPROVED', steps = $1, break_glass = $2 WHERE tenant_id = $3 AND id = $4",
          [JSON.stringify(steps), JSON.stringify(breakGlass), tenantId, requestId]
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
            breakGlass,
            createdAt: req.created_at ? new Date(req.created_at).toISOString() : new Date().toISOString(),
          },
        };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  // Phase 3E: Privacy & Right to be Forgotten
  public async anonymizeUserPii(
    tenantId: string,
    userId: string,
    actorId: string,
    idempotencyKey: string
  ): Promise<StorageResult<{ userId: string; anonymizedAt: string }>> {
    if (!this.pool) return this.missingConnError();
    const existing = await this.checkIdempotency(tenantId, idempotencyKey, 'anonymizeUserPii');
    if (existing) return { success: true, data: existing };

    return this.withTenantScope(tenantId, async () => {
      try {
        const checkUser = await this.query(
          'SELECT id FROM an_users WHERE tenant_id = $1 AND id = $2',
          [tenantId, userId]
        );
        if (checkUser.rows.length === 0) {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/user-not-found',
              title: 'المستخدم غير موجود',
              status: 404,
              detail: `تعذر العثور على المستخدم ${userId} ضمن مستأجر ${tenantId}`,
            },
          };
        }

        const timestamp = new Date().toISOString();
        const scrubbedName = 'مستخدم مجهول (حق النسيان - GDPR/PDPL)';
        const scrubbedEmail = `anonymized_${userId.slice(-6)}@privacy.an-erp.local`;
        const scrubbedUsername = `anon_${userId.slice(-6)}`;

        await this.query(
          `UPDATE an_users
           SET full_name = $1,
               email = $2,
               username = $3,
               encrypted_pii = NULL,
               two_factor_secret = NULL,
               two_factor_enabled = false,
               backup_codes = NULL,
               hashed_backup_codes = NULL,
               status = 'INACTIVE'
           WHERE tenant_id = $4 AND id = $5`,
          [scrubbedName, scrubbedEmail, scrubbedUsername, tenantId, userId]
        );

        // Delete active sessions
        await this.query('DELETE FROM an_active_sessions WHERE user_id = $1', [userId]);

        const resData = { userId, anonymizedAt: timestamp };
        await this.recordIdempotency(tenantId, idempotencyKey, 'anonymizeUserPii', resData);
        return { success: true, data: resData };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }
}
