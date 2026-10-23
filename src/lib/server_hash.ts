import crypto from "crypto";

let hasWarnedUnsetPepper = false;

/**
 * Returns legacy pepper v1 from environment (LEGACY_PEPPER_V1 / LEGACY_EXPOSED_PEPPER).
 * In strict/production mode: fails loud if not set when requested.
 */
export function getLegacyPepperV1(): string {
  const envVal = typeof process !== 'undefined' ? (process.env?.LEGACY_PEPPER_V1 || process.env?.LEGACY_EXPOSED_PEPPER) : undefined;
  if (!envVal) {
    const isStrict = typeof process !== 'undefined' && (process.env?.STRICT_PROD_SECURITY === 'true' || process.env?.NODE_ENV === 'production');
    if (isStrict) {
      throw new Error('CRITICAL SECURITY ERROR: LEGACY_PEPPER_V1 environment variable is not set in production/strict mode.');
    }
    return 'DEV_LEGACY_PEPPER_V1_ENV_REQUIRED';
  }
  return envVal;
}

/**
 * Returns legacy pepper v3 from environment (LEGACY_PEPPER_V3 / TRANSIENT_EXPOSED_PEPPER_V2).
 * In strict/production mode: fails loud if not set when requested.
 */
export function getLegacyPepperV3(): string {
  const envVal = typeof process !== 'undefined' ? (process.env?.LEGACY_PEPPER_V3 || process.env?.TRANSIENT_EXPOSED_PEPPER_V2) : undefined;
  if (!envVal) {
    const isStrict = typeof process !== 'undefined' && (process.env?.STRICT_PROD_SECURITY === 'true' || process.env?.NODE_ENV === 'production');
    if (isStrict) {
      throw new Error('CRITICAL SECURITY ERROR: LEGACY_PEPPER_V3 environment variable is not set in production/strict mode.');
    }
    return 'DEV_LEGACY_PEPPER_V3_ENV_REQUIRED';
  }
  return envVal;
}

// Backwards-compatible exported constants referencing env helpers dynamically or returning default placeholders for non-strict dev
export const LEGACY_EXPOSED_PEPPER = typeof process !== 'undefined' && (process.env?.LEGACY_PEPPER_V1 || process.env?.LEGACY_EXPOSED_PEPPER) ? (process.env.LEGACY_PEPPER_V1 || process.env.LEGACY_EXPOSED_PEPPER)! : 'DEV_LEGACY_PEPPER_V1_ENV_REQUIRED';
export const TRANSIENT_EXPOSED_PEPPER_V2 = typeof process !== 'undefined' && (process.env?.LEGACY_PEPPER_V3 || process.env?.TRANSIENT_EXPOSED_PEPPER_V2) ? (process.env.LEGACY_PEPPER_V3 || process.env.TRANSIENT_EXPOSED_PEPPER_V2)! : 'DEV_LEGACY_PEPPER_V3_ENV_REQUIRED';

/**
 * Returns the active APP_PEPPER from environment.
 * - In STRICT_PROD_SECURITY mode: throws a critical fail-loud error if APP_PEPPER is not set.
 * - In non-strict preview/dev mode: returns a stable fallback pepper so authentication flows do not crash.
 */
export function getActiveServerPepper(): string {
  const envPepper = typeof process !== 'undefined' ? process.env?.APP_PEPPER : undefined;
  if (!envPepper) {
    const isStrictProdSecurity =
      typeof process !== 'undefined' &&
      (process?.env?.STRICT_PROD_SECURITY === 'true' || process?.env?.NODE_ENV === 'production');
    if (isStrictProdSecurity) {
      throw new Error(
        'CRITICAL SECURITY ERROR: APP_PEPPER environment variable is not set. Refusing to start or serve authentication without a secure secret pepper.'
      );
    }
    if (!hasWarnedUnsetPepper) {
      hasWarnedUnsetPepper = true;
      console.warn('[Security Notice] APP_PEPPER environment secret is unset; using stable non-strict fallback pepper.');
    }
    return "DEV_NON_STRICT_FALLBACK_PEPPER_V2";
  }
  return envPepper;
}

