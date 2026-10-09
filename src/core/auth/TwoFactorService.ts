/**
 * @file TwoFactorService.ts
 * @description SEC-1: the ONLY place that creates, reads or checks TOTP secrets and backup codes.
 *  - an ENROLLED user's login challenge is a plain "code required" answer: never a secret, QR or otpauth URI, and nothing is generated or saved;
 *  - enrollment (start / confirm) works strictly on the CALLER'S OWN account (the user id comes from the session, never from the request body);
 *  - an already-enrolled account cannot be re-enrolled through this service (409), so nobody can replace a live secret;
 *  - the secret stays encrypted at rest (EncryptionService) and is returned in plain text only by startSetup, once, to its owner.
 * The TOTP library and the QR renderer are injected, so the rules are testable without the real libraries.
 */
import type { StoragePort, User } from '../storage/StoragePort';
import { EncryptionService } from '../crypto/EncryptionService';

export interface TotpDeps {
  generateSecret(): string;
  generateURI(o: { label: string; issuer: string; secret: string }): string;
  verify(o: { token: string; secret: string }): Promise<{ valid: boolean }> | { valid: boolean };
  qrDataUrl(uri: string): Promise<string>;
}

export type TfFail = { ok: false; status: number; type: string; title: string; detail: string; code: string };
const fail = (status: number, code: string, title: string, detail: string): TfFail => ({ ok: false, status, code, type: `https://api.an-erp.local/errors/${code}`, title, detail });

export class TwoFactorService {
  constructor(private deps: TotpDeps) {}

  /** The ONLY body /api/auth/login may return when an enrolled user has not supplied a code. */
  static loginChallenge(anomalyDetected: boolean, anomalyMessage?: string) {
    return {
      requires2FA: true as const,
      setupRequired: false as const,
      anomalyDetected,
      securityNote: anomalyMessage || 'يلزم إدخال رمز التحقق الثنائي لإكمال تسجيل الدخول.',
    };
  }

  private decrypt(user: User): string | null {
    if (!user.twoFactorSecret) return null;
    try {
      const dec = EncryptionService.decryptPII<string>(user.twoFactorSecret);
      return typeof dec === 'string' && dec.length > 0 ? dec : null;
    } catch {
      return null;   // never log the secret or the error payload; never regenerate here
    }
  }

  /** Second factor at login. A TOTP code is accepted only from an ENROLLED user; a failed decrypt is a failure (never a new secret). */
  async verifyLoginSecondFactor(
    storage: StoragePort,
    user: User,
    input: { twoFactorCode?: string; backupCode?: string }
  ): Promise<{ valid: boolean; usedBackupCode: boolean; remainingBackupCodes?: number }> {
    if (!user.twoFactorEnabled) return { valid: false, usedBackupCode: false };
    if (input.twoFactorCode) {
      const secret = this.decrypt(user);
      if (!secret) return { valid: false, usedBackupCode: false };
      const r = await this.deps.verify({ token: String(input.twoFactorCode), secret });
      return { valid: !!r.valid, usedBackupCode: false };
    }
    if (input.backupCode) {
      const codes = user.backupCodes || user.hashedBackupCodes || [];
      const c = EncryptionService.verifyAndConsumeBackupCode(String(input.backupCode), codes);
      if (!c.valid) return { valid: false, usedBackupCode: false };
      await storage.updateUser(user.id, { backupCodes: c.remainingHashedCodes, hashedBackupCodes: c.remainingHashedCodes });
      return { valid: true, usedBackupCode: true, remainingBackupCodes: c.remainingHashedCodes.length };
    }
    return { valid: false, usedBackupCode: false };
  }

  private async owner(storage: StoragePort, actor: { tenantId: string; userId: string }): Promise<{ ok: true; user: User } | TfFail> {
    const r = await storage.getUser(actor.tenantId, actor.userId);   // tenant-scoped lookup of the CALLER
    if (!r.success || !r.data || r.data.tenantId !== actor.tenantId || r.data.id !== actor.userId) {
      return fail(404, 'user-not-found', 'المستخدم غير موجود', 'تعذّر العثور على حسابك.');
    }
    return { ok: true, user: r.data };
  }

  /** Explicit enrollment start: generates a secret for the CALLER only, stores it encrypted (2FA stays disabled until confirmed). */
  async startSetup(storage: StoragePort, actor: { tenantId: string; userId: string }) {
    const o = await this.owner(storage, actor);
    if (!o.ok) return o;
    if (o.user.twoFactorEnabled) return fail(409, 'two-factor-already-enrolled', 'التحقق الثنائي مفعّل بالفعل', 'لا يمكن إعادة التهيئة لحساب مفعّل؛ اطلب إعادة تعيين من مسؤول النظام.');
    const secret = this.deps.generateSecret();
    await storage.updateUser(o.user.id, { twoFactorSecret: EncryptionService.encryptPII(secret) });
    const otpauthUrl = this.deps.generateURI({ label: o.user.username, issuer: 'A.N ERP', secret });
    return { ok: true as const, secret, otpauthUrl, qrCodeDataUrl: await this.deps.qrDataUrl(otpauthUrl), username: o.user.username };
  }

  /** Confirms enrollment with a valid code; a wrong code leaves 2FA disabled. */
  async confirmSetup(storage: StoragePort, actor: { tenantId: string; userId: string }, token: string) {
    const o = await this.owner(storage, actor);
    if (!o.ok) return o;
    if (o.user.twoFactorEnabled) return fail(409, 'two-factor-already-enrolled', 'التحقق الثنائي مفعّل بالفعل', 'الحساب مفعّل مسبقًا.');
    const secret = this.decrypt(o.user);
    if (!secret) return fail(400, 'two-factor-not-initialised', 'لم تُبدأ التهيئة', 'ابدأ التهيئة أولًا.');
    const r = await this.deps.verify({ token: String(token || ''), secret });
    if (!r.valid) return { ...fail(400, 'invalid-2fa', 'رمز التحقق غير صحيح', 'رمز TOTP غير صحيح أو منتهي الصلاحية.'), username: o.user.username };
    await storage.updateUser(o.user.id, { twoFactorEnabled: true });
    return { ok: true as const, username: o.user.username };
  }
}
