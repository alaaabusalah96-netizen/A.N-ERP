/**
 * @file PostgresPrimaryAdapter.ts
 * @description PostgreSQL / Supabase Primary Storage Adapter for A.N ERP (Phase 0)
 * Uses official 'pg' library with connection pooling and atomic transactions.
 * Connection string is read from process.env.DATABASE_URL.
 */

import { Pool, PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as crypto from 'node:crypto';
import { requestContextALS } from '../../context/RequestContext';
import {
  StoragePort,
  ApprovalPolicy,
  InventorySettings,
  defaultInventorySettings,
  planCostLayerConsumption,
  ApprovalDocumentType,
  PostStockDocumentAtomicInput,
  PostStockTransferAtomicInput,
  StorageResult,
  AccountingPeriod,
  AccountingPeriodStatus,
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
  CustomFieldDefinition,
  OperationalAuditRecord,
  CashCustody,
  CashCustodyTransaction,
  CashCustodySettlement,
  ExpenseCategory,
  ExpenseLine,
  ExpenseAttachment,
  ExpenseRequest,
  Warehouse,
  WarehouseBin,
  StockItem,
  WarehouseStock,
  StockMovement,
  StockTransfer,
  StockTransferLine,
  StockTransferStatus,
  StockCount,
  StockCountLine,
  StockCountStatus,
  ItemBatch,
  ItemSerial,
  StockDocument,
  StockDocumentLine,
  StockDocumentType,
  CustodyExpenseLine,
  CustodyExpenseVoucher,
  DocumentAttachment,
  ItemPrice,
  Invitation,
  ConsumedInvitation,
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
        idempotency_key VARCHAR(128) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        operation VARCHAR(64) NOT NULL,
        request_hash VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
        response_payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, idempotency_key, operation)
      );
      ALTER TABLE an_idempotency_keys ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);
      ALTER TABLE an_idempotency_keys ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED';
      ALTER TABLE an_idempotency_keys ALTER COLUMN response_payload DROP NOT NULL;

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
      ALTER TABLE an_active_sessions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);

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

      -- Phase 4 (IDENT-001): Membership / Role / Scope layer
      CREATE TABLE IF NOT EXISTS an_memberships (
        id VARCHAR(80) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        user_id VARCHAR(64) NOT NULL REFERENCES an_users(id),
        status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
        created_by VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS an_role_assignments (
        id VARCHAR(90) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        membership_id VARCHAR(80) NOT NULL REFERENCES an_memberships(id),
        role VARCHAR(64) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
        created_by VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_an_role_assignment_active ON an_role_assignments(membership_id) WHERE status = 'ACTIVE';
      CREATE TABLE IF NOT EXISTS an_membership_scopes (
        id VARCHAR(90) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        membership_id VARCHAR(80) NOT NULL REFERENCES an_memberships(id),
        scope_type VARCHAR(16) NOT NULL CHECK (scope_type IN ('TENANT','NODE')),
        org_node_id VARCHAR(64) REFERENCES an_org_nodes(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK ((scope_type = 'NODE' AND org_node_id IS NOT NULL) OR (scope_type = 'TENANT' AND org_node_id IS NULL))
      );

      -- Phase 5 (AUTH-003): persistent invitations (SHA-256 token hash only; the raw token is never stored)
      CREATE TABLE IF NOT EXISTS an_invitations (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL,
        proposed_role VARCHAR(64) NOT NULL,
        org_node_id VARCHAR(64) REFERENCES an_org_nodes(id),
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REVOKED')),
        expires_at TIMESTAMPTZ NOT NULL,
        created_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        consumed_at TIMESTAMPTZ
      );

      -- Schema migrations for Phase 3 fields
      ALTER TABLE an_users ADD COLUMN IF NOT EXISTS assigned_node_id VARCHAR(64);
      ALTER TABLE an_approval_requests ADD COLUMN IF NOT EXISTS break_glass JSONB;
      -- Phase 12 (APR-001): snapshot of the policy flag + rejection data on the request
      ALTER TABLE an_approval_requests ADD COLUMN IF NOT EXISTS enforce_distinct BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE an_approval_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT;
      ALTER TABLE an_approval_requests ADD COLUMN IF NOT EXISTS rejected_step INT;
      CREATE TABLE IF NOT EXISTS an_approval_policies (
        id VARCHAR(80) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        document_type VARCHAR(64) NOT NULL,
        mode VARCHAR(8) NOT NULL CHECK (mode IN ('DIRECT','STEPS')),
        steps JSONB NOT NULL DEFAULT '[]'::jsonb,
        enforce_distinct BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        version INT NOT NULL DEFAULT 1,
        updated_by VARCHAR(64) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, document_type)
      );
      ALTER TABLE an_system_changelog ALTER COLUMN actor TYPE VARCHAR(255);

      -- Schema migrations for Phase 4 (Accounting Core)
      ALTER TABLE an_accounts ADD COLUMN IF NOT EXISTS parent_code VARCHAR(64);
      ALTER TABLE an_accounts ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
      ALTER TABLE an_accounts ADD COLUMN IF NOT EXISTS nature VARCHAR(16) DEFAULT 'DEBIT';
      ALTER TABLE an_accounts ADD COLUMN IF NOT EXISTS is_parent BOOLEAN DEFAULT FALSE;
      ALTER TABLE an_accounts ADD COLUMN IF NOT EXISTS level INT DEFAULT 1;

      CREATE TABLE IF NOT EXISTS an_fiscal_periods (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        code VARCHAR(64) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_closed BOOLEAN NOT NULL DEFAULT FALSE,
        closed_at TIMESTAMPTZ,
        closed_by VARCHAR(64),
        closing_entry_id VARCHAR(64),
        reopen_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS an_dimensions (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        type VARCHAR(32) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, type, code)
      );

      CREATE TABLE IF NOT EXISTS an_units (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        code VARCHAR(64) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        symbol VARCHAR(32) NOT NULL,
        conversion_factor NUMERIC(14, 4) NOT NULL DEFAULT 1.0,
        base_unit_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS an_accounting_items (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        code VARCHAR(64) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL,
        unit_id VARCHAR(64),
        unit_name_ar VARCHAR(64),
        average_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
        sale_price NUMERIC(16, 4) NOT NULL DEFAULT 0,
        income_account_code VARCHAR(64),
        expense_account_code VARCHAR(64),
        asset_account_code VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS an_budgets (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        fiscal_year INT NOT NULL,
        account_code VARCHAR(64) NOT NULL,
        monthly_allocations JSONB NOT NULL DEFAULT '{}',
        total_budget NUMERIC(16, 4) NOT NULL DEFAULT 0,
        policy VARCHAR(32) NOT NULL DEFAULT 'WARN',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, fiscal_year, account_code)
      );

      CREATE TABLE IF NOT EXISTS an_recurring_entries (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        code VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        frequency VARCHAR(32) NOT NULL,
        next_run_date DATE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        auto_post BOOLEAN NOT NULL DEFAULT TRUE,
        entry_payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS an_balance_check_logs (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_balanced BOOLEAN NOT NULL,
        total_debit NUMERIC(18, 4) NOT NULL,
        total_credit NUMERIC(18, 4) NOT NULL,
        discrepancy NUMERIC(18, 4) NOT NULL,
        checked_accounts_count INT NOT NULL,
        status VARCHAR(32) NOT NULL,
        details JSONB
      );

      -- Phase 5: Cash Custody Module (1 of 15)
      CREATE TABLE IF NOT EXISTS an_cash_custodies (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        custody_code VARCHAR(64) NOT NULL,
        employee_id VARCHAR(64) NOT NULL,
        employee_name VARCHAR(255) NOT NULL,
        branch_id VARCHAR(64),
        branch_name VARCHAR(255),
        cost_center_id VARCHAR(64) NOT NULL,
        cost_center_name VARCHAR(255),
        currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
        allocated_amount NUMERIC(16, 4) NOT NULL,
        current_balance NUMERIC(16, 4) NOT NULL,
        max_limit_per_role NUMERIC(16, 4) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        opened_by VARCHAR(64) NOT NULL,
        opened_by_name VARCHAR(255) NOT NULL,
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        closed_by VARCHAR(64),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, custody_code)
      );

      CREATE TABLE IF NOT EXISTS an_cash_custody_transactions (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        transaction_code VARCHAR(64) NOT NULL,
        custody_id VARCHAR(64) NOT NULL REFERENCES an_cash_custodies(id),
        amount NUMERIC(16, 4) NOT NULL,
        expense_category VARCHAR(128) NOT NULL,
        expense_account_code VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        receipt_number VARCHAR(128) NOT NULL,
        attachment_url TEXT NOT NULL,
        attachment_name VARCHAR(255),
        cost_center_id VARCHAR(64),
        recorded_by VARCHAR(64) NOT NULL,
        recorded_by_name VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'RECORDED',
        settlement_id VARCHAR(64),
        transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        idempotency_key VARCHAR(128),
        UNIQUE(tenant_id, transaction_code)
      );

      CREATE TABLE IF NOT EXISTS an_cash_custody_settlements (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        settlement_code VARCHAR(64) NOT NULL,
        custody_id VARCHAR(64) NOT NULL REFERENCES an_cash_custodies(id),
        settlement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        total_expenses NUMERIC(16, 4) NOT NULL,
        replenishment_amount NUMERIC(16, 4) NOT NULL,
        variance_amount NUMERIC(16, 4) NOT NULL DEFAULT 0,
        variance_type VARCHAR(32) NOT NULL DEFAULT 'NONE',
        journal_entry_id VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
        settled_by VARCHAR(64) NOT NULL,
        settled_by_name VARCHAR(255) NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        idempotency_key VARCHAR(128),
        UNIQUE(tenant_id, settlement_code)
      );

      -- Phase 6: Expenses Module Tables (2 of 15)
      CREATE TABLE IF NOT EXISTS an_expense_categories (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        default_account_code VARCHAR(64) NOT NULL,
        requires_attachment BOOLEAN NOT NULL DEFAULT true,
        attachment_threshold_amount NUMERIC(16, 4) NOT NULL DEFAULT 500,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS an_expense_requests (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        request_code VARCHAR(64) NOT NULL,
        title_ar VARCHAR(255) NOT NULL,
        employee_id VARCHAR(64) NOT NULL,
        employee_name VARCHAR(255) NOT NULL,
        department VARCHAR(128),
        cost_center_id VARCHAR(64),
        project_id VARCHAR(64),
        total_amount NUMERIC(16, 4) NOT NULL,
        currency VARCHAR(16) NOT NULL DEFAULT 'SAR',
        payment_method VARCHAR(64) NOT NULL DEFAULT 'DIRECT_BANK_TRANSFER',
        disbursement_account_code VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
        current_approval_tier VARCHAR(32) NOT NULL DEFAULT 'L1',
        submitted_by VARCHAR(64) NOT NULL,
        submitted_by_name VARCHAR(255) NOT NULL,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_l1_by VARCHAR(64),
        approved_l1_by_name VARCHAR(255),
        approved_l1_at TIMESTAMPTZ,
        approved_by VARCHAR(64),
        approved_by_name VARCHAR(255),
        approved_at TIMESTAMPTZ,
        rejected_by VARCHAR(64),
        rejected_by_name VARCHAR(255),
        rejected_at TIMESTAMPTZ,
        rejection_reason TEXT,
        journal_entry_id VARCHAR(64),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        idempotency_key VARCHAR(128),
        UNIQUE(tenant_id, request_code)
      );

      CREATE TABLE IF NOT EXISTS an_expense_lines (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        request_id VARCHAR(64) NOT NULL REFERENCES an_expense_requests(id) ON DELETE CASCADE,
        category_id VARCHAR(64) NOT NULL,
        category_name_ar VARCHAR(255) NOT NULL,
        expense_account_code VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        amount NUMERIC(16, 4) NOT NULL,
        cost_center_id VARCHAR(64),
        project_id VARCHAR(64),
        invoice_number VARCHAR(128),
        invoice_date VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS an_expense_attachments (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        request_id VARCHAR(64) NOT NULL REFERENCES an_expense_requests(id) ON DELETE CASCADE,
        line_id VARCHAR(64),
        file_name VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_type VARCHAR(64) NOT NULL,
        file_size_bytes BIGINT NOT NULL DEFAULT 0,
        uploaded_by VARCHAR(64) NOT NULL,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ============================================================================
      -- Phase 7: Warehouses & Inventory Module Tables (3 of 15)
      -- ============================================================================
      CREATE TABLE IF NOT EXISTS an_warehouses (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        branch_id VARCHAR(64),
        branch_name VARCHAR(255),
        location TEXT,
        is_default BOOLEAN NOT NULL DEFAULT false,
        valuation_method VARCHAR(32) NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS an_warehouse_bins (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id) ON DELETE CASCADE,
        code VARCHAR(64) NOT NULL,
        aisle VARCHAR(64),
        rack VARCHAR(64),
        shelf VARCHAR(64),
        bin VARCHAR(64),
        description_ar VARCHAR(255),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, warehouse_id, code)
      );

      CREATE TABLE IF NOT EXISTS an_stock_items (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        item_code VARCHAR(64) NOT NULL,
        barcode VARCHAR(128),
        name_ar VARCHAR(255) NOT NULL,
        name_en VARCHAR(255),
        category VARCHAR(128) NOT NULL DEFAULT 'GENERAL',
        uom VARCHAR(64) NOT NULL DEFAULT 'حبة',
        inventory_account_code VARCHAR(64) NOT NULL DEFAULT '1050',
        cogs_account_code VARCHAR(64) NOT NULL DEFAULT '5010',
        adjustment_expense_account_code VARCHAR(64) NOT NULL DEFAULT '5090',
        adjustment_gain_account_code VARCHAR(64) NOT NULL DEFAULT '4090',
        valuation_method VARCHAR(32) NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
        standard_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
        average_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
        last_purchase_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
        selling_price NUMERIC(16, 4) NOT NULL DEFAULT 0,
        reorder_point NUMERIC(16, 4) NOT NULL DEFAULT 10,
        min_stock_level NUMERIC(16, 4) NOT NULL DEFAULT 5,
        max_stock_level NUMERIC(16, 4) NOT NULL DEFAULT 1000,
        track_batch BOOLEAN NOT NULL DEFAULT false,
        track_serial BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, item_code)
      );

      CREATE TABLE IF NOT EXISTS an_warehouse_stock (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id) ON DELETE CASCADE,
        item_id VARCHAR(64) NOT NULL REFERENCES an_stock_items(id) ON DELETE CASCADE,
        current_qty NUMERIC(16, 4) NOT NULL DEFAULT 0,
        reserved_qty NUMERIC(16, 4) NOT NULL DEFAULT 0,
        available_qty NUMERIC(16, 4) NOT NULL DEFAULT 0,
        average_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
        total_value NUMERIC(16, 4) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, warehouse_id, item_id)
      );

      -- Phase 13 (COST-001): cost layers (FIFO / SPECIFIC_LOT) and per-tenant inventory settings
      CREATE TABLE IF NOT EXISTS an_stock_cost_layers (
        id VARCHAR(80) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id) ON DELETE CASCADE,
        item_id VARCHAR(64) NOT NULL REFERENCES an_stock_items(id) ON DELETE CASCADE,
        source_document_type VARCHAR(40),
        source_document_id VARCHAR(64),
        source_document_number VARCHAR(64),
        po_number VARCHAR(64),
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        original_qty NUMERIC(16,4) NOT NULL CHECK (original_qty > 0),
        remaining_qty NUMERIC(16,4) NOT NULL CHECK (remaining_qty >= 0),
        unit_cost NUMERIC(16,4) NOT NULL CHECK (unit_cost >= 0),
        is_closed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_an_cost_layers_fifo ON an_stock_cost_layers(tenant_id, warehouse_id, item_id, received_at) WHERE remaining_qty > 0 AND is_closed = FALSE;
      CREATE INDEX IF NOT EXISTS idx_an_cost_layers_po ON an_stock_cost_layers(tenant_id, item_id, po_number) WHERE po_number IS NOT NULL;
      CREATE TABLE IF NOT EXISTS an_inventory_settings (
        tenant_id VARCHAR(64) PRIMARY KEY REFERENCES an_tenants(id),
        default_valuation_method VARCHAR(32) NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
        allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
        over_receipt_tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (over_receipt_tolerance_pct >= 0 AND over_receipt_tolerance_pct <= 100),
        updated_by VARCHAR(64),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Phase 14 (ACC-AUTO-001)
      CREATE TABLE IF NOT EXISTS an_stock_accounting_config (
        tenant_id VARCHAR(64) PRIMARY KEY REFERENCES an_tenants(id),
        auto_post_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        grir_account_code VARCHAR(32) NOT NULL DEFAULT '2106',
        in_transit_account_code VARCHAR(32) NOT NULL DEFAULT '1109',
        default_inventory_account_code VARCHAR(32) NOT NULL DEFAULT '1105',
        default_cogs_account_code VARCHAR(32) NOT NULL DEFAULT '5101',
        updated_by VARCHAR(64),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE an_stock_documents ADD COLUMN IF NOT EXISTS journal_entry_id VARCHAR(64);
      ALTER TABLE an_stock_documents ADD COLUMN IF NOT EXISTS journal_status VARCHAR(16);
      ALTER TABLE an_stock_transfers ADD COLUMN IF NOT EXISTS dispatch_journal_entry_id VARCHAR(64);
      ALTER TABLE an_stock_transfers ADD COLUMN IF NOT EXISTS receive_journal_entry_id VARCHAR(64);
      ALTER TABLE an_stock_transfers ADD COLUMN IF NOT EXISTS journal_status VARCHAR(16);


      CREATE TABLE IF NOT EXISTS an_stock_movements (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        movement_number VARCHAR(64) NOT NULL,
        movement_type VARCHAR(64) NOT NULL,
        warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id),
        warehouse_name_ar VARCHAR(255),
        bin_id VARCHAR(64),
        item_id VARCHAR(64) NOT NULL REFERENCES an_stock_items(id),
        item_code VARCHAR(64) NOT NULL,
        item_name_ar VARCHAR(255) NOT NULL,
        quantity NUMERIC(16, 4) NOT NULL,
        unit_cost NUMERIC(16, 4) NOT NULL,
        total_cost NUMERIC(16, 4) NOT NULL,
        balance_after_qty NUMERIC(16, 4) NOT NULL,
        source_document_type VARCHAR(64),
        source_document_id VARCHAR(64),
        source_document_number VARCHAR(64),
        journal_entry_id VARCHAR(64),
        batch_number VARCHAR(128),
        serial_number VARCHAR(128),
        notes TEXT,
        performed_by VARCHAR(64) NOT NULL,
        performed_by_name VARCHAR(255) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        idempotency_key VARCHAR(128),
        UNIQUE(tenant_id, movement_number)
      );

      CREATE TABLE IF NOT EXISTS an_stock_transfers (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        transfer_number VARCHAR(64) NOT NULL,
        source_warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id),
        source_warehouse_name_ar VARCHAR(255) NOT NULL,
        target_warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id),
        target_warehouse_name_ar VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        requested_by VARCHAR(64) NOT NULL,
        requested_by_name VARCHAR(255) NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        dispatched_by VARCHAR(64),
        dispatched_by_name VARCHAR(255),
        dispatched_at TIMESTAMPTZ,
        received_by VARCHAR(64),
        received_by_name VARCHAR(255),
        received_at TIMESTAMPTZ,
        total_items_count INT NOT NULL DEFAULT 0,
        total_quantity NUMERIC(16, 4) NOT NULL DEFAULT 0,
        total_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        idempotency_key VARCHAR(128),
        UNIQUE(tenant_id, transfer_number)
      );

      CREATE TABLE IF NOT EXISTS an_stock_transfer_lines (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        transfer_id VARCHAR(64) NOT NULL REFERENCES an_stock_transfers(id) ON DELETE CASCADE,
        item_id VARCHAR(64) NOT NULL REFERENCES an_stock_items(id),
        item_code VARCHAR(64) NOT NULL,
        item_name_ar VARCHAR(255) NOT NULL,
        quantity NUMERIC(16, 4) NOT NULL,
        unit_cost NUMERIC(16, 4) NOT NULL,
        total_cost NUMERIC(16, 4) NOT NULL,
        batch_number VARCHAR(128),
        serial_number VARCHAR(128)
      );

      CREATE TABLE IF NOT EXISTS an_stock_counts (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        count_number VARCHAR(64) NOT NULL,
        count_type VARCHAR(32) NOT NULL DEFAULT 'PERIODIC',
        warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id),
        warehouse_name_ar VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
        performed_by VARCHAR(64) NOT NULL,
        performed_by_name VARCHAR(255) NOT NULL,
        performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_by VARCHAR(64),
        approved_by_name VARCHAR(255),
        approved_at TIMESTAMPTZ,
        total_items_count INT NOT NULL DEFAULT 0,
        has_variance BOOLEAN NOT NULL DEFAULT false,
        net_variance_amount NUMERIC(16, 4) NOT NULL DEFAULT 0,
        journal_entry_id VARCHAR(64),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        idempotency_key VARCHAR(128),
        UNIQUE(tenant_id, count_number)
      );

      CREATE TABLE IF NOT EXISTS an_stock_count_lines (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        count_id VARCHAR(64) NOT NULL REFERENCES an_stock_counts(id) ON DELETE CASCADE,
        item_id VARCHAR(64) NOT NULL REFERENCES an_stock_items(id),
        item_code VARCHAR(64) NOT NULL,
        item_name_ar VARCHAR(255) NOT NULL,
        system_qty NUMERIC(16, 4) NOT NULL,
        counted_qty NUMERIC(16, 4) NOT NULL,
        variance_qty NUMERIC(16, 4) NOT NULL,
        unit_cost NUMERIC(16, 4) NOT NULL,
        variance_amount NUMERIC(16, 4) NOT NULL,
        batch_number VARCHAR(128),
        serial_number VARCHAR(128),
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS an_item_batches (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL REFERENCES an_stock_items(id),
        warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id),
        batch_number VARCHAR(128) NOT NULL,
        production_date VARCHAR(64),
        expiry_date VARCHAR(64),
        current_qty NUMERIC(16, 4) NOT NULL DEFAULT 0,
        unit_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, warehouse_id, item_id, batch_number)
      );

      CREATE TABLE IF NOT EXISTS an_item_serials (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NOT NULL REFERENCES an_stock_items(id),
        warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id),
        serial_number VARCHAR(128) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'IN_STOCK',
        warranty_expiry VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, item_id, serial_number)
      );

      -- Seed country tax rules if not exist
      INSERT INTO an_tax_rules (country_code, country_name_ar, standard_vat_rate, currency_code, tax_authority_name, tax_id_format_regex)
      VALUES 
        ('SA', 'المملكة العربية السعودية', 0.1500, 'SAR', 'هيئة الزكاة والضريبة والجمارك (ZATCA)', '^3[0-9]{13}3$'),
        ('EG', 'جمهورية مصر العربية', 0.1400, 'EGP', 'مصلحة الضرائب المصرية (ETA)', '^[0-9]{9}$'),
        ('AE', 'الإمارات العربية المتحدة', 0.0500, 'AED', 'الهيئة الاتحادية للضرائب (FTA)', '^100[0-9]{12}$'),
        ('OM', 'سلطنة عمان', 0.0500, 'OMR', 'جهاز الضرائب العماني (OTA)', '^[0-9]{8}$'),
        ('BH', 'مملكة البحرين', 0.1000, 'BHD', 'الجهاز الوطني للإيرادات (NBR)', '^[0-9]{15}$')
      ON CONFLICT (country_code) DO NOTHING;

      -- ============================================================================
      -- Wave 7.5E: Fiscal Periods & Accounting Closing
      -- ============================================================================
      CREATE TABLE IF NOT EXISTS an_accounting_periods (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        code VARCHAR(64) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        reopened_by VARCHAR(64),
        reopened_reason TEXT,
        closed_at TIMESTAMPTZ,
        closed_by VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, code)
      );
      CREATE INDEX IF NOT EXISTS idx_periods_tenant_date ON an_accounting_periods(tenant_id, start_date, end_date);

      -- ============================================================================
      -- Phase 7.6: Multi-line stock documents, custody vouchers, attachments, prices
      -- ============================================================================
      CREATE TABLE IF NOT EXISTS an_stock_documents (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        document_number VARCHAR(64) NOT NULL,
        document_type VARCHAR(32) NOT NULL,
        warehouse_id VARCHAR(64) NOT NULL REFERENCES an_warehouses(id),
        warehouse_name_ar VARCHAR(255),
        status VARCHAR(32) NOT NULL DEFAULT 'POSTED',
        total_quantity NUMERIC(16, 4) NOT NULL DEFAULT 0,
        total_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
        reference_type VARCHAR(64),
        reference_id VARCHAR(64),
        reference_number VARCHAR(64),
        notes TEXT,
        performed_by VARCHAR(64) NOT NULL,
        performed_by_name VARCHAR(255) NOT NULL,
        idempotency_key VARCHAR(128),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, document_number)
      );
      CREATE INDEX IF NOT EXISTS idx_stock_docs_tenant ON an_stock_documents(tenant_id, document_type, warehouse_id);

      CREATE TABLE IF NOT EXISTS an_stock_document_lines (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        document_id VARCHAR(64) NOT NULL REFERENCES an_stock_documents(id) ON DELETE CASCADE,
        line_number INT NOT NULL,
        item_id VARCHAR(64) NOT NULL REFERENCES an_stock_items(id),
        item_code VARCHAR(64) NOT NULL,
        item_name_ar VARCHAR(255) NOT NULL,
        uom VARCHAR(32) NOT NULL,
        quantity NUMERIC(16, 4) NOT NULL,
        unit_cost NUMERIC(16, 4) NOT NULL,
        total_cost NUMERIC(16, 4) NOT NULL,
        batch_number VARCHAR(128),
        serial_number VARCHAR(128),
        expiry_date VARCHAR(64),
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_stock_doc_lines ON an_stock_document_lines(tenant_id, document_id, item_id);

      CREATE TABLE IF NOT EXISTS an_custody_expense_vouchers (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        voucher_number VARCHAR(64) NOT NULL,
        custody_id VARCHAR(64) NOT NULL REFERENCES an_cash_custodies(id),
        total_amount NUMERIC(16, 4) NOT NULL,
        notes TEXT,
        receipt_number VARCHAR(128),
        journal_entry_id VARCHAR(64),
        recorded_by VARCHAR(64) NOT NULL,
        recorded_by_name VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'POSTED',
        idempotency_key VARCHAR(128),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, voucher_number)
      );
      CREATE INDEX IF NOT EXISTS idx_custody_vouchers ON an_custody_expense_vouchers(tenant_id, custody_id);

      CREATE TABLE IF NOT EXISTS an_custody_expense_lines (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        voucher_id VARCHAR(64) NOT NULL REFERENCES an_custody_expense_vouchers(id) ON DELETE CASCADE,
        line_number INT NOT NULL,
        expense_category VARCHAR(128) NOT NULL,
        expense_account_code VARCHAR(64) NOT NULL,
        amount NUMERIC(16, 4) NOT NULL,
        cost_center_id VARCHAR(64),
        description TEXT,
        receipt_number VARCHAR(128),
        attachment_url TEXT,
        attachment_name VARCHAR(255)
      );
      CREATE INDEX IF NOT EXISTS idx_custody_exp_lines ON an_custody_expense_lines(tenant_id, voucher_id);

      CREATE TABLE IF NOT EXISTS an_document_attachments (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        company_id VARCHAR(64) NOT NULL,
        document_type VARCHAR(64) NOT NULL,
        document_id VARCHAR(64) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_size INT,
        mime_type VARCHAR(128),
        uploaded_by VARCHAR(64) NOT NULL,
        uploaded_by_name VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_doc_attachments ON an_document_attachments(tenant_id, document_type, document_id);

      CREATE TABLE IF NOT EXISTS an_item_prices (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL REFERENCES an_tenants(id),
        item_id VARCHAR(64) NOT NULL REFERENCES an_stock_items(id),
        price_type VARCHAR(64) NOT NULL,
        amount NUMERIC(16, 4) NOT NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'SAR',
        is_default BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, item_id, price_type)
      );
      CREATE INDEX IF NOT EXISTS idx_item_prices ON an_item_prices(tenant_id, item_id);

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
          'an_accounting_periods',
          'an_approval_requests',
          'an_token_families',
          'an_refresh_tokens',
          'an_tenant_modules',
          'an_master_items',
          'an_master_partners',
          'an_audit_chain',
          'an_org_nodes',
          'an_fiscal_periods',
          'an_dimensions',
          'an_units',
          'an_accounting_items',
          'an_budgets',
          'an_recurring_entries',
          'an_balance_check_logs',
          'an_cash_custodies',
          'an_cash_custody_transactions',
          'an_cash_custody_settlements',
          'an_expense_categories',
          'an_expense_requests',
          'an_expense_lines',
          'an_expense_attachments',
          'an_warehouses',
          'an_warehouse_bins',
          'an_stock_items',
          'an_warehouse_stock',
          'an_stock_movements',
          'an_stock_transfers',
          'an_stock_transfer_lines',
          'an_stock_counts',
          'an_stock_count_lines',
          'an_item_batches',
          'an_item_serials',
          'an_stock_documents',
          'an_stock_document_lines',
          'an_custody_expense_vouchers',
          'an_custody_expense_lines',
          'an_document_attachments',
          'an_item_prices',
          'an_memberships',
          'an_role_assignments',
          'an_membership_scopes',
          'an_invitations',
          'an_approval_policies',
          'an_stock_cost_layers',
          'an_inventory_settings'
        ];
      BEGIN
        FOREACH tbl IN ARRAY tables LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
          EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I FOR ALL USING (tenant_id = current_setting(''app.current_tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true));', tbl);
        END LOOP;

        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'an_idempotency_keys'::regclass
            AND conname = 'an_idempotency_keys_pkey'
            AND pg_get_constraintdef(oid) = 'PRIMARY KEY (idempotency_key)'
        ) THEN
          ALTER TABLE an_idempotency_keys DROP CONSTRAINT an_idempotency_keys_pkey;
          ALTER TABLE an_idempotency_keys ADD CONSTRAINT an_idempotency_keys_pkey PRIMARY KEY (tenant_id, idempotency_key, operation);
        END IF;
      END $$;
    `;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(ddl);
        await this.backfillMemberships(client);
        await this.backfillOpeningCostLayers(client);
      } finally {
        client.release();
      }
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

  // Phase 4 (IDENT-001): idempotent membership / role / scope SQL (one statement per table)
  private static membershipBackfillSql(scope: 'ALL' | 'TENANT' | 'USER'): string[] {
    const userCond = scope === 'USER' ? 'u.id = $1 AND ' : '';
    const tenantCondU = scope === 'TENANT' ? ' AND u.tenant_id = $1' : '';
    const extra = scope === 'USER' ? ' AND u.id = $1' : scope === 'TENANT' ? ' AND m.tenant_id = $1' : '';
    return [
      `INSERT INTO an_memberships (id, tenant_id, user_id, status, created_by)
       SELECT 'mbr-' || u.id, u.tenant_id, u.id, 'ACTIVE', 'BACKFILL' FROM an_users u
       WHERE ${userCond}NOT EXISTS (SELECT 1 FROM an_memberships m WHERE m.tenant_id = u.tenant_id AND m.user_id = u.id)${tenantCondU}`,
      `INSERT INTO an_role_assignments (id, tenant_id, membership_id, role, status, created_by)
       SELECT 'ra-' || m.id, m.tenant_id, m.id, u.role, 'ACTIVE', 'BACKFILL'
       FROM an_memberships m JOIN an_users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
       WHERE NOT EXISTS (SELECT 1 FROM an_role_assignments r WHERE r.membership_id = m.id)${extra}`,
      `INSERT INTO an_membership_scopes (id, tenant_id, membership_id, scope_type, org_node_id)
       SELECT 'ms-' || m.id, m.tenant_id, m.id, CASE WHEN n.id IS NULL THEN 'TENANT' ELSE 'NODE' END, n.id
       FROM an_memberships m JOIN an_users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
       LEFT JOIN an_org_nodes n ON n.id = u.assigned_node_id AND n.tenant_id = u.tenant_id
       WHERE NOT EXISTS (SELECT 1 FROM an_membership_scopes s WHERE s.membership_id = m.id)${extra}`,
    ];
  }

  // Phase 4 (IDENT-001): backfill memberships for existing users, respecting RLS.
  // DECISION: if the DB role bypasses RLS (rolbypassrls or superuser) -> one global pass.
  //           otherwise -> one transaction per tenant with app.current_tenant_id set (tenant isolation preserved).
  private async backfillMemberships(client: PoolClient): Promise<void> {
    const roleRes = await client.query('SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user');
    const bypass = !!(roleRes.rows[0]?.rolbypassrls || roleRes.rows[0]?.rolsuper);
    const countMissing = `SELECT count(*)::int AS n FROM an_users u WHERE NOT EXISTS (SELECT 1 FROM an_memberships m WHERE m.tenant_id = u.tenant_id AND m.user_id = u.id)`;
    let missing = 0;
    if (bypass) {
      console.log('[phase-4] DECISION: DB role bypasses RLS -> global membership backfill');
      for (const sql of PostgresPrimaryAdapter.membershipBackfillSql('ALL')) await client.query(sql);
      missing = (await client.query(countMissing)).rows[0].n;
    } else {
      console.log('[phase-4] DECISION: DB role does NOT bypass RLS -> per-tenant membership backfill');
      const tenants = await client.query('SELECT id FROM an_tenants');
      for (const t of tenants.rows) {
        try {
          await client.query('BEGIN');
          await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [t.id]);
          for (const sql of PostgresPrimaryAdapter.membershipBackfillSql('TENANT')) await client.query(sql, [t.id]);
          missing += (await client.query(countMissing + ' AND u.tenant_id = $1', [t.id])).rows[0].n;
          await client.query('COMMIT');
        } catch (e) {
          try { await client.query('ROLLBACK'); } catch (rbErr: any) { console.warn('[PostgresPrimaryAdapter] membership backfill ROLLBACK failed:', rbErr?.message); }
          throw e;
        }
      }
    }
    if (missing > 0) console.error(`[phase-4] users without membership: ${missing}`);
  }

  // Phase 13 (COST-001): idempotent OPENING cost layers for FIFO / SPECIFIC_LOT items that already hold stock but have no layer.
  // Invariant afterwards: for these items the sum of open layers' remaining_qty = current_qty. WEIGHTED_AVERAGE items get NO layers.
  // Same RLS decision as the membership backfill (global pass if the role bypasses RLS, else one transaction per tenant).
  private static openingLayersSql(scoped: boolean): string {
    return `INSERT INTO an_stock_cost_layers (id, tenant_id, warehouse_id, item_id, source_document_type, received_at, original_qty, remaining_qty, unit_cost)
       SELECT 'lyr-open-' || md5(ws.warehouse_id || '|' || ws.item_id), ws.tenant_id, ws.warehouse_id, ws.item_id, 'OPENING', ws.updated_at, ws.current_qty, ws.current_qty, ws.average_cost
       FROM an_warehouse_stock ws JOIN an_stock_items i ON i.id = ws.item_id AND i.tenant_id = ws.tenant_id
       WHERE ws.current_qty > 0 AND i.valuation_method IN ('FIFO', 'SPECIFIC_LOT')${scoped ? ' AND ws.tenant_id = $1' : ''}
         AND NOT EXISTS (SELECT 1 FROM an_stock_cost_layers l WHERE l.tenant_id = ws.tenant_id AND l.warehouse_id = ws.warehouse_id AND l.item_id = ws.item_id)
       ON CONFLICT (id) DO NOTHING`;
  }

  private async backfillOpeningCostLayers(client: PoolClient): Promise<void> {
    const roleRes = await client.query('SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user');
    const bypass = !!(roleRes.rows[0]?.rolbypassrls || roleRes.rows[0]?.rolsuper);
    if (bypass) {
      await client.query(PostgresPrimaryAdapter.openingLayersSql(false));
      return;
    }
    const tenants = await client.query('SELECT id FROM an_tenants');
    for (const t of tenants.rows) {
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [t.id]);
        await client.query(PostgresPrimaryAdapter.openingLayersSql(true), [t.id]);
        await client.query('COMMIT');
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (rbErr: any) { console.warn('[PostgresPrimaryAdapter] opening layers backfill ROLLBACK failed:', rbErr?.message); }
        throw e;
      }
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

  public async saveTenant(tenant: TenantCompany, idempotencyKey: string, skipIdempotency: boolean = false): Promise<StorageResult<TenantCompany>> {
    if (!this.pool) return this.missingConnError();

    return this.withTenantScope(tenant.id, async () => {
      const effKey = skipIdempotency ? undefined : idempotencyKey;
      return this.runIdempotent(tenant.id, effKey, 'saveTenant', async (client) => {
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
          const res = await client.query(query, [
            tenant.id,
            tenant.code,
            tenant.nameAr,
            tenant.nameEn || null,
            tenant.taxNumber || null,
            JSON.stringify(tenant.backendConfig),
            tenant.status,
            tenant.createdAt || new Date().toISOString(),
          ]);

          if (!res || !res.rows || res.rows.length === 0) {
            return {
              success: false,
              error: {
                type: 'https://api.an-erp.local/errors/tenant-upsert-noop',
                title: 'فشل إدراج/تحديث المنشأة',
                status: 500,
                detail: `لم يُنتج INSERT ... ON CONFLICT (id) صفًا فعليًا للمنشأة ${tenant.id}.`,
              },
            };
          }

          const row = res.rows[0];
          const savedTenant: TenantCompany = {
            id: row.id,
            code: row.code,
            nameAr: row.name_ar,
            nameEn: row.name_en,
            taxNumber: row.tax_number,
            backendConfig: typeof row.backend_config === 'string' ? JSON.parse(row.backend_config) : row.backend_config,
            status: row.status,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : (tenant.createdAt || new Date().toISOString()),
          };

          return { success: true, data: savedTenant };
        } catch (err: any) {
          return this.dbError(err);
        }
      });
    });
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
    } catch (e: any) { console.warn('[PostgresPrimaryAdapter] user backup_codes parse failed:', e?.name); }

    try {
      if (r.hashed_backup_codes) {
        hashedBackupCodes = typeof r.hashed_backup_codes === 'string' ? JSON.parse(r.hashed_backup_codes) : r.hashed_backup_codes;
      }
    } catch (e: any) { console.warn('[PostgresPrimaryAdapter] user hashed_backup_codes parse failed:', e?.name); }

    try {
      if (r.permissions) {
        permissions = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions;
      }
    } catch (e: any) { console.warn('[PostgresPrimaryAdapter] user permissions parse failed:', e?.name); }

    try {
      if (r.encrypted_pii) {
        encryptedPii = typeof r.encrypted_pii === 'string' ? JSON.parse(r.encrypted_pii) : r.encrypted_pii;
      }
    } catch (e: any) { console.warn('[PostgresPrimaryAdapter] user encrypted_pii parse failed:', e?.name); }

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
          'SELECT * FROM an_users WHERE tenant_id = $1 AND (id = $2 OR LOWER(username) = LOWER($2)) LIMIT 1',
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
    if (!tenantId) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/tenant-required',
          title: 'مستأجر غير محدد',
          status: 400,
          detail: 'يجب تحديد المستأجر عند البحث عن مستخدم بالاسم.',
        },
      };
    }
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query(
          'SELECT * FROM an_users WHERE LOWER(username) = LOWER($1) AND tenant_id = $2 LIMIT 1',
          [username.trim(), tenantId]
        );
        if (res.rows.length === 0) {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/user-not-found',
              title: 'المستخدم غير موجود',
              status: 404,
              detail: `المستخدم ${username} غير مسجل للشركة ${tenantId}`,
            },
          };
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

  public async saveUser(user: User, idempotencyKey: string, skipIdempotency: boolean = false): Promise<StorageResult<User>> {
    if (!this.pool) return this.missingConnError();
    if (!user.tenantId || user.tenantId.trim() === '') {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/missing-tenant-id',
          title: 'معرف المنشأة مفقود',
          status: 400,
          detail: 'يجب تحديد tenantId صريح لحفظ المستخدم في نطاق الشركة (بند 5.4).',
        },
      };
    }
    const effectiveTenantId = user.tenantId;
    return this.withTenantScope(effectiveTenantId, async () => {
      try {
        const prevRoleRes = await this.query('SELECT role FROM an_users WHERE id = $1', [user.id]);
        const prevRole: string | null = prevRoleRes.rows.length > 0 ? prevRoleRes.rows[0].role : null;
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
        // Phase 4 (IDENT-001): keep membership/role/scope in the same transaction.
        // Sync the active role assignment ONLY when the role actually changed.
        if (prevRole !== null && prevRole !== user.role) {
          await this.query(
            `UPDATE an_role_assignments SET role = $2 WHERE membership_id = 'mbr-' || $1 AND status = 'ACTIVE'`,
            [user.id, user.role]
          );
        }
        for (const sql of PostgresPrimaryAdapter.membershipBackfillSql('USER')) {
          await this.query(sql, [user.id]);
        }
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

  // Phase 4 (IDENT-001): membership context (role authority + scopes) from the DB
  public async getMembershipContext(tenantId: string, userId: string): Promise<StorageResult<{ membershipId: string; status: string; role: string | null; scopes: { type: 'TENANT' | 'NODE'; orgNodeId?: string }[] } | null>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const m = await this.query(
          `SELECT m.id AS membership_id, m.status, r.role
           FROM an_memberships m
           LEFT JOIN an_role_assignments r ON r.membership_id = m.id AND r.status = 'ACTIVE'
           WHERE m.tenant_id = $1 AND m.user_id = $2`,
          [tenantId, userId]
        );
        if (m.rows.length === 0) return { success: true as const, data: null };
        const row = m.rows[0];
        const sc = await this.query(
          `SELECT scope_type, org_node_id FROM an_membership_scopes WHERE tenant_id = $1 AND membership_id = $2 ORDER BY created_at, id`,
          [tenantId, row.membership_id]
        );
        const scopes = sc.rows.map((x: any) => ({
          type: x.scope_type as 'TENANT' | 'NODE',
          ...(x.org_node_id ? { orgNodeId: x.org_node_id as string } : {}),
        }));
        return { success: true as const, data: { membershipId: row.membership_id as string, status: row.status as string, role: (row.role as string | null) ?? null, scopes } };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async setMembershipStatus(tenantId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'): Promise<StorageResult<boolean>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query(
          `UPDATE an_memberships SET status = $3 WHERE tenant_id = $1 AND user_id = $2`,
          [tenantId, userId, status]
        );
        return { success: true as const, data: (res.rowCount ?? 0) > 0 };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  // Phase 5 (AUTH-003): invitations. Persists ONLY token_hash.
  // org_node_id is stored only if that node exists in this tenant (otherwise NULL), so a stale user->node value cannot break invitations.
  public async createInvitation(tenantId: string, inv: Invitation): Promise<StorageResult<boolean>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        await this.query(
          `INSERT INTO an_invitations (id, tenant_id, token_hash, email, proposed_role, org_node_id, status, expires_at, created_by)
           VALUES ($1, $2, $3, $4, $5,
                   (SELECT id FROM an_org_nodes WHERE id = $6 AND tenant_id = $2),
                   'PENDING', $7, $8)`,
          [inv.id, tenantId, inv.tokenHash, inv.email, inv.proposedRole, inv.orgNodeId || null, new Date(inv.expiresAt), inv.createdBy]
        );
        return { success: true as const, data: true };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  // Atomic single-statement consume: two concurrent callers can never both receive a row.
  public async consumeInvitation(tenantId: string, tokenHash: string): Promise<StorageResult<ConsumedInvitation | null>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query(
          `UPDATE an_invitations
           SET status = 'ACCEPTED', consumed_at = NOW()
           WHERE tenant_id = $1 AND token_hash = $2 AND status = 'PENDING' AND expires_at > NOW()
           RETURNING id, email, proposed_role, org_node_id`,
          [tenantId, tokenHash]
        );
        if (res.rows.length !== 1) return { success: true as const, data: null };
        const r = res.rows[0];
        return {
          success: true as const,
          data: { id: r.id as string, email: r.email as string, proposedRole: r.proposed_role as string, orgNodeId: (r.org_node_id as string | null) || undefined },
        };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async releaseInvitation(tenantId: string, tokenHash: string): Promise<StorageResult<boolean>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query(
          `UPDATE an_invitations SET status = 'PENDING', consumed_at = NULL
           WHERE tenant_id = $1 AND token_hash = $2 AND status = 'ACCEPTED'`,
          [tenantId, tokenHash]
        );
        return { success: true as const, data: (res.rowCount ?? 0) > 0 };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
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
           session_id, user_id, tenant_id, username, full_name, role, device_type, ip_address, location, family_id, created_at, last_active_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (session_id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           last_active_at = EXCLUDED.last_active_at`,
        [
          session.sessionId,
          session.userId,
          session.tenantId || null,
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
          tenantId: r.tenant_id || undefined,
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

  public async listActiveSessions(tenantId: string): Promise<StorageResult<ActiveSessionRecord[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        'SELECT * FROM an_active_sessions WHERE tenant_id = $1 ORDER BY created_at DESC',
        [tenantId]
      );
      const list = res.rows.map((r: any) => ({
        sessionId: r.session_id,
        userId: r.user_id,
        tenantId: r.tenant_id || undefined,
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

  public async listAccounts(tenantId: string): Promise<StorageResult<Account[]>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query(
          'SELECT * FROM an_accounts WHERE tenant_id = $1 ORDER BY code ASC',
          [tenantId]
        );
        const accounts: Account[] = res.rows.map((r: any) => ({
          code: r.code,
          tenantId: r.tenant_id,
          nameAr: r.name_ar,
          type: r.type,
          currency: r.currency,
          debitBalance: Number(r.debit_balance),
          creditBalance: Number(r.credit_balance),
          isActive: r.is_active,
        }));
        return { success: true, data: accounts };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async saveAccount(tenantId: string, account: Account, idempotencyKey: string, skipIdempotency: boolean = false): Promise<StorageResult<Account>> {
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

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'createJournalEntry');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

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
        entry.createdBy || 'SYSTEM',
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

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'createJournalEntry', entry);

      await client.query('COMMIT');
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

    const entryRes = await this.getJournalEntry(tenantId, entryId);
    if (!entryRes.success || !entryRes.data) {
      return { success: false, error: entryRes.error };
    }
    const entry = entryRes.data;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'postJournalEntry');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

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

      entry.status = 'POSTED';
      entry.postedAt = postedAt;

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'postJournalEntry', entry);

      await client.query('COMMIT');
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
          date: (row.date instanceof Date ? row.date.toISOString() : new Date(row.date).toISOString()).split('T')[0],
          type: row.type,
          description: row.description,
          lines: [],
          totalAmount: Number(row.total_amount),
          status: row.status,
          createdBy: row.created_by,
          approvedBy: row.approved_by,
          postedAt: row.posted_at ? (row.posted_at instanceof Date ? row.posted_at.toISOString() : new Date(row.posted_at).toISOString()) : undefined,
          reversedByEntryId: row.reversed_by_entry_id,
        });
      }
      return { success: true, data: entries };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async deleteJournalEntry(tenantId: string, entryId: string): Promise<StorageResult<void>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.pool.query(
        'SELECT status FROM an_journal_entries WHERE tenant_id = $1 AND id = $2',
        [tenantId, entryId]
      );
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/entry-not-found',
            title: 'السند غير موجود',
            status: 404,
            detail: `تعذر العثور على القيد المحاسبي برقم ${entryId}.`,
          },
        };
      }

      const status = res.rows[0].status;
      // Wave 7.5E & Section 13.1: Defense-in-depth: POSTED / REVERSED entries cannot be deleted
      if (status === 'POSTED' || status === 'REVERSED') {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/immutable-posted-entry',
            title: 'حظر حذف القيد المعتمد',
            status: 403,
            detail: 'ممنوع نظامياً: لا يجوز حذف أو تعديل قيد محاسبي مرحل (POSTED) بحكم الثوابت المحاسبية (بند 13.1). التصحيح يتم حصرًا عبر قيد عكسي.',
          },
        };
      }

      await this.pool.query('DELETE FROM an_journal_lines WHERE tenant_id = $1 AND journal_id = $2', [tenantId, entryId]);
      await this.pool.query('DELETE FROM an_journal_entries WHERE tenant_id = $1 AND id = $2', [tenantId, entryId]);
      return { success: true, data: undefined };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getPeriodForDate(tenantId: string, date: string): Promise<StorageResult<AccountingPeriod | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.pool.query(
        'SELECT * FROM an_accounting_periods WHERE tenant_id = $1 AND start_date <= $2 AND end_date >= $2 LIMIT 1',
        [tenantId, date]
      );
      if (res.rows.length === 0) {
        return { success: true, data: null };
      }
      const r = res.rows[0];
      return {
        success: true,
        data: {
          id: r.id,
          tenantId: r.tenant_id,
          code: r.code,
          startDate: r.start_date.toISOString().split('T')[0],
          endDate: r.end_date.toISOString().split('T')[0],
          status: r.status,
          reopenedBy: r.reopened_by,
          reopenedReason: r.reopened_reason,
          closedAt: r.closed_at ? r.closed_at.toISOString() : undefined,
          closedBy: r.closed_by,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async setPeriodStatus(
    tenantId: string,
    periodId: string,
    status: AccountingPeriodStatus,
    actorId: string,
    reason?: string
  ): Promise<StorageResult<AccountingPeriod>> {
    if (!this.pool) return this.missingConnError();
    try {
      const query = `
        INSERT INTO an_accounting_periods (
          id, tenant_id, code, start_date, end_date, status, reopened_by, reopened_reason, closed_at, closed_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (tenant_id, code) DO UPDATE SET
          status = EXCLUDED.status,
          reopened_by = EXCLUDED.reopened_by,
          reopened_reason = EXCLUDED.reopened_reason,
          closed_at = EXCLUDED.closed_at,
          closed_by = EXCLUDED.closed_by
        RETURNING *;
      `;
      const isClosed = status === 'CLOSED';
      const isReopened = status === 'REOPENED';
      const res = await this.pool.query(query, [
        periodId,
        tenantId,
        periodId,
        '2026-01-01',
        '2026-12-31',
        status,
        isReopened ? actorId : null,
        isReopened ? (reason || null) : null,
        isClosed ? new Date() : null,
        isClosed ? actorId : null,
      ]);
      const r = res.rows[0];
      return {
        success: true,
        data: {
          id: r.id,
          tenantId: r.tenant_id,
          code: r.code,
          startDate: r.start_date.toISOString().split('T')[0],
          endDate: r.end_date.toISOString().split('T')[0],
          status: r.status,
          reopenedBy: r.reopened_by,
          reopenedReason: r.reopened_reason,
          closedAt: r.closed_at ? r.closed_at.toISOString() : undefined,
          closedBy: r.closed_by,
        },
      };
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
        INSERT INTO an_approval_requests (id, tenant_id, document_type, document_id, document_code, initiator_id, current_step, steps, status, enforce_distinct)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        request.enforceDistinctApprovers === true,
      ]);
      return { success: true, data: request };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Phase 12 (APR-001): row -> ApprovalRequest
  private mapApprovalRow(row: any): ApprovalRequest {
    const steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      documentType: row.document_type,
      documentId: row.document_id,
      documentCode: row.document_code,
      initiatorId: row.initiator_id,
      currentStep: row.current_step,
      steps,
      status: row.status,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      enforceDistinctApprovers: row.enforce_distinct === true,
      rejectReason: row.reject_reason || undefined,
      rejectedStep: row.rejected_step ?? undefined,
    };
  }

  private approvalProblem(status: number, type: string, title: string, detail: string): RFC7807Problem {
    return { type: `https://api.an-erp.local/errors/${type}`, title, status, detail };
  }

  // Same rules as the InMemory adapter (contract parity): state, separation of duties, current step, assignee, distinct approvers.
  private evaluateApprovalAction(
    req: ApprovalRequest,
    approverId: string,
    approverRole: string | undefined
  ): { ok: true; index: number } | { ok: false; error: RFC7807Problem } {
    if (req.status !== 'PENDING') {
      return { ok: false, error: this.approvalProblem(409, 'request-not-pending', 'طلب الاعتماد ليس قيد الانتظار', `حالة الطلب الحالية (${req.status}) لا تسمح بأي إجراء.`) };
    }
    if (req.initiatorId === approverId) {
      return { ok: false, error: this.approvalProblem(403, 'sod-violation', 'تعارض مصالح - فصل الصلاحيات والواجبات', 'ممنوع نظامياً: لا يجوز لمنشئ المستند اعتماده بنفسه (قاعدة فصل المهام والرقابة الثنائية).') };
    }
    let index = -1;
    req.steps.forEach((st, i) => {
      if (st.status === 'PENDING' && (index < 0 || st.stepNumber < req.steps[index].stepNumber)) index = i;
    });
    if (index < 0) {
      return { ok: false, error: this.approvalProblem(409, 'request-not-pending', 'طلب الاعتماد ليس قيد الانتظار', 'لا توجد خطوة معلّقة في هذا الطلب.') };
    }
    const step = req.steps[index];
    if (step.approverType) {
      if (step.approverType === 'USER') {
        if (approverId !== step.approverRef) {
          return { ok: false, error: this.approvalProblem(403, 'not-assigned-approver', 'المستخدم غير مكلّف بهذه الخطوة', 'هذه الخطوة مخصصة لمستخدم آخر.') };
        }
      } else if (!approverRole || approverRole.toLowerCase() !== (step.approverRef || '').toLowerCase()) {
        return { ok: false, error: this.approvalProblem(403, 'role-not-allowed', 'دور المستخدم لا يسمح بهذه الخطوة', 'دور المستخدم الحالي لا يطابق الدور المطلوب لهذه الخطوة.') };
      }
      if (req.enforceDistinctApprovers && req.steps.some(x => x.status === 'APPROVED' && x.approverId === approverId)) {
        return { ok: false, error: this.approvalProblem(403, 'duplicate-approver', 'لا يجوز لنفس الشخص اعتماد أكثر من خطوة', 'السياسة تشترط أن يكون لكل خطوة موافق مختلف.') };
      }
    }
    return { ok: true, index };
  }

  // One locked transaction for approve / reject. action='APPROVE' | 'REJECT'
  private async actOnApprovalStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    approverRole: string | undefined,
    idempotencyKey: string,
    action: 'APPROVE' | 'REJECT',
    reason?: string
  ): Promise<StorageResult<ApprovalRequest>> {
    if (!this.pool) return this.missingConnError();
    const operation = action === 'APPROVE' ? 'approveStep' : 'rejectApprovalStep';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, operation);
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }
      const sel = await client.query(
        'SELECT * FROM an_approval_requests WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
        [tenantId, requestId]
      );
      if (sel.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: this.approvalProblem(404, 'request-not-found', 'طلب الاعتماد غير موجود', `تعذر العثور على طلب الاعتماد ${requestId}`) };
      }
      const req = this.mapApprovalRow(sel.rows[0]);
      const ev = this.evaluateApprovalAction(req, approverId, approverRole);
      if (!ev.ok) {
        await client.query('ROLLBACK');
        return { success: false, error: (ev as any).error };
      }
      const steps = req.steps.map(x => ({ ...x }));
      steps[ev.index].approverId = approverId;
      steps[ev.index].actionTimestamp = new Date().toISOString();
      let updated: ApprovalRequest;
      if (action === 'APPROVE') {
        steps[ev.index].status = 'APPROVED';
        const pending = steps.filter(x => x.status === 'PENDING').sort((x, y) => x.stepNumber - y.stepNumber);
        const status: 'PENDING' | 'APPROVED' = pending.length > 0 ? 'PENDING' : 'APPROVED';
        const currentStep = pending.length > 0 ? pending[0].stepNumber : req.currentStep;
        await client.query(
          'UPDATE an_approval_requests SET status = $1, steps = $2, current_step = $3 WHERE tenant_id = $4 AND id = $5',
          [status, JSON.stringify(steps), currentStep, tenantId, requestId]
        );
        updated = { ...req, steps, status, currentStep };
      } else {
        steps[ev.index].status = 'REJECTED';
        steps[ev.index].rejectReason = reason;
        const rejectedStep = steps[ev.index].stepNumber;
        await client.query(
          "UPDATE an_approval_requests SET status = 'REJECTED', steps = $1, reject_reason = $2, rejected_step = $3 WHERE tenant_id = $4 AND id = $5",
          [JSON.stringify(steps), reason, rejectedStep, tenantId, requestId]
        );
        updated = { ...req, steps, status: 'REJECTED', rejectReason: reason, rejectedStep };
      }
      await this.completeIdempotency(client, tenantId, idempotencyKey, operation, updated);
      await client.query('COMMIT');
      return { success: true, data: updated };
    } catch (err: any) {
      try { await client.query('ROLLBACK'); } catch (rbErr: any) { console.warn('[PostgresPrimaryAdapter] approval ROLLBACK failed:', rbErr?.message); }
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async approveStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    idempotencyKey: string,
    approverRole?: string
  ): Promise<StorageResult<ApprovalRequest>> {
    return this.actOnApprovalStep(tenantId, requestId, approverId, approverRole, idempotencyKey, 'APPROVE');
  }

  public async rejectApprovalStep(
    tenantId: string,
    requestId: string,
    approverId: string,
    approverRole: string,
    reason: string,
    idempotencyKey: string
  ): Promise<StorageResult<ApprovalRequest>> {
    const cleanReason = (reason || '').trim();
    if (cleanReason.length < 3 || cleanReason.length > 500) {
      return { success: false, error: this.approvalProblem(400, 'invalid-reject-reason', 'سبب الرفض مطلوب', 'سبب الرفض إلزامي ويجب أن يتراوح بين 3 و500 حرف.') };
    }
    return this.actOnApprovalStep(tenantId, requestId, approverId, approverRole, idempotencyKey, 'REJECT', cleanReason);
  }

  public async getApprovalRequest(tenantId: string, id: string): Promise<StorageResult<ApprovalRequest | null>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query('SELECT * FROM an_approval_requests WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
        return { success: true as const, data: res.rows.length ? this.mapApprovalRow(res.rows[0]) : null };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async listApprovalRequests(
    tenantId: string,
    filter?: { status?: string; documentType?: string; documentId?: string }
  ): Promise<StorageResult<ApprovalRequest[]>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const where: string[] = ['tenant_id = $1'];
        const params: any[] = [tenantId];
        if (filter?.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
        if (filter?.documentType) { params.push(filter.documentType); where.push(`document_type = $${params.length}`); }
        if (filter?.documentId) { params.push(filter.documentId); where.push(`document_id = $${params.length}`); }
        const res = await this.query(
          `SELECT * FROM an_approval_requests WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
          params
        );
        return { success: true as const, data: res.rows.map((r: any) => this.mapApprovalRow(r)) };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  private mapPolicyRow(r: any): ApprovalPolicy {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      documentType: r.document_type,
      mode: r.mode,
      steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps,
      enforceDistinctApprovers: r.enforce_distinct === true,
      isActive: r.is_active === true,
      version: r.version,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    };
  }

  public async getApprovalPolicy(tenantId: string, documentType: ApprovalDocumentType): Promise<StorageResult<ApprovalPolicy | null>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query('SELECT * FROM an_approval_policies WHERE tenant_id = $1 AND document_type = $2', [tenantId, documentType]);
        return { success: true as const, data: res.rows.length ? this.mapPolicyRow(res.rows[0]) : null };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async listApprovalPolicies(tenantId: string): Promise<StorageResult<ApprovalPolicy[]>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query('SELECT * FROM an_approval_policies WHERE tenant_id = $1 ORDER BY document_type', [tenantId]);
        return { success: true as const, data: res.rows.map((r: any) => this.mapPolicyRow(r)) };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  // Upsert on (tenant_id, document_type); the version increments atomically inside the statement.
  public async saveApprovalPolicy(tenantId: string, policy: ApprovalPolicy, idempotencyKey: string): Promise<StorageResult<ApprovalPolicy>> {
    if (!this.pool) return this.missingConnError();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'saveApprovalPolicy');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }
      const res = await client.query(
        `INSERT INTO an_approval_policies (id, tenant_id, document_type, mode, steps, enforce_distinct, is_active, version, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 1, $8, NOW())
         ON CONFLICT (tenant_id, document_type) DO UPDATE SET
           mode = EXCLUDED.mode,
           steps = EXCLUDED.steps,
           enforce_distinct = EXCLUDED.enforce_distinct,
           is_active = EXCLUDED.is_active,
           version = an_approval_policies.version + 1,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING *`,
        [policy.id, tenantId, policy.documentType, policy.mode, JSON.stringify(policy.steps), policy.enforceDistinctApprovers, policy.isActive, policy.updatedBy]
      );
      const saved = this.mapPolicyRow(res.rows[0]);
      await this.completeIdempotency(client, tenantId, idempotencyKey, 'saveApprovalPolicy', saved);
      await client.query('COMMIT');
      return { success: true, data: saved };
    } catch (err: any) {
      try { await client.query('ROLLBACK'); } catch (rbErr: any) { console.warn('[PostgresPrimaryAdapter] saveApprovalPolicy ROLLBACK failed:', rbErr?.message); }
      return this.dbError(err);
    } finally {
      client.release();
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

  public async consumeRefreshToken(tokenHash: string, revokedAt: number): Promise<StorageResult<boolean>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        'UPDATE an_refresh_tokens SET is_used = TRUE, revoked_at = $2 WHERE token_hash = $1 AND is_used = FALSE',
        [tokenHash, revokedAt]
      );
      return { success: true, data: res.rowCount === 1 };
    } catch (err: any) {
      return this.dbError(err);
    }
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
      } catch (rbErr: any) {
        console.warn('[PostgresPrimaryAdapter] withTenantScope ROLLBACK failed:', rbErr?.message);
      }
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
        request_hash VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
        response_payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, idempotency_key, operation)
      );
      ALTER TABLE an_idempotency_keys ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);
      ALTER TABLE an_idempotency_keys ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED';
      ALTER TABLE an_idempotency_keys ALTER COLUMN response_payload DROP NOT NULL;

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
      ALTER TABLE an_custom_fields ADD COLUMN IF NOT EXISTS options JSONB;

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

  private async checkIdempotency(tenantId: string, key: string, operation: string, client?: any): Promise<any | null> {
    if (!this.pool || !key) return null;
    try {
      const runner = client || this.asyncLocalStorage.getStore()?.client || this.pool;
      const res = await runner.query(
        'SELECT response_payload FROM an_idempotency_keys WHERE idempotency_key = $1 AND tenant_id = $2 AND operation = $3',
        [key, tenantId, operation]
      );
      if (res.rows.length > 0) {
        return res.rows[0].response_payload;
      }
      return null;
    } catch (err: any) {
      console.error('[PostgresPrimaryAdapter] checkIdempotency error:', {
        level: 'ERROR',
        op: 'checkIdempotency',
        tenantId,
        key,
        operation,
        err: err?.message || String(err),
      });
      return null;
    }
  }

  private async recordIdempotency(tenantId: string, key: string, operation: string, payload: any, client?: any): Promise<StorageResult<boolean>> {
    if (!this.pool) return this.missingConnError();
    if (!key) return { success: true, data: true };
    try {
      const runner = client || this.asyncLocalStorage.getStore()?.client || this.pool;
      const res = await runner.query(
        'INSERT INTO an_idempotency_keys (idempotency_key, tenant_id, operation, response_payload) VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, idempotency_key, operation) DO NOTHING RETURNING idempotency_key',
        [key, tenantId, operation, JSON.stringify(payload)]
      );
      if (res.rowCount === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/idempotency-conflict',
            title: 'تعارض في مفتاح العملية',
            status: 409,
            detail: `مفتاح العملية ${key} تم تسجيله مسبقاً.`,
          },
        };
      }
      return { success: true, data: true };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  private async runIdempotent<T>(
    tenantId: string,
    idempotencyKey: string | undefined | null,
    operation: string,
    work: (client: PoolClient) => Promise<StorageResult<T>>
  ): Promise<StorageResult<T>> {
    const client = this.asyncLocalStorage.getStore()?.client;
    if (!client) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/missing-transaction-client',
          title: 'غياب اتصال المعاملة المحمية',
          status: 500,
          detail: `تعذر تنفيذ العملية (${operation}) بإدهنية لعدم وجود اتصال نشط في سياق المعاملة (withTenantScope).`,
        },
      };
    }

    if (!idempotencyKey) {
      return await work(client);
    }

    const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, operation);
    if (reservation.action === 'REPLAY') {
      return { success: true, data: reservation.cachedPayload };
    }
    if (reservation.action === 'CONFLICT') {
      return { success: false, error: reservation.error };
    }

    const savepoint = `sp_idem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await client.query(`SAVEPOINT ${savepoint}`);

    try {
      const result = await work(client);
      if (!result.success) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(
          `DELETE FROM an_idempotency_keys WHERE tenant_id = $1 AND idempotency_key = $2 AND operation = $3`,
          [tenantId, idempotencyKey, operation]
        );
        return result;
      }

      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      await this.completeIdempotency(client, tenantId, idempotencyKey, operation, result.data);
      return result;
    } catch (err: any) {
      try {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(
          `DELETE FROM an_idempotency_keys WHERE tenant_id = $1 AND idempotency_key = $2 AND operation = $3`,
          [tenantId, idempotencyKey, operation]
        );
      } catch (cleanupErr: any) {
        console.warn('[PostgresPrimaryAdapter] idempotency savepoint cleanup failed:', cleanupErr?.message);
      }
      throw err;
    }
  }

  private async reserveIdempotency(
    client: PoolClient,
    tenantId: string,
    key: string,
    operation: string,
    explicitHash?: string
  ): Promise<{ action: 'PROCEED' | 'REPLAY' | 'CONFLICT'; cachedPayload?: any; error?: RFC7807Problem }> {
    if (!key) return { action: 'PROCEED' };
    const reqHash = explicitHash || requestContextALS.getStore()?.requestHash || null;
    const res = await client.query(
      `INSERT INTO an_idempotency_keys (idempotency_key, tenant_id, operation, request_hash, status, response_payload)
       VALUES ($1, $2, $3, $4, 'IN_PROGRESS', NULL)
       ON CONFLICT (tenant_id, idempotency_key, operation)
       DO UPDATE SET idempotency_key = an_idempotency_keys.idempotency_key
       RETURNING response_payload, request_hash, status, (xmax = 0) AS is_new_insert`,
      [key, tenantId, operation, reqHash]
    );
    const row = res.rows[0];
    if (row.is_new_insert) {
      return { action: 'PROCEED' };
    }
    if (row.request_hash && reqHash && row.request_hash !== reqHash) {
      return {
        action: 'CONFLICT',
        error: {
          type: 'https://api.an-erp.local/errors/idempotency-conflict',
          title: 'تعارض في مفتاح العملية',
          status: 409,
          detail: `مفتاح العملية (${key}) مستخدم مسبقاً مع حمولة طلب مختلفة (Same-key different-payload conflict).`,
        },
      };
    }
    if (row.status !== 'COMPLETED' || row.response_payload === null || row.response_payload === undefined) {
      return {
        action: 'CONFLICT',
        error: {
          type: 'https://api.an-erp.local/errors/idempotency-in-progress-or-incomplete',
          title: 'العملية قيد المعالجة أو غير مكتملة',
          status: 409,
          detail: `مفتاح العملية (${key}) مرتبط بعملية سابقة لم تكتمل بنجاح (الحالة: ${row.status}).`,
        },
      };
    }
    return { action: 'REPLAY', cachedPayload: row.response_payload };
  }

  private async completeIdempotency(
    client: PoolClient,
    tenantId: string,
    key: string,
    operation: string,
    payload: any
  ): Promise<void> {
    if (!key) return;
    await client.query(
      `UPDATE an_idempotency_keys
       SET response_payload = $1, status = 'COMPLETED'
       WHERE tenant_id = $2 AND idempotency_key = $3 AND operation = $4`,
      [JSON.stringify(payload), tenantId, key, operation]
    );
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

    return this.withTenantScope(tenantId, async () => {
      return this.runIdempotent(tenantId, idempotencyKey, 'saveOrgNode', async (client) => {
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
          await client.query(query, [
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
          return { success: true, data: node };
        } catch (err: any) {
          return this.dbError(err);
        }
      });
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

    return this.withTenantScope(tenantId, async () => {
      return this.runIdempotent(tenantId, idempotencyKey, 'anonymizeUserPii', async (client) => {
        try {
          const checkUser = await client.query(
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

          await client.query(
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
          await client.query('DELETE FROM an_active_sessions WHERE user_id = $1', [userId]);

          const resData = { userId, anonymizedAt: timestamp };
          return { success: true, data: resData };
        } catch (err: any) {
          return this.dbError(err);
        }
      });
    });
  }

  // Phase 4.5: Operational Audit & Custom Fields Persistence (4.5E)
  public async saveAuditRecord(record: OperationalAuditRecord): Promise<StorageResult<OperationalAuditRecord>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_audit_trail (id, tenant_id, actor_id, actor_name, action, entity_type, entity_id, details, ip_address, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          record.id,
          record.tenantId,
          record.actorId,
          record.actorName,
          record.action,
          record.entityType,
          record.entityId,
          record.details ? JSON.stringify(record.details) : null,
          record.ipAddress || null,
          record.timestamp ? new Date(record.timestamp) : new Date(),
        ]
      );
      return { success: true, data: record };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getAuditRecords(tenantId: string, limit: number = 100): Promise<StorageResult<OperationalAuditRecord[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT id, tenant_id, actor_id, actor_name, action, entity_type, entity_id, details, ip_address, timestamp
         FROM an_audit_trail
         WHERE tenant_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [tenantId, limit]
      );
      const records: OperationalAuditRecord[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        actorId: r.actor_id,
        actorName: r.actor_name,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
        ipAddress: r.ip_address || undefined,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      }));
      return { success: true, data: records };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveCustomField(tenantId: string, field: CustomFieldDefinition): Promise<StorageResult<CustomFieldDefinition>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_custom_fields (id, tenant_id, module, field_key, field_label_ar, field_type, is_required, options)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           module = EXCLUDED.module,
           field_key = EXCLUDED.field_key,
           field_label_ar = EXCLUDED.field_label_ar,
           field_type = EXCLUDED.field_type,
           is_required = EXCLUDED.is_required,
           options = EXCLUDED.options`,
        [
          field.id,
          tenantId,
          field.module || 'GENERAL',
          field.fieldKey,
          field.fieldLabelAr,
          field.fieldType,
          !!field.isRequired,
          field.options ? JSON.stringify(field.options) : null,
        ]
      );
      return { success: true, data: field };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getCustomFields(tenantId: string, module?: string): Promise<StorageResult<CustomFieldDefinition[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = 'SELECT * FROM an_custom_fields WHERE tenant_id = $1';
      const params: any[] = [tenantId];
      if (module) {
        queryStr += ' AND module = $2';
        params.push(module);
      }
      queryStr += ' ORDER BY field_key ASC';
      const res = await this.query(queryStr, params);
      const fields: CustomFieldDefinition[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        module: r.module,
        fieldKey: r.field_key,
        fieldLabelAr: r.field_label_ar,
        fieldType: r.field_type,
        isRequired: !!r.is_required,
        options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options || [],
      }));
      return { success: true, data: fields };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async checkIdempotencyRecord(tenantId: string, key: string, operation: string): Promise<StorageResult<any | null>> {
    const payload = await this.checkIdempotency(tenantId, key, operation);
    return { success: true, data: payload };
  }

  public async saveIdempotencyRecord(tenantId: string, key: string, operation: string, payload: any): Promise<StorageResult<void>> {
    const res = await this.recordIdempotency(tenantId, key, operation, payload);
    if (!res.success) return { success: false, error: res.error };
    return { success: true, data: undefined };
  }

  // =========================================================================
  // Phase 5: Cash Custody Module Storage Methods (1 of 15)
  // =========================================================================

  public async createCashCustody(
    tenantId: string,
    custody: CashCustody,
    idempotencyKey: string
  ): Promise<StorageResult<CashCustody>> {
    if (!this.pool) return this.missingConnError();

    return this.withTenantScope(tenantId, async () => {
      return this.runIdempotent(tenantId, idempotencyKey, 'createCashCustody', async (client) => {
        try {
          await client.query(
            `INSERT INTO an_cash_custodies (
              id, tenant_id, company_id, custody_code, employee_id, employee_name,
              branch_id, branch_name, cost_center_id, cost_center_name, currency,
              allocated_amount, current_balance, max_limit_per_role, status,
              opened_by, opened_by_name, opened_at, notes, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
            [
              custody.id,
              tenantId,
              custody.companyId || tenantId,
              custody.custodyCode,
              custody.employeeId,
              custody.employeeName,
              custody.branchId || null,
              custody.branchName || null,
              custody.costCenterId,
              custody.costCenterName || null,
              custody.currency || 'SAR',
              custody.allocatedAmount,
              custody.currentBalance,
              custody.maxLimitPerRole,
              custody.status || 'OPEN',
              custody.openedBy,
              custody.openedByName,
              custody.openedAt,
              custody.notes || null,
              custody.createdAt,
              custody.updatedAt,
            ]
          );

          return { success: true, data: custody };
        } catch (err: any) {
          return this.dbError(err);
        }
      });
    });
  }

  public async getCashCustody(
    tenantId: string,
    custodyId: string
  ): Promise<StorageResult<CashCustody | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_cash_custodies WHERE tenant_id = $1 AND (id = $2 OR custody_code = $2)`,
        [tenantId, custodyId]
      );
      if (res.rows.length === 0) return { success: true, data: null };
      const r = res.rows[0];
      const custody: CashCustody = {
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        custodyCode: r.custody_code,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        branchId: r.branch_id || undefined,
        branchName: r.branch_name || undefined,
        costCenterId: r.cost_center_id,
        costCenterName: r.cost_center_name || undefined,
        currency: r.currency,
        allocatedAmount: Number(r.allocated_amount),
        currentBalance: Number(r.current_balance),
        maxLimitPerRole: Number(r.max_limit_per_role),
        status: r.status,
        openedBy: r.opened_by,
        openedByName: r.opened_by_name,
        openedAt: r.opened_at?.toISOString?.() || r.opened_at,
        closedAt: r.closed_at?.toISOString?.() || r.closed_at,
        closedBy: r.closed_by || undefined,
        notes: r.notes || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
      };
      return { success: true, data: custody };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listCashCustodies(
    tenantId: string,
    filter?: { status?: string; employeeId?: string }
  ): Promise<StorageResult<CashCustody[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_cash_custodies WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      let pIdx = 2;
      if (filter?.status) {
        queryStr += ` AND status = $${pIdx++}`;
        params.push(filter.status);
      }
      if (filter?.employeeId) {
        queryStr += ` AND employee_id = $${pIdx++}`;
        params.push(filter.employeeId);
      }
      queryStr += ` ORDER BY created_at DESC`;

      const res = await this.query(queryStr, params);
      const list: CashCustody[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        custodyCode: r.custody_code,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        branchId: r.branch_id || undefined,
        branchName: r.branch_name || undefined,
        costCenterId: r.cost_center_id,
        costCenterName: r.cost_center_name || undefined,
        currency: r.currency,
        allocatedAmount: Number(r.allocated_amount),
        currentBalance: Number(r.current_balance),
        maxLimitPerRole: Number(r.max_limit_per_role),
        status: r.status,
        openedBy: r.opened_by,
        openedByName: r.opened_by_name,
        openedAt: r.opened_at?.toISOString?.() || r.opened_at,
        closedAt: r.closed_at?.toISOString?.() || r.closed_at,
        closedBy: r.closed_by || undefined,
        notes: r.notes || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async updateCashCustody(
    tenantId: string,
    custodyId: string,
    updates: Partial<CashCustody>
  ): Promise<StorageResult<CashCustody>> {
    if (!this.pool) return this.missingConnError();
    try {
      const setClauses: string[] = ['updated_at = NOW()'];
      const params: any[] = [tenantId, custodyId];
      let pIdx = 3;

      if (updates.currentBalance !== undefined) {
        setClauses.push(`current_balance = $${pIdx++}`);
        params.push(updates.currentBalance);
      }
      if (updates.status !== undefined) {
        setClauses.push(`status = $${pIdx++}`);
        params.push(updates.status);
      }
      if (updates.employeeId !== undefined) {
        setClauses.push(`employee_id = $${pIdx++}`);
        params.push(updates.employeeId);
      }
      if (updates.employeeName !== undefined) {
        setClauses.push(`employee_name = $${pIdx++}`);
        params.push(updates.employeeName);
      }
      if (updates.closedAt !== undefined) {
        setClauses.push(`closed_at = $${pIdx++}`);
        params.push(updates.closedAt);
      }
      if (updates.closedBy !== undefined) {
        setClauses.push(`closed_by = $${pIdx++}`);
        params.push(updates.closedBy);
      }
      if (updates.notes !== undefined) {
        setClauses.push(`notes = $${pIdx++}`);
        params.push(updates.notes);
      }

      const queryStr = `UPDATE an_cash_custodies SET ${setClauses.join(', ')} WHERE tenant_id = $1 AND (id = $2 OR custody_code = $2) RETURNING *`;
      const res = await this.query(queryStr, params);
      if (res.rows.length === 0) {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/not-found',
            title: 'العهدة غير موجودة',
            status: 404,
            detail: 'سجل العهدة المطلوب تحديثه غير موجود.',
          },
        };
      }
      return this.getCashCustody(tenantId, custodyId) as any;
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async recordCustodyExpense(
    tenantId: string,
    transaction: CashCustodyTransaction,
    idempotencyKey: string,
    skipBalanceDeduction: boolean = false
  ): Promise<StorageResult<CashCustodyTransaction>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'recordCustodyExpense');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      // 1. Deduct custody balance atomically (skipped if voucher already deducted atomically)
      if (!skipBalanceDeduction) {
        const deductRes = await client.query(
          `UPDATE an_cash_custodies 
           SET current_balance = current_balance - $1, updated_at = NOW() 
           WHERE tenant_id = $2 AND id = $3 AND current_balance >= $1 
           RETURNING current_balance`,
          [transaction.amount, tenantId, transaction.custodyId]
        );

        if (deductRes.rows.length === 0) {
          throw new Error('رصيد العهدة غير كافٍ أو العهدة غير موجودة في قاعدة البيانات.');
        }
      }

      // 2. Insert transaction
      await client.query(
        `INSERT INTO an_cash_custody_transactions (
          id, tenant_id, company_id, transaction_code, custody_id, amount,
          expense_category, expense_account_code, description, receipt_number,
          attachment_url, attachment_name, cost_center_id, recorded_by,
          recorded_by_name, status, settlement_id, transaction_date,
          created_at, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          transaction.id,
          tenantId,
          transaction.companyId || tenantId,
          transaction.transactionCode,
          transaction.custodyId,
          transaction.amount,
          transaction.expenseCategory,
          transaction.expenseAccountCode,
          transaction.description,
          transaction.receiptNumber,
          transaction.attachmentUrl,
          transaction.attachmentName || null,
          transaction.costCenterId || null,
          transaction.recordedBy,
          transaction.recordedByName,
          transaction.status || 'RECORDED',
          transaction.settlementId || null,
          transaction.transactionDate,
          transaction.createdAt,
          idempotencyKey,
        ]
      );

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'recordCustodyExpense', transaction);

      await client.query('COMMIT');
      return { success: true, data: transaction };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async listCustodyTransactions(
    tenantId: string,
    custodyId?: string
  ): Promise<StorageResult<CashCustodyTransaction[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_cash_custody_transactions WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (custodyId) {
        queryStr += ` AND custody_id = $2`;
        params.push(custodyId);
      }
      queryStr += ` ORDER BY transaction_date DESC`;

      const res = await this.pool.query(queryStr, params);
      const list: CashCustodyTransaction[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        transactionCode: r.transaction_code,
        custodyId: r.custody_id,
        amount: Number(r.amount),
        expenseCategory: r.expense_category,
        expenseAccountCode: r.expense_account_code,
        description: r.description,
        receiptNumber: r.receipt_number,
        attachmentUrl: r.attachment_url,
        attachmentName: r.attachment_name || undefined,
        costCenterId: r.cost_center_id || undefined,
        recordedBy: r.recorded_by,
        recordedByName: r.recorded_by_name,
        status: r.status,
        settlementId: r.settlement_id || undefined,
        transactionDate: r.transaction_date?.toISOString?.() || r.transaction_date,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        idempotencyKey: r.idempotency_key,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveCustodySettlement(
    tenantId: string,
    settlement: CashCustodySettlement,
    idempotencyKey: string
  ): Promise<StorageResult<CashCustodySettlement>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'saveCustodySettlement');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      // Wave 7.5D & Section 7.1: Adapter-level SoD enforcement on STORED record
      const custodyRes = await client.query(
        'SELECT opened_by FROM an_cash_custodies WHERE tenant_id = $1 AND id = $2',
        [tenantId, settlement.custodyId]
      );
      if (custodyRes.rows.length > 0 && custodyRes.rows[0].opened_by === settlement.settledBy) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/sod-violation',
            title: 'تعارض مصالح - فصل الصلاحيات والواجبات',
            status: 403,
            detail: 'ممنوع نظامياً: لا يجوز لمن قام بفتح وتخصيص العهدة أن يعتمد تسويتها النهائية (بند 7.1). تم التحقق بناءً على القيمة المخزنة فعلياً في قاعدة البيانات.',
          },
        };
      }

      // 1. Mark included transactions as settled
      await client.query(
        `UPDATE an_cash_custody_transactions 
         SET status = 'INCLUDED_IN_SETTLEMENT', settlement_id = $1 
         WHERE tenant_id = $2 AND custody_id = $3 AND status = 'RECORDED'`,
        [settlement.id, tenantId, settlement.custodyId]
      );

      // 2. Insert settlement record
      await client.query(
        `INSERT INTO an_cash_custody_settlements (
          id, tenant_id, company_id, settlement_code, custody_id,
          settlement_date, total_expenses, replenishment_amount,
          variance_amount, variance_type, journal_entry_id, status,
          settled_by, settled_by_name, notes, created_at, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          settlement.id,
          tenantId,
          settlement.companyId || tenantId,
          settlement.settlementCode,
          settlement.custodyId,
          settlement.settlementDate,
          settlement.totalExpenses,
          settlement.replenishmentAmount,
          settlement.varianceAmount || 0,
          settlement.varianceType || 'NONE',
          settlement.journalEntryId || null,
          settlement.status || 'APPROVED',
          settlement.settledBy,
          settlement.settledByName,
          settlement.notes || null,
          settlement.createdAt,
          idempotencyKey,
        ]
      );

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'saveCustodySettlement', settlement);

      await client.query('COMMIT');
      return { success: true, data: settlement };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async listCustodySettlements(
    tenantId: string,
    custodyId?: string
  ): Promise<StorageResult<CashCustodySettlement[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_cash_custody_settlements WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (custodyId) {
        queryStr += ` AND custody_id = $2`;
        params.push(custodyId);
      }
      queryStr += ` ORDER BY settlement_date DESC`;

      const res = await this.query(queryStr, params);
      const list: CashCustodySettlement[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        settlementCode: r.settlement_code,
        custodyId: r.custody_id,
        settlementDate: r.settlement_date?.toISOString?.() || r.settlement_date,
        totalExpenses: Number(r.total_expenses),
        replenishmentAmount: Number(r.replenishment_amount),
        varianceAmount: Number(r.variance_amount),
        varianceType: r.variance_type,
        journalEntryId: r.journal_entry_id || undefined,
        status: r.status,
        settledBy: r.settled_by,
        settledByName: r.settled_by_name,
        notes: r.notes || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        idempotencyKey: r.idempotency_key,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Phase 6: Expenses Module Methods (2 of 15)
  public async createExpenseRequest(
    tenantId: string,
    request: ExpenseRequest,
    lines: ExpenseLine[],
    attachments: ExpenseAttachment[],
    idempotencyKey: string
  ): Promise<StorageResult<ExpenseRequest>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);

      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'createExpenseRequest');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      // 1. Insert Request
      await client.query(
        `INSERT INTO an_expense_requests (
          id, tenant_id, company_id, request_code, title_ar, employee_id, employee_name,
          department, cost_center_id, project_id, total_amount, currency, payment_method,
          disbursement_account_code, status, current_approval_tier, submitted_by, submitted_by_name,
          submitted_at, approved_l1_by, approved_l1_by_name, approved_l1_at, approved_by, approved_by_name,
          approved_at, rejected_by, rejected_by_name, rejected_at, rejection_reason, journal_entry_id,
          notes, created_at, updated_at, idempotency_key
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34
        )`,
        [
          request.id,
          tenantId,
          request.companyId || tenantId,
          request.requestCode,
          request.titleAr,
          request.employeeId,
          request.employeeName,
          request.department || null,
          request.costCenterId || null,
          request.projectId || null,
          request.totalAmount,
          request.currency || 'SAR',
          request.paymentMethod || 'DIRECT_BANK_TRANSFER',
          request.disbursementAccountCode || null,
          request.status || 'SUBMITTED',
          request.currentApprovalTier || 'L1',
          request.submittedBy,
          request.submittedByName,
          request.submittedAt || new Date().toISOString(),
          request.approvedL1By || null,
          request.approvedL1ByName || null,
          request.approvedL1At || null,
          request.approvedBy || null,
          request.approvedByName || null,
          request.approvedAt || null,
          request.rejectedBy || null,
          request.rejectedByName || null,
          request.rejectedAt || null,
          request.rejectionReason || null,
          request.journalEntryId || null,
          request.notes || null,
          request.createdAt || new Date().toISOString(),
          request.updatedAt || new Date().toISOString(),
          idempotencyKey,
        ]
      );

      // 2. Insert Lines
      for (const line of lines) {
        await client.query(
          `INSERT INTO an_expense_lines (
            id, tenant_id, company_id, request_id, category_id, category_name_ar,
            expense_account_code, description, amount, cost_center_id, project_id,
            invoice_number, invoice_date, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            line.id,
            tenantId,
            line.companyId || tenantId,
            request.id,
            line.categoryId,
            line.categoryNameAr,
            line.expenseAccountCode,
            line.description,
            line.amount,
            line.costCenterId || request.costCenterId || null,
            line.projectId || request.projectId || null,
            line.invoiceNumber || null,
            line.invoiceDate || null,
            line.createdAt || new Date().toISOString(),
          ]
        );
      }

      // 3. Insert Attachments
      for (const att of attachments) {
        await client.query(
          `INSERT INTO an_expense_attachments (
            id, tenant_id, company_id, request_id, line_id, file_name, file_url,
            file_type, file_size_bytes, uploaded_by, uploaded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            att.id,
            tenantId,
            att.companyId || tenantId,
            request.id,
            att.lineId || null,
            att.fileName,
            att.fileUrl,
            att.fileType || 'application/pdf',
            att.fileSizeBytes || 0,
            att.uploadedBy,
            att.uploadedAt || new Date().toISOString(),
          ]
        );
      }

      const savedRequest: ExpenseRequest = {
        ...request,
        idempotencyKey,
      };

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'createExpenseRequest', savedRequest);

      await client.query('COMMIT');
      return { success: true, data: savedRequest };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async getExpenseRequest(
    tenantId: string,
    requestId: string
  ): Promise<StorageResult<{ request: ExpenseRequest; lines: ExpenseLine[]; attachments: ExpenseAttachment[] } | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const reqRes = await this.query(
        `SELECT * FROM an_expense_requests WHERE tenant_id = $1 AND id = $2`,
        [tenantId, requestId]
      );
      if (reqRes.rows.length === 0) {
        return { success: true, data: null };
      }
      const r = reqRes.rows[0];
      const request: ExpenseRequest = {
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        requestCode: r.request_code,
        titleAr: r.title_ar,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        department: r.department || undefined,
        costCenterId: r.cost_center_id || undefined,
        projectId: r.project_id || undefined,
        totalAmount: Number(r.total_amount),
        currency: r.currency,
        paymentMethod: r.payment_method,
        disbursementAccountCode: r.disbursement_account_code || undefined,
        status: r.status,
        currentApprovalTier: r.current_approval_tier,
        submittedBy: r.submitted_by,
        submittedByName: r.submitted_by_name,
        submittedAt: r.submitted_at?.toISOString?.() || r.submitted_at,
        approvedL1By: r.approved_l1_by || undefined,
        approvedL1ByName: r.approved_l1_by_name || undefined,
        approvedL1At: r.approved_l1_at?.toISOString?.() || r.approved_l1_at || undefined,
        approvedBy: r.approved_by || undefined,
        approvedByName: r.approved_by_name || undefined,
        approvedAt: r.approved_at?.toISOString?.() || r.approved_at || undefined,
        rejectedBy: r.rejected_by || undefined,
        rejectedByName: r.rejected_by_name || undefined,
        rejectedAt: r.rejected_at?.toISOString?.() || r.rejected_at || undefined,
        rejectionReason: r.rejection_reason || undefined,
        journalEntryId: r.journal_entry_id || undefined,
        notes: r.notes || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
        idempotencyKey: r.idempotency_key || undefined,
      };

      const linesRes = await this.query(
        `SELECT * FROM an_expense_lines WHERE tenant_id = $1 AND request_id = $2 ORDER BY created_at ASC`,
        [tenantId, requestId]
      );
      const lines: ExpenseLine[] = linesRes.rows.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        companyId: l.company_id,
        requestId: l.request_id,
        categoryId: l.category_id,
        categoryNameAr: l.category_name_ar,
        expenseAccountCode: l.expense_account_code,
        description: l.description,
        amount: Number(l.amount),
        costCenterId: l.cost_center_id || undefined,
        projectId: l.project_id || undefined,
        invoiceNumber: l.invoice_number || undefined,
        invoiceDate: l.invoice_date || undefined,
        createdAt: l.created_at?.toISOString?.() || l.created_at,
      }));

      const attRes = await this.query(
        `SELECT * FROM an_expense_attachments WHERE tenant_id = $1 AND request_id = $2 ORDER BY uploaded_at ASC`,
        [tenantId, requestId]
      );
      const attachments: ExpenseAttachment[] = attRes.rows.map((a: any) => ({
        id: a.id,
        tenantId: a.tenant_id,
        companyId: a.company_id,
        requestId: a.request_id,
        lineId: a.line_id || undefined,
        fileName: a.file_name,
        fileUrl: a.file_url,
        fileType: a.file_type,
        fileSizeBytes: Number(a.file_size_bytes),
        uploadedBy: a.uploaded_by,
        uploadedAt: a.uploaded_at?.toISOString?.() || a.uploaded_at,
      }));

      return { success: true, data: { request, lines, attachments } };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listExpenseRequests(
    tenantId: string,
    filter?: { status?: string; employeeId?: string }
  ): Promise<StorageResult<ExpenseRequest[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_expense_requests WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (filter?.status) {
        params.push(filter.status);
        queryStr += ` AND status = $${params.length}`;
      }
      if (filter?.employeeId) {
        params.push(filter.employeeId);
        queryStr += ` AND employee_id = $${params.length}`;
      }
      queryStr += ` ORDER BY created_at DESC`;

      const res = await this.query(queryStr, params);
      const list: ExpenseRequest[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        requestCode: r.request_code,
        titleAr: r.title_ar,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        department: r.department || undefined,
        costCenterId: r.cost_center_id || undefined,
        projectId: r.project_id || undefined,
        totalAmount: Number(r.total_amount),
        currency: r.currency,
        paymentMethod: r.payment_method,
        disbursementAccountCode: r.disbursement_account_code || undefined,
        status: r.status,
        currentApprovalTier: r.current_approval_tier,
        submittedBy: r.submitted_by,
        submittedByName: r.submitted_by_name,
        submittedAt: r.submitted_at?.toISOString?.() || r.submitted_at,
        approvedL1By: r.approved_l1_by || undefined,
        approvedL1ByName: r.approved_l1_by_name || undefined,
        approvedL1At: r.approved_l1_at?.toISOString?.() || r.approved_l1_at || undefined,
        approvedBy: r.approved_by || undefined,
        approvedByName: r.approved_by_name || undefined,
        approvedAt: r.approved_at?.toISOString?.() || r.approved_at || undefined,
        rejectedBy: r.rejected_by || undefined,
        rejectedByName: r.rejected_by_name || undefined,
        rejectedAt: r.rejected_at?.toISOString?.() || r.rejected_at || undefined,
        rejectionReason: r.rejection_reason || undefined,
        journalEntryId: r.journal_entry_id || undefined,
        notes: r.notes || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
        idempotencyKey: r.idempotency_key || undefined,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async updateExpenseRequestStatus(
    tenantId: string,
    requestId: string,
    updates: Partial<ExpenseRequest>,
    idempotencyKey: string
  ): Promise<StorageResult<ExpenseRequest>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);

      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'updateExpenseRequestStatus');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      const checkRes = await client.query(
        `SELECT * FROM an_expense_requests WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, requestId]
      );
      if (checkRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/expense-not-found',
            title: 'طلب الصرف غير موجود',
            status: 404,
            detail: `تعذر العثور على طلب الصرف برقم ${requestId}`,
          },
        };
      }

      const existing = checkRes.rows[0];

      // Wave 7.5D & Section 7.1: Adapter-level SoD enforcement on STORED record
      const storedCreator = existing.submitted_by || existing.employee_id;
      if (updates.approvedL1By && updates.approvedL1By === storedCreator) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/sod-violation',
            title: 'تعارض مصالح - فصل الصلاحيات والواجبات',
            status: 403,
            detail: 'ممنوع نظامياً: لا يجوز لمنشئ أو مقدم طلب الصرف اعتماد طلبه (SoD بند 7.1). تم التحقق بناءً على القيمة المخزنة بالمخزن.',
          },
        };
      }
      if (updates.approvedBy && updates.approvedBy === storedCreator) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/sod-violation',
            title: 'تعارض مصالح - فصل الصلاحيات والواجبات',
            status: 403,
            detail: 'ممنوع نظامياً: لا يجوز لمنشئ أو مقدم طلب الصرف اعتماد طلبه (SoD بند 7.1). تم التحقق بناءً على القيمة المخزنة بالمخزن.',
          },
        };
      }

      const newStatus = updates.status !== undefined ? updates.status : existing.status;
      const newTier = updates.currentApprovalTier !== undefined ? updates.currentApprovalTier : existing.current_approval_tier;
      const l1By = updates.approvedL1By !== undefined ? updates.approvedL1By : existing.approved_l1_by;
      const l1ByName = updates.approvedL1ByName !== undefined ? updates.approvedL1ByName : existing.approved_l1_by_name;
      const l1At = updates.approvedL1At !== undefined ? updates.approvedL1At : existing.approved_l1_at;
      const appBy = updates.approvedBy !== undefined ? updates.approvedBy : existing.approved_by;
      const appByName = updates.approvedByName !== undefined ? updates.approvedByName : existing.approved_by_name;
      const appAt = updates.approvedAt !== undefined ? updates.approvedAt : existing.approved_at;
      const rejBy = updates.rejectedBy !== undefined ? updates.rejectedBy : existing.rejected_by;
      const rejByName = updates.rejectedByName !== undefined ? updates.rejectedByName : existing.rejected_by_name;
      const rejAt = updates.rejectedAt !== undefined ? updates.rejectedAt : existing.rejected_at;
      const rejReason = updates.rejectionReason !== undefined ? updates.rejectionReason : existing.rejection_reason;
      const jeId = updates.journalEntryId !== undefined ? updates.journalEntryId : existing.journal_entry_id;
      const notes = updates.notes !== undefined ? updates.notes : existing.notes;
      const nowIso = new Date().toISOString();

      await client.query(
        `UPDATE an_expense_requests SET
          status = $1,
          current_approval_tier = $2,
          approved_l1_by = $3,
          approved_l1_by_name = $4,
          approved_l1_at = $5,
          approved_by = $6,
          approved_by_name = $7,
          approved_at = $8,
          rejected_by = $9,
          rejected_by_name = $10,
          rejected_at = $11,
          rejection_reason = $12,
          journal_entry_id = $13,
          notes = $14,
          updated_at = $15
        WHERE tenant_id = $16 AND id = $17`,
        [
          newStatus,
          newTier,
          l1By,
          l1ByName,
          l1At,
          appBy,
          appByName,
          appAt,
          rejBy,
          rejByName,
          rejAt,
          rejReason,
          jeId,
          notes,
          nowIso,
          tenantId,
          requestId,
        ]
      );

      const updatedRequest: ExpenseRequest = {
        id: existing.id,
        tenantId: existing.tenant_id,
        companyId: existing.company_id,
        requestCode: existing.request_code,
        titleAr: existing.title_ar,
        employeeId: existing.employee_id,
        employeeName: existing.employee_name,
        department: existing.department || undefined,
        costCenterId: existing.cost_center_id || undefined,
        projectId: existing.project_id || undefined,
        totalAmount: Number(existing.total_amount),
        currency: existing.currency,
        paymentMethod: existing.payment_method,
        disbursementAccountCode: existing.disbursement_account_code || undefined,
        status: newStatus,
        currentApprovalTier: newTier,
        submittedBy: existing.submitted_by,
        submittedByName: existing.submitted_by_name,
        submittedAt: existing.submitted_at?.toISOString?.() || existing.submitted_at,
        approvedL1By: l1By || undefined,
        approvedL1ByName: l1ByName || undefined,
        approvedL1At: l1At?.toISOString?.() || l1At || undefined,
        approvedBy: appBy || undefined,
        approvedByName: appByName || undefined,
        approvedAt: appAt?.toISOString?.() || appAt || undefined,
        rejectedBy: rejBy || undefined,
        rejectedByName: rejByName || undefined,
        rejectedAt: rejAt?.toISOString?.() || rejAt || undefined,
        rejectionReason: rejReason || undefined,
        journalEntryId: jeId || undefined,
        notes: notes || undefined,
        createdAt: existing.created_at?.toISOString?.() || existing.created_at,
        updatedAt: nowIso,
        idempotencyKey,
      };

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'updateExpenseRequestStatus', updatedRequest);

      await client.query('COMMIT');
      return { success: true, data: updatedRequest };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async listExpenseCategories(tenantId: string): Promise<StorageResult<ExpenseCategory[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_expense_categories WHERE tenant_id = $1 ORDER BY created_at ASC`,
        [tenantId]
      );
      const list: ExpenseCategory[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        code: r.code,
        nameAr: r.name_ar,
        nameEn: r.name_en || undefined,
        defaultAccountCode: r.default_account_code,
        requiresAttachment: Boolean(r.requires_attachment),
        attachmentThresholdAmount: Number(r.attachment_threshold_amount),
        isActive: Boolean(r.is_active),
        createdAt: r.created_at?.toISOString?.() || r.created_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveExpenseCategory(
    tenantId: string,
    category: ExpenseCategory,
    idempotencyKey: string,
    skipIdempotency: boolean = false
  ): Promise<StorageResult<ExpenseCategory>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_expense_categories (
          id, tenant_id, company_id, code, name_ar, name_en,
          default_account_code, requires_attachment, attachment_threshold_amount, is_active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, code) DO UPDATE SET
          name_ar = EXCLUDED.name_ar,
          name_en = EXCLUDED.name_en,
          default_account_code = EXCLUDED.default_account_code,
          requires_attachment = EXCLUDED.requires_attachment,
          attachment_threshold_amount = EXCLUDED.attachment_threshold_amount,
          is_active = EXCLUDED.is_active`,
        [
          category.id,
          tenantId,
          category.companyId || tenantId,
          category.code,
          category.nameAr,
          category.nameEn || null,
          category.defaultAccountCode,
          category.requiresAttachment,
          category.attachmentThresholdAmount,
          category.isActive,
          category.createdAt || new Date().toISOString(),
        ]
      );
      return { success: true, data: category };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // ============================================================================
  // Phase 7: Warehouses & Inventory Module Implementation (3 of 15 - بند 7)
  // ============================================================================

  public async saveWarehouse(
    tenantId: string,
    warehouse: Warehouse,
    idempotencyKey: string
  ): Promise<StorageResult<Warehouse>> {
    if (!this.pool) return this.missingConnError();

    return this.withTenantScope(tenantId, async () => {
      return this.runIdempotent(tenantId, idempotencyKey, 'saveWarehouse', async (client) => {
        try {
          await client.query(
            `INSERT INTO an_warehouses (
              id, tenant_id, company_id, code, name_ar, name_en,
              branch_id, branch_name, location, is_default, valuation_method, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (tenant_id, code) DO UPDATE SET
              name_ar = EXCLUDED.name_ar,
              name_en = EXCLUDED.name_en,
              branch_id = EXCLUDED.branch_id,
              branch_name = EXCLUDED.branch_name,
              location = EXCLUDED.location,
              is_default = EXCLUDED.is_default,
              valuation_method = EXCLUDED.valuation_method,
              is_active = EXCLUDED.is_active,
              updated_at = EXCLUDED.updated_at`,
            [
              warehouse.id,
              tenantId,
              warehouse.companyId || tenantId,
              warehouse.code,
              warehouse.nameAr,
              warehouse.nameEn || null,
              warehouse.branchId || null,
              warehouse.branchName || null,
              warehouse.location || null,
              warehouse.isDefault ?? false,
              warehouse.valuationMethod || 'WEIGHTED_AVERAGE',
              warehouse.isActive ?? true,
              warehouse.createdAt || new Date().toISOString(),
              new Date().toISOString(),
            ]
          );

          return { success: true, data: warehouse };
        } catch (err: any) {
          return this.dbError(err);
        }
      });
    });
  }

  public async getWarehouse(tenantId: string, warehouseId: string): Promise<StorageResult<Warehouse | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_warehouses WHERE tenant_id = $1 AND (id = $2 OR code = $2)`,
        [tenantId, warehouseId]
      );
      if (res.rows.length === 0) return { success: true, data: null };
      const r = res.rows[0];
      return {
        success: true,
        data: {
          id: r.id,
          tenantId: r.tenant_id,
          companyId: r.company_id,
          code: r.code,
          nameAr: r.name_ar,
          nameEn: r.name_en || undefined,
          branchId: r.branch_id || undefined,
          branchName: r.branch_name || undefined,
          location: r.location || undefined,
          isDefault: r.is_default,
          valuationMethod: r.valuation_method,
          isActive: r.is_active,
          createdAt: r.created_at?.toISOString?.() || r.created_at,
          updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listWarehouses(
    tenantId: string,
    filter?: { isActive?: boolean; branchId?: string }
  ): Promise<StorageResult<Warehouse[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_warehouses WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (filter?.isActive !== undefined) {
        params.push(filter.isActive);
        queryStr += ` AND is_active = $${params.length}`;
      }
      if (filter?.branchId) {
        params.push(filter.branchId);
        queryStr += ` AND branch_id = $${params.length}`;
      }
      queryStr += ` ORDER BY is_default DESC, code ASC`;

      const res = await this.query(queryStr, params);
      const list: Warehouse[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        code: r.code,
        nameAr: r.name_ar,
        nameEn: r.name_en || undefined,
        branchId: r.branch_id || undefined,
        branchName: r.branch_name || undefined,
        location: r.location || undefined,
        isDefault: r.is_default,
        valuationMethod: r.valuation_method,
        isActive: r.is_active,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveWarehouseBin(tenantId: string, bin: WarehouseBin): Promise<StorageResult<WarehouseBin>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_warehouse_bins (
          id, tenant_id, company_id, warehouse_id, code, aisle, rack, shelf, bin, description_ar, is_active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tenant_id, warehouse_id, code) DO UPDATE SET
          aisle = EXCLUDED.aisle,
          rack = EXCLUDED.rack,
          shelf = EXCLUDED.shelf,
          bin = EXCLUDED.bin,
          description_ar = EXCLUDED.description_ar,
          is_active = EXCLUDED.is_active`,
        [
          bin.id,
          tenantId,
          bin.companyId || tenantId,
          bin.warehouseId,
          bin.code,
          bin.aisle || null,
          bin.rack || null,
          bin.shelf || null,
          bin.bin || null,
          bin.descriptionAr || null,
          bin.isActive ?? true,
          bin.createdAt || new Date().toISOString(),
        ]
      );
      return { success: true, data: bin };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listWarehouseBins(tenantId: string, warehouseId: string): Promise<StorageResult<WarehouseBin[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_warehouse_bins WHERE tenant_id = $1 AND warehouse_id = $2 ORDER BY code ASC`,
        [tenantId, warehouseId]
      );
      const list: WarehouseBin[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        warehouseId: r.warehouse_id,
        code: r.code,
        aisle: r.aisle || undefined,
        rack: r.rack || undefined,
        shelf: r.shelf || undefined,
        bin: r.bin || undefined,
        descriptionAr: r.description_ar || undefined,
        isActive: r.is_active,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveStockItem(
    tenantId: string,
    item: StockItem,
    idempotencyKey: string
  ): Promise<StorageResult<StockItem>> {
    if (!this.pool) return this.missingConnError();

    return this.withTenantScope(tenantId, async () => {
      return this.runIdempotent(tenantId, idempotencyKey, 'saveStockItem', async (client) => {
        try {
          // Phase 13 (COST-001): detect a valuation-method change of an existing item. Lock order = stock rows first, then the item row
          // (same order as the movement paths), so a change can never deadlock with a concurrent movement.
          const normMethod = (m: any): 'WEIGHTED_AVERAGE' | 'FIFO' | 'SPECIFIC_LOT' => (m === 'FIFO' || m === 'SPECIFIC_LOT' ? m : 'WEIGHTED_AVERAGE');
          const newMethod = normMethod(item.valuationMethod);
          const prevPeek = await client.query(`SELECT id, valuation_method FROM an_stock_items WHERE tenant_id = $1 AND item_code = $2`, [tenantId, item.itemCode]);
          let methodChange: { itemId: string; from: string; to: string; stockRows: any[] } | null = null;
          if (prevPeek.rows.length > 0 && normMethod(prevPeek.rows[0].valuation_method) !== newMethod) {
            const existingItemId = prevPeek.rows[0].id;
            const lockedRows = await client.query(
              `SELECT warehouse_id, current_qty, average_cost, total_value FROM an_warehouse_stock WHERE tenant_id = $1 AND item_id = $2 ORDER BY warehouse_id FOR UPDATE`,
              [tenantId, existingItemId]
            );
            const prevNow = await client.query(`SELECT valuation_method FROM an_stock_items WHERE tenant_id = $1 AND id = $2`, [tenantId, existingItemId]);
            const fromNow = normMethod(prevNow.rows[0]?.valuation_method);
            if (fromNow !== newMethod) methodChange = { itemId: existingItemId, from: fromNow, to: newMethod, stockRows: lockedRows.rows };
          }
          await client.query(
            `INSERT INTO an_stock_items (
              id, tenant_id, company_id, item_code, barcode, name_ar, name_en,
              category, uom, inventory_account_code, cogs_account_code,
              adjustment_expense_account_code, adjustment_gain_account_code,
              valuation_method, standard_cost, average_cost, last_purchase_cost,
              selling_price, reorder_point, min_stock_level, max_stock_level,
              track_batch, track_serial, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
            ON CONFLICT (tenant_id, item_code) DO UPDATE SET
              name_ar = EXCLUDED.name_ar,
              name_en = EXCLUDED.name_en,
              barcode = EXCLUDED.barcode,
              category = EXCLUDED.category,
              uom = EXCLUDED.uom,
              inventory_account_code = EXCLUDED.inventory_account_code,
              cogs_account_code = EXCLUDED.cogs_account_code,
              adjustment_expense_account_code = EXCLUDED.adjustment_expense_account_code,
              adjustment_gain_account_code = EXCLUDED.adjustment_gain_account_code,
              valuation_method = EXCLUDED.valuation_method,
              standard_cost = EXCLUDED.standard_cost,
              average_cost = EXCLUDED.average_cost,
              last_purchase_cost = EXCLUDED.last_purchase_cost,
              selling_price = EXCLUDED.selling_price,
              reorder_point = EXCLUDED.reorder_point,
              min_stock_level = EXCLUDED.min_stock_level,
              max_stock_level = EXCLUDED.max_stock_level,
              track_batch = EXCLUDED.track_batch,
              track_serial = EXCLUDED.track_serial,
              is_active = EXCLUDED.is_active,
              updated_at = EXCLUDED.updated_at`,
            [
              item.id,
              tenantId,
              item.companyId || tenantId,
              item.itemCode,
              item.barcode || null,
              item.nameAr,
              item.nameEn || null,
              item.category || 'GENERAL',
              item.uom || 'حبة',
              item.inventoryAccountCode || '1050',
              item.cogsAccountCode || '5010',
              item.adjustmentExpenseAccountCode || '5090',
              item.adjustmentGainAccountCode || '4090',
              item.valuationMethod || 'WEIGHTED_AVERAGE',
              item.standardCost || 0,
              item.averageCost || 0,
              item.lastPurchaseCost || 0,
              item.sellingPrice || 0,
              item.reorderPoint || 10,
              item.minStockLevel || 5,
              item.maxStockLevel || 1000,
              item.trackBatch ?? false,
              item.trackSerial ?? false,
              item.isActive ?? true,
              item.createdAt || new Date().toISOString(),
              new Date().toISOString(),
            ]
          );

          if (methodChange && !(methodChange.from !== 'WEIGHTED_AVERAGE' && methodChange.to !== 'WEIGHTED_AVERAGE')) {
            const nowIso = new Date().toISOString();
            let affected = 0;
            // Any open layer of this item is closed first, so the re-basing below is idempotent and keeps sum(remaining) = current_qty
            await client.query(
              `UPDATE an_stock_cost_layers SET remaining_qty = 0, is_closed = TRUE WHERE tenant_id = $1 AND item_id = $2 AND is_closed = FALSE`,
              [tenantId, methodChange.itemId]
            );
            for (const sr of methodChange.stockRows) {
              const q = Number(sr.current_qty);
              if (!(q > 0)) continue;
              affected++;
              if (methodChange.from === 'WEIGHTED_AVERAGE') {
                // WEIGHTED_AVERAGE -> FIFO / SPECIFIC_LOT: opening re-measurement layer at the current average cost
                await client.query(
                  `INSERT INTO an_stock_cost_layers (id, tenant_id, warehouse_id, item_id, source_document_type, received_at, original_qty, remaining_qty, unit_cost)
                   VALUES ($1, $2, $3, $4, 'OPENING', $5, $6, $6, $7)`,
                  [`lyr-open-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, tenantId, sr.warehouse_id, methodChange.itemId, nowIso, q, Number(sr.average_cost)]
                );
              } else {
                // FIFO / SPECIFIC_LOT -> WEIGHTED_AVERAGE: average = value / quantity
                await client.query(
                  `UPDATE an_warehouse_stock SET average_cost = $1, updated_at = $2 WHERE tenant_id = $3 AND warehouse_id = $4 AND item_id = $5`,
                  [Number(sr.total_value) / q, nowIso, tenantId, sr.warehouse_id, methodChange.itemId]
                );
              }
            }
            await client.query(
              `INSERT INTO an_system_changelog (id, timestamp, actor, change_type, module, entities_affected, summary_ar, before_state, after_state, evidence_ref, version)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                `scl-valm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, nowIso, (item as any).updatedBy || 'system', 'PLATFORM_MANAGEMENT', 'INVENTORY',
                [`StockItem:${methodChange.itemId}`],
                `تغيير طريقة تقييم الصنف ${item.itemCode} من ${methodChange.from} إلى ${methodChange.to} (مستودعات متأثرة: ${affected})`,
                JSON.stringify({ valuationMethod: methodChange.from }), JSON.stringify({ valuationMethod: methodChange.to, warehousesAffected: affected }), null, '1.0',
              ]
            );
          }

          return { success: true, data: item };
        } catch (err: any) {
          return this.dbError(err);
        }
      });
    });
  }

  public async getStockItem(tenantId: string, itemId: string): Promise<StorageResult<StockItem | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_stock_items WHERE tenant_id = $1 AND (id = $2 OR item_code = $2)`,
        [tenantId, itemId]
      );
      if (res.rows.length === 0) return { success: true, data: null };
      const r = res.rows[0];
      return {
        success: true,
        data: {
          id: r.id,
          tenantId: r.tenant_id,
          companyId: r.company_id,
          itemCode: r.item_code,
          barcode: r.barcode || undefined,
          nameAr: r.name_ar,
          nameEn: r.name_en || undefined,
          category: r.category,
          uom: r.uom,
          inventoryAccountCode: r.inventory_account_code,
          cogsAccountCode: r.cogs_account_code,
          adjustmentExpenseAccountCode: r.adjustment_expense_account_code,
          adjustmentGainAccountCode: r.adjustment_gain_account_code,
          valuationMethod: r.valuation_method,
          standardCost: Number(r.standard_cost),
          averageCost: Number(r.average_cost),
          lastPurchaseCost: Number(r.last_purchase_cost),
          sellingPrice: Number(r.selling_price),
          reorderPoint: Number(r.reorder_point),
          minStockLevel: Number(r.min_stock_level),
          maxStockLevel: Number(r.max_stock_level),
          trackBatch: r.track_batch,
          trackSerial: r.track_serial,
          isActive: r.is_active,
          createdAt: r.created_at?.toISOString?.() || r.created_at,
          updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listStockItems(
    tenantId: string,
    filter?: { category?: string; isActive?: boolean }
  ): Promise<StorageResult<StockItem[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_stock_items WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (filter?.isActive !== undefined) {
        params.push(filter.isActive);
        queryStr += ` AND is_active = $${params.length}`;
      }
      if (filter?.category) {
        params.push(filter.category);
        queryStr += ` AND category = $${params.length}`;
      }
      queryStr += ` ORDER BY item_code ASC`;

      const res = await this.query(queryStr, params);
      const list: StockItem[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        itemCode: r.item_code,
        barcode: r.barcode || undefined,
        nameAr: r.name_ar,
        nameEn: r.name_en || undefined,
        category: r.category,
        uom: r.uom,
        inventoryAccountCode: r.inventory_account_code,
        cogsAccountCode: r.cogs_account_code,
        adjustmentExpenseAccountCode: r.adjustment_expense_account_code,
        adjustmentGainAccountCode: r.adjustment_gain_account_code,
        valuationMethod: r.valuation_method,
        standardCost: Number(r.standard_cost),
        averageCost: Number(r.average_cost),
        lastPurchaseCost: Number(r.last_purchase_cost),
        sellingPrice: Number(r.selling_price),
        reorderPoint: Number(r.reorder_point),
        minStockLevel: Number(r.min_stock_level),
        maxStockLevel: Number(r.max_stock_level),
        trackBatch: r.track_batch,
        trackSerial: r.track_serial,
        isActive: r.is_active,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getWarehouseStock(
    tenantId: string,
    warehouseId: string,
    itemId: string
  ): Promise<StorageResult<WarehouseStock | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_warehouse_stock WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3`,
        [tenantId, warehouseId, itemId]
      );
      if (res.rows.length === 0) return { success: true, data: null };
      const r = res.rows[0];
      return {
        success: true,
        data: {
          id: r.id,
          tenantId: r.tenant_id,
          companyId: r.company_id,
          warehouseId: r.warehouse_id,
          itemId: r.item_id,
          currentQty: Number(r.current_qty),
          reservedQty: Number(r.reserved_qty),
          availableQty: Number(r.available_qty),
          averageCost: Number(r.average_cost),
          totalValue: Number(r.total_value),
          updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
        },
      };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listWarehouseStock(
    tenantId: string,
    warehouseId?: string,
    itemId?: string
  ): Promise<StorageResult<WarehouseStock[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_warehouse_stock WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (warehouseId) {
        params.push(warehouseId);
        queryStr += ` AND warehouse_id = $${params.length}`;
      }
      if (itemId) {
        params.push(itemId);
        queryStr += ` AND item_id = $${params.length}`;
      }
      queryStr += ` ORDER BY updated_at DESC`;

      const res = await this.query(queryStr, params);
      const list: WarehouseStock[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        warehouseId: r.warehouse_id,
        itemId: r.item_id,
        currentQty: Number(r.current_qty),
        reservedQty: Number(r.reserved_qty),
        availableQty: Number(r.available_qty),
        averageCost: Number(r.average_cost),
        totalValue: Number(r.total_value),
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Phase 10 (STK-ATOMIC-001): the single source of the stock-movement math and SQL. Runs inside the caller's transaction
  // (the caller owns BEGIN/COMMIT/ROLLBACK, the tenant GUC and the idempotency reservation).
  // Default options reproduce exactly what recordStockMovement did before this refactor.
  private async applyMovementInTx(
    client: PoolClient,
    tenantId: string,
    movement: StockMovement,
    idempotencyKey: string,
    opts?: { lockedOutgoingCost?: boolean; rejectNegative?: boolean }
  ): Promise<{ ok: true; newQty: number; unitCostUsed: number; totalCostUsed: number; saved: StockMovement } | { ok: false; error: RFC7807Problem }> {
      // Check warehouse stock row with FOR UPDATE lock
      const stockRes = await client.query(
        `SELECT * FROM an_warehouse_stock WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3 FOR UPDATE`,
        [tenantId, movement.warehouseId, movement.itemId]
      );

      let currentQty = 0;
      let totalValue = 0;
      let averageCost = movement.unitCost;

      if (stockRes.rows.length > 0) {
        currentQty = Number(stockRes.rows[0].current_qty);
        totalValue = Number(stockRes.rows[0].total_value);
        averageCost = Number(stockRes.rows[0].average_cost);
      }

      // Calculate quantity delta based on movement type
      let qtyDelta = 0;
      let valueDelta = 0;
      let unitCostUsed = movement.unitCost;
      let totalCostUsed = movement.totalCost;

      if (movement.movementType === 'RECEIPT' || movement.movementType === 'TRANSFER_IN' || movement.movementType === 'COUNT_ADJUSTMENT_GAIN') {
        qtyDelta = Math.abs(movement.quantity);
        valueDelta = qtyDelta * movement.unitCost;
      } else if (movement.movementType === 'ISSUE' || movement.movementType === 'TRANSFER_OUT' || movement.movementType === 'COUNT_ADJUSTMENT_LOSS') {
        qtyDelta = -Math.abs(movement.quantity);
        valueDelta = qtyDelta * (averageCost > 0 ? averageCost : movement.unitCost);
      }

      const newQty = currentQty + qtyDelta;
      if (opts?.rejectNegative && qtyDelta < 0 && newQty < -0.00005) {
        // Fail closed BEFORE any permanent change (the caller rolls the transaction back)
        return {
          ok: false,
          error: {
            type: 'https://api.an-erp.local/errors/insufficient-stock',
            title: 'الرصيد المخزني غير كافٍ',
            status: 422,
            detail: `الرصيد المتاح للصنف ${movement.itemNameAr} (${currentQty}) أقل من الكمية المطلوبة للصرف (${Math.abs(movement.quantity)}). فشلت العملية بالكامل ذرياً.`,
          },
        };
      }
      if (opts?.lockedOutgoingCost && qtyDelta < 0) {
        // Outgoing cost = weighted average of the LOCKED balance row at execution time (not the service's earlier read)
        unitCostUsed = averageCost > 0 ? averageCost : movement.unitCost;
        totalCostUsed = Math.round(Math.abs(movement.quantity) * unitCostUsed * 100) / 100;
      }
      // Phase 13 (COST-001): FIFO / SPECIFIC_LOT items use cost layers. WEIGHTED_AVERAGE items skip this block entirely (no layers, no extra writes).
      const valuationMethod = await this.getItemValuationMethodInTx(client, tenantId, movement.itemId);
      if (valuationMethod !== 'WEIGHTED_AVERAGE') {
        const layerRes = await this.applyCostLayersInTx(client, tenantId, movement, qtyDelta, valuationMethod);
        if (!layerRes.ok) return layerRes;
        // a transferred-in layer carries the exact transferred value (unit cost is rounded to 4 decimals), so the total value is preserved
        if (qtyDelta > 0 && movement.movementType === 'TRANSFER_IN' && movement.totalCost > 0) valueDelta = movement.totalCost;
        if (qtyDelta < 0) {
          valueDelta = -layerRes.totalCost;
          if (!opts || opts.lockedOutgoingCost) {
            unitCostUsed = layerRes.unitCost;
            totalCostUsed = Math.round(layerRes.totalCost * 100) / 100;
          }
        }
      }
      const newTotalValue = Math.max(0, totalValue + valueDelta);
      const newAverageCost = newQty > 0 ? newTotalValue / newQty : (movement.unitCost > 0 ? movement.unitCost : averageCost);

      const stockId = stockRes.rows.length > 0 ? stockRes.rows[0].id : `stk-${movement.warehouseId}-${movement.itemId}`;
      const nowIso = new Date().toISOString();

      await client.query(
        `INSERT INTO an_warehouse_stock (
          id, tenant_id, company_id, warehouse_id, item_id, current_qty, reserved_qty, available_qty, average_cost, total_value, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, $6, $7, $8, $9)
        ON CONFLICT (tenant_id, warehouse_id, item_id) DO UPDATE SET
          current_qty = EXCLUDED.current_qty,
          available_qty = EXCLUDED.available_qty,
          average_cost = EXCLUDED.average_cost,
          total_value = EXCLUDED.total_value,
          updated_at = EXCLUDED.updated_at`,
        [
          stockId,
          tenantId,
          movement.companyId || tenantId,
          movement.warehouseId,
          movement.itemId,
          newQty,
          newAverageCost,
          newTotalValue,
          nowIso,
        ]
      );

      // Update global item average cost and last purchase cost if receipt
      if (movement.movementType === 'RECEIPT' && movement.unitCost > 0) {
        await client.query(
          `UPDATE an_stock_items SET
            average_cost = $1,
            last_purchase_cost = $2,
            updated_at = $3
          WHERE tenant_id = $4 AND id = $5`,
          [newAverageCost, movement.unitCost, nowIso, tenantId, movement.itemId]
        );
      }

      // Insert stock movement record
      await client.query(
        `INSERT INTO an_stock_movements (
          id, tenant_id, company_id, movement_number, movement_type,
          warehouse_id, warehouse_name_ar, bin_id, item_id, item_code, item_name_ar,
          quantity, unit_cost, total_cost, balance_after_qty,
          source_document_type, source_document_id, source_document_number,
          journal_entry_id, batch_number, serial_number, notes,
          performed_by, performed_by_name, timestamp, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          movement.id,
          tenantId,
          movement.companyId || tenantId,
          movement.movementNumber,
          movement.movementType,
          movement.warehouseId,
          movement.warehouseNameAr || null,
          movement.binId || null,
          movement.itemId,
          movement.itemCode,
          movement.itemNameAr,
          movement.quantity,
          unitCostUsed,
          totalCostUsed,
          newQty,
          movement.sourceDocumentType || null,
          movement.sourceDocumentId || null,
          movement.sourceDocumentNumber || null,
          movement.journalEntryId || null,
          movement.batchNumber || null,
          movement.serialNumber || null,
          movement.notes || null,
          movement.performedBy,
          movement.performedByName,
          movement.timestamp || nowIso,
          idempotencyKey,
        ]
      );

      // Update Batch if provided
      if (movement.batchNumber) {
        const batchDelta = (movement.movementType === 'RECEIPT' || movement.movementType === 'TRANSFER_IN')
          ? Math.abs(movement.quantity)
          : -Math.abs(movement.quantity);
        await client.query(
          `INSERT INTO an_item_batches (
            id, tenant_id, company_id, item_id, warehouse_id, batch_number, current_qty, unit_cost, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (tenant_id, warehouse_id, item_id, batch_number) DO UPDATE SET
            current_qty = GREATEST(0, an_item_batches.current_qty + $10)`,
          [
            `bat-${movement.warehouseId}-${movement.itemId}-${movement.batchNumber}`,
            tenantId,
            movement.companyId || tenantId,
            movement.itemId,
            movement.warehouseId,
            movement.batchNumber,
            Math.max(0, batchDelta),
            movement.unitCost,
            nowIso,
            batchDelta,
          ]
        );
      }

      const saved: StockMovement = {
        ...movement,
        unitCost: unitCostUsed,
        totalCost: totalCostUsed,
        balanceAfterQty: newQty,
        idempotencyKey,
      };
      return { ok: true, newQty, unitCostUsed, totalCostUsed, saved };
  }

  // Phase 13 (COST-001): valuation method of an item, read AFTER the warehouse-stock row lock (a method change locks the same rows first).
  private async getItemValuationMethodInTx(client: PoolClient, tenantId: string, itemId: string): Promise<'WEIGHTED_AVERAGE' | 'FIFO' | 'SPECIFIC_LOT'> {
    const r = await client.query(`SELECT valuation_method FROM an_stock_items WHERE tenant_id = $1 AND id = $2`, [tenantId, itemId]);
    const m = r.rows[0]?.valuation_method;
    if (m === 'FIFO' || m === 'SPECIFIC_LOT') return m;
    if (m === 'STANDARD_COST') console.warn(`[phase-13] item ${itemId} is stored as STANDARD_COST (unsupported) -> treated as WEIGHTED_AVERAGE`);
    return 'WEIGHTED_AVERAGE';
  }

  // Phase 13 (COST-001): entry = insert a layer; exit = lock open layers (oldest first), plan, then consume. Returns BEFORE any write when the layers cannot cover the quantity.
  private async applyCostLayersInTx(
    client: PoolClient,
    tenantId: string,
    movement: StockMovement,
    qtyDelta: number,
    method: 'FIFO' | 'SPECIFIC_LOT'
  ): Promise<{ ok: true; totalCost: number; unitCost: number } | { ok: false; error: RFC7807Problem }> {
    if (qtyDelta > 0) {
      const po = movement.sourcePoNumber || (movement.sourceDocumentType === 'PURCHASE_ORDER' ? movement.sourceDocumentNumber : null) || null;
      await client.query(
        `INSERT INTO an_stock_cost_layers (id, tenant_id, warehouse_id, item_id, source_document_type, source_document_id, source_document_number, po_number, received_at, original_qty, remaining_qty, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp(), $9, $9, $10)`,
        [`lyr-${movement.id}-${Math.random().toString(36).substr(2, 4)}`, tenantId, movement.warehouseId, movement.itemId, movement.sourceDocumentType || null, movement.sourceDocumentId || null,
         movement.sourceDocumentNumber || null, po, qtyDelta, movement.unitCost]
      );
      return { ok: true, totalCost: 0, unitCost: 0 };
    }
    if (qtyDelta < 0) {
      const qty = Math.abs(qtyDelta);
      const layersRes = await client.query(
        `SELECT id, po_number, remaining_qty, unit_cost FROM an_stock_cost_layers
          WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3 AND remaining_qty > 0 AND is_closed = FALSE
          ORDER BY received_at ASC, created_at ASC, id ASC FOR UPDATE`,
        [tenantId, movement.warehouseId, movement.itemId]
      );
      const plan = planCostLayerConsumption(
        layersRes.rows.map((l: any) => ({ id: l.id, poNumber: l.po_number, remainingQty: Number(l.remaining_qty), unitCost: Number(l.unit_cost) })),
        qty, method, movement.sourcePoNumber
      );
      if (!plan.ok) {
        return {
          ok: false,
          error: plan.code === 'insufficient-lot-stock'
            ? { type: 'https://api.an-erp.local/errors/insufficient-lot-stock', title: 'رصيد أمر الشراء غير كافٍ', status: 422,
                detail: `رصيد أمر الشراء ${movement.sourcePoNumber} للصنف ${movement.itemNameAr} (${plan.available}) أقل من الكمية المطلوبة (${qty}). فشلت العملية بالكامل ذرياً.` }
            : { type: 'https://api.an-erp.local/errors/insufficient-stock', title: 'الرصيد المخزني غير كافٍ', status: 422,
                detail: `رصيد طبقات التكلفة للصنف ${movement.itemNameAr} (${plan.available}) أقل من الكمية المطلوبة للصرف (${qty}). فشلت العملية بالكامل ذرياً.` },
        };
      }
      for (const t of plan.takes) {
        await client.query(
          `UPDATE an_stock_cost_layers SET remaining_qty = $1, is_closed = $2 WHERE tenant_id = $3 AND id = $4`,
          [t.newRemaining, t.newRemaining <= 0.00005, tenantId, t.layerId]
        );
      }
      return { ok: true, totalCost: plan.totalCost, unitCost: plan.unitCost };
    }
    return { ok: true, totalCost: 0, unitCost: 0 };
  }

  // Phase 13 (COST-001): per-tenant inventory settings
  public async getInventorySettings(tenantId: string): Promise<StorageResult<InventorySettings>> {
    if (!this.pool) return this.missingConnError();
    return this.withTenantScope(tenantId, async () => {
      try {
        const res = await this.query('SELECT * FROM an_inventory_settings WHERE tenant_id = $1', [tenantId]);
        if (res.rows.length === 0) return { success: true as const, data: defaultInventorySettings(tenantId) };
        const r = res.rows[0];
        return {
          success: true as const,
          data: {
            tenantId,
            defaultValuationMethod: r.default_valuation_method,
            allowNegativeStock: !!r.allow_negative_stock,
            overReceiptTolerancePct: Number(r.over_receipt_tolerance_pct),
            updatedBy: r.updated_by || undefined,
            updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
          },
        };
      } catch (err: any) {
        return this.dbError(err);
      }
    });
  }

  public async saveInventorySettings(tenantId: string, settings: Partial<Omit<InventorySettings, 'tenantId'>>, actorId: string, idempotencyKey: string): Promise<StorageResult<InventorySettings>> {
    if (!this.pool) return this.missingConnError();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'saveInventorySettings');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }
      const cur = await client.query('SELECT * FROM an_inventory_settings WHERE tenant_id = $1 FOR UPDATE', [tenantId]);
      const base = defaultInventorySettings(tenantId);
      const method = settings.defaultValuationMethod ?? (cur.rows[0]?.default_valuation_method ?? base.defaultValuationMethod);
      const allowNeg = settings.allowNegativeStock ?? (cur.rows[0] ? !!cur.rows[0].allow_negative_stock : base.allowNegativeStock);
      const tol = settings.overReceiptTolerancePct ?? (cur.rows[0] ? Number(cur.rows[0].over_receipt_tolerance_pct) : base.overReceiptTolerancePct);
      const res = await client.query(
        `INSERT INTO an_inventory_settings (tenant_id, default_valuation_method, allow_negative_stock, over_receipt_tolerance_pct, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           default_valuation_method = EXCLUDED.default_valuation_method,
           allow_negative_stock = EXCLUDED.allow_negative_stock,
           over_receipt_tolerance_pct = EXCLUDED.over_receipt_tolerance_pct,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING *`,
        [tenantId, method, allowNeg, tol, actorId]
      );
      const r = res.rows[0];
      const saved: InventorySettings = {
        tenantId,
        defaultValuationMethod: r.default_valuation_method,
        allowNegativeStock: !!r.allow_negative_stock,
        overReceiptTolerancePct: Number(r.over_receipt_tolerance_pct),
        updatedBy: r.updated_by || undefined,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
      };
      await this.completeIdempotency(client, tenantId, idempotencyKey, 'saveInventorySettings', saved);
      await client.query('COMMIT');
      return { success: true, data: saved };
    } catch (err: any) {
      try { await client.query('ROLLBACK'); } catch (rbErr: any) { console.warn('[PostgresPrimaryAdapter] saveInventorySettings ROLLBACK failed:', rbErr?.message); }
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async getStockAccountingConfig(tenantId: string): Promise<any> {
    const { defaultStockAccountingConfig } = await import('../StoragePort');
    try {
      const r = await this.pool.query(`SELECT * FROM an_stock_accounting_config WHERE tenant_id = $1`, [tenantId]);
      if (!r.rows.length) return { success: true, data: defaultStockAccountingConfig(tenantId) };
      const row = r.rows[0];
      return { success: true, data: {
        tenantId, autoPostEnabled: !!row.auto_post_enabled, grirAccountCode: row.grir_account_code,
        inTransitAccountCode: row.in_transit_account_code, defaultInventoryAccountCode: row.default_inventory_account_code,
        defaultCogsAccountCode: row.default_cogs_account_code, updatedBy: row.updated_by || undefined,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
      }};
    } catch (e: any) { return { success: false, error: { type: 'db', title: 'db', status: 500, detail: e.message } }; }
  }
  public async saveStockAccountingConfig(tenantId: string, settings: any, actorId: string, _k: string): Promise<any> {
    const { defaultStockAccountingConfig } = await import('../StoragePort');
    try {
      const curRes = await this.getStockAccountingConfig(tenantId);
      const cur = curRes.success && curRes.data ? curRes.data : defaultStockAccountingConfig(tenantId);
      const next = { ...cur, ...settings, tenantId, updatedBy: actorId, updatedAt: new Date().toISOString() };
      await this.pool.query(`INSERT INTO an_stock_accounting_config (tenant_id, auto_post_enabled, grir_account_code, in_transit_account_code, default_inventory_account_code, default_cogs_account_code, updated_by, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT (tenant_id) DO UPDATE SET auto_post_enabled=EXCLUDED.auto_post_enabled, grir_account_code=EXCLUDED.grir_account_code, in_transit_account_code=EXCLUDED.in_transit_account_code, default_inventory_account_code=EXCLUDED.default_inventory_account_code, default_cogs_account_code=EXCLUDED.default_cogs_account_code, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
        [tenantId, !!next.autoPostEnabled, next.grirAccountCode, next.inTransitAccountCode, next.defaultInventoryAccountCode, next.defaultCogsAccountCode, actorId]);
      return { success: true, data: next };
    } catch (e: any) { return { success: false, error: { type: 'db', title: 'db', status: 500, detail: e.message } }; }
  }
  public async setStockDocumentJournal(tenantId: string, docId: string, journalEntryId: string | null, status: any): Promise<any> {
    try {
      await this.pool.query(`UPDATE an_stock_documents SET journal_entry_id=$1, journal_status=$2 WHERE tenant_id=$3 AND id=$4`, [journalEntryId, status, tenantId, docId]);
      return { success: true, data: undefined };
    } catch (e: any) { return { success: false, error: { type: 'db', title: 'db', status: 500, detail: e.message } }; }
  }
  public async setStockTransferJournal(tenantId: string, transferId: string, which: any, journalEntryId: string | null, status: any): Promise<any> {
    try {
      if (which === 'DISPATCH') await this.pool.query(`UPDATE an_stock_transfers SET dispatch_journal_entry_id=$1, journal_status=$2 WHERE tenant_id=$3 AND id=$4`, [journalEntryId, status, tenantId, transferId]);
      else await this.pool.query(`UPDATE an_stock_transfers SET receive_journal_entry_id=$1, journal_status=$2 WHERE tenant_id=$3 AND id=$4`, [journalEntryId, status, tenantId, transferId]);
      return { success: true, data: undefined };
    } catch (e: any) { return { success: false, error: { type: 'db', title: 'db', status: 500, detail: e.message } }; }
  }

  public async recordStockMovement(
    tenantId: string,
    movement: StockMovement,
    idempotencyKey: string
  ): Promise<StorageResult<StockMovement>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'recordStockMovement');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      const applied = await this.applyMovementInTx(client, tenantId, movement, idempotencyKey);
      if (!applied.ok) {
        await client.query('ROLLBACK');
        return { success: false, error: (applied as any).error };
      }
      const savedMovement: StockMovement = applied.saved;

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'recordStockMovement', savedMovement);

      await client.query('COMMIT');
      return { success: true, data: savedMovement };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async listStockMovements(
    tenantId: string,
    filter?: { warehouseId?: string; itemId?: string; movementType?: string; limit?: number }
  ): Promise<StorageResult<StockMovement[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_stock_movements WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (filter?.warehouseId) {
        params.push(filter.warehouseId);
        queryStr += ` AND warehouse_id = $${params.length}`;
      }
      if (filter?.itemId) {
        params.push(filter.itemId);
        queryStr += ` AND item_id = $${params.length}`;
      }
      if (filter?.movementType) {
        params.push(filter.movementType);
        queryStr += ` AND movement_type = $${params.length}`;
      }
      queryStr += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
      params.push(filter?.limit || 100);

      const res = await this.query(queryStr, params);
      const list: StockMovement[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        movementNumber: r.movement_number,
        movementType: r.movement_type,
        warehouseId: r.warehouse_id,
        warehouseNameAr: r.warehouse_name_ar || undefined,
        binId: r.bin_id || undefined,
        itemId: r.item_id,
        itemCode: r.item_code,
        itemNameAr: r.item_name_ar,
        quantity: Number(r.quantity),
        unitCost: Number(r.unit_cost),
        totalCost: Number(r.total_cost),
        balanceAfterQty: Number(r.balance_after_qty),
        sourceDocumentType: r.source_document_type || undefined,
        sourceDocumentId: r.source_document_id || undefined,
        sourceDocumentNumber: r.source_document_number || undefined,
        journalEntryId: r.journal_entry_id || undefined,
        batchNumber: r.batch_number || undefined,
        serialNumber: r.serial_number || undefined,
        notes: r.notes || undefined,
        performedBy: r.performed_by,
        performedByName: r.performed_by_name,
        timestamp: r.timestamp?.toISOString?.() || r.timestamp,
        idempotencyKey: r.idempotency_key || undefined,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Phase 11 (STK-ATOMIC-002): send or receive a transfer in ONE transaction, fail-closed.
  public async postStockTransferAtomic(
    tenantId: string,
    input: PostStockTransferAtomicInput,
    idempotencyKey: string
  ): Promise<StorageResult<StockTransfer>> {
    if (!this.pool) return this.missingConnError();
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const problem = (status: number, type: string, title: string, detail: string): StorageResult<StockTransfer> => ({
      success: false,
      error: { type: `https://api.an-erp.local/errors/${type}`, title, status, detail },
    });
    if (input.mode === 'DISPATCH' && (!input.lines || input.lines.length === 0)) {
      return problem(400, 'invalid-transfer', 'تحويل غير صالح', 'لا توجد أسطر في مستند التحويل.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'postStockTransferAtomic');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      if (input.mode === 'DISPATCH') {
        const t = input.transfer;
        await this.lockStockRowsInTx(client, tenantId, t.companyId || tenantId, input.lines.map(l => ({ warehouseId: t.sourceWarehouseId, itemId: l.itemId })));
        const lines = input.lines.map(l => ({ ...l }));
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const lineKey = `${idempotencyKey}-out-${i}`;
          const applied = await this.applyMovementInTx(client, tenantId, {
            id: `mov-trf-out-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
            tenantId,
            companyId: tenantId,
            movementNumber: `MOV-${t.transferNumber}-OUT-${i + 1}`,
            movementType: 'TRANSFER_OUT',
            warehouseId: t.sourceWarehouseId,
            warehouseNameAr: t.sourceWarehouseNameAr,
            itemId: l.itemId,
            itemCode: l.itemCode,
            itemNameAr: l.itemNameAr,
            quantity: l.quantity,
            unitCost: l.unitCost,
            totalCost: l.totalCost,
            balanceAfterQty: 0,
            sourceDocumentType: 'STOCK_TRANSFER',
            sourceDocumentId: t.id,
            sourceDocumentNumber: t.transferNumber,
            performedBy: input.actorId,
            performedByName: input.actorName,
            timestamp: new Date().toISOString(),
            idempotencyKey: lineKey,
          }, lineKey, { lockedOutgoingCost: true, rejectNegative: true });
          if (!applied.ok) {
            await client.query('ROLLBACK');
            return { success: false, error: (applied as any).error };
          }
          l.unitCost = applied.unitCostUsed;
          l.totalCost = applied.totalCostUsed;
        }
        const finalTransfer: StockTransfer = {
          ...t,
          status: 'IN_TRANSIT',
          totalItemsCount: lines.length,
          totalCost: round2(lines.reduce((sum, l) => sum + Number(l.totalCost || 0), 0)),
        };
        await this.insertStockTransferInTx(client, tenantId, finalTransfer, lines, idempotencyKey);
        await this.completeIdempotency(client, tenantId, idempotencyKey, 'postStockTransferAtomic', finalTransfer);
        await client.query('COMMIT');
        return { success: true, data: finalTransfer };
      }

      // RECEIVE — the transfer row lock serialises concurrent receivers (even with different idempotency keys)
      const sel = await client.query(
        `SELECT * FROM an_stock_transfers WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, input.transfer.id]
      );
      if (sel.rows.length === 0) {
        await client.query('ROLLBACK');
        return problem(404, 'transfer-not-found', 'مستند التحويل غير موجود', 'تعذر العثور على مستند التحويل المطلوب استلامه.');
      }
      const row = sel.rows[0];
      if (row.status !== 'IN_TRANSIT') {
        await client.query('ROLLBACK');
        return problem(409, 'invalid-transfer-status', 'حالة التحويل لا تسمح بالاستلام', `المستند حالياً في حالة (${row.status}) ولا يمكن استلامه مجدداً.`);
      }
      const linesRes = await client.query(
        `SELECT * FROM an_stock_transfer_lines WHERE tenant_id = $1 AND transfer_id = $2 ORDER BY id`,
        [tenantId, row.id]
      );
      await this.lockStockRowsInTx(client, tenantId, row.company_id || tenantId, linesRes.rows.map((l: any) => ({ warehouseId: row.target_warehouse_id, itemId: l.item_id })));
      for (let i = 0; i < linesRes.rows.length; i++) {
        const l = linesRes.rows[i];
        const lineKey = `${idempotencyKey}-in-${i}`;
        const applied = await this.applyMovementInTx(client, tenantId, {
          id: `mov-trf-in-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
          tenantId,
          companyId: tenantId,
          movementNumber: `MOV-${row.transfer_number}-IN-${i + 1}`,
          movementType: 'TRANSFER_IN',
          warehouseId: row.target_warehouse_id,
          warehouseNameAr: row.target_warehouse_name_ar,
          itemId: l.item_id,
          itemCode: l.item_code,
          itemNameAr: l.item_name_ar,
          quantity: Number(l.quantity),
          unitCost: Number(l.unit_cost),
          totalCost: Number(l.total_cost),
          balanceAfterQty: 0,
          sourceDocumentType: 'STOCK_TRANSFER',
          sourceDocumentId: row.id,
          sourceDocumentNumber: row.transfer_number,
          performedBy: input.actorId,
          performedByName: input.actorName,
          timestamp: new Date().toISOString(),
          idempotencyKey: lineKey,
        }, lineKey);
        if (!applied.ok) {
          await client.query('ROLLBACK');
          return { success: false, error: (applied as any).error };
        }
      }
      const updated = await this.applyTransferStatusInTx(client, tenantId, row.id, row, 'RECEIVED', input.actorId, input.actorName, idempotencyKey);
      await this.completeIdempotency(client, tenantId, idempotencyKey, 'postStockTransferAtomic', updated);
      await client.query('COMMIT');
      return { success: true, data: updated };
    } catch (err: any) {
      try { await client.query('ROLLBACK'); } catch (rbErr: any) { console.warn('[PostgresPrimaryAdapter] postStockTransferAtomic ROLLBACK failed:', rbErr?.message); }
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  // Phase 11 (STK-ATOMIC-002): transfer + lines insert, shared by createStockTransfer and postStockTransferAtomic
  private async insertStockTransferInTx(client: PoolClient, tenantId: string, transfer: StockTransfer, lines: StockTransferLine[], idempotencyKey: string): Promise<void> {
      await client.query(
        `INSERT INTO an_stock_transfers (
          id, tenant_id, company_id, transfer_number,
          source_warehouse_id, source_warehouse_name_ar,
          target_warehouse_id, target_warehouse_name_ar,
          status, requested_by, requested_by_name, requested_at,
          total_items_count, total_quantity, total_cost, notes,
          created_at, updated_at, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          transfer.id,
          tenantId,
          transfer.companyId || tenantId,
          transfer.transferNumber,
          transfer.sourceWarehouseId,
          transfer.sourceWarehouseNameAr,
          transfer.targetWarehouseId,
          transfer.targetWarehouseNameAr,
          transfer.status || 'DRAFT',
          transfer.requestedBy,
          transfer.requestedByName,
          transfer.requestedAt || new Date().toISOString(),
          lines.length,
          transfer.totalQuantity,
          transfer.totalCost,
          transfer.notes || null,
          new Date().toISOString(),
          new Date().toISOString(),
          idempotencyKey,
        ]
      );

      for (const line of lines) {
        await client.query(
          `INSERT INTO an_stock_transfer_lines (
            id, tenant_id, company_id, transfer_id, item_id, item_code, item_name_ar,
            quantity, unit_cost, total_cost, batch_number, serial_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            line.id,
            tenantId,
            line.companyId || tenantId,
            transfer.id,
            line.itemId,
            line.itemCode,
            line.itemNameAr,
            line.quantity,
            line.unitCost,
            line.totalCost,
            line.batchNumber || null,
            line.serialNumber || null,
          ]
        );
      }

  }

  public async createStockTransfer(
    tenantId: string,
    transfer: StockTransfer,
    lines: StockTransferLine[],
    idempotencyKey: string
  ): Promise<StorageResult<StockTransfer>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'createStockTransfer');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      await this.insertStockTransferInTx(client, tenantId, transfer, lines, idempotencyKey);

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'createStockTransfer', transfer);

      await client.query('COMMIT');
      return { success: true, data: transfer };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async getStockTransfer(
    tenantId: string,
    transferId: string
  ): Promise<StorageResult<{ transfer: StockTransfer; lines: StockTransferLine[] } | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_stock_transfers WHERE tenant_id = $1 AND (id = $2 OR transfer_number = $2)`,
        [tenantId, transferId]
      );
      if (res.rows.length === 0) return { success: true, data: null };
      const r = res.rows[0];
      const transfer: StockTransfer = {
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        transferNumber: r.transfer_number,
        sourceWarehouseId: r.source_warehouse_id,
        sourceWarehouseNameAr: r.source_warehouse_name_ar,
        targetWarehouseId: r.target_warehouse_id,
        targetWarehouseNameAr: r.target_warehouse_name_ar,
        status: r.status,
        requestedBy: r.requested_by,
        requestedByName: r.requested_by_name,
        requestedAt: r.requested_at?.toISOString?.() || r.requested_at,
        dispatchedBy: r.dispatched_by || undefined,
        dispatchedByName: r.dispatched_by_name || undefined,
        dispatchedAt: r.dispatched_at?.toISOString?.() || r.dispatched_at || undefined,
        receivedBy: r.received_by || undefined,
        receivedByName: r.received_by_name || undefined,
        receivedAt: r.received_at?.toISOString?.() || r.received_at || undefined,
        totalItemsCount: Number(r.total_items_count),
        totalQuantity: Number(r.total_quantity),
        totalCost: Number(r.total_cost),
        notes: r.notes || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
        idempotencyKey: r.idempotency_key || undefined,
      };

      const linesRes = await this.query(
        `SELECT * FROM an_stock_transfer_lines WHERE tenant_id = $1 AND transfer_id = $2`,
        [tenantId, transfer.id]
      );
      const lines: StockTransferLine[] = linesRes.rows.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        companyId: l.company_id,
        transferId: l.transfer_id,
        itemId: l.item_id,
        itemCode: l.item_code,
        itemNameAr: l.item_name_ar,
        quantity: Number(l.quantity),
        unitCost: Number(l.unit_cost),
        totalCost: Number(l.total_cost),
        batchNumber: l.batch_number || undefined,
        serialNumber: l.serial_number || undefined,
      }));

      return { success: true, data: { transfer, lines } };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listStockTransfers(
    tenantId: string,
    filter?: { status?: string; warehouseId?: string }
  ): Promise<StorageResult<StockTransfer[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_stock_transfers WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (filter?.status) {
        params.push(filter.status);
        queryStr += ` AND status = $${params.length}`;
      }
      if (filter?.warehouseId) {
        params.push(filter.warehouseId);
        queryStr += ` AND (source_warehouse_id = $${params.length} OR target_warehouse_id = $${params.length})`;
      }
      queryStr += ` ORDER BY created_at DESC`;

      const res = await this.query(queryStr, params);
      const list: StockTransfer[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        transferNumber: r.transfer_number,
        sourceWarehouseId: r.source_warehouse_id,
        sourceWarehouseNameAr: r.source_warehouse_name_ar,
        targetWarehouseId: r.target_warehouse_id,
        targetWarehouseNameAr: r.target_warehouse_name_ar,
        status: r.status,
        requestedBy: r.requested_by,
        requestedByName: r.requested_by_name,
        requestedAt: r.requested_at?.toISOString?.() || r.requested_at,
        dispatchedBy: r.dispatched_by || undefined,
        dispatchedByName: r.dispatched_by_name || undefined,
        dispatchedAt: r.dispatched_at?.toISOString?.() || r.dispatched_at || undefined,
        receivedBy: r.received_by || undefined,
        receivedByName: r.received_by_name || undefined,
        receivedAt: r.received_at?.toISOString?.() || r.received_at || undefined,
        totalItemsCount: Number(r.total_items_count),
        totalQuantity: Number(r.total_quantity),
        totalCost: Number(r.total_cost),
        notes: r.notes || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
        idempotencyKey: r.idempotency_key || undefined,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // Phase 11 (STK-ATOMIC-002): status UPDATE + mapping of the updated transfer, shared by updateStockTransferStatus and postStockTransferAtomic
  private async applyTransferStatusInTx(
    client: PoolClient,
    tenantId: string,
    transferId: string,
    existing: any,
    status: StockTransferStatus,
    actorId: string,
    actorName: string,
    idempotencyKey: string
  ): Promise<StockTransfer> {
      const nowIso = new Date().toISOString();

      let dispatchedBy = existing.dispatched_by;
      let dispatchedByName = existing.dispatched_by_name;
      let dispatchedAt = existing.dispatched_at;
      let receivedBy = existing.received_by;
      let receivedByName = existing.received_by_name;
      let receivedAt = existing.received_at;

      if (status === 'IN_TRANSIT') {
        dispatchedBy = actorId;
        dispatchedByName = actorName;
        dispatchedAt = nowIso;
      } else if (status === 'RECEIVED') {
        receivedBy = actorId;
        receivedByName = actorName;
        receivedAt = nowIso;
      }

      await client.query(
        `UPDATE an_stock_transfers SET
          status = $1,
          dispatched_by = $2,
          dispatched_by_name = $3,
          dispatched_at = $4,
          received_by = $5,
          received_by_name = $6,
          received_at = $7,
          updated_at = $8,
          idempotency_key = $9
        WHERE tenant_id = $10 AND id = $11`,
        [
          status,
          dispatchedBy,
          dispatchedByName,
          dispatchedAt,
          receivedBy,
          receivedByName,
          receivedAt,
          nowIso,
          idempotencyKey,
          tenantId,
          transferId,
        ]
      );

      const updated: StockTransfer = {
        id: existing.id,
        tenantId: existing.tenant_id,
        companyId: existing.company_id,
        transferNumber: existing.transfer_number,
        sourceWarehouseId: existing.source_warehouse_id,
        sourceWarehouseNameAr: existing.source_warehouse_name_ar,
        targetWarehouseId: existing.target_warehouse_id,
        targetWarehouseNameAr: existing.target_warehouse_name_ar,
        status,
        requestedBy: existing.requested_by,
        requestedByName: existing.requested_by_name,
        requestedAt: existing.requested_at?.toISOString?.() || existing.requested_at,
        dispatchedBy: dispatchedBy || undefined,
        dispatchedByName: dispatchedByName || undefined,
        dispatchedAt: dispatchedAt?.toISOString?.() || dispatchedAt || undefined,
        receivedBy: receivedBy || undefined,
        receivedByName: receivedByName || undefined,
        receivedAt: receivedAt?.toISOString?.() || receivedAt || undefined,
        totalItemsCount: Number(existing.total_items_count),
        totalQuantity: Number(existing.total_quantity),
        totalCost: Number(existing.total_cost),
        notes: existing.notes || undefined,
        createdAt: existing.created_at?.toISOString?.() || existing.created_at,
        updatedAt: nowIso,
        idempotencyKey,
      };

      return updated;
  }

  public async updateStockTransferStatus(
    tenantId: string,
    transferId: string,
    status: StockTransferStatus,
    actorId: string,
    actorName: string,
    idempotencyKey: string
  ): Promise<StorageResult<StockTransfer>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'updateStockTransferStatus');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      const selRes = await client.query(
        `SELECT * FROM an_stock_transfers WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, transferId]
      );
      if (selRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/transfer-not-found',
            title: 'Stock Transfer Not Found',
            status: 404,
            detail: `Stock transfer ${transferId} was not found`,
            instance: `/api/inventory/transfers/${transferId}`,
          },
        };
      }

      const existing = selRes.rows[0];
      const updated = await this.applyTransferStatusInTx(client, tenantId, transferId, existing, status, actorId, actorName, idempotencyKey);

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'updateStockTransferStatus', updated);

      await client.query('COMMIT');
      return { success: true, data: updated };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async createStockCount(
    tenantId: string,
    count: StockCount,
    lines: StockCountLine[],
    idempotencyKey: string
  ): Promise<StorageResult<StockCount>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'createStockCount');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      await client.query(
        `INSERT INTO an_stock_counts (
          id, tenant_id, company_id, count_number, count_type,
          warehouse_id, warehouse_name_ar, status,
          performed_by, performed_by_name, performed_at,
          total_items_count, has_variance, net_variance_amount,
          notes, created_at, updated_at, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          count.id,
          tenantId,
          count.companyId || tenantId,
          count.countNumber,
          count.countType || 'PERIODIC',
          count.warehouseId,
          count.warehouseNameAr,
          count.status || 'COMPLETED',
          count.performedBy,
          count.performedByName,
          count.performedAt || new Date().toISOString(),
          lines.length,
          count.hasVariance,
          count.netVarianceAmount,
          count.notes || null,
          new Date().toISOString(),
          new Date().toISOString(),
          idempotencyKey,
        ]
      );

      for (const line of lines) {
        await client.query(
          `INSERT INTO an_stock_count_lines (
            id, tenant_id, company_id, count_id, item_id, item_code, item_name_ar,
            system_qty, counted_qty, variance_qty, unit_cost, variance_amount,
            batch_number, serial_number, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            line.id,
            tenantId,
            line.companyId || tenantId,
            count.id,
            line.itemId,
            line.itemCode,
            line.itemNameAr,
            line.systemQty,
            line.countedQty,
            line.varianceQty,
            line.unitCost,
            line.varianceAmount,
            line.batchNumber || null,
            line.serialNumber || null,
            line.notes || null,
          ]
        );
      }

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'createStockCount', count);

      await client.query('COMMIT');
      return { success: true, data: count };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async getStockCount(
    tenantId: string,
    countId: string
  ): Promise<StorageResult<{ count: StockCount; lines: StockCountLine[] } | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_stock_counts WHERE tenant_id = $1 AND (id = $2 OR count_number = $2)`,
        [tenantId, countId]
      );
      if (res.rows.length === 0) return { success: true, data: null };
      const r = res.rows[0];
      const count: StockCount = {
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        countNumber: r.count_number,
        countType: r.count_type,
        warehouseId: r.warehouse_id,
        warehouseNameAr: r.warehouse_name_ar,
        status: r.status,
        performedBy: r.performed_by,
        performedByName: r.performed_by_name,
        performedAt: r.performed_at?.toISOString?.() || r.performed_at,
        approvedBy: r.approved_by || undefined,
        approvedByName: r.approved_by_name || undefined,
        approvedAt: r.approved_at?.toISOString?.() || r.approved_at || undefined,
        totalItemsCount: Number(r.total_items_count),
        hasVariance: r.has_variance,
        netVarianceAmount: Number(r.net_variance_amount),
        journalEntryId: r.journal_entry_id || undefined,
        notes: r.notes || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
        idempotencyKey: r.idempotency_key || undefined,
      };

      const linesRes = await this.query(
        `SELECT * FROM an_stock_count_lines WHERE tenant_id = $1 AND count_id = $2`,
        [tenantId, count.id]
      );
      const lines: StockCountLine[] = linesRes.rows.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        companyId: l.company_id,
        countId: l.count_id,
        itemId: l.item_id,
        itemCode: l.item_code,
        itemNameAr: l.item_name_ar,
        systemQty: Number(l.system_qty),
        countedQty: Number(l.counted_qty),
        varianceQty: Number(l.variance_qty),
        unitCost: Number(l.unit_cost),
        varianceAmount: Number(l.variance_amount),
        batchNumber: l.batch_number || undefined,
        serialNumber: l.serial_number || undefined,
        notes: l.notes || undefined,
      }));

      return { success: true, data: { count, lines } };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listStockCounts(
    tenantId: string,
    filter?: { warehouseId?: string; status?: string }
  ): Promise<StorageResult<StockCount[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_stock_counts WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (filter?.warehouseId) {
        params.push(filter.warehouseId);
        queryStr += ` AND warehouse_id = $${params.length}`;
      }
      if (filter?.status) {
        params.push(filter.status);
        queryStr += ` AND status = $${params.length}`;
      }
      queryStr += ` ORDER BY created_at DESC`;

      const res = await this.query(queryStr, params);
      const list: StockCount[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        countNumber: r.count_number,
        countType: r.count_type,
        warehouseId: r.warehouse_id,
        warehouseNameAr: r.warehouse_name_ar,
        status: r.status,
        performedBy: r.performed_by,
        performedByName: r.performed_by_name,
        performedAt: r.performed_at?.toISOString?.() || r.performed_at,
        approvedBy: r.approved_by || undefined,
        approvedByName: r.approved_by_name || undefined,
        approvedAt: r.approved_at?.toISOString?.() || r.approved_at || undefined,
        totalItemsCount: Number(r.total_items_count),
        hasVariance: r.has_variance,
        netVarianceAmount: Number(r.net_variance_amount),
        journalEntryId: r.journal_entry_id || undefined,
        notes: r.notes || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
        idempotencyKey: r.idempotency_key || undefined,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async updateStockCountStatus(
    tenantId: string,
    countId: string,
    status: StockCountStatus,
    actorId: string,
    actorName: string,
    journalEntryId?: string,
    idempotencyKey?: string
  ): Promise<StorageResult<StockCount>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      if (idempotencyKey) {
        const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'updateStockCountStatus');
        if (reservation.action === 'REPLAY') {
          await client.query('ROLLBACK');
          return { success: true, data: reservation.cachedPayload };
        }
        if (reservation.action === 'CONFLICT') {
          await client.query('ROLLBACK');
          return { success: false, error: reservation.error };
        }
      }

      const selRes = await client.query(
        `SELECT * FROM an_stock_counts WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, countId]
      );
      if (selRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/count-not-found',
            title: 'Stock Count Not Found',
            status: 404,
            detail: `Stock count ${countId} was not found`,
            instance: `/api/inventory/counts/${countId}`,
          },
        };
      }

      const existing = selRes.rows[0];

      // SoD Enforcement: Section 7.1 - Performer cannot approve own stock count
      if ((status === 'APPROVED' || status === 'POSTED') && existing.performed_by === actorId) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/sod-violation',
            title: 'Segregation of Duties Violation',
            status: 403,
            detail: 'لا يجوز للقائم بالجرد الفعلي اعتماد نتيجة الجرد أو ترحيل فروقه تسوية (بند 7/SoD)',
            instance: `/api/inventory/counts/${countId}/approve`,
          },
        };
      }

      const nowIso = new Date().toISOString();
      const jeId = journalEntryId || existing.journal_entry_id;

      await client.query(
        `UPDATE an_stock_counts SET
          status = $1,
          approved_by = $2,
          approved_by_name = $3,
          approved_at = $4,
          journal_entry_id = $5,
          updated_at = $6
        WHERE tenant_id = $7 AND id = $8`,
        [
          status,
          actorId,
          actorName,
          nowIso,
          jeId,
          nowIso,
          tenantId,
          countId,
        ]
      );

      const updated: StockCount = {
        id: existing.id,
        tenantId: existing.tenant_id,
        companyId: existing.company_id,
        countNumber: existing.count_number,
        countType: existing.count_type,
        warehouseId: existing.warehouse_id,
        warehouseNameAr: existing.warehouse_name_ar,
        status,
        performedBy: existing.performed_by,
        performedByName: existing.performed_by_name,
        performedAt: existing.performed_at?.toISOString?.() || existing.performed_at,
        approvedBy: actorId,
        approvedByName: actorName,
        approvedAt: nowIso,
        totalItemsCount: Number(existing.total_items_count),
        hasVariance: existing.has_variance,
        netVarianceAmount: Number(existing.net_variance_amount),
        journalEntryId: jeId,
        notes: existing.notes || undefined,
        createdAt: existing.created_at?.toISOString?.() || existing.created_at,
        updatedAt: nowIso,
        idempotencyKey,
      };

      if (idempotencyKey) {
        await this.completeIdempotency(client, tenantId, idempotencyKey, 'updateStockCountStatus', updated);
      }

      await client.query('COMMIT');
      return { success: true, data: updated };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async saveItemBatch(tenantId: string, batch: ItemBatch): Promise<StorageResult<ItemBatch>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_item_batches (
          id, tenant_id, company_id, item_id, warehouse_id, batch_number,
          production_date, expiry_date, current_qty, unit_cost, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, warehouse_id, item_id, batch_number) DO UPDATE SET
          current_qty = EXCLUDED.current_qty,
          production_date = EXCLUDED.production_date,
          expiry_date = EXCLUDED.expiry_date,
          unit_cost = EXCLUDED.unit_cost`,
        [
          batch.id,
          tenantId,
          batch.companyId || tenantId,
          batch.itemId,
          batch.warehouseId,
          batch.batchNumber,
          batch.productionDate || null,
          batch.expiryDate || null,
          batch.currentQty || 0,
          batch.unitCost || 0,
          batch.createdAt || new Date().toISOString(),
        ]
      );
      return { success: true, data: batch };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listItemBatches(
    tenantId: string,
    itemId?: string,
    warehouseId?: string
  ): Promise<StorageResult<ItemBatch[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_item_batches WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (itemId) {
        params.push(itemId);
        queryStr += ` AND item_id = $${params.length}`;
      }
      if (warehouseId) {
        params.push(warehouseId);
        queryStr += ` AND warehouse_id = $${params.length}`;
      }
      queryStr += ` ORDER BY expiry_date ASC, created_at DESC`;

      const res = await this.query(queryStr, params);
      const list: ItemBatch[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        itemId: r.item_id,
        warehouseId: r.warehouse_id,
        batchNumber: r.batch_number,
        productionDate: r.production_date || undefined,
        expiryDate: r.expiry_date || undefined,
        currentQty: Number(r.current_qty),
        unitCost: Number(r.unit_cost),
        createdAt: r.created_at?.toISOString?.() || r.created_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveItemSerial(tenantId: string, serial: ItemSerial): Promise<StorageResult<ItemSerial>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_item_serials (
          id, tenant_id, company_id, item_id, warehouse_id, serial_number, status, warranty_expiry, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tenant_id, item_id, serial_number) DO UPDATE SET
          warehouse_id = EXCLUDED.warehouse_id,
          status = EXCLUDED.status,
          warranty_expiry = EXCLUDED.warranty_expiry`,
        [
          serial.id,
          tenantId,
          serial.companyId || tenantId,
          serial.itemId,
          serial.warehouseId,
          serial.serialNumber,
          serial.status || 'IN_STOCK',
          serial.warrantyExpiry || null,
          serial.createdAt || new Date().toISOString(),
        ]
      );
      return { success: true, data: serial };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listItemSerials(
    tenantId: string,
    itemId?: string,
    warehouseId?: string
  ): Promise<StorageResult<ItemSerial[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_item_serials WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (itemId) {
        params.push(itemId);
        queryStr += ` AND item_id = $${params.length}`;
      }
      if (warehouseId) {
        params.push(warehouseId);
        queryStr += ` AND warehouse_id = $${params.length}`;
      }
      queryStr += ` ORDER BY created_at DESC`;

      const res = await this.query(queryStr, params);
      const list: ItemSerial[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        itemId: r.item_id,
        warehouseId: r.warehouse_id,
        serialNumber: r.serial_number,
        status: r.status,
        warrantyExpiry: r.warranty_expiry || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  // ============================================================================
  // Phase 7.6: Multi-line stock documents, custody vouchers, attachments, prices
  // ============================================================================

  // Phase 10 (STK-ATOMIC-001): lock the (warehouse,item) balance rows in one global order so concurrent documents can never deadlock.
  private async lockStockRowsInTx(client: PoolClient, tenantId: string, companyId: string, pairs: Array<{ warehouseId: string; itemId: string }>): Promise<void> {
    const uniq = Array.from(new Map(pairs.map(p => [`${p.warehouseId}\u0000${p.itemId}`, p])).values())
      .sort((x, y) => (x.warehouseId < y.warehouseId ? -1 : x.warehouseId > y.warehouseId ? 1 : x.itemId < y.itemId ? -1 : x.itemId > y.itemId ? 1 : 0));
    const nowIso = new Date().toISOString();
    for (const p of uniq) {
      await client.query(
        `INSERT INTO an_warehouse_stock (id, tenant_id, company_id, warehouse_id, item_id, current_qty, reserved_qty, available_qty, average_cost, total_value, updated_at)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 0, 0, $6)
         ON CONFLICT (tenant_id, warehouse_id, item_id) DO NOTHING`,
        [`stk-${p.warehouseId}-${p.itemId}`, tenantId, companyId, p.warehouseId, p.itemId, nowIso]
      );
    }
    for (const p of uniq) {
      await client.query(
        `SELECT id FROM an_warehouse_stock WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3 FOR UPDATE`,
        [tenantId, p.warehouseId, p.itemId]
      );
    }
  }

  // Receipts also update an_stock_items (average / last purchase cost): lock those rows in sorted order too.
  private async lockItemRowsInTx(client: PoolClient, tenantId: string, itemIds: string[]): Promise<void> {
    const ids = Array.from(new Set(itemIds)).sort();
    if (ids.length === 0) return;
    await client.query(
      `SELECT id FROM an_stock_items WHERE tenant_id = $1 AND id = ANY($2::text[]) ORDER BY id FOR UPDATE`,
      [tenantId, ids]
    );
  }

  public async postStockDocumentAtomic(
    tenantId: string,
    input: PostStockDocumentAtomicInput,
    idempotencyKey: string
  ): Promise<StorageResult<StockDocument>> {
    if (!this.pool) return this.missingConnError();
    const { doc, movements } = input;
    const invalid = (detail: string): StorageResult<StockDocument> => ({
      success: false,
      error: { type: 'https://api.an-erp.local/errors/invalid-document', title: 'مستند مخزني غير صالح', status: 400, detail },
    });
    if (!doc.lines || doc.lines.length === 0 || doc.lines.length !== movements.length) {
      return invalid('عدد أسطر المستند لا يطابق عدد الحركات.');
    }
    for (let i = 0; i < movements.length; i++) {
      if (doc.lines[i].itemId !== movements[i].itemId || Number(doc.lines[i].quantity) !== Number(movements[i].quantity)) {
        return invalid(`السطر رقم ${i + 1} لا يطابق حركته (الصنف أو الكمية).`);
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'postStockDocumentAtomic');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      await this.lockStockRowsInTx(client, tenantId, doc.companyId || tenantId, movements.map(m => ({ warehouseId: m.warehouseId, itemId: m.itemId })));
      await this.lockItemRowsInTx(client, tenantId, movements.filter(m => m.movementType === 'RECEIPT').map(m => m.itemId));

      const savedMovements: StockMovement[] = [];
      const lines = doc.lines.map(l => ({ ...l }));
      for (let i = 0; i < movements.length; i++) {
        const m = movements[i];
        const lineKey = m.idempotencyKey || `${idempotencyKey}-line-${i}`;
        const applied = await this.applyMovementInTx(client, tenantId, m, lineKey, {
          lockedOutgoingCost: input.useProvidedCost !== true,
          rejectNegative: input.allowNegative !== true,
        });
        if (!applied.ok) {
          await client.query('ROLLBACK');
          return { success: false, error: (applied as any).error };
        }
        savedMovements.push(applied.saved);
        if (!(m.movementType === 'RECEIPT' || m.movementType === 'TRANSFER_IN' || m.movementType === 'COUNT_ADJUSTMENT_GAIN')) {
          lines[i].unitCost = applied.unitCostUsed;
          lines[i].totalCost = applied.totalCostUsed;
        }
      }

      const finalDoc: StockDocument = {
        ...doc,
        lines,
        movements: savedMovements,
        totalCost: Math.round(lines.reduce((sum, l) => sum + Number(l.totalCost || 0), 0) * 100) / 100,
      };
      await this.insertStockDocumentInTx(client, tenantId, finalDoc, idempotencyKey);

      for (const batch of input.batches || []) {
        await client.query(
          `INSERT INTO an_item_batches (
            id, tenant_id, company_id, item_id, warehouse_id, batch_number,
            production_date, expiry_date, current_qty, unit_cost, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (tenant_id, warehouse_id, item_id, batch_number) DO UPDATE SET
            current_qty = EXCLUDED.current_qty,
            production_date = EXCLUDED.production_date,
            expiry_date = EXCLUDED.expiry_date,
            unit_cost = EXCLUDED.unit_cost`,
          [batch.id, tenantId, batch.companyId || tenantId, batch.itemId, batch.warehouseId, batch.batchNumber,
           batch.productionDate || null, batch.expiryDate || null, batch.currentQty || 0, batch.unitCost || 0,
           batch.createdAt || new Date().toISOString()]
        );
      }
      for (const serial of input.serials || []) {
        await client.query(
          `INSERT INTO an_item_serials (
            id, tenant_id, company_id, item_id, warehouse_id, serial_number, status, warranty_expiry, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (tenant_id, item_id, serial_number) DO UPDATE SET
            warehouse_id = EXCLUDED.warehouse_id,
            status = EXCLUDED.status,
            warranty_expiry = EXCLUDED.warranty_expiry`,
          [serial.id, tenantId, serial.companyId || tenantId, serial.itemId, serial.warehouseId, serial.serialNumber,
           serial.status || 'IN_STOCK', serial.warrantyExpiry || null, serial.createdAt || new Date().toISOString()]
        );
      }

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'postStockDocumentAtomic', finalDoc);
      await client.query('COMMIT');
      return { success: true, data: finalDoc };
    } catch (err: any) {
      try { await client.query('ROLLBACK'); } catch (rbErr: any) { console.warn('[PostgresPrimaryAdapter] postStockDocumentAtomic ROLLBACK failed:', rbErr?.message); }
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  // Phase 10 (STK-ATOMIC-001): document + lines insert, shared by saveStockDocument and postStockDocumentAtomic
  private async insertStockDocumentInTx(client: PoolClient, tenantId: string, doc: StockDocument, idempotencyKey: string): Promise<void> {
      await client.query(
        `INSERT INTO an_stock_documents (
          id, tenant_id, company_id, document_number, document_type,
          warehouse_id, warehouse_name_ar, status, total_quantity, total_cost,
          reference_type, reference_id, reference_number, notes,
          performed_by, performed_by_name, idempotency_key, created_at, posted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          doc.id,
          tenantId,
          doc.companyId || tenantId,
          doc.documentNumber,
          doc.documentType,
          doc.warehouseId,
          doc.warehouseNameAr || null,
          doc.status || 'POSTED',
          doc.totalQuantity,
          doc.totalCost,
          doc.referenceType || null,
          doc.referenceId || null,
          doc.referenceNumber || null,
          doc.notes || null,
          doc.performedBy,
          doc.performedByName,
          idempotencyKey,
          doc.createdAt,
          doc.postedAt,
        ]
      );

      for (const line of doc.lines) {
        await client.query(
          `INSERT INTO an_stock_document_lines (
            id, tenant_id, company_id, document_id, line_number,
            item_id, item_code, item_name_ar, uom, quantity,
            unit_cost, total_cost, batch_number, serial_number, expiry_date, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            line.id,
            tenantId,
            line.companyId || tenantId,
            doc.id,
            line.lineNumber,
            line.itemId,
            line.itemCode,
            line.itemNameAr,
            line.uom || 'حبه',
            line.quantity,
            line.unitCost,
            line.totalCost,
            line.batchNumber || null,
            line.serialNumber || null,
            line.expiryDate || null,
            line.notes || null,
          ]
        );
      }
  }

  public async saveStockDocument(
    tenantId: string,
    doc: StockDocument,
    idempotencyKey: string
  ): Promise<StorageResult<StockDocument>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'saveStockDocument');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }
      await this.insertStockDocumentInTx(client, tenantId, doc, idempotencyKey);

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'saveStockDocument', doc);

      await client.query('COMMIT');
      return { success: true, data: doc };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async getStockDocument(
    tenantId: string,
    docId: string
  ): Promise<StorageResult<StockDocument | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const docRes = await this.query(
        `SELECT * FROM an_stock_documents WHERE tenant_id = $1 AND (id = $2 OR document_number = $2)`,
        [tenantId, docId]
      );
      if (docRes.rows.length === 0) return { success: true, data: null };
      const r = docRes.rows[0];

      const linesRes = await this.query(
        `SELECT * FROM an_stock_document_lines WHERE tenant_id = $1 AND document_id = $2 ORDER BY line_number ASC`,
        [tenantId, r.id]
      );

      const lines: StockDocumentLine[] = linesRes.rows.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        companyId: l.company_id,
        documentId: l.document_id,
        lineNumber: Number(l.line_number),
        itemId: l.item_id,
        itemCode: l.item_code,
        itemNameAr: l.item_name_ar,
        uom: l.uom,
        quantity: Number(l.quantity),
        unitCost: Number(l.unit_cost),
        totalCost: Number(l.total_cost),
        batchNumber: l.batch_number || undefined,
        serialNumber: l.serial_number || undefined,
        expiryDate: l.expiry_date || undefined,
        notes: l.notes || undefined,
      }));

      const doc: StockDocument = {
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        documentNumber: r.document_number,
        documentType: r.document_type,
        warehouseId: r.warehouse_id,
        warehouseNameAr: r.warehouse_name_ar || undefined,
        status: r.status,
        totalQuantity: Number(r.total_quantity),
        totalCost: Number(r.total_cost),
        referenceType: r.reference_type || undefined,
        referenceId: r.reference_id || undefined,
        referenceNumber: r.reference_number || undefined,
        notes: r.notes || undefined,
        lines,
        performedBy: r.performed_by,
        performedByName: r.performed_by_name,
        idempotencyKey: r.idempotency_key,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        postedAt: r.posted_at?.toISOString?.() || r.posted_at,
      };

      return { success: true, data: doc };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listStockDocuments(
    tenantId: string,
    filter?: { warehouseId?: string; documentType?: StockDocumentType; limit?: number }
  ): Promise<StorageResult<StockDocument[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_stock_documents WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (filter?.warehouseId) {
        params.push(filter.warehouseId);
        queryStr += ` AND warehouse_id = $${params.length}`;
      }
      if (filter?.documentType) {
        params.push(filter.documentType);
        queryStr += ` AND document_type = $${params.length}`;
      }
      queryStr += ` ORDER BY created_at DESC`;
      if (filter?.limit) {
        params.push(filter.limit);
        queryStr += ` LIMIT $${params.length}`;
      }

      const res = await this.query(queryStr, params);
      const docs: StockDocument[] = [];
      for (const r of res.rows) {
        const linesRes = await this.query(
          `SELECT * FROM an_stock_document_lines WHERE tenant_id = $1 AND document_id = $2 ORDER BY line_number ASC`,
          [tenantId, r.id]
        );
        const lines: StockDocumentLine[] = linesRes.rows.map((l: any) => ({
          id: l.id,
          tenantId: l.tenant_id,
          companyId: l.company_id,
          documentId: l.document_id,
          lineNumber: Number(l.line_number),
          itemId: l.item_id,
          itemCode: l.item_code,
          itemNameAr: l.item_name_ar,
          uom: l.uom,
          quantity: Number(l.quantity),
          unitCost: Number(l.unit_cost),
          totalCost: Number(l.total_cost),
          batchNumber: l.batch_number || undefined,
          serialNumber: l.serial_number || undefined,
          expiryDate: l.expiry_date || undefined,
          notes: l.notes || undefined,
        }));
        docs.push({
          id: r.id,
          tenantId: r.tenant_id,
          companyId: r.company_id,
          documentNumber: r.document_number,
          documentType: r.document_type,
          warehouseId: r.warehouse_id,
          warehouseNameAr: r.warehouse_name_ar || undefined,
          status: r.status,
          totalQuantity: Number(r.total_quantity),
          totalCost: Number(r.total_cost),
          referenceType: r.reference_type || undefined,
          referenceId: r.reference_id || undefined,
          referenceNumber: r.reference_number || undefined,
          notes: r.notes || undefined,
          lines,
          performedBy: r.performed_by,
          performedByName: r.performed_by_name,
          idempotencyKey: r.idempotency_key,
          createdAt: r.created_at ? (r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString()) : undefined as any,
          postedAt: r.posted_at ? (r.posted_at instanceof Date ? r.posted_at.toISOString() : new Date(r.posted_at).toISOString()) : undefined as any,
        });
      }
      return { success: true, data: docs };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveCustodyExpenseVoucher(
    tenantId: string,
    voucher: CustodyExpenseVoucher,
    idempotencyKey: string
  ): Promise<StorageResult<CustodyExpenseVoucher>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'saveCustodyExpenseVoucher');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      // Deduct custody balance atomically
      const deductRes = await client.query(
        `UPDATE an_cash_custodies 
         SET current_balance = current_balance - $1, updated_at = NOW() 
         WHERE tenant_id = $2 AND id = $3 AND current_balance >= $1 
         RETURNING current_balance`,
        [voucher.totalAmount, tenantId, voucher.custodyId]
      );
      if (deductRes.rows.length === 0) {
        throw new Error('رصيد العهدة غير كافٍ أو العهدة غير موجودة في قاعدة البيانات.');
      }

      await client.query(
        `INSERT INTO an_custody_expense_vouchers (
          id, tenant_id, company_id, voucher_number, custody_id, total_amount,
          notes, receipt_number, journal_entry_id, recorded_by, recorded_by_name,
          status, idempotency_key, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          voucher.id,
          tenantId,
          voucher.companyId || tenantId,
          voucher.voucherNumber,
          voucher.custodyId,
          voucher.totalAmount,
          voucher.notes || null,
          voucher.receiptNumber || null,
          voucher.journalEntryId || null,
          voucher.recordedBy,
          voucher.recordedByName,
          voucher.status || 'POSTED',
          idempotencyKey,
          voucher.createdAt,
        ]
      );

      for (const line of voucher.lines) {
        await client.query(
          `INSERT INTO an_custody_expense_lines (
            id, tenant_id, voucher_id, line_number, expense_category,
            expense_account_code, amount, cost_center_id, description,
            receipt_number, attachment_url, attachment_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            line.id,
            tenantId,
            voucher.id,
            line.lineNumber,
            line.expenseCategory,
            line.expenseAccountCode,
            line.amount,
            line.costCenterId || null,
            line.description || null,
            line.receiptNumber || null,
            line.attachmentUrl || null,
            line.attachmentName || null,
          ]
        );
      }

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'saveCustodyExpenseVoucher', voucher);

      await client.query('COMMIT');
      return { success: true, data: voucher };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async getCustodyExpenseVoucher(
    tenantId: string,
    voucherId: string
  ): Promise<StorageResult<CustodyExpenseVoucher | null>> {
    if (!this.pool) return this.missingConnError();
    try {
      const vRes = await this.query(
        `SELECT * FROM an_custody_expense_vouchers WHERE tenant_id = $1 AND (id = $2 OR voucher_number = $2)`,
        [tenantId, voucherId]
      );
      if (vRes.rows.length === 0) return { success: true, data: null };
      const r = vRes.rows[0];

      const linesRes = await this.query(
        `SELECT * FROM an_custody_expense_lines WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_number ASC`,
        [tenantId, r.id]
      );

      const lines: CustodyExpenseLine[] = linesRes.rows.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        voucherId: l.voucher_id,
        lineNumber: Number(l.line_number),
        expenseCategory: l.expense_category,
        expenseAccountCode: l.expense_account_code,
        amount: Number(l.amount),
        costCenterId: l.cost_center_id || undefined,
        description: l.description || undefined,
        receiptNumber: l.receipt_number || undefined,
        attachmentUrl: l.attachment_url || undefined,
        attachmentName: l.attachment_name || undefined,
      }));

      const voucher: CustodyExpenseVoucher = {
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        voucherNumber: r.voucher_number,
        custodyId: r.custody_id,
        totalAmount: Number(r.total_amount),
        notes: r.notes || undefined,
        receiptNumber: r.receipt_number || undefined,
        journalEntryId: r.journal_entry_id || undefined,
        recordedBy: r.recorded_by,
        recordedByName: r.recorded_by_name,
        status: r.status,
        lines,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        idempotencyKey: r.idempotency_key,
      };

      return { success: true, data: voucher };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listCustodyExpenseVouchers(
    tenantId: string,
    custodyId?: string
  ): Promise<StorageResult<CustodyExpenseVoucher[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      let queryStr = `SELECT * FROM an_custody_expense_vouchers WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (custodyId) {
        params.push(custodyId);
        queryStr += ` AND custody_id = $${params.length}`;
      }
      queryStr += ` ORDER BY created_at DESC`;

      const res = await this.query(queryStr, params);
      const vouchers: CustodyExpenseVoucher[] = [];
      for (const r of res.rows) {
        const linesRes = await this.query(
          `SELECT * FROM an_custody_expense_lines WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_number ASC`,
          [tenantId, r.id]
        );
        const lines: CustodyExpenseLine[] = linesRes.rows.map((l: any) => ({
          id: l.id,
          tenantId: l.tenant_id,
          voucherId: l.voucher_id,
          lineNumber: Number(l.line_number),
          expenseCategory: l.expense_category,
          expenseAccountCode: l.expense_account_code,
          amount: Number(l.amount),
          costCenterId: l.cost_center_id || undefined,
          description: l.description || undefined,
          receiptNumber: l.receipt_number || undefined,
          attachmentUrl: l.attachment_url || undefined,
          attachmentName: l.attachment_name || undefined,
        }));
        vouchers.push({
          id: r.id,
          tenantId: r.tenant_id,
          companyId: r.company_id,
          voucherNumber: r.voucher_number,
          custodyId: r.custody_id,
          totalAmount: Number(r.total_amount),
          notes: r.notes || undefined,
          receiptNumber: r.receipt_number || undefined,
          journalEntryId: r.journal_entry_id || undefined,
          recordedBy: r.recorded_by,
          recordedByName: r.recorded_by_name,
          status: r.status,
          lines,
          createdAt: r.created_at?.toISOString?.() || r.created_at,
          idempotencyKey: r.idempotency_key,
        });
      }
      return { success: true, data: vouchers };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async reverseCustodyExpenseVoucher(
    tenantId: string,
    voucherId: string,
    reversedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<CustodyExpenseVoucher>> {
    if (!this.pool) return this.missingConnError();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const reservation = await this.reserveIdempotency(client, tenantId, idempotencyKey, 'reverseCustodyExpenseVoucher');
      if (reservation.action === 'REPLAY') {
        await client.query('ROLLBACK');
        return { success: true, data: reservation.cachedPayload };
      }
      if (reservation.action === 'CONFLICT') {
        await client.query('ROLLBACK');
        return { success: false, error: reservation.error };
      }

      const vRes = await client.query(
        `SELECT * FROM an_custody_expense_vouchers WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, voucherId]
      );
      if (vRes.rows.length === 0) {
        throw new Error('سند صرف العهدة غير موجود.');
      }
      const r = vRes.rows[0];
      if (r.status === 'REVERSED') {
        throw new Error('السند معكوس مسبقاً.');
      }

      // Refund custody balance
      await client.query(
        `UPDATE an_cash_custodies 
         SET current_balance = current_balance + $1, updated_at = NOW() 
         WHERE tenant_id = $2 AND id = $3`,
        [Number(r.total_amount), tenantId, r.custody_id]
      );

      // Update voucher status
      await client.query(
        `UPDATE an_custody_expense_vouchers SET status = 'REVERSED' WHERE tenant_id = $1 AND id = $2`,
        [tenantId, voucherId]
      );

      const linesRes = await client.query(
        `SELECT * FROM an_custody_expense_lines WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_number ASC`,
        [tenantId, voucherId]
      );

      const lines: CustodyExpenseLine[] = linesRes.rows.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        voucherId: l.voucher_id,
        lineNumber: Number(l.line_number),
        expenseCategory: l.expense_category,
        expenseAccountCode: l.expense_account_code,
        amount: Number(l.amount),
        costCenterId: l.cost_center_id || undefined,
        description: l.description || undefined,
        receiptNumber: l.receipt_number || undefined,
        attachmentUrl: l.attachment_url || undefined,
        attachmentName: l.attachment_name || undefined,
      }));

      const updatedVoucher: CustodyExpenseVoucher = {
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        voucherNumber: r.voucher_number,
        custodyId: r.custody_id,
        totalAmount: Number(r.total_amount),
        notes: r.notes || undefined,
        receiptNumber: r.receipt_number || undefined,
        journalEntryId: r.journal_entry_id || undefined,
        recordedBy: r.recorded_by,
        recordedByName: r.recorded_by_name,
        status: 'REVERSED',
        lines,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
        idempotencyKey: r.idempotency_key,
      };

      await this.completeIdempotency(client, tenantId, idempotencyKey, 'reverseCustodyExpenseVoucher', updatedVoucher);

      await client.query('COMMIT');
      return { success: true, data: updatedVoucher };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return this.dbError(err);
    } finally {
      client.release();
    }
  }

  public async saveDocumentAttachment(
    tenantId: string,
    attachment: DocumentAttachment
  ): Promise<StorageResult<DocumentAttachment>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_document_attachments (
          id, tenant_id, company_id, document_type, document_id,
          file_name, file_url, file_size, mime_type, uploaded_by, uploaded_by_name, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          attachment.id,
          tenantId,
          attachment.companyId || tenantId,
          attachment.documentType,
          attachment.documentId,
          attachment.fileName,
          attachment.fileUrl,
          attachment.fileSize || null,
          attachment.mimeType || 'application/pdf',
          attachment.uploadedBy,
          attachment.uploadedByName || null,
          attachment.createdAt,
        ]
      );
      return { success: true, data: attachment };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async listDocumentAttachments(
    tenantId: string,
    documentType: string,
    documentId: string
  ): Promise<StorageResult<DocumentAttachment[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_document_attachments WHERE tenant_id = $1 AND document_type = $2 AND document_id = $3 ORDER BY created_at DESC`,
        [tenantId, documentType, documentId]
      );
      const list: DocumentAttachment[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        companyId: r.company_id,
        documentType: r.document_type,
        documentId: r.document_id,
        fileName: r.file_name,
        fileUrl: r.file_url,
        fileSize: r.file_size ? Number(r.file_size) : undefined,
        mimeType: r.mime_type || undefined,
        uploadedBy: r.uploaded_by,
        uploadedByName: r.uploaded_by_name || undefined,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async saveItemPrice(tenantId: string, price: ItemPrice): Promise<StorageResult<ItemPrice>> {
    if (!this.pool) return this.missingConnError();
    try {
      await this.query(
        `INSERT INTO an_item_prices (id, tenant_id, item_id, price_type, amount, currency, is_default, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, item_id, price_type)
         DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, is_default = EXCLUDED.is_default`,
        [
          price.id,
          tenantId,
          price.itemId,
          price.priceType,
          price.amount,
          price.currency || 'SAR',
          price.isDefault ?? true,
          price.createdAt,
        ]
      );
      return { success: true, data: price };
    } catch (err: any) {
      return this.dbError(err);
    }
  }

  public async getItemPrices(tenantId: string, itemId: string): Promise<StorageResult<ItemPrice[]>> {
    if (!this.pool) return this.missingConnError();
    try {
      const res = await this.query(
        `SELECT * FROM an_item_prices WHERE tenant_id = $1 AND item_id = $2`,
        [tenantId, itemId]
      );
      const list: ItemPrice[] = res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        itemId: r.item_id,
        priceType: r.price_type,
        amount: Number(r.amount),
        currency: r.currency,
        isDefault: r.is_default,
        createdAt: r.created_at?.toISOString?.() || r.created_at,
      }));
      return { success: true, data: list };
    } catch (err: any) {
      return this.dbError(err);
    }
  }
}

