/**
 * Ordered, version-tracked migrations (DEF-P2-002).
 * Keep SQL idempotent. Do not reorder applied versions.
 */
import type { MigrationDefinition } from './MigrationEngine';

export const SCHEMA_MIGRATIONS: MigrationDefinition[] = [
  {
    version: '20261010_001',
    name: 'journal_entries_unique_tenant_code',
    sql: `
CREATE UNIQUE INDEX IF NOT EXISTS uq_an_journal_entries_tenant_code
  ON an_journal_entries (tenant_id, code);
`.trim(),
  },
  {
    version: '20261010_002',
    name: 'schema_migrations_bootstrap_comment',
    sql: `
COMMENT ON TABLE an_schema_migrations IS 'DEF-P2-002 version-tracked schema migrations';
`.trim(),
  },
  {
    // DB-1: indexes led by tenant_id for the tables whose access path is (tenant_id, parent id / time). Plain CREATE INDEX
    // (a transaction cannot hold CREATE INDEX CONCURRENTLY): the tables are small at the time this first runs.
    version: '20261014_001',
    name: 'db1_tenant_led_indexes',
    sql: `
CREATE INDEX IF NOT EXISTS ix_an_approval_requests_tenant_created ON an_approval_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_an_audit_chain_tenant_seq ON an_audit_chain (tenant_id, sequence_number DESC);
CREATE INDEX IF NOT EXISTS ix_an_audit_trail_tenant_ts ON an_audit_trail (tenant_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS ix_an_balance_check_logs_tenant_ts ON an_balance_check_logs (tenant_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS ix_an_expense_attachments_tenant_request ON an_expense_attachments (tenant_id, request_id);
CREATE INDEX IF NOT EXISTS ix_an_expense_lines_tenant_request ON an_expense_lines (tenant_id, request_id);
CREATE INDEX IF NOT EXISTS ix_an_goods_receipt_lines_tenant_receipt ON an_goods_receipt_lines (tenant_id, receipt_id);
CREATE INDEX IF NOT EXISTS ix_an_goods_receipt_lines_tenant_poline ON an_goods_receipt_lines (tenant_id, po_line_id);
CREATE INDEX IF NOT EXISTS ix_an_invitations_tenant_token ON an_invitations (tenant_id, token_hash);
CREATE INDEX IF NOT EXISTS ix_an_master_items_tenant_code ON an_master_items (tenant_id, code);
CREATE INDEX IF NOT EXISTS ix_an_master_partners_tenant_code ON an_master_partners (tenant_id, code);
CREATE INDEX IF NOT EXISTS ix_an_membership_scopes_tenant_membership ON an_membership_scopes (tenant_id, membership_id);
CREATE INDEX IF NOT EXISTS ix_an_purchase_order_lines_tenant_po ON an_purchase_order_lines (tenant_id, po_id);
CREATE INDEX IF NOT EXISTS ix_an_purchase_request_lines_tenant_pr ON an_purchase_request_lines (tenant_id, pr_id);
CREATE INDEX IF NOT EXISTS ix_an_rfq_lines_tenant_rfq ON an_rfq_lines (tenant_id, rfq_id);
CREATE INDEX IF NOT EXISTS ix_an_role_assignments_tenant_membership ON an_role_assignments (tenant_id, membership_id);
CREATE INDEX IF NOT EXISTS ix_an_stock_count_lines_tenant_count ON an_stock_count_lines (tenant_id, count_id);
CREATE INDEX IF NOT EXISTS ix_an_stock_transfer_lines_tenant_transfer ON an_stock_transfer_lines (tenant_id, transfer_id);
CREATE INDEX IF NOT EXISTS ix_an_supplier_invoice_lines_tenant_invoice ON an_supplier_invoice_lines (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS ix_an_supplier_quote_lines_tenant_quote ON an_supplier_quote_lines (tenant_id, quote_id);
CREATE INDEX IF NOT EXISTS ix_an_users_tenant_username ON an_users (tenant_id, lower(username));
`.trim(),
  },
];
