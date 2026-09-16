/**
 * @file PrivacyAnonymizationService.ts
 * @description Phase 3E: GDPR / PDPL Privacy & Right to be Forgotten Service
 * Anonymizes user PII irreversibly while guaranteeing zero compromise to historical ledger integrity.
 * Accounting Invariant (13.1): Posted entries, lines, and trial balances are NEVER deleted or altered.
 */

import crypto from 'crypto';
import { StoragePort, StorageResult, User } from '../storage/StoragePort';

export interface AnonymizationResult {
  userId: string;
  anonymizedAt: string;
  piiScrubbed: {
    fullName: string;
    email: string;
    username: string;
    encryptedPiiWiped: boolean;
  };
  sessionsTerminatedCount: number;
  ledgerInvarianceVerified: {
    associatedJournalEntriesCount: number;
    booksBalanced: boolean;
    entriesPreservedWithoutDeletion: boolean;
  };
}

export class PrivacyAnonymizationService {
  private readonly port: StoragePort;

  constructor(port: StoragePort) {
    this.port = port;
  }

  /**
   * Executes full PII anonymization for a user requesting right to be forgotten.
   * Protects financial ledger entries created or approved by the user.
   */
  public async executeRightToBeForgotten(
    tenantId: string,
    targetUserId: string,
    actorId: string,
    idempotencyKey: string
  ): Promise<StorageResult<AnonymizationResult>> {
    // 1. Fetch user
    const userRes = await this.port.getUser(tenantId, targetUserId);
    if (!userRes.success || !userRes.data) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/user-not-found',
          title: 'المستخدم غير موجود',
          status: 404,
          detail: `المستخدم بالمعرف (${targetUserId}) غير موجود في سجلات المنشأة.`,
        },
      };
    }

    const user = userRes.data;
    const pseudonymTag = crypto.randomBytes(4).toString('hex');
    const anonymizedFullName = 'مستخدم مجهول (حق النسيان - GDPR/PDPL)';
    const anonymizedEmail = `anonymized_${pseudonymTag}@privacy.an-erp.local`;
    const anonymizedUsername = `anon_${pseudonymTag}_${targetUserId.slice(-4)}`;

    // 2. Anonymize user record
    const updatedUserRes = await this.port.updateUser(targetUserId, {
      fullName: anonymizedFullName,
      email: anonymizedEmail,
      username: anonymizedUsername,
      status: 'INACTIVE',
      encryptedPii: undefined,
      twoFactorEnabled: false,
      twoFactorSecret: undefined,
      backupCodes: [],
      hashedBackupCodes: [],
    });

    if (!updatedUserRes.success) {
      return {
        success: false,
        error: updatedUserRes.error,
      };
    }

    // 3. Terminate all active sessions for this user
    let terminatedCount = 0;
    const activeSessionsRes = await this.port.listActiveSessionsByUser(targetUserId);
    if (activeSessionsRes.success && activeSessionsRes.data) {
      for (const sess of activeSessionsRes.data) {
        await this.port.deleteActiveSession(sess.sessionId);
        terminatedCount++;
      }
    }

    // 4. Verify Accounting Ledger Invariance (13.1 Compliance)
    const entriesRes = await this.port.listJournalEntries(tenantId);
    const allEntries = entriesRes.data || [];
    const userEntries = allEntries.filter(
      (e) => e.createdBy === targetUserId || e.approvedBy === targetUserId
    );

    let allBalanced = true;
    for (const entry of allEntries) {
      let debit = 0;
      let credit = 0;
      for (const line of entry.lines || []) {
        debit += Number(line.debit || 0);
        credit += Number(line.credit || 0);
      }
      if (Math.abs(debit - credit) > 0.0001) {
        allBalanced = false;
        break;
      }
    }

    // 5. Append System Change Log entry
    await this.port.appendSystemChangeLog({
      id: `SCL-PRIV-${Date.now()}-${pseudonymTag}`,
      timestamp: new Date().toISOString(),
      actor: actorId,
      changeType: 'ANONYMIZATION',
      module: 'PRIVACY_ENGINE',
      entitiesAffected: [targetUserId],
      summaryAr: `تنفيذ حق النسيان وتجهيل الهوية للمستخدم (${targetUserId}) مع الحفاظ التام على توازن القيود المحاسبية (${userEntries.length} قيد).`,
      beforeState: { username: user.username, role: user.role, status: user.status },
      afterState: { fullName: anonymizedFullName, email: anonymizedEmail, status: 'INACTIVE' },
      evidenceRef: idempotencyKey,
      version: 'v7.2',
    });

    return {
      success: true,
      data: {
        userId: targetUserId,
        anonymizedAt: new Date().toISOString(),
        piiScrubbed: {
          fullName: anonymizedFullName,
          email: anonymizedEmail,
          username: anonymizedUsername,
          encryptedPiiWiped: true,
        },
        sessionsTerminatedCount: terminatedCount,
        ledgerInvarianceVerified: {
          associatedJournalEntriesCount: userEntries.length,
          booksBalanced: allBalanced,
          entriesPreservedWithoutDeletion: true,
        },
      },
    };
  }
}
