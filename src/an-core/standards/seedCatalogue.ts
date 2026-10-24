/**
 * @file seedCatalogue.ts
 * @description Initial catalogue: jurisdictions + standards as REFERENCE ENTRIES ONLY.
 * No rules, rates or effective dates are asserted here (SI-10). Every standard is NOT_IMPLEMENTED,
 * sourceVerified=false and carries the UNASSERTED_DATE sentinel until a verified source is attached.
 * Mapping EAS -> IFRS is a topic correspondence, relation UNVERIFIED (mapping is not equivalence).
 */
import type { StoragePort } from '../storage/StoragePort';
import { Framework, JurisdictionRecord, StandardRecord, UNASSERTED_DATE } from './standardsTypes';
import { JurisdictionRegistry, StandardsRegistry } from './registries';

export const SEED_JURISDICTIONS: JurisdictionRecord[] = [
  { id: 'GLOBAL-IFRS', kind: 'GLOBAL', countryCode: null, framework: 'IFRS', parentId: null, relationToIfrs: 'SELF', nameAr: 'المعايير الدولية (IFRS)', nameEn: 'Global / IFRS Accounting Standards', status: 'ACTIVE' },
  { id: 'EG-EAS', kind: 'COUNTRY', countryCode: 'EG', framework: 'EAS', parentId: null, relationToIfrs: 'UNVERIFIED', nameAr: 'مصر — معايير المحاسبة المصرية', nameEn: 'Egypt / Egyptian Accounting Standards', status: 'ACTIVE' },
  { id: 'EG-TAX', kind: 'COUNTRY', countryCode: 'EG', framework: 'TAX', parentId: null, relationToIfrs: 'NOT_APPLICABLE', nameAr: 'مصر — القواعد الضريبية', nameEn: 'Egypt / Tax rules', status: 'ACTIVE' },
  { id: 'GULF-PACK', kind: 'REGION_PACK', countryCode: null, framework: 'PACK', parentId: null, relationToIfrs: 'NOT_APPLICABLE', nameAr: 'حزم دول الخليج (قابلة للتوسعة)', nameEn: 'Gulf jurisdiction packs (extensible)', status: 'PLACEHOLDER' },
];

const IFRS: Array<[string, string]> = [
  ['IAS 2', 'Inventories'], ['IAS 7', 'Statement of Cash Flows'],
  ['IAS 8', 'Basis of Preparation / Accounting Policies, Changes in Accounting Estimates and Errors'],
  ['IAS 10', 'Events after Reporting Period'], ['IAS 12', 'Income Taxes'], ['IAS 16', 'Property, Plant and Equipment'],
  ['IAS 19', 'Employee Benefits'], ['IAS 21', 'The Effects of Changes in Foreign Exchange Rates'], ['IAS 23', 'Borrowing Costs'],
  ['IAS 24', 'Related Party Disclosures'], ['IAS 36', 'Impairment of Assets'],
  ['IAS 37', 'Provisions, Contingent Liabilities and Contingent Assets'], ['IAS 38', 'Intangible Assets'],
  ['IAS 40', 'Investment Property'], ['IAS 41', 'Agriculture'],
  ['IFRS 5', 'Non-current Assets Held for Sale and Discontinued Operations'], ['IFRS 7', 'Financial Instruments: Disclosures'],
  ['IFRS 9', 'Financial Instruments'], ['IFRS 10', 'Consolidated Financial Statements'], ['IFRS 11', 'Joint Arrangements'],
  ['IFRS 12', 'Disclosure of Interests in Other Entities'], ['IFRS 13', 'Fair Value Measurement'],
  ['IFRS 15', 'Revenue from Contracts with Customers'], ['IFRS 16', 'Leases'],
  ['IFRS 18', 'Presentation and Disclosure in Financial Statements'], ['IFRS 19', 'Subsidiaries without Public Accountability: Disclosures (where applicable)'],
];
/** Spec section 7. Revenue and leases numbers are NOT stated in the spec, so ids are placeholders, not invented numbers. */
const EAS: Array<[string, string, string | null]> = [
  ['EAS 13', 'Foreign exchange', 'IAS 21'], ['EAS 17', 'Separate financial statements', null],
  ['EAS 34', 'Investment property', 'IAS 40'], ['EAS 47', 'Financial instruments', 'IFRS 9'],
  ['EAS-REVENUE-PLACEHOLDER', 'Revenue (EAS number to be confirmed from an official source)', 'IFRS 15'],
  ['EAS-LEASES-PLACEHOLDER', 'Leases (EAS number to be confirmed from an official source)', 'IFRS 16'],
];

function entry(standardId: string, framework: Framework, titleEn: string, mapTo: string | null): StandardRecord {
  return {
    standardId, framework, titleEn, version: 1, effectiveFrom: UNASSERTED_DATE, effectiveTo: null,
    coverageStatus: 'NOT_IMPLEMENTED', coverageEvidenceRef: null, amendment: 'CATALOGUE_PLACEHOLDER',
    transitionMethod: 'NONE', supersededBy: null, sourceReference: null, sourceVerified: false,
    mapping: mapTo ? { standardId: mapTo, relation: 'UNVERIFIED', sourceReference: null } : null,
  };
}
export const SEED_STANDARDS: StandardRecord[] = [
  ...IFRS.map(([id, t]) => entry(id, 'IFRS', t, null)),
  ...EAS.map(([id, t, m]) => entry(id, 'EAS', t, m)),
];

/** Idempotent: existing rows are skipped, never overwritten. Returns counts for the evidence log. */
export async function seedStandardsCatalogue(st: StoragePort, actor = 'system'): Promise<{ jurisdictions: number; standards: number; skipped: number; errors: string[] }> {
  const jr = new JurisdictionRegistry(st), sr = new StandardsRegistry(st);
  const out = { jurisdictions: 0, standards: 0, skipped: 0, errors: [] as string[] };
  const haveJ = new Set(((await st.listJurisdictions()).data || []).map(j => j.id));
  for (const j of SEED_JURISDICTIONS) {
    if (haveJ.has(j.id)) { out.skipped++; continue; }
    const r = await jr.register(j, actor, `seed-j-${j.id}`);
    r.success ? out.jurisdictions++ : out.errors.push(`${j.id}: ${r.error?.detail}`);
  }
  const haveS = new Set(((await st.listStandards()).data || []).map(s => `${s.framework}|${s.standardId}|${s.version}`));
  for (const s of SEED_STANDARDS) {
    if (haveS.has(`${s.framework}|${s.standardId}|${s.version}`)) { out.skipped++; continue; }
    const r = await sr.register(s, actor, `seed-s-${s.framework}-${s.standardId}-v${s.version}`.replace(/\s+/g, '_'));
    r.success ? out.standards++ : out.errors.push(`${s.standardId}: ${r.error?.detail}`);
  }
  return out;
}
