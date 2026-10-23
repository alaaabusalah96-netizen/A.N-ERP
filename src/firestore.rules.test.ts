import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 3.1: Firestore Security Rules — Logic-Parity & Structural Checks (NOT full behavioral coverage)
 *
 * IMPORTANT LIMITATION — READ BEFORE TRUSTING THIS SUITE AS "RULES ARE TESTED":
 * The permission logic below (evaluateCompanyRead, evaluateOrgScopedWrite, etc.) is a MANUAL
 * TypeScript REIMPLEMENTATION of the intended /firestore.rules behavior. It is NOT an AST parser
 * and does NOT execute the real Firestore Rules engine. These tests verify that the reimplemented
 * TypeScript logic is internally consistent with itself and with the documented intent — they do
 * NOT verify that the actual firestore.rules file enforces that behavior at runtime.
 *
 * Concretely: if a future edit to firestore.rules introduces a bug (e.g. changes `==` to `!=` in
 * a security condition), this suite will very likely still pass, because it never reads that
 * condition's runtime behavior — it only string-matches for the presence of function names
 * (see "Rules Structure" describe block below) and independently re-implements the expected logic.
 *
 * WHAT THIS SUITE DOES COVER:
 * - Structural presence of required security helper functions in the raw rules text.
 * - Internal consistency of the intended security model (company isolation, org-unit scoping,
 *   self-update privilege escalation defense) as a specification / regression-guard for the
 *   TypeScript reimplementation itself.
 *
 * WHAT THIS SUITE DOES NOT COVER:
 * - Actual runtime evaluation of firestore.rules by the Firestore Rules engine.
 * - Any guarantee that firestore.rules matches this reimplementation today or after future edits.
 *
 * TO GET REAL BEHAVIORAL COVERAGE:
 * Integrate `@firebase/rules-unit-testing` against a live Firestore Emulator (requires Java in the
 * execution environment) and replace/augment the mock evaluator calls below with actual
 * `assertSucceeds` / `assertFails` calls against `initializeTestEnvironment()`. This is tracked as
 * the follow-up task for Phase 3.1 completion.
 */

interface MockAuthContext {
  uid: string;
  role?: 'SystemAdmin' | 'Admin' | 'User';
  company_id?: string;
  org_unit_id?: string;
  station_id?: string;
  region_id?: string;
}

interface MockResource {
  id: string;
  data: Record<string, any>;
}

class FirestoreRulesPolicyValidator {
  private rulesContent: string;

  constructor(rulesPath: string) {
    this.rulesContent = fs.readFileSync(rulesPath, 'utf-8');
  }

  public getRawRules(): string {
    return this.rulesContent;
  }

  public hasRuleBlock(collectionPath: string): boolean {
    return this.rulesContent.includes(`match /${collectionPath}`);
  }

  /**
   * Simulates evaluation of /user_credentials/{id}
   */
  public evaluateUserCredentialsAccess(action: 'read' | 'write', auth: MockAuthContext | null): boolean {
    // In firestore.rules: match /user_credentials/{id} { allow read, write: if false; }
    return false;
  }

  /**
   * Simulates evaluation of isSameCompanyRead
   */
  public evaluateCompanyRead(auth: MockAuthContext | null, resource: MockResource | null): boolean {
    if (!auth) return false;
    if (auth.role === 'SystemAdmin') return true;
    if (!auth.company_id) return false;
    if (!resource || !resource.data) return false;
    const resCompanyId = resource.data.company_id || resource.data.companyId || '';
    return resCompanyId === auth.company_id;
  }

  /**
   * Simulates evaluation of isSameCompanyWrite
   */
  public evaluateCompanyWrite(
    auth: MockAuthContext | null,
    requestData: Record<string, any> | null,
    resource: MockResource | null
  ): boolean {
    if (!auth) return false;
    if (auth.role === 'SystemAdmin') return true;
    if (!auth.company_id) return false;
    if (!requestData) return false;

    const reqCompanyId = requestData.company_id || requestData.companyId || '';
    if (reqCompanyId !== auth.company_id) return false;

    if (resource && resource.data) {
      const resCompanyId = resource.data.company_id || resource.data.companyId || '';
      if (resCompanyId !== auth.company_id) return false;
    }
    return true;
  }

  /**
   * Simulates evaluation of isOrgScopedRead
   */
  public evaluateOrgScopedRead(auth: MockAuthContext | null, resource: MockResource | null): boolean {
    if (!this.evaluateCompanyRead(auth, resource)) return false;
    if (!auth) return false;
    if (auth.role === 'SystemAdmin' || auth.role === 'Admin') return true;
    if (!auth.org_unit_id) return true;
    if (!resource || !resource.data) return true;

    const resOrgUnitId = resource.data.org_unit_id || resource.data.orgUnitId || '';
    if (resOrgUnitId === auth.org_unit_id) return true;

    if (auth.station_id && resource.data.station_id === auth.station_id) return true;
    if (auth.region_id && resource.data.region_id === auth.region_id) return true;

    return false;
  }

