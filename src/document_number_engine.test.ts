import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentNumberEngine } from './db/documentNumberEngine';
import { SequenceEngine } from './lib/enterprise/sequence';

describe('Phase 9: Document Number Engine Unit Tests', () => {
  const companyId = 'comp-phase9-test';

  beforeEach(() => {
    DocumentNumberEngine.resetState();
  });

  it('should generate default configurations for core enterprise document types', () => {
    const defaults = DocumentNumberEngine.createDefaultConfigs(companyId);
    expect(defaults.length).toBeGreaterThanOrEqual(12);

    const docTypes = defaults.map(d => d.documentType);
    expect(docTypes).toContain('INVOICE');
    expect(docTypes).toContain('RECEIPT');
    expect(docTypes).toContain('PO');
    expect(docTypes).toContain('PR');
    expect(docTypes).toContain('TRANSFER');
    expect(docTypes).toContain('INVENTORY');
    expect(docTypes).toContain('ASSET');
    expect(docTypes).toContain('HR');
  });

  it('should generate document numbers with default company-level formatting', () => {
    const result = DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'INVOICE',
      date: new Date('2026-05-15')
    });

    expect(result.documentNumber).toBe('INV-2026-1001');
    expect(result.sequenceNumber).toBe(1001);

    const secondResult = DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'INVOICE',
      date: new Date('2026-05-15')
    });

    expect(secondResult.documentNumber).toBe('INV-2026-1002');
    expect(secondResult.sequenceNumber).toBe(1002);
  });

  it('should support independent numbering per organization unit', () => {
    // Org Unit 1: Headquarters (HQ)
    const hqResult1 = DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'PR',
      org_unit_id: 'org-hq',
      orgCode: 'HQ',
      date: new Date('2026-07-24')
    });

    expect(hqResult1.documentNumber).toBe('PR-HQ-2026-1001');

    // Org Unit 2: Alexandria Branch (ALX)
    const alxResult1 = DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'PR',
      org_unit_id: 'org-alx',
      orgCode: 'ALX',
      date: new Date('2026-07-24')
    });

    expect(alxResult1.documentNumber).toBe('PR-ALX-2026-1001');

    // Increment Org Unit 1 again
    const hqResult2 = DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'PR',
      org_unit_id: 'org-hq',
      orgCode: 'HQ',
      date: new Date('2026-07-24')
    });

    expect(hqResult2.documentNumber).toBe('PR-HQ-2026-1002');
  });

  it('should support custom pattern templates and padding tokens (e.g., {PREFIX}/{ORG_CODE}/{YY}{MONTH}/{SEQ:5})', () => {
    DocumentNumberEngine.saveConfig({
      company_id: companyId,
      documentType: 'PO',
      prefix: 'PUR',
      pattern: '{PREFIX}/{ORG_CODE}/{YY}{MONTH}/{SEQ:5}',
      padding: 5,
      includeYear: true,
      includeOrgCode: true,
      currentSequence: 0,
      manualStartNo: 1
    });

    const poRes1 = DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'PO',
      orgCode: 'FAC1',
      date: new Date('2026-09-10')
    });

    expect(poRes1.documentNumber).toBe('PUR/FAC1/2609/00001');

    const poRes2 = DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'PO',
      orgCode: 'FAC1',
      date: new Date('2026-09-10')
    });

    expect(poRes2.documentNumber).toBe('PUR/FAC1/2609/00002');
  });

  it('should fallback from Org-Unit specific config to company-wide config if org-unit config is absent', () => {
    // Save company-wide config
    DocumentNumberEngine.saveConfig({
      company_id: companyId,
      documentType: 'TRANSFER',
      prefix: 'TRF',
      pattern: '{PREFIX}-{YEAR}-{SEQ:4}',
      padding: 4,
      includeYear: true,
      includeOrgCode: false,
      currentSequence: 50,
      manualStartNo: 1
    });

    // Request for an org unit without a specific config
    const res = DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'TRANSFER',
      org_unit_id: 'org-unconfigured',
      orgCode: 'UNC'
    });

    expect(res.documentNumber).toBe('TRF-2026-0051');
    expect(res.sequenceNumber).toBe(51);
  });

  it('should allow resetting sequence counter', () => {
    DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'HR',
      date: new Date('2026-01-01')
    });

    DocumentNumberEngine.resetSequence(companyId, 'HR', undefined, 2000);

    const res = DocumentNumberEngine.generateNextNumber({
      companyId,
      documentType: 'HR',
      date: new Date('2026-01-01')
    });

    expect(res.sequenceNumber).toBe(2001);
    expect(res.documentNumber).toBe('HR-2026-2001');
  });

  it('should retry atomic transaction bounded times and throw clear error when all retries fail', async () => {
    const seqSpy = vi.spyOn(SequenceEngine, 'getNextNumericVal').mockRejectedValue(new Error('Simulated atomic transaction failure'));

    const fakeDb = {} as any;
    await expect(
      DocumentNumberEngine.generateNextNumberAsync({
        companyId,
        documentType: 'PO',
        date: new Date('2026-05-15')
      }, fakeDb)
    ).rejects.toThrow(/فشل توليد الرقم التسلسلي للمستند.*Failed to generate atomic document sequence/);

    expect(seqSpy).toHaveBeenCalledTimes(3);

    seqSpy.mockRestore();
  });
});
