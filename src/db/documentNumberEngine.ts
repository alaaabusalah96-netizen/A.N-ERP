import { StorageEngine } from './storage';
import { 
  DocumentType, 
  DocumentNumberConfig, 
  GenerateNumberParams, 
  GenerateNumberResult 
} from '../types/documentNumber';
import { SequenceEngine } from '../lib/enterprise/sequence';
import { db } from '../firebase';
import { Firestore } from 'firebase/firestore';

export class DocumentNumberEngine {
  private static readonly STORAGE_KEY_CONFIGS = 'document_number_configs';

  private static getSequenceKeyForDocType(docType: DocumentType): string {
    const map: Record<string, string> = {
      INVOICE: 'last_invoice_no',
      RECEIPT: 'last_receipt_no',
      PO: 'last_po_no',
      PR: 'last_pr_no',
      TRANSFER: 'last_transfer_no',
      INVENTORY: 'last_inventory_no',
      ASSET: 'last_asset_no',
      HR: 'last_hr_no',
      CUSTODY: 'last_cash_voucher_no',
      VOUCHER: 'last_cash_voucher_no',
      EXPENSE: 'last_expense_no',
      JOURNAL_ENTRY: 'last_journal_entry_no',
      FLEET: 'last_fleet_no'
    };
    return map[docType] || `last_${docType.toLowerCase()}_no`;
  }

  /**
   * Resets local cache state (primarily for unit tests)
   */
  public static resetState(): void {
    StorageEngine.setStored(this.STORAGE_KEY_CONFIGS, []);
  }

  /**
   * Retrieves all document number configurations for a company, optionally filtered by Org Unit
   */
  public static getConfigs(companyId: string, org_unit_id?: string): DocumentNumberConfig[] {
    const all = StorageEngine.getStored<DocumentNumberConfig[]>(this.STORAGE_KEY_CONFIGS, []);
    return all.filter(c => {
      if (c.company_id !== companyId) return false;
      if (org_unit_id !== undefined) {
        return c.org_unit_id === org_unit_id;
      }
      return true;
    });
  }

  /**
   * Finds a specific configuration for a company + document type + org unit combination
   */
  public static getConfig(companyId: string, documentType: DocumentType, org_unit_id?: string): DocumentNumberConfig | null {
    const all = StorageEngine.getStored<DocumentNumberConfig[]>(this.STORAGE_KEY_CONFIGS, []);
    
    // 1. Try exact match (companyId + documentType + org_unit_id)
    if (org_unit_id) {
      const exact = all.find(c => c.company_id === companyId && c.documentType === documentType && c.org_unit_id === org_unit_id);
      if (exact) return exact;
    }

    // 2. Fallback to company-wide config (companyId + documentType + no org_unit_id)
    const companyWide = all.find(c => c.company_id === companyId && c.documentType === documentType && (!c.org_unit_id || c.org_unit_id === ''));
    if (companyWide) return companyWide;

    return null;
  }

  /**
   * Returns default prefix for a standard enterprise document type
   */
  public static getDefaultPrefix(documentType: DocumentType): string {
    const prefixes: Record<string, string> = {
      INVOICE: 'INV',
      RECEIPT: 'REC',
      PO: 'PO',
      PR: 'PR',
      TRANSFER: 'TRF',
      INVENTORY: 'INV-DOC',
      ASSET: 'AST',
      HR: 'HR',
      CUSTODY: 'CUST',
      VOUCHER: 'VOUCH',
      EXPENSE: 'EXP',
      JOURNAL_ENTRY: 'JV'
    };
    return prefixes[documentType] || documentType.toUpperCase().substring(0, 5);
  }

