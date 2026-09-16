/**
 * @file AnomalyDetector.ts
 * @description Deterministic Impossible Travel Engine & Progressive Account Lockout & Concurrent Session Limits
 * Complies with Section 1D, 1I, 1J, 1K.
 * Pure deterministic mathematics (Haversine formula + velocity threshold), zero ML or guessing.
 * All state is persisted via StoragePort — zero in-memory static Maps.
 */

import type { StoragePort, GeoLocation, LoginAttemptRecord, ActiveSessionRecord } from '../storage/StoragePort';
import { InMemoryAdapter } from '../storage/adapters/InMemoryAdapter';

export type { GeoLocation, LoginAttemptRecord, ActiveSessionRecord };

export interface LockoutStatus {
  isLocked: boolean;
  failedAttempts: number;
  lockedUntil?: number;
  lockoutDurationMinutes: number;
}

export class AnomalyDetector {
  // Threshold: Max realistic physical travel velocity (800 km/h)
  private static readonly MAX_VELOCITY_KM_PER_HOUR = 800;

  // جلسة بلا أي نشاط لهذه المدة تُعتبر مهجورة (انقطاع/إغلاق بدون تسجيل خروج)
  // ويتم حذفها بدل أن تحتل مكانًا دائمًا من حد الجلسات المتزامنة.
  private static readonly STALE_SESSION_MS = 24 * 60 * 60 * 1000; // 24 ساعة

  // Configurable concurrent sessions limit per role (Section 1K)
  private static readonly CONCURRENT_LIMIT_BY_ROLE: Record<string, number> = {
    financial_approver: 1, // Stricter security for approvers
    accountant: 2,
    warehouse_keeper: 2,
    sales_officer: 3,
    branch_manager: 2,
    fleet_supervisor: 2,
  };

  private storage: StoragePort;

  constructor(storage?: StoragePort) {
    this.storage = storage || new InMemoryAdapter();
  }

  /**
   * Calculates distance in kilometers between two geo-coordinates using the Haversine formula
   */
  public static calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Deterministic Impossible Travel Check (Section 1J)
   * Returns whether impossible travel occurred, forcing 2FA challenge and security alert.
   */
  public async checkImpossibleTravel(
    userId: string,
    currentLocation: GeoLocation,
    currentTimestamp = Date.now()
  ): Promise<{
    isAnomaly: boolean;
    distanceKm?: number;
    hoursElapsed?: number;
    velocityKmPerHour?: number;
    message?: string;
  }> {
    const res = await this.storage.getLastSuccessfulLogin(userId);
    const previous = res.success ? res.data : null;
    if (!previous) {
      return { isAnomaly: false };
    }

    const distanceKm = AnomalyDetector.calculateHaversineDistanceKm(
      previous.location.lat,
      previous.location.lon,
      currentLocation.lat,
      currentLocation.lon
    );

    const msElapsed = currentTimestamp - previous.timestamp;
    const hoursElapsed = msElapsed / (1000 * 60 * 60);

    // If logins happened within less than 30 seconds across distinct locations > 50km
    if (hoursElapsed <= 0.01) {
      if (distanceKm > 50) {
        return {
          isAnomaly: true,
          distanceKm: Math.round(distanceKm),
          hoursElapsed: 0.01,
          velocityKmPerHour: 5000,
          message: `تم رصد قفزة جغرافية مستحيلة (${Math.round(distanceKm)} كم خلال ثوانٍ معدودة بين ${previous.location.city} و ${currentLocation.city}). تم فرض التحقق الثنائي وإطلاق تنبيه أمني.`,
        };
      }
      return { isAnomaly: false };
    }

    const velocity = distanceKm / hoursElapsed;

    if (velocity > AnomalyDetector.MAX_VELOCITY_KM_PER_HOUR && distanceKm > 100) {
      return {
        isAnomaly: true,
        distanceKm: Math.round(distanceKm),
        hoursElapsed: parseFloat(hoursElapsed.toFixed(2)),
        velocityKmPerHour: Math.round(velocity),
        message: `تم رصد قفزة جغرافية مستحيلة بسرعة مقدرة ${Math.round(velocity)} كم/ساعة عبر مسافة ${Math.round(distanceKm)} كم. تم فرض التحقق الثنائي فورا.`,
      };
    }

    return {
      isAnomaly: false,
      distanceKm: Math.round(distanceKm),
      hoursElapsed: parseFloat(hoursElapsed.toFixed(2)),
      velocityKmPerHour: Math.round(velocity),
    };
  }

