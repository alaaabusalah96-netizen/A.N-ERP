/**
 * @file NumberingEngine.ts
 * @description Core Numbering Engine for A.N ERP (v7.1)
 * Dependency injection of StoragePort only.
 * NO internal Map, Set, or in-memory state permitted in class.
 */

import { StoragePort, StorageResult, SequenceResult, SystemChangeLogEntry } from '../storage/StoragePort';

export interface GapCheckResult {
  isGapless: boolean;
  expectedCount: number;
  actualCount: number;
  missingNumbers: number[];
  highestNumber: number;
}

export class NumberingEngine {
  private readonly port: StoragePort;

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * Generates next atomic document sequence number via StoragePort.
   */
  public async generateNumber(
    tenantId: string,
    sequenceKey: string,
    prefix: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>> {
    if (!tenantId || !sequenceKey) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'معايير الترقيم غير مكتملة',
          status: 400,
          detail: 'معرف الشركة ومفتاح التسلسل إلزاميان لتوليد الرقم الآلي.',
        },
      };
    }

    return this.port.nextSequence(tenantId, sequenceKey, prefix, idempotencyKey);
  }

  /**
   * Performs documented manual sequence override.
   * Mandates formal justification reason (>= 10 chars) and authorized user identifier.
   * Logs an immutable audit event in SystemChangeLog.
   */
  public async overrideSequence(
    tenantId: string,
    sequenceKey: string,
    manualNumber: number,
    reason: string,
    authorizedBy: string,
    idempotencyKey: string
  ): Promise<StorageResult<SequenceResult>> {
    if (!tenantId || !sequenceKey || !manualNumber || !authorizedBy) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/invalid-parameter',
          title: 'بيانات التجاوز اليدوي غير مكتملة',
          status: 400,
          detail: 'معرف الشركة، ومفتاح التسلسل، والرقم اليدوي، وهوية المفوض إلزامية.',
        },
      };
    }

    if (!reason || reason.trim().length < 10) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/justification-required',
          title: 'سبب التجاوز التوثيقي إلزامي',
          status: 422,
          detail: 'يجب تقديم سبب توثيقي صريح ومفصل (10 أحرف كحد أدنى) لتجاوز الترقيم الآلي منعاً للفجوات غير المبررة.',
        },
      };
    }

    const res = await this.port.overrideSequence(
      tenantId,
      sequenceKey,
      manualNumber,
      reason.trim(),
      authorizedBy,
      idempotencyKey
    );

    if (res.success) {
      // Append audit to SystemChangeLog
      const logEntry: SystemChangeLogEntry = {
        id: `SCL-OVERRIDE-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: authorizedBy,
        changeType: 'ENGINE_POST',
        module: 'NUMBERING_ENGINE',
        entitiesAffected: [`sequence:${tenantId}:${sequenceKey}`],
        summaryAr: `تجاوز يدوي معتمد لترقيم (${sequenceKey}) إلى الرقم (${manualNumber}) بسبب: ${reason.trim()}`,
        beforeState: null,
        afterState: { sequenceKey, manualNumber, reason: reason.trim() },
        evidenceRef: idempotencyKey,
        version: '7.1',
      };
      await this.port.appendSystemChangeLog(logEntry);
    }

    return res;
  }

  /**
   * Evaluates an array of issued sequence numbers to verify gapless continuity.
   */
  public static verifyGaplessContinuity(issuedNumbers: number[]): GapCheckResult {
    if (!issuedNumbers || issuedNumbers.length === 0) {
      return { isGapless: true, expectedCount: 0, actualCount: 0, missingNumbers: [], highestNumber: 0 };
    }

    // Wave 7.5F & Section 6: Pure array deduction without hash collection allocations
    const rawSorted = issuedNumbers.slice().sort((a, b) => a - b);
    const sorted: number[] = [];
    for (let idx = 0; idx < rawSorted.length; idx++) {
      if (idx === 0 || rawSorted[idx] !== rawSorted[idx - 1]) {
        sorted.push(rawSorted[idx]);
      }
    }

    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const missing: number[] = [];

    let seqPointer = 0;
    for (let i = min; i <= max; i++) {
      if (seqPointer < sorted.length && sorted[seqPointer] === i) {
        seqPointer++;
      } else {
        missing.push(i);
      }
    }

    return {
      isGapless: missing.length === 0,
      expectedCount: max - min + 1,
      actualCount: sorted.length,
      missingNumbers: missing,
      highestNumber: max,
    };
  }
}
