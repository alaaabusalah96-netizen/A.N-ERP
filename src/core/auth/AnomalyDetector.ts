/**
 * @file AnomalyDetector.ts
 * @description Deterministic Impossible Travel Engine & Progressive Account Lockout & Concurrent Session Limits
 * Complies with Section 1D, 1I, 1J, 1K.
 * Pure deterministic mathematics (Haversine formula + velocity threshold), zero ML or guessing.
 */

export interface GeoLocation {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface LoginAttemptRecord {
  userId: string;
  location: GeoLocation;
  ip: string;
  timestamp: number;
}

export interface LockoutStatus {
  isLocked: boolean;
  failedAttempts: number;
  lockedUntil?: number;
  lockoutDurationMinutes: number;
}

export class AnomalyDetector {
  // Threshold: Max realistic physical travel velocity (800 km/h)
  private static readonly MAX_VELOCITY_KM_PER_HOUR = 800;

  // History of last successful logins by user
  private static lastSuccessfulLogins: Map<string, LoginAttemptRecord> = new Map();

  // Failed attempts tracker for progressive lockout
  private static failedAttemptsMap: Map<string, { count: number; lockedUntil?: number }> = new Map();

  // Concurrent active sessions tracking
  private static activeSessionsByUser: Map<string, Array<{ sessionId: string; role: string; createdAt: number }>> = new Map();

  // Configurable concurrent sessions limit per role (Section 1K)
  private static readonly CONCURRENT_LIMIT_BY_ROLE: Record<string, number> = {
    financial_approver: 1, // Stricter security for approvers
    accountant: 2,
    warehouse_keeper: 2,
    sales_officer: 3,
    branch_manager: 2,
    fleet_supervisor: 2,
  };

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
  public static checkImpossibleTravel(
    userId: string,
    currentLocation: GeoLocation,
    currentTimestamp = Date.now()
  ): {
    isAnomaly: boolean;
    distanceKm?: number;
    hoursElapsed?: number;
    velocityKmPerHour?: number;
    message?: string;
  } {
    const previous = this.lastSuccessfulLogins.get(userId);
    if (!previous) {
      return { isAnomaly: false };
    }

    const distanceKm = this.calculateHaversineDistanceKm(
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

    if (velocity > this.MAX_VELOCITY_KM_PER_HOUR && distanceKm > 100) {
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
  public static recordSuccessfulLogin(userId: string, location: GeoLocation, ip: string): void {
    this.lastSuccessfulLogins.set(userId, {
      userId,
      location,
      ip,
      timestamp: Date.now(),
    });

    // Reset failed attempts on success
    this.failedAttemptsMap.delete(userId);
  }

  /**
   * Progressive Account Lockout (Section 1D)
   * 5 failed attempts -> 5 minutes
   * 10 failed attempts -> 15 minutes
   * 15+ failed attempts -> 60 minutes
   */
  public static recordFailedAttempt(userId: string): LockoutStatus {
    const current = this.failedAttemptsMap.get(userId) || { count: 0 };
    current.count += 1;

    let durationMinutes = 0;
    let lockedUntil: number | undefined;

    if (current.count >= 15) {
      durationMinutes = 60;
      lockedUntil = Date.now() + 60 * 60 * 1000;
    } else if (current.count >= 10) {
      durationMinutes = 15;
      lockedUntil = Date.now() + 15 * 60 * 1000;
    } else if (current.count >= 5) {
      durationMinutes = 5;
      lockedUntil = Date.now() + 5 * 60 * 1000;
    }

    if (lockedUntil) {
      current.lockedUntil = lockedUntil;
    }

    this.failedAttemptsMap.set(userId, current);

    return {
      isLocked: !!lockedUntil,
      failedAttempts: current.count,
      lockedUntil,
      lockoutDurationMinutes: durationMinutes,
    };
  }

  /**
   * Checks if user is currently locked out
   */
  public static checkLockout(userId: string): LockoutStatus {
    const record = this.failedAttemptsMap.get(userId);
    if (!record) {
      return { isLocked: false, failedAttempts: 0, lockoutDurationMinutes: 0 };
    }

    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingMinutes = Math.ceil((record.lockedUntil - Date.now()) / (60 * 1000));
      return {
        isLocked: true,
        failedAttempts: record.count,
        lockedUntil: record.lockedUntil,
        lockoutDurationMinutes: remainingMinutes,
      };
    }

    // If lock expired, remove lock but keep count
    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
      record.lockedUntil = undefined;
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
  public static checkConcurrentSessionLimit(
    userId: string,
    role: string
  ): {
    limitExceeded: boolean;
    maxAllowed: number;
    currentActiveCount: number;
    oldestSessionId?: string;
  } {
    const limit = this.CONCURRENT_LIMIT_BY_ROLE[role] || 2;
    const active = this.activeSessionsByUser.get(userId) || [];

    if (active.length >= limit) {
      const oldest = active.sort((a, b) => a.createdAt - b.createdAt)[0];
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
  public static registerActiveSession(userId: string, sessionId: string, role: string): void {
    const active = this.activeSessionsByUser.get(userId) || [];
    active.push({ sessionId, role, createdAt: Date.now() });
    this.activeSessionsByUser.set(userId, active);
  }

  /**
   * Removes a session upon logout or termination
   */
  public static terminateSession(userId: string, sessionId: string): void {
    const active = this.activeSessionsByUser.get(userId) || [];
    const filtered = active.filter((s) => s.sessionId !== sessionId);
    this.activeSessionsByUser.set(userId, filtered);
  }
}