  /**
   * Saves or updates a document number configuration
   */
  public static saveConfig(
    configData: Omit<DocumentNumberConfig, 'id' | 'updatedAt'> & { id?: string }
  ): DocumentNumberConfig {
    const all = StorageEngine.getStored<DocumentNumberConfig[]>(this.STORAGE_KEY_CONFIGS, []);
    const now = new Date().toISOString();

    const existingIdx = configData.id 
      ? all.findIndex(c => c.id === configData.id)
      : all.findIndex(c => c.company_id === configData.company_id && c.documentType === configData.documentType && (c.org_unit_id || '') === (configData.org_unit_id || ''));

    let saved: DocumentNumberConfig;

    if (existingIdx >= 0) {
      saved = {
        ...all[existingIdx],
        ...configData,
        id: all[existingIdx].id,
        updatedAt: now
      };
      all[existingIdx] = saved;
    } else {
      saved = {
        id: configData.id || crypto.randomUUID(),
        ...configData,
        updatedAt: now
      };
      all.push(saved);
    }

    StorageEngine.setStored(this.STORAGE_KEY_CONFIGS, all);
    return saved;
  }

  /**
   * Creates default document numbering configurations for all core document types for a company or org unit
   */
  public static createDefaultConfigs(companyId: string, org_unit_id?: string): DocumentNumberConfig[] {
    const types: DocumentType[] = [
      'INVOICE', 'RECEIPT', 'PO', 'PR', 'TRANSFER', 
      'INVENTORY', 'ASSET', 'HR', 'CUSTODY', 'VOUCHER', 'EXPENSE', 'JOURNAL_ENTRY'
    ];

    const created: DocumentNumberConfig[] = [];
    for (const docType of types) {
      const prefix = this.getDefaultPrefix(docType);
      const cfg = this.saveConfig({
        company_id: companyId,
        org_unit_id,
        documentType: docType,
        prefix,
        pattern: org_unit_id ? `{PREFIX}-{ORG_CODE}-{YEAR}-{SEQ:4}` : `{PREFIX}-{YEAR}-{SEQ:4}`,
        padding: 4,
        resetFrequency: 'YEARLY',
        includeYear: true,
        includeOrgCode: !!org_unit_id,
        currentSequence: 0,
        manualStartNo: 1001
      });
      created.push(cfg);
    }

    return created;
  }

  /**
   * Generates the next document number asynchronously using SequenceEngine for atomic Firestore sequence allocation.
   */
  public static async generateNextNumberAsync(
    params: GenerateNumberParams,
    dbInstance?: Firestore
  ): Promise<GenerateNumberResult> {
    const { companyId, documentType, org_unit_id, orgCode, date } = params;

    let config = this.getConfig(companyId, documentType, org_unit_id);
    if (!config) {
      const prefix = this.getDefaultPrefix(documentType);
      config = this.saveConfig({
        company_id: companyId,
        org_unit_id,
        documentType,
        prefix,
        pattern: org_unit_id ? `{PREFIX}-{ORG_CODE}-{YEAR}-{SEQ:4}` : `{PREFIX}-{YEAR}-{SEQ:4}`,
        padding: 4,
        resetFrequency: 'YEARLY',
        includeYear: true,
        includeOrgCode: !!orgCode || !!org_unit_id,
        currentSequence: 0,
        manualStartNo: 1001
      });
    }

    const startVal = config.manualStartNo !== undefined ? config.manualStartNo : 1001;
    const sequenceKey = this.getSequenceKeyForDocType(documentType);

    let nextSeq: number = 0;
    const targetDb = dbInstance || db;
    if (targetDb) {
      let retries = 3;
      let delayMs = 50;
      let success = false;
      let lastError: any = null;
      while (retries > 0 && !success) {
        try {
          nextSeq = await SequenceEngine.getNextNumericVal(targetDb, companyId, sequenceKey, startVal);
          success = true;
        } catch (err) {
          lastError = err;
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= 2;
          }
        }
      }
      if (!success) {
        throw new Error(
          `فشل توليد الرقم التسلسلي للمستند (${documentType}) عبر المعاملة المتزامنة بعد عدة محاولات. يلزم وجود اتصال مستقر بالإنترنت لمنع تكرار الأرقام. / Failed to generate atomic document sequence for (${documentType}) after retries: ${lastError?.message || 'Server connection required'}`
        );
      }
    } else {
      throw new Error(
        `قاعدة البيانات غير متاحة لتوليد الرقم التسلسلي المتزامن للمستند (${documentType}). / Database instance unavailable for atomic document sequencing.`
      );
    }

    config.currentSequence = nextSeq;
    this.saveConfig(config);

