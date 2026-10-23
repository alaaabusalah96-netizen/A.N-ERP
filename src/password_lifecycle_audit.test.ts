import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  hashPasswordPBKDF2_210k,
  hashPassword,
  legacyStretchedHashPassword1000,
  legacySinglePassHashPassword,
  legacyHashPassword,
  getActiveServerPepper,
  getPepperByVersion
} from './lib/server_hash';

describe('Password Lifecycle End-to-End Audit', () => {
  it('1. Traces Step 1 (Creation), Step 2 (Verification), Step 3 (Change Password) with exact values', () => {
    const manualPassword = 'TempManualPass2026!';
    const userEmail = 'new_employee_audit@kemit.com';
    const userId = 'usr_audit_' + crypto.randomUUID();
    const companyId = 'company_audit_1';

    // STEP 1: Account Creation (POST /api/admin/users)
    const saltStep1 = crypto.randomUUID();
    const pepperVersionStep1 = 2;
    const kdfStep1 = 'sha256_pbkdf2_210k';
    const hashStep1 = hashPasswordPBKDF2_210k(manualPassword, saltStep1, pepperVersionStep1);

    // Stored document in user_credentials:
    const storedCredentials = {
      id: userId,
      company_id: companyId,
      email: userEmail,
      passwordHash: hashStep1,
      salt: saltStep1,
      kdf: kdfStep1,
      pepper_version: pepperVersionStep1,
      updated_at: new Date().toISOString()
    };

    console.log('[Audit Step 1] Creation:', {
      password: manualPassword,
      salt: saltStep1,
      kdf: kdfStep1,
      pepper_version: pepperVersionStep1,
      hash: hashStep1
    });

    expect(storedCredentials.passwordHash).toBe(hashStep1);
    expect(storedCredentials.salt).toBe(saltStep1);
    expect(storedCredentials.pepper_version).toBe(2);

    // STEP 2: Login / Credential Verification (POST /api/auth/verify-credentials)
    // Server reads user_credentials for userId:
    const readSaltStep2 = storedCredentials.salt;
    const readPepperVersionStep2 = storedCredentials.pepper_version;
    const readKdfStep2 = storedCredentials.kdf;
    const storedHashStep2 = storedCredentials.passwordHash;

    const computedHashStep2 = hashPasswordPBKDF2_210k(manualPassword, readSaltStep2, readPepperVersionStep2);
    const isPBKDF2MatchStep2 = storedHashStep2 === computedHashStep2;

    console.log('[Audit Step 2] Verify-Credentials:', {
      readSalt: readSaltStep2,
      readPepperVersion: readPepperVersionStep2,
      computedHash: computedHashStep2,
      isPBKDF2Match: isPBKDF2MatchStep2
    });

    expect(isPBKDF2MatchStep2).toBe(true);

    // Auto-upgrade condition check:
    const shouldAutoUpgrade = !storedCredentials || readKdfStep2 !== 'sha256_pbkdf2_210k' || !isPBKDF2MatchStep2 || readPepperVersionStep2 !== 2;
    expect(shouldAutoUpgrade).toBe(false); // Does NOT auto-upgrade because it is already PBKDF2/210k and pepper_version: 2!

    // STEP 3: Change Password (POST /api/auth/change-password)
    // When called with the correct user UID:
    const authenticatedUidStep3 = userId;
    const readSaltStep3 = storedCredentials.salt;
    const readPepperVersionStep3 = storedCredentials.pepper_version;
    const storedHashStep3 = storedCredentials.passwordHash;

    const currentPasswordInput = manualPassword;
    const computedHashStep3 = hashPasswordPBKDF2_210k(currentPasswordInput, readSaltStep3, readPepperVersionStep3);
    const isPBKDF2MatchStep3 = storedHashStep3 === computedHashStep3;

    console.log('[Audit Step 3] Change-Password with matching UID:', {
      authenticatedUid: authenticatedUidStep3,
      readSalt: readSaltStep3,
      readPepperVersion: readPepperVersionStep3,
      computedHash: computedHashStep3,
      isPBKDF2Match: isPBKDF2MatchStep3
    });

    expect(isPBKDF2MatchStep3).toBe(true);

    // BUT WHAT IF authenticatedUid resolves to a DIFFERENT user (e.g. previous admin)?
    const adminUid = 'usr_admin_prev_session';
    const adminCredentials = {
      id: adminUid,
      passwordHash: hashPasswordPBKDF2_210k('AdminPassword2026!', crypto.randomUUID(), 2),
      salt: crypto.randomUUID(),
      pepper_version: 2
    };

    // If change-password uses adminUid because of a stale session cookie:
    const computedAgainstAdmin = hashPasswordPBKDF2_210k(currentPasswordInput, adminCredentials.salt, adminCredentials.pepper_version);
    const mismatch = adminCredentials.passwordHash === computedAgainstAdmin;
    expect(mismatch).toBe(false); // FAILS! This produces "Incorrect current password"
  });

  it('2. Checks password trimming and whitespace consistency between endpoints', () => {
    const rawPass = '  TempPassword123!  ';
    const trimmedPass = rawPass.trim();

    // server.ts /api/admin/users trims password:
    // let effectivePassword = trimmed;
    const effectiveCreationPassword = rawPass.trim();

    // server.ts /api/auth/verify-credentials receives password as-is from req.body:
    // const { email, password } = req.body;
    // But Login.tsx passes setPassword(e.target.value) without trim, or user types trimmed.
    // If verify-credentials receives trimmed vs untrimmed:
    const salt = 'fixed_test_salt';
    const hashUntrimmed = hashPasswordPBKDF2_210k(rawPass, salt, 2);
    const hashTrimmed = hashPasswordPBKDF2_210k(trimmedPass, salt, 2);

    expect(hashUntrimmed).not.toBe(hashTrimmed);

    // In ChangePasswordRequired.tsx:
    // const trimmedCurrent = currentPassword.trim();
    // And in server.ts /api/auth/change-password:
    // currentPassword = String(currentPassword ?? "").trim();
    // Both trim!
  });
});