/**
 * Returns pepper according to stored pepper_version.
 * - pepper_version: 1 -> LEGACY_PEPPER_V1 from env (verification-only for old hashes)
 * - pepper_version: 3 -> LEGACY_PEPPER_V3 from env (verification-only for transient regression hashes)
 * - pepper_version: 2 (or other) -> active APP_PEPPER from environment
 */
export function getPepperByVersion(version: number = 2): string {
  if (version === 1) {
    return getLegacyPepperV1();
  }
  if (version === 3) {
    return getLegacyPepperV3();
  }
  return getActiveServerPepper();
}

function runSHA256(text: string): string {
  function rotateRight(n: number, x: number) {
    return (x >>> n) | (x << (32 - n));
  }
  const words: number[] = [];
  const asciiBitLength = text.length * 8;
  
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const wordsCount = ((asciiBitLength + 64 >> 9) << 4) + 16;
  for (let i = 0; i < wordsCount; i++) words[i] = 0;
  for (let i = 0; i < text.length; i++) {
    words[i >> 2] |= (text.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[wordsCount - 1] = asciiBitLength;

  for (let i = 0; i < words.length; i += 16) {
    const w = [];
    for (let j = 0; j < 16; j++) w[j] = words[i + j];
    for (let j = 16; j < 64; j++) {
      const s0 = rotateRight(7, w[j - 15]) ^ rotateRight(18, w[j - 15]) ^ (w[j - 15] >>> 3);
      const s1 = rotateRight(17, w[j - 2]) ^ rotateRight(19, w[j - 2]) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let j = 0; j < 64; j++) {
      const S1 = rotateRight(6, e) ^ rotateRight(11, e) ^ rotateRight(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
      const S0 = rotateRight(2, a) ^ rotateRight(13, a) ^ rotateRight(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const hashWords = [h0, h1, h2, h3, h4, h5, h6, h7];
  const result: string[] = [];
  for (let i = 0; i < 8; i++) {
    const word = hashWords[i];
    const hex = (word >>> 0).toString(16);
    result.push(('00000000' + hex).slice(-8));
  }
  return result.join('');
}

/**
 * High-stretching password hashing using 10,000 iterations of SHA-256 key stretching
 * combined with per-user unique salt and system pepper to resist brute-force/GPU cracking.
 */
export function hashPassword(password: string, salt: string = '', pepperVersion: number = 2): string {
  if (!password) return '';
  const pepper = getPepperByVersion(pepperVersion);
  const combinedSalt = salt 
    ? `${salt.toLowerCase().trim()}_${pepper}` 
    : pepper;
  let currentHash = runSHA256(`${password}:${combinedSalt}`);
  
  // OWASP Key Stretching: 10,000 iterations prevents GPU dictionary attacks
  for (let i = 0; i < 9999; i++) {
    currentHash = runSHA256(`${currentHash}:${combinedSalt}:${i}`);
  }
  return currentHash;
}

export interface LegacyHashDeprecationPolicy {
  announcementDate: string;
  sunsetDate: string;
  deprecatedHashFunctions: string[];
  deprecatedPepperVersions: number[];
  targetAlgorithm: string;
  targetPepperVersion: number;
  enforceSunset: boolean;
  gracePeriodActive: boolean;
  messageAr: string;
  messageEn: string;
}

/**
 * Returns the official Kemit ERP (CustodyFlow) Phase 4.1 Legacy Password Hash Deprecation & Removal Policy.
 * - During the grace period (announcementDate until sunsetDate, or when ENFORCE_LEGACY_HASH_SUNSET != 'true'),
 *   legacy SHA-256 hashes (legacyHashPassword, legacySinglePassHashPassword, legacyStretchedHashPassword1000)
 *   are accepted on login and automatically upgraded to PBKDF2 210,000 iterations (pepper_version: 2).
 * - After sunsetDate or when ENFORCE_LEGACY_HASH_SUNSET is set to 'true', legacy hashes are rejected
 *   and users are directed to reset their password via the Forgot Password OTP flow.
 */
export function getLegacyHashDeprecationPolicy(): LegacyHashDeprecationPolicy {
  const enforceSunset = process.env.ENFORCE_LEGACY_HASH_SUNSET === 'true';
  return {
    announcementDate: '2026-08-01',
    sunsetDate: '2027-02-01',
    deprecatedHashFunctions: [
      'legacyHashPassword',
      'legacySinglePassHashPassword',
      'legacyStretchedHashPassword1000'
    ],
    deprecatedPepperVersions: [1, 3],
    targetAlgorithm: 'PBKDF2-HMAC-SHA256 (210,000 iterations)',
    targetPepperVersion: 2,
    enforceSunset,
    gracePeriodActive: !enforceSunset,
    messageAr: enforceSunset
      ? 'انتهت صلاحية تشفير كلمة المرور القديم (SHA-256) بموجب سياسة أمان النظام. يرجى إعادة تعيين كلمة المرور عبر خيار نسيت كلمة المرور.'
      : 'فترة الهجرة التلقائية نشطة: يتم تحديث الحسابات القديمة تلقائياً إلى تشفير PBKDF2 عند تسجيل الدخول الناجح.',
    messageEn: enforceSunset
      ? 'Legacy password encryption (SHA-256) has expired under system security policy. Please reset your password via Forgot Password.'
      : 'Auto-migration grace period active: Legacy accounts are upgraded to PBKDF2 automatically upon successful login.'
  };
}

/**
 * @deprecated Since Phase 4.1 (2026-08-01). Will be removed after Sunset Date (2027-02-01).
 * Accounts matching this format are automatically upgraded to PBKDF2 210,000 iterations upon login.
 * 1,000-pass stretched hash function used for smooth auto-migration of accounts hashed during v1 stretching.
 */
export function legacyStretchedHashPassword1000(password: string, salt: string = '', pepperVersion: number = 2): string {
  if (!password) return '';
  const pepper = getPepperByVersion(pepperVersion);
  const combinedSalt = salt 
    ? `${salt.toLowerCase().trim()}_${pepper}` 
    : pepper;
  let currentHash = runSHA256(`${password}:${combinedSalt}`);
  for (let i = 0; i < 999; i++) {
    currentHash = runSHA256(`${currentHash}:${combinedSalt}:${i}`);
  }
  return currentHash;
}

/**
 * @deprecated Since Phase 4.1 (2026-08-01). Will be removed after Sunset Date (2027-02-01).
 * Accounts matching this format are automatically upgraded to PBKDF2 210,000 iterations upon login.
 * Pre-stretching hash function used for checking legacy accounts during login.
 */
export function legacySinglePassHashPassword(password: string, salt: string = '', pepperVersion: number = 2): string {
  if (!password) return '';
  const pepper = getPepperByVersion(pepperVersion);
  const combinedSalt = salt 
    ? `${salt.toLowerCase().trim()}_${pepper}` 
    : pepper;
  return runSHA256(`${password}:${combinedSalt}`);
}

/**
 * @deprecated Since Phase 4.1 (2026-08-01). Will be removed after Sunset Date (2027-02-01).
 * Accounts matching this format are automatically upgraded to PBKDF2 210,000 iterations upon login.
 * Original legacy hash function for backward-compatibility checks and smooth password auto-migration.
 */
export function legacyHashPassword(password: string, salt: string = ''): string {
  if (!password) return '';
  const saltedPassword = salt ? `${password}:${salt.toLowerCase().trim()}` : password;
  return runSHA256(saltedPassword);
}

/**
 * PBKDF2 210,000 iterations with SHA-256 for authoritative server-side password hashing.
 */
export function hashPasswordPBKDF2_210k(password: string, salt: string, pepperVersion: number = 2): string {
  if (!password) return '';
  const pepper = getPepperByVersion(pepperVersion);
  const combinedSalt = salt ? `${salt.toLowerCase().trim()}_${pepper}` : pepper;
  return crypto.pbkdf2Sync(password, combinedSalt, 210000, 64, 'sha256').toString('hex');
}
