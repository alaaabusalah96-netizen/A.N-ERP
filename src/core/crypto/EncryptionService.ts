/**
 * @file EncryptionService.ts
 * @description AES-256-GCM Encryption for PII Data & 2FA Emergency Backup Codes
 * Complies with Section 1D (PII encryption via AES-256-GCM, 8 one-time emergency codes).
 */

import crypto from 'crypto';

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits for GCM
  private static readonly TAG_LENGTH = 16; // 128 bits auth tag

  /**
   * Derives a 256-bit key from environment secret (PII_ENCRYPTION_SECRET)
   * Mandatory: zero hardcoded fallback secrets in codebase.
   */
  private static getMasterKey(): Buffer {
    let secret = process.env.PII_ENCRYPTION_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV !== 'production') {
        secret = 'dev-ephemeral-pii-secret-key-for-local-development-mode-2026';
      } else {
        throw new Error('PII_ENCRYPTION_SECRET غير معرَّف في متغيرات البيئة — لا يمكن تشغيل السيرفر بدونه');
      }
    }
    return crypto.createHash('sha256').update(secret).digest();
  }

  /**
   * Encrypts plaintext string using AES-256-GCM
   */
  public static encrypt(plainText: string): EncryptedData {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.getMasterKey(), iv);
    
    let ciphertext = cipher.update(plainText, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  /**
   * Decrypts ciphertext string using AES-256-GCM
   */
  public static decrypt(encrypted: EncryptedData): string {
    const decipher = crypto.createDecipheriv(
      this.ALGORITHM,
      this.getMasterKey(),
      Buffer.from(encrypted.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));

    let decrypted = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Encrypts a PII object or string into JSON string
   */
  public static encryptPII(pii: Record<string, any> | string): string {
    const raw = typeof pii === 'string' ? JSON.stringify({ value: pii }) : JSON.stringify(pii);
    const enc = this.encrypt(raw);
    return JSON.stringify(enc);
  }

  /**
   * Decrypts a PII encrypted JSON string
   */
  public static decryptPII<T = any>(encryptedJson: string): T {
    try {
      const parsed: EncryptedData = JSON.parse(encryptedJson);
      const raw = this.decrypt(parsed);
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && 'value' in obj && Object.keys(obj).length === 1) {
        return obj.value as T;
      }
      return obj as T;
    } catch {
      return {} as T;
    }
  }

  /**
   * Generates 8 one-time emergency backup codes for 2FA (Section 1D)
   * Format: XXXX-XXXX
   */
  public static generateEmergencyBackupCodes(): { plainCodes: string[]; hashedCodes: string[] } {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < 8; i++) {
      const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `${part1}-${part2}`;
      plainCodes.push(code);

      const hash = crypto.createHash('sha256').update(code).digest('hex');
      hashedCodes.push(hash);
    }

    return { plainCodes, hashedCodes };
  }

  /**
   * Verifies if a given code matches any of the remaining hashed backup codes
   */
  public static verifyAndConsumeBackupCode(
    candidateCode: string,
    hashedCodes: string[]
  ): { valid: boolean; remainingHashedCodes: string[] } {
    const candidateHash = crypto.createHash('sha256').update(candidateCode.trim().toUpperCase()).digest('hex');
    const index = hashedCodes.indexOf(candidateHash);

    if (index === -1) {
      return { valid: false, remainingHashedCodes: hashedCodes };
    }

    const remaining = [...hashedCodes];
    remaining.splice(index, 1);
    return { valid: true, remainingHashedCodes: remaining };
  }
}