  /**
   * Records a successful login for future geo-velocity checks
   */
  public async recordSuccessfulLogin(
    userId: string,
    location: GeoLocation,
    ip: string,
    tenantId?: string
  ): Promise<void> {
    await this.storage.recordSuccessfulLogin({
      userId,
      tenantId,
      location,
      ip,
      timestamp: Date.now(),
    });
  }

  /**
   * Progressive Account Lockout (Section 1D)
   * 5 failed attempts -> 5 minutes
   * 10 failed attempts -> 15 minutes
   * 15+ failed attempts -> 60 minutes
   */
  public async recordFailedAttempt(userId: string): Promise<LockoutStatus> {
    const res = await this.storage.getFailedLoginAttempts(userId);
    const count = (res.success && res.data ? res.data.count : 0) + 1;

    let durationMinutes = 0;
    let lockedUntil: number | undefined;

    if (count >= 15) {
      durationMinutes = 60;
      lockedUntil = Date.now() + 60 * 60 * 1000;
    } else if (count >= 10) {
      durationMinutes = 15;
      lockedUntil = Date.now() + 15 * 60 * 1000;
    } else if (count >= 5) {
      durationMinutes = 5;
      lockedUntil = Date.now() + 5 * 60 * 1000;
    }

    await this.storage.recordFailedLoginAttempt(userId, count, lockedUntil);

    return {
      isLocked: !!lockedUntil,
      failedAttempts: count,
      lockedUntil,
      lockoutDurationMinutes: durationMinutes,
    };
  }

  /**
   * Checks if user is currently locked out
   */
  public async checkLockout(userId: string): Promise<LockoutStatus> {
    const res = await this.storage.getFailedLoginAttempts(userId);
    if (!res.success || !res.data) {
      return { isLocked: false, failedAttempts: 0, lockoutDurationMinutes: 0 };
    }

    const record = res.data;
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingMinutes = Math.ceil((record.lockedUntil - Date.now()) / (60 * 1000));
      return {
        isLocked: true,
        failedAttempts: record.count,
        lockedUntil: record.lockedUntil,
        lockoutDurationMinutes: remainingMinutes,
      };
    }

    return {
      isLocked: false,
      failedAttempts: record.count,
      lockoutDurationMinutes: 0,
    };
  }

  /**
   * Concurrent Session Policy Enforcement (Section 1K)
   * When limit exceeded: prompt user to terminate oldest session or reject new.
   */
  public async checkConcurrentSessionLimit(
    userId: string,
    role: string
  ): Promise<{
    limitExceeded: boolean;
    maxAllowed: number;
    currentActiveCount: number;
    oldestSessionId?: string;
  }> {
    const limit = AnomalyDetector.CONCURRENT_LIMIT_BY_ROLE[role] || 2;
    const res = await this.storage.listActiveSessionsByUser(userId);
    const allSessions = res.success && res.data ? res.data : [];

    // تنظيف الجلسات المهجورة قبل العدّ، بحيث لا تحتل مكانًا دائمًا من الحد
    const now = Date.now();
    const active: ActiveSessionRecord[] = [];
    for (const session of allSessions) {
      if (now - session.lastActiveAt > AnomalyDetector.STALE_SESSION_MS) {
        await this.storage.deleteActiveSession(session.sessionId);
      } else {
        active.push(session);
      }
    }

    if (active.length >= limit) {
      const oldest = [...active].sort((a, b) => a.createdAt - b.createdAt)[0];
      return {
        limitExceeded: true,
        maxAllowed: limit,
        currentActiveCount: active.length,
        oldestSessionId: oldest?.sessionId,
      };
    }

    return {
      limitExceeded: false,
      maxAllowed: limit,
      currentActiveCount: active.length,
    };
  }

  /**
   * Registers a session in active sessions tracker
   */
  public async registerActiveSession(session: ActiveSessionRecord): Promise<void> {
    await this.storage.saveActiveSession(session);
  }

  /**
   * Removes a session upon logout or termination
   */
  public async terminateSession(sessionId: string): Promise<void> {
    await this.storage.deleteActiveSession(sessionId);
  }
}