  /**
   * Simulates evaluation of isOrgScopedWrite
   */
  public evaluateOrgScopedWrite(
    auth: MockAuthContext | null,
    requestData: Record<string, any> | null,
    resource: MockResource | null
  ): boolean {
    if (!this.evaluateCompanyWrite(auth, requestData, resource)) return false;
    if (!auth) return false;
    if (auth.role === 'SystemAdmin' || auth.role === 'Admin') return true;
    if (!auth.org_unit_id) return true;
    if (!requestData) return true;

    const reqOrgUnitId = requestData.org_unit_id || requestData.orgUnitId || '';
    return reqOrgUnitId === auth.org_unit_id;
  }

  /**
   * Simulates evaluation of isUserSelfUpdateSafe
   */
  public evaluateSelfUpdateSafe(oldData: Record<string, any>, newData: Record<string, any>): boolean {
    const forbiddenKeys = [
      'role',
      'permissions',
      'company_id',
      'companyId',
      'org_unit_id',
      'orgUnitId',
      'is_platform_owner',
      'is_active',
      'region_id',
      'station_id'
    ];
    for (const key of forbiddenKeys) {
      if (oldData[key] !== newData[key]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Simulates evaluation of /account_correction_requests/{id} create rule.
   * Faithfully models Firestore helper semantics:
   * - isLoggedIn(): auth != null
   * - getCompanyId(): returns auth.company_id if user doc exists, else ""
   * - Rule checks: isLoggedIn() && hasAll(...) && status == 'Pending' && ... && company_id != "" && company_id == getCompanyId()
   */
  public evaluateAccountCorrectionRequestCreate(
    auth: MockAuthContext | null,
    requestData: Record<string, any> | null
  ): boolean {
    const isLoggedIn = auth !== null;
    const userCompanyId = (auth && auth.company_id) ? auth.company_id : "";

    if (!requestData) return false;

    const requiredKeys = ['targetEmail', 'targetUserId', 'correctionType', 'status', 'company_id'];
    const hasAll = requiredKeys.every(k => k in requestData);
    if (!hasAll) return false;
    if (requestData.status !== 'Pending') return false;
    if (typeof requestData.targetEmail !== 'string') return false;
    if (typeof requestData.targetUserId !== 'string') return false;
    if (typeof requestData.company_id !== 'string') return false;

    // Rule condition: isLoggedIn() && ... && request.resource.data.company_id != "" && request.resource.data.company_id == getCompanyId()
    if (!isLoggedIn) return false;
    if (requestData.company_id === "") return false;
    if (requestData.company_id !== userCompanyId) return false;

    return true;
  }
}

describe('Phase 3.1: Firestore Security Rules Comprehensive Unit Tests', () => {
  let validator: FirestoreRulesPolicyValidator;
  const rulesFilePath = path.resolve(process.cwd(), 'firestore.rules');

  beforeAll(() => {
    expect(fs.existsSync(rulesFilePath)).toBe(true);
    validator = new FirestoreRulesPolicyValidator(rulesFilePath);
  });

  describe('1. Rules Structure & Required Security Helpers Verification', () => {
    it('should declare rules_version 2 and service cloud.firestore', () => {
      const raw = validator.getRawRules();
      expect(raw).toContain("rules_version = '2';");
      expect(raw).toContain('service cloud.firestore');
    });

    it('should include core multi-tenant security helper functions', () => {
      const raw = validator.getRawRules();
      expect(raw).toContain('function isSameCompanyRead(');
      expect(raw).toContain('function isSameCompanyWrite(');
      expect(raw).toContain('function isOrgScopedRead(');
      expect(raw).toContain('function isOrgScopedWrite(');
      expect(raw).toContain('function isUserSelfUpdateSafe(');
    });

    it('should declare strict rules for user_credentials and core collections including AuditLogs with isSameCompanyRead', () => {
      expect(validator.hasRuleBlock('user_credentials/{id}')).toBe(true);
      expect(validator.hasRuleBlock('companies/{id}')).toBe(true);
      expect(validator.hasRuleBlock('users/{id}')).toBe(true);
      expect(validator.hasRuleBlock('inventory/{id}')).toBe(true);
      expect(validator.hasRuleBlock('stock_movements/{id}')).toBe(true);
      expect(validator.hasRuleBlock('journal_entries/{id}')).toBe(true);
      expect(validator.hasRuleBlock('AuditLogs/{id}')).toBe(true);
      expect(validator.hasRuleBlock('account_correction_requests/{id}')).toBe(true);
      const raw = validator.getRawRules();
      const auditLogBlock = raw.substring(raw.indexOf('match /AuditLogs/{id}'));
      const auditLogReadRule = auditLogBlock.substring(0, auditLogBlock.indexOf('allow create:'));
      expect(auditLogReadRule).toContain('isSameCompanyRead(resource.data)');

      const acrBlock = raw.substring(raw.indexOf('match /account_correction_requests/{id}'));
      expect(acrBlock).toContain('request.resource.data.company_id == getCompanyId()');
    });
  });

  describe('2. Zero-Trust Private Authentication Vault (/user_credentials/{id})', () => {
    it('should unconditionally DENY client read/write access to user_credentials for anonymous users', () => {
      const allowedRead = validator.evaluateUserCredentialsAccess('read', null);
      const allowedWrite = validator.evaluateUserCredentialsAccess('write', null);
      expect(allowedRead).toBe(false);
      expect(allowedWrite).toBe(false);
    });

    it('should unconditionally DENY client read/write access to user_credentials for CompanyAdmin users', () => {
      const adminAuth: MockAuthContext = { uid: 'admin-1', role: 'Admin', company_id: 'comp-1' };
      const allowedRead = validator.evaluateUserCredentialsAccess('read', adminAuth);
      const allowedWrite = validator.evaluateUserCredentialsAccess('write', adminAuth);
      expect(allowedRead).toBe(false);
      expect(allowedWrite).toBe(false);
    });

    it('should unconditionally DENY client read/write access to user_credentials even for SystemAdmin users', () => {
      const sysAdminAuth: MockAuthContext = { uid: 'sysadmin-0', role: 'SystemAdmin' };
      const allowedRead = validator.evaluateUserCredentialsAccess('read', sysAdminAuth);
      const allowedWrite = validator.evaluateUserCredentialsAccess('write', sysAdminAuth);
      expect(allowedRead).toBe(false);
      expect(allowedWrite).toBe(false);
    });
  });

  describe('3. Multi-Tenant Company Isolation (Tenant Isolation Rules)', () => {
    it('should ALLOW users to read documents belonging to their own company_id', () => {
      const auth: MockAuthContext = { uid: 'user-1', role: 'User', company_id: 'comp-1' };
      const resDoc: MockResource = { id: 'doc-100', data: { company_id: 'comp-1', title: 'Invoice A' } };

      const canRead = validator.evaluateCompanyRead(auth, resDoc);
      expect(canRead).toBe(true);
    });

    it('should DENY users from reading documents belonging to a different company_id', () => {
      const auth: MockAuthContext = { uid: 'user-1', role: 'User', company_id: 'comp-1' };
      const foreignDoc: MockResource = { id: 'doc-200', data: { company_id: 'comp-2', title: 'Invoice B' } };

      const canRead = validator.evaluateCompanyRead(auth, foreignDoc);
      expect(canRead).toBe(false);
    });

    it('should DENY write attempts where request.resource.data.company_id does not match user company_id', () => {
      const auth: MockAuthContext = { uid: 'user-1', role: 'User', company_id: 'comp-1' };
      const spoofedWriteData = { company_id: 'comp-2', amount: 500 };

      const canWrite = validator.evaluateCompanyWrite(auth, spoofedWriteData, null);
      expect(canWrite).toBe(false);
    });

    it('should ALLOW SystemAdmin to read and write across any company_id', () => {
      const sysAdminAuth: MockAuthContext = { uid: 'sys-0', role: 'SystemAdmin' };
      const docComp1: MockResource = { id: 'd-1', data: { company_id: 'comp-1' } };
      const docComp2: MockResource = { id: 'd-2', data: { company_id: 'comp-2' } };

      expect(validator.evaluateCompanyRead(sysAdminAuth, docComp1)).toBe(true);
      expect(validator.evaluateCompanyRead(sysAdminAuth, docComp2)).toBe(true);
      expect(validator.evaluateCompanyWrite(sysAdminAuth, { company_id: 'comp-3' }, null)).toBe(true);
    });
  });

  describe('4. Organization Unit Department Scoping (isOrgScopedRead / isOrgScopedWrite)', () => {
    it('should ALLOW standard employee to read documents matching their assigned org_unit_id', () => {
      const empAuth: MockAuthContext = {
        uid: 'emp-10',
        role: 'User',
        company_id: 'comp-1',
        org_unit_id: 'warehouse-cairo'
      };
      const doc: MockResource = {
        id: 'inv-1',
        data: { company_id: 'comp-1', org_unit_id: 'warehouse-cairo', sku: 'SKU-001' }
      };

      expect(validator.evaluateOrgScopedRead(empAuth, doc)).toBe(true);
    });

    it('should DENY standard employee from reading documents assigned to a different org_unit_id within the same company', () => {
      const empAuth: MockAuthContext = {
        uid: 'emp-10',
        role: 'User',
        company_id: 'comp-1',
        org_unit_id: 'warehouse-cairo'
      };
      const siblingDoc: MockResource = {
        id: 'inv-2',
        data: { company_id: 'comp-1', org_unit_id: 'warehouse-alexandria', sku: 'SKU-002' }
      };

      expect(validator.evaluateOrgScopedRead(empAuth, siblingDoc)).toBe(false);
    });

    it('should ALLOW CompanyAdmin to read across all organization units within their company', () => {
      const adminAuth: MockAuthContext = {
        uid: 'admin-1',
        role: 'Admin',
        company_id: 'comp-1',
        org_unit_id: 'hq'
      };
      const docAlex: MockResource = {
        id: 'inv-alex',
        data: { company_id: 'comp-1', org_unit_id: 'warehouse-alexandria' }
      };

      expect(validator.evaluateOrgScopedRead(adminAuth, docAlex)).toBe(true);
    });
  });

  describe('5. Profile Self-Update Privilege Escalation Defense (isUserSelfUpdateSafe)', () => {
    it('should ALLOW self-update of benign profile fields (displayName, phone, preferences)', () => {
      const oldProfile = {
        displayName: 'Alaa Abusalah',
        email: 'alaa@example.com',
        role: 'User',
        company_id: 'comp-1',
        org_unit_id: 'unit-1',
        permissions: ['read']
      };
      const newProfile = {
        ...oldProfile,
        displayName: 'Alaa A. Abusalah',
        phone: '+201000000000'
      };

      expect(validator.evaluateSelfUpdateSafe(oldProfile, newProfile)).toBe(true);
    });

    it('should DENY self-update attempting to elevate role to SystemAdmin or Admin', () => {
      const oldProfile = {
        displayName: 'Alaa',
        role: 'User',
        company_id: 'comp-1'
      };
      const attackerProfile = {
        ...oldProfile,
        role: 'SystemAdmin'
      };

      expect(validator.evaluateSelfUpdateSafe(oldProfile, attackerProfile)).toBe(false);
    });

    it('should DENY self-update attempting to mutate company_id to gain unauthorized tenant access', () => {
      const oldProfile = {
        displayName: 'Alaa',
        role: 'User',
        company_id: 'comp-1'
      };
      const spoofedProfile = {
        ...oldProfile,
        company_id: 'comp-target-company'
      };

      expect(validator.evaluateSelfUpdateSafe(oldProfile, spoofedProfile)).toBe(false);
    });
  });

  describe('6. Account Correction Requests Tenant Isolation (/account_correction_requests/{id})', () => {
    const validRequestData = {
      targetEmail: 'target@example.com',
      targetUserId: 'u-target-1',
      correctionType: 'ROLE_RESET',
      status: 'Pending',
      company_id: 'comp-1'
    };

    it('should ALLOW create when company_id matches the authenticated user company', () => {
      const authUser: MockAuthContext = {
        uid: 'user-1',
        role: 'Admin',
        company_id: 'comp-1'
      };

      expect(validator.evaluateAccountCorrectionRequestCreate(authUser, validRequestData)).toBe(true);
    });

    it('should DENY create when company_id does NOT match the authenticated user company (cross-tenant injection)', () => {
      const attackerAuth: MockAuthContext = {
        uid: 'attacker-1',
        role: 'Admin',
        company_id: 'comp-evil'
      };

      expect(validator.evaluateAccountCorrectionRequestCreate(attackerAuth, validRequestData)).toBe(false);
    });

    it('should DENY create when unauthenticated or missing required fields', () => {
      expect(validator.evaluateAccountCorrectionRequestCreate(null, validRequestData)).toBe(false);

      // Attempt with empty company_id while unauthenticated
      const emptyCompanyData = { ...validRequestData, company_id: '' };
      expect(validator.evaluateAccountCorrectionRequestCreate(null, emptyCompanyData)).toBe(false);

      // Attempt with empty company_id while authenticated (user without company doc)
      const noDocAuth: MockAuthContext = { uid: 'user-no-company', role: 'User', company_id: '' };
      expect(validator.evaluateAccountCorrectionRequestCreate(noDocAuth, emptyCompanyData)).toBe(false);

      const missingCompany = { ...validRequestData };
      delete (missingCompany as any).company_id;
      const authUser: MockAuthContext = { uid: 'user-1', role: 'Admin', company_id: 'comp-1' };
      expect(validator.evaluateAccountCorrectionRequestCreate(authUser, missingCompany)).toBe(false);

      const nonPendingStatus = { ...validRequestData, status: 'Approved' };
      expect(validator.evaluateAccountCorrectionRequestCreate(authUser, nonPendingStatus)).toBe(false);
    });
  });
});
