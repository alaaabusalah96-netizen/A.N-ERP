import { Firestore, doc, runTransaction } from 'firebase/firestore';
import { SequenceOptions } from '../../types/enterprise';

/**
 * 3.2 Document Number / Sequence Engine
 * محرك توليد أرقام المستندات والترقيم المتسلسل التلقائي للمؤسسات
 * 
 * Provides an independent, highly isolated sequential number generator.
 * Operates inside a strict Firestore Transaction to guarantee gap-free, non-duplicate sequences.
 */
export class SequenceEngine {
  /**
   * Fetches and increments next raw sequence number inside a Firestore transaction.
   */
  static async getNextNumericVal(
    dbInstance: Firestore | null | undefined,
    companyId: string,
    sequenceKey: string,
    defaultStart: number = 1001
  ): Promise<number> {
    if (!companyId) {
      throw new Error('Company ID is required to generate sequential document number.');
    }

    if (!dbInstance) {
      return defaultStart;
    }

    const seqDocRef = doc(dbInstance, 'company_sequences', companyId);

    return await runTransaction(dbInstance, async (transaction) => {
      const sfDoc = await transaction.get(seqDocRef);

      if (!sfDoc.exists()) {
        const initialDoc: Record<string, any> = {
          id: companyId,
          company_id: companyId
        };
        initialDoc[sequenceKey] = defaultStart;

        transaction.set(seqDocRef, initialDoc);
        return defaultStart;
      } else {
        const data = sfDoc.data();
        let lastNo = data[sequenceKey];
        if (lastNo === undefined && sequenceKey === 'last_cash_voucher_no') {
          lastNo = data['last_voucher_no'];
        }
        const lastNoVal = lastNo !== undefined ? lastNo : (defaultStart - 1);
        const nextVal = lastNoVal + 1;
        
        const updateData: Record<string, any> = {};
        updateData[sequenceKey] = nextVal;

        transaction.update(seqDocRef, updateData);
        return nextVal;
      }
    });
  }

  /**
   * Generates a gap-free sequential number for a specific document type within a company/tenant context.
   * Runs in a transaction to guarantee absolute safety and uniqueness under high concurrency.
   * 
   * @param dbInstance Firestore database instance
   * @param companyId Tenant identification string (company ID)
   * @param sequenceKey The field name representing the specific counter (e.g., 'last_voucher_no', 'last_expense_no', 'last_inventory_no')
   * @param options Sequence format parameters (prefix, suffix, padding, includeYear)
   * @returns Formatted sequence string (e.g., "WH-INV-2026-0001")
   */
  static async generateNextSequence(
    dbInstance: Firestore,
    companyId: string,
    sequenceKey: string = 'last_cash_voucher_no',
    options: SequenceOptions
  ): Promise<string> {
    const defaultStart = options.manualStartNo !== undefined ? options.manualStartNo : 1001;
    const nextNumericVal = await this.getNextNumericVal(dbInstance, companyId, sequenceKey, defaultStart);

    const padding = options.padding ?? 4;
    const includeYear = options.includeYear ?? true;
    const yearStr = includeYear ? `-${new Date().getFullYear()}-` : '-';
    
    const paddedNum = String(nextNumericVal).padStart(padding, '0');
    const suffixStr = options.suffix ? `-${options.suffix}` : '';

    return `${options.prefix}${yearStr}${paddedNum}${suffixStr}`;
  }
}
