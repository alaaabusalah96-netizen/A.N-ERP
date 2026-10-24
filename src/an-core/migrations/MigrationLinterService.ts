/**
 * @file MigrationLinterService.ts
 * @description Phase 3F: Automated Migration & Schema Linter CI Gate
 * Validates new tables/collections from any module (Section 11).
 * Rejects any schema lacking tenant_id or explicit isolation/RLS guarantees.
 */

import { RFC7807Problem, AdapterType } from '../storage/StoragePort';

export interface TableSchemaDefinition {
  tableName: string;
  columns: Array<{
    name: string;
    type: string;
    isNullable?: boolean;
    isPrimaryKey?: boolean;
  }>;
  indexes?: string[];
  hasRlsPolicy?: boolean;
}

export interface SchemaLintViolation {
  tableName: string;
  ruleCode: 'MISSING_TENANT_ID' | 'NULLABLE_TENANT_ID' | 'MISSING_TENANT_INDEX' | 'MISSING_RLS_POLICY';
  severity: 'REJECT_BLOCKING';
  messageAr: string;
}

export interface SchemaLintResult {
  valid: boolean;
  tablesInspectedCount: number;
  violations: SchemaLintViolation[];
  problem?: RFC7807Problem;
}

export class MigrationLinterService {
  /**
   * System-level singleton tables exempt from tenant_id requirement
   */
  private static readonly EXEMPT_SYSTEM_TABLES = [
    'an_tenants',
    'an_system_changelog',
    'an_country_tax_rules',
  ];

  /**
   * Lints structured table definitions across all storage adapters.
   */
  public static lintTableSchemas(
    schemas: TableSchemaDefinition[],
    adapterType: AdapterType = 'postgresql'
  ): SchemaLintResult {
    const violations: SchemaLintViolation[] = [];

    for (const schema of schemas) {
      if (this.EXEMPT_SYSTEM_TABLES.includes(schema.tableName)) {
        continue;
      }

      const tenantIdCol = schema.columns.find(
        (c) => c.name.toLowerCase() === 'tenant_id'
      );

      // Rule 1: Must contain tenant_id
      if (!tenantIdCol) {
        violations.push({
          tableName: schema.tableName,
          ruleCode: 'MISSING_TENANT_ID',
          severity: 'REJECT_BLOCKING',
          messageAr: `الجدول (${schema.tableName}) مرفوض قطيعاً: لا يحتوي على عمود/حقل (tenant_id) الإلزامي لعزل المستأجرين.`,
        });
        continue;
      }

      // Rule 2: tenant_id must be NOT NULL
      if (tenantIdCol.isNullable === true) {
        violations.push({
          tableName: schema.tableName,
          ruleCode: 'NULLABLE_TENANT_ID',
          severity: 'REJECT_BLOCKING',
          messageAr: `الجدول (${schema.tableName}) مرفوض: حقل (tenant_id) يقبل قيماً فارغة (NULL)، مما يهدد بتسريب البيانات المشتركة.`,
        });
      }

      // Rule 3: Must have index or composite key on tenant_id
      const hasTenantIndex =
        tenantIdCol.isPrimaryKey ||
        (schema.indexes &&
          schema.indexes.some((idx) => idx.toLowerCase().includes('tenant_id')));

      if (!hasTenantIndex) {
        violations.push({
          tableName: schema.tableName,
          ruleCode: 'MISSING_TENANT_INDEX',
          severity: 'REJECT_BLOCKING',
          messageAr: `الجدول (${schema.tableName}) مرفوض: يفتقر إلى فهرس أو مفتاح مركب يتضمن (tenant_id) لضمان أداء العزل.`,
        });
      }

      // Rule 4: For PostgreSQL, RLS policy or explicit tenant scope guarantee is mandatory
      if (adapterType === 'postgresql' && schema.hasRlsPolicy === false) {
        violations.push({
          tableName: schema.tableName,
          ruleCode: 'MISSING_RLS_POLICY',
          severity: 'REJECT_BLOCKING',
          messageAr: `الجدول (${schema.tableName}) مرفوض: لم يتم تفعيل سياسة أمان مستوى السجل (RLS Policy) للجدول على قاعدة PostgreSQL.`,
        });
      }
    }

    const isValid = violations.length === 0;

    let problem: RFC7807Problem | undefined;
    if (!isValid) {
      problem = {
        type: 'https://api.an-erp.local/errors/migration-linter-rejection',
        title: 'فشل فحص الترحيلات وقواعد العزل المعماري (Migration Linter Rejection)',
        status: 422,
        detail: `تم رفض الترحيلة لاحتوائها على ${violations.length} مخالفة معمارية تمس عزل المستأجرين.`,
        invalidParams: violations.map((v) => ({
          name: `${v.tableName}.${v.ruleCode}`,
          reason: v.messageAr,
        })),
      };
    }

    return {
      valid: isValid,
      tablesInspectedCount: schemas.length,
      violations,
      problem,
    };
  }

  /**
   * Lints raw SQL DDL script (e.g. for CI pipelines).
   */
  public static lintRawSqlDdl(sqlContent: string): SchemaLintResult {
    const tableBlocks = sqlContent.split(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i).slice(1);
    const tableSchemas: TableSchemaDefinition[] = [];

    for (const block of tableBlocks) {
      const match = block.match(/^([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/);
      if (!match) continue;

      const tableName = match[1];
      const body = match[2];
      const columnLines = body.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

      const columns: TableSchemaDefinition['columns'] = [];
      for (const line of columnLines) {
        if (line.startsWith('--') || line.toUpperCase().startsWith('PRIMARY KEY') || line.toUpperCase().startsWith('CONSTRAINT')) {
          continue;
        }
        const colParts = line.split(/\s+/);
        if (colParts.length >= 2) {
          const colName = colParts[0].replace(/[",]/g, '');
          const colType = colParts[1];
          const isNullable = !line.toUpperCase().includes('NOT NULL');
          columns.push({ name: colName, type: colType, isNullable });
        }
      }

      const hasTenantIndex = sqlContent.toLowerCase().includes(`index`) && sqlContent.toLowerCase().includes(tableName.toLowerCase());
      const hasRls = sqlContent.toLowerCase().includes(`enable row level security`) || sqlContent.toLowerCase().includes(`create policy`);

      tableSchemas.push({
        tableName,
        columns,
        indexes: hasTenantIndex ? ['idx_tenant'] : [],
        hasRlsPolicy: hasRls,
      });
    }

    return this.lintTableSchemas(tableSchemas, 'postgresql');
  }
}