    return this.formatDocumentNumber(config, nextSeq, orgCode, date);
  }

  /**
   * Generates the next document number for an enterprise document (sync fallback).
   */
  public static generateNextNumber(params: GenerateNumberParams): GenerateNumberResult {
    const { companyId, documentType, org_unit_id, orgCode, date } = params;

    let config = this.getConfig(companyId, documentType, org_unit_id);
    if (!config) {
      // Auto-create default config for this company & document type
      const prefix = this.getDefaultPrefix(documentType);
      config = this.saveConfig({
        company_id: companyId,
        org_unit_id,
        documentType,
        prefix,
        pattern: org_unit_id ? `{PREFIX}-{ORG_CODE}-{YEAR}-{SEQ:4}` : `{PREFIX}-{YEAR}-{SEQ:4}`,
        padding: 4,
        resetFrequency: 'YEARLY',
        includeYear: true,
        includeOrgCode: !!orgCode || !!org_unit_id,
        currentSequence: 0,
        manualStartNo: 1001
      });
    }

    // Determine current sequence and calculate next value
    const startVal = config.manualStartNo !== undefined ? config.manualStartNo : 1001;
    const nextSeq = config.currentSequence === 0 ? startVal : config.currentSequence + 1;

    // Update current sequence in storage
    config.currentSequence = nextSeq;
    this.saveConfig(config);

    return this.formatDocumentNumber(config, nextSeq, orgCode, date);
  }

  private static formatDocumentNumber(
    config: DocumentNumberConfig,
    nextSeq: number,
    orgCode?: string,
    date?: Date | string
  ): GenerateNumberResult {
    // Format date components
    const d = date ? (typeof date === 'string' ? new Date(date) : date) : new Date();
    const year = d.getFullYear().toString();
    const yy = year.substring(2);
    const month = String(d.getMonth() + 1).padStart(2, '0');

    const cleanOrgCode = orgCode || '';
    const cleanPrefix = config.prefix || this.getDefaultPrefix(config.documentType);
    const cleanSuffix = config.suffix || '';

    // Process pattern template or construct default
    let pattern = config.pattern;
    if (!pattern) {
      if (config.includeOrgCode && cleanOrgCode) {
        pattern = config.includeYear ? `{PREFIX}-{ORG_CODE}-{YEAR}-{SEQ}` : `{PREFIX}-{ORG_CODE}-{SEQ}`;
      } else {
        pattern = config.includeYear ? `{PREFIX}-{YEAR}-{SEQ}` : `{PREFIX}-{SEQ}`;
      }
    }

    // Handle {SEQ:N} token parsing with specific padding (e.g., {SEQ:5})
    let formattedSeq = String(nextSeq).padStart(config.padding || 4, '0');

    let resultStr = pattern;

    // Check for {SEQ:N} pattern token
    const seqMatch = pattern.match(/\{SEQ:(\d+)\}/);
    if (seqMatch) {
      const customPadding = parseInt(seqMatch[1], 10);
      formattedSeq = String(nextSeq).padStart(customPadding, '0');
      resultStr = resultStr.replace(seqMatch[0], formattedSeq);
    } else {
      resultStr = resultStr.replace(/\{SEQ\}/g, formattedSeq);
    }

    resultStr = resultStr
      .replace(/\{PREFIX\}/g, cleanPrefix)
      .replace(/\{ORG_CODE\}/g, cleanOrgCode)
      .replace(/\{YEAR\}/g, year)
      .replace(/\{YY\}/g, yy)
      .replace(/\{MONTH\}/g, month)
      .replace(/\{SUFFIX\}/g, cleanSuffix);

    // Clean up duplicate or trailing dashes if tokens were empty (e.g. empty ORG_CODE)
    resultStr = resultStr.replace(/--+/g, '-').replace(/^-|-$/g, '');

    return {
      documentNumber: resultStr,
      sequenceNumber: nextSeq,
      configId: config.id,
      documentType: config.documentType
    };
  }

  /**
   * Resets sequence counter for a document configuration
   */
  public static resetSequence(companyId: string, documentType: DocumentType, org_unit_id?: string, newSequenceValue: number = 0): void {
    const config = this.getConfig(companyId, documentType, org_unit_id);
    if (config) {
      config.currentSequence = newSequenceValue;
      this.saveConfig(config);
    }
  }
}
