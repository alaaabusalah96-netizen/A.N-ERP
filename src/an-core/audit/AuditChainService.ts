/**
 * @file AuditChainService.ts
 * @description Cryptographic Tamper-Evident Hash Chain & Document Audit Service (v7.1 / Phase 2)
 * Strictly conforms to Section 2E & 2G.
 * Calculates SHA-256 hash chains (Genesis -> Block) to detect any database tampering.
 * Distinct from SystemChangeLog (which logs platform evolution).
 */

import crypto from 'crypto';
import { StoragePort, AuditChainEntry, StorageResult } from '../storage/StoragePort';

export const GENESIS_PREVIOUS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditAppendPayload {
  tenantId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: any;
  afterState?: any;
  ipAddress?: string;
}

export interface RetentionPolicy {
  countryCode: string;
  retentionYears: number;
  legalReferenceAr: string;
  canPurgeArchived: boolean;
}

export class AuditChainService {
  private readonly port: StoragePort;

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * Computes deterministic SHA-256 hash for an audit record linked to previous hash.
   */
  public static computeRecordHash(
    sequenceNumber: number,
    tenantId: string,
    timestamp: string,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    beforeState: any,
    afterState: any,
    previousHash: string
  ): string {
    const payloadCanonical = JSON.stringify({
      seq: sequenceNumber,
      tenant: tenantId,
      ts: timestamp,
      actor: actorId,
      act: action,
      type: entityType,
      id: entityId,
      before: beforeState || null,
      after: afterState || null,
      prev: previousHash,
    });

    return crypto.createHash('sha256').update(payloadCanonical).digest('hex');
  }

  /**
   * Appends an audit event to the tamper-evident hash chain via StoragePort.
   */
  public async recordAuditEvent(payload: AuditAppendPayload): Promise<StorageResult<AuditChainEntry>> {
    return this.port.appendAuditChain(payload.tenantId, {
      id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      actorId: payload.actorId,
      actorName: payload.actorName,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      beforeState: payload.beforeState,
      afterState: payload.afterState,
      ipAddress: payload.ipAddress || '127.0.0.1',
    });
  }

  /**
   * Verifies the cryptographic integrity of the entire audit chain for a tenant.
   * If any row was manually edited in the database, verification fails immediately.
   */
  public async verifyIntegrity(tenantId: string): Promise<StorageResult<{ isValid: boolean; verifiedRecordsCount: number; brokenAtSequence?: number; messageAr: string }>> {
    return this.port.verifyAuditChain(tenantId);
  }

  /**
   * Returns retention legal policy by country.
   */
  public static getRetentionPolicy(countryCode: string): RetentionPolicy {
    switch (countryCode.toUpperCase()) {
      case 'SA':
        return {
          countryCode: 'SA',
          retentionYears: 10,
          legalReferenceAr: 'المادة 63 من اللائحة التنفيذية لضريبة القيمة المضافة ومتطلبات ZATCA (10 سنوات إلزامية حفظ إلكتروني)',
          canPurgeArchived: false,
        };
      case 'EG':
        return {
          countryCode: 'EG',
          retentionYears: 5,
          legalReferenceAr: 'قانون الإجراءات الضريبية الموحد رقم 206 لسنة 2020 (5 سنوات ميلادية)',
          canPurgeArchived: false,
        };
      case 'AE':
        return {
          countryCode: 'AE',
          retentionYears: 5,
          legalReferenceAr: 'المرسوم بقانون اتحادي رقم (8) لسنة 2017 في شأن ضريبة القيمة المضافة (5 سنوات)',
          canPurgeArchived: false,
        };
      default:
        return {
          countryCode,
          retentionYears: 10,
          legalReferenceAr: 'السياسة القياسية لحوكمة البيانات المالية في A.N ERP (10 سنوات)',
          canPurgeArchived: false,
        };
    }
  }
}
