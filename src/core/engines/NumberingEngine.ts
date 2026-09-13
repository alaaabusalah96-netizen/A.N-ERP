/**
 * @file NumberingEngine.ts
 * @description Core Numbering Engine for A.N ERP (v7.1)
 * Dependency injection of StoragePort only.
 * NO internal Map, Set, or in-memory state permitted in class.
 */

import { StoragePort, StorageResult, SequenceResult } from '../storage/StoragePort';

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
}
