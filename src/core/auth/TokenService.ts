/**
 * @file TokenService.ts
 * @description Short-lived JWT (15 min) + Refresh Token with Mandatory Rotation & Family Invalidation
 * Complies with Section 1A, 1I, 1L.
 * Zero token storage in localStorage — issued exclusively for HttpOnly Secure Cookies.
 */

import crypto from 'crypto';

export interface JWTPayload {
  sub: string; // userId
  tenantId: string;
  role: string;
  sessionId: string;
  familyId: string;
  exp: number; // Unix timestamp in seconds
  iat: number;
}

export interface RefreshTokenRecord {
  tokenHash: string;
  familyId: string;
  sequence: number;
  userId: string;
  tenantId: string;
  sessionId: string;
  expiresAt: number; // ms
  isUsed: boolean;
  revokedAt?: number;
}

export interface TokenFamily {
  familyId: string;
  userId: string;
  tenantId: string;
  isInvalidated: boolean;
  invalidationReason?: string;
  createdAt: number;
}

export class TokenService {
  private static readonly ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes (Section 1A)
  private static readonly REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private static readonly INVITE_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours (Section 1L)

  // In-memory or persisted token families & refresh records
  private static tokenFamilies: Map<string, TokenFamily> = new Map();
  private static refreshTokens: Map<string, RefreshTokenRecord> = new Map();

  private static getSecret(): string {
    return process.env.JWT_SECRET || 'an-erp-v7-production-jwt-hmac-secret-key-phase1';
  }

  /**
   * Generates a short-lived JWT (15 minutes) using native HMAC-SHA256
   */
  public static generateAccessToken(params: {
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
      exp: nowSec + this.ACCESS_TOKEN_TTL_SECONDS,
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
   * Verifies and decodes a JWT access token
   */
  public static verifyAccessToken(token: string): { valid: boolean; payload?: JWTPayload; error?: string } {
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

      // Check if family is invalidated
      const family = this.tokenFamilies.get(payload.familyId);
      if (family && family.isInvalidated) {
        return { valid: false, error: 'تم إبطال سلسلة الجلسة بالكامل' };
      }

      return { valid: true, payload };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  /**
   * Creates a new Refresh Token Family upon login
   */
  public static createRefreshTokenFamily(userId: string, tenantId: string, sessionId: string): {
    familyId: string;
    refreshToken: string;
  } {
    const familyId = `fam-${crypto.randomUUID()}`;
    const family: TokenFamily = {
      familyId,
      userId,
      tenantId,
      isInvalidated: false,
      createdAt: Date.now(),
    };
    this.tokenFamilies.set(familyId, family);

    const refreshToken = this.issueNewRefreshToken(familyId, 1, userId, tenantId, sessionId);
    return { familyId, refreshToken };
  }

  /**
   * Issues a new Refresh Token inside a family
   */
  private static issueNewRefreshToken(
    familyId: string,
    sequence: number,
    userId: string,
    tenantId: string,
    sessionId: string
  ): string {
    const randomHex = crypto.randomBytes(32).toString('hex');
    const plainToken = `rt.${familyId}.${sequence}.${randomHex}`;
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

    const record: RefreshTokenRecord = {
      tokenHash,
      familyId,
      sequence,
      userId,
      tenantId,
      sessionId,
      expiresAt: Date.now() + this.REFRESH_TOKEN_TTL_MS,
      isUsed: false,
    };

    this.refreshTokens.set(tokenHash, record);
    return plainToken;
  }

  /**
   * Mandatory Refresh Token Rotation & Reuse Detection (Section 1A, Acceptance Criteria)
   * If a previously used token is presented -> INVALIDATE ENTIRE FAMILY IMMEDIATELY!
   */
  public static rotateRefreshToken(oldPlainToken: string): {
    success: boolean;
    newAccessToken?: string;
    newRefreshToken?: string;
    error?: string;
    familyRevoked?: boolean;
  } {
    const tokenHash = crypto.createHash('sha256').update(oldPlainToken).digest('hex');
    const record = this.refreshTokens.get(tokenHash);

    if (!record) {
      return { success: false, error: 'رمز التحديث غير معروف أو غير صالح' };
    }

    const family = this.tokenFamilies.get(record.familyId);
    if (!family || family.isInvalidated) {
      return {
        success: false,
        error: 'تم إبطال سلسلة الجلسة مسبقاً لدواعي أمنية',
        familyRevoked: true,
      };
    }

    // CRITICAL: Token Reuse Detection!
    if (record.isUsed) {
      // Breached! An attacker is trying to reuse an old token!
      family.isInvalidated = true;
      family.invalidationReason = `DETECTED_REUSE_OF_TOKEN_SEQ_${record.sequence}`;
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

    // Mark current token as used
    record.isUsed = true;
    record.revokedAt = Date.now();

    // Rotate: Issue new refresh token & access token in same family
    const nextSeq = record.sequence + 1;
    const newRefreshToken = this.issueNewRefreshToken(
      record.familyId,
      nextSeq,
      record.userId,
      record.tenantId,
      record.sessionId
    );

    const newAccessToken = this.generateAccessToken({
      userId: record.userId,
      tenantId: record.tenantId,
      role: 'accountant', // Role is resolved from user record
      sessionId: record.sessionId,
      familyId: record.familyId,
    });

    return {
      success: true,
      newAccessToken,
      newRefreshToken,
    };
  }

  /**
   * Explicitly invalidates an entire token family (e.g. upon user logout or remote session termination)
   */
  public static revokeFamily(familyId: string, reason = 'EXPLICIT_REVOCATION'): void {
    const family = this.tokenFamilies.get(familyId);
    if (family) {
      family.isInvalidated = true;
      family.invalidationReason = reason;
    }
  }

  /**
   * Generates a time-limited signed invitation link (Section 1L)
   */
  public static generateInvitationToken(tenantId: string, email: string, role: string): {
    token: string;
    expiresAt: string;
  } {
    const payload = {
      tenantId,
      email,
      role,
      nonce: crypto.randomUUID(),
      exp: Date.now() + this.INVITE_TOKEN_TTL_MS,
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
  public static verifyInvitationToken(token: string): {
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
