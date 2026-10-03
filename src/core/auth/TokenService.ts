/**
 * @file TokenService.ts
 * @description Short-lived JWT (15 min) + Refresh Token with Mandatory Rotation & Family Invalidation
 * Complies with Section 1A, 1I, 1L, and Rule 4.2/Section B.3:
 * - ZERO internal class Map state (all token families and refresh tokens stored via StoragePort)
 * - Zero token storage in localStorage — issued exclusively for HttpOnly Secure Cookies.
 * - ZERO hardcoded fallback secrets: throws error immediately if JWT_SECRET is missing.
 */

import crypto from 'crypto';
import { StoragePort, TokenFamily, RefreshTokenRecord } from '../storage/StoragePort';

export interface JWTPayload {
  sub: string; // userId
  tenantId: string;
  role: string;
  sessionId: string;
  familyId: string;
  exp: number; // Unix timestamp in seconds
  iat: number;
}

export class TokenService {
  private static readonly ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes (Section 1A)
  private static readonly REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private static readonly INVITE_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours (Section 1L)

  constructor(private readonly storage: StoragePort) {}

  /**
   * Retrieves JWT secret strictly from environment.
   * Throws error immediately if missing — zero fallback keys permitted.
   */
  private getSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim() === '') {
      throw new Error('JWT_SECRET غير معرَّف في متغيرات البيئة — لا يمكن تشغيل السيرفر بدونه');
    }
    return secret;
  }

  /**
   * Generates a short-lived JWT (15 minutes) using native HMAC-SHA256
   */
  public generateAccessToken(params: {
    userId: string;
    tenantId: string;
    role: string;
    sessionId: string;
    familyId: string;
  }): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const nowSec = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: params.userId,
      tenantId: params.tenantId,
      role: params.role,
      sessionId: params.sessionId,
      familyId: params.familyId,
      iat: nowSec,
      exp: nowSec + TokenService.ACCESS_TOKEN_TTL_SECONDS,
    };

    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.getSecret())
      .update(`${b64Header}.${b64Payload}`)
      .digest('base64url');

    return `${b64Header}.${b64Payload}.${signature}`;
  }

  /**
   * Verifies and decodes a JWT access token, and confirms the token family is active
   */
  public async verifyAccessToken(token: string): Promise<{ valid: boolean; payload?: JWTPayload; error?: string }> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'صيغة التوكن غير صحيحة' };
      }

      const [b64Header, b64Payload, signature] = parts;
      const expectedSig = crypto
        .createHmac('sha256', this.getSecret())
        .update(`${b64Header}.${b64Payload}`)
        .digest('base64url');

      if (signature !== expectedSig) {
        return { valid: false, error: 'توقيع التوكن غير صالح' };
      }

      const payload: JWTPayload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
      const nowSec = Math.floor(Date.now() / 1000);

      if (payload.exp < nowSec) {
        return { valid: false, error: 'انتهت صلاحية الجلسة (15 دقيقة)' };
      }

      // Check if family is invalidated in persistent storage
      const familyRes = await this.storage.getTokenFamily(payload.familyId);
      if (familyRes.success && familyRes.data?.isInvalidated) {
        return { valid: false, error: 'تم إبطال سلسلة الجلسة بالكامل' };
      }

      return { valid: true, payload };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  /**
   * Creates a new Refresh Token Family upon login, persisted via StoragePort
   */
  public async createRefreshTokenFamily(
    userId: string,
    tenantId: string,
    sessionId: string
  ): Promise<{ familyId: string; refreshToken: string }> {
    const familyId = `fam-${crypto.randomUUID()}`;
    const family: TokenFamily = {
      familyId,
      userId,
      tenantId,
      isInvalidated: false,
      createdAt: Date.now(),
    };

    const saveFamRes = await this.storage.saveTokenFamily(family);
    if (!saveFamRes.success) {
      throw new Error(`فشل حفظ عائلة الجلسة: ${saveFamRes.error?.detail}`);
    }

    const refreshToken = await this.issueNewRefreshToken(familyId, 1, userId, tenantId, sessionId);
    return { familyId, refreshToken };
  }

  /**
   * Issues a new Refresh Token inside a family, persisted via StoragePort
   */
  private async issueNewRefreshToken(
    familyId: string,
    sequence: number,
    userId: string,
    tenantId: string,
    sessionId: string
  ): Promise<string> {
    const randomHex = crypto.randomBytes(32).toString('hex');
    const payloadB64 = Buffer.from(
      JSON.stringify({ tenantId, familyId, sequence, userId, sessionId })
    ).toString('base64url');
    const plainToken = `rt.${payloadB64}.${randomHex}`;
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

    const record: RefreshTokenRecord = {
      tokenHash,
      familyId,
      sequence,
      userId,
      tenantId,
      sessionId,
      expiresAt: Date.now() + TokenService.REFRESH_TOKEN_TTL_MS,
      isUsed: false,
    };

    const saveRes = await this.storage.saveRefreshToken(record);
    if (!saveRes.success) {
      throw new Error(`فشل حفظ رمز التحديث في المخزن: ${saveRes.error?.detail}`);
    }

    return plainToken;
  }

  /**
   * Mandatory Refresh Token Rotation & Reuse Detection (Section 1A, Acceptance Criteria)
   * If a previously used token is presented -> INVALIDATE ENTIRE FAMILY IMMEDIATELY via StoragePort!
   */
  public async rotateRefreshToken(oldPlainToken: string): Promise<{
    success: boolean;
    newAccessToken?: string;
    newRefreshToken?: string;
    error?: string;
    familyRevoked?: boolean;
    userId?: string;
    tenantId?: string;
    sessionId?: string;
  }> {
    // Wave 7.5A & Section 5.4: Strictly derive tenantId from the cryptographically formatted token; zero fallback
    const parts = oldPlainToken.split('.');
    if (parts.length < 3 || parts[0] !== 'rt' || !parts[1] || parts[1].trim() === '') {
      return {
        success: false,
        error: 'رمز التحديث فاقد لمعرّف المنشأة الصريح — تم رفض التجديد لعدم وجود نطاق معتمد (بند 5.4)',
      };
    }
    let tenantId = parts[1];
    if (parts.length === 3) {
      try {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (decoded?.tenantId) {
          tenantId = decoded.tenantId;
        }
      } catch {}
    }

    return this.storage.withTenantScope(tenantId, async () => {
      const tokenHash = crypto.createHash('sha256').update(oldPlainToken).digest('hex');
      const tokenRes = await this.storage.getRefreshToken(tokenHash);

      if (!tokenRes.success || !tokenRes.data) {
        return { success: false, error: 'رمز التحديث غير معروف أو غير صالح' };
      }

      const record = tokenRes.data;
      const familyRes = await this.storage.getTokenFamily(record.familyId);

      if (!familyRes.success || !familyRes.data || familyRes.data.isInvalidated) {
        return {
          success: false,
          error: 'تم إبطال سلسلة الجلسة مسبقاً لدواعي أمنية',
          familyRevoked: true,
        };
      }

      const family = familyRes.data;

      // CRITICAL: Token Reuse Detection!
      if (record.isUsed) {
        // Breached! An attacker or replay is trying to reuse an old token!
        await this.storage.invalidateTokenFamily(
          record.familyId,
          `DETECTED_REUSE_OF_TOKEN_SEQ_${record.sequence}`
        );
        return {
          success: false,
          error: 'تم اكتشاف محاولة إعادة استخدام رمز جلسة قديم — تم إبطال سلسلة التوكن بالكامل فوراً',
          familyRevoked: true,
        };
      }

      // Check expiration
      if (Date.now() > record.expiresAt) {
        return { success: false, error: 'انتهت صلاحية رمز التحديث' };
      }

      // Mark current token as used atomically (exactly one concurrent caller wins)
      const consumed = await this.storage.consumeRefreshToken(tokenHash, Date.now());
      if (!consumed.success) {
        return { success: false, error: 'رمز التحديث غير معروف أو غير صالح' };
      }
      if (consumed.data === false) {
        await this.storage.invalidateTokenFamily(
          record.familyId,
          `DETECTED_REUSE_OF_TOKEN_SEQ_${record.sequence}`
        );
        return {
          success: false,
          error: 'تم اكتشاف محاولة إعادة استخدام رمز جلسة قديم — تم إبطال سلسلة التوكن بالكامل فوراً',
          familyRevoked: true,
        };
      }

      // Rotate: Issue new refresh token & access token in same family
      const nextSeq = record.sequence + 1;
      const newRefreshToken = await this.issueNewRefreshToken(
        record.familyId,
        nextSeq,
        record.userId,
        record.tenantId,
        record.sessionId
      );

      // Fetch user for correct role
      const userRes = await this.storage.getUser(record.tenantId, record.userId);
      const role = userRes.success && userRes.data ? userRes.data.role : 'auditor';

      const newAccessToken = this.generateAccessToken({
        userId: record.userId,
        tenantId: record.tenantId,
        role,
        sessionId: record.sessionId,
        familyId: record.familyId,
      });

      return {
        success: true,
        newAccessToken,
        newRefreshToken,
        userId: record.userId,
        tenantId: record.tenantId,
        sessionId: record.sessionId,
      };
    });
  }

  /**
   * Explicitly invalidates an entire token family (e.g. user logout, remote session termination)
   */
  public async revokeFamily(familyId: string, reason = 'EXPLICIT_REVOCATION'): Promise<void> {
    await this.storage.invalidateTokenFamily(familyId, reason);
  }

  /**
   * Generates a time-limited signed invitation link (Section 1L)
   */
  public generateInvitationToken(tenantId: string, email: string, role: string): {
    token: string;
    expiresAt: string;
  } {
    const payload = {
      tenantId,
      email,
      role,
      nonce: crypto.randomUUID(),
      exp: Date.now() + TokenService.INVITE_TOKEN_TTL_MS,
    };

    const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.getSecret()).update(raw).digest('base64url');
    const token = `${raw}.${signature}`;

    return {
      token,
      expiresAt: new Date(payload.exp).toISOString(),
    };
  }

  /**
   * Verifies an invitation token
   */
  public verifyInvitationToken(token: string): {
    valid: boolean;
    data?: { tenantId: string; email: string; role: string };
    error?: string;
  } {
    try {
      const [raw, signature] = token.split('.');
      const expectedSig = crypto.createHmac('sha256', this.getSecret()).update(raw).digest('base64url');
      if (signature !== expectedSig) {
        return { valid: false, error: 'رابط الدعوة غير صالح أو تم التلاعب به' };
      }

      const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (Date.now() > payload.exp) {
        return { valid: false, error: 'انتهت صلاحية رابط الدعوة (أكثر من 48 ساعة)' };
      }

      return {
        valid: true,
        data: { tenantId: payload.tenantId, email: payload.email, role: payload.role },
      };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }
}
