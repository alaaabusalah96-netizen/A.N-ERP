/**
 * AN-AUTH-BRIDGE-1 — map A.N user → Firebase custom token (best-effort).
 */
import type { User } from '../an-core/storage/StoragePort';
import crypto from 'crypto';

export interface FirebaseBridgeResult {
  ok: boolean;
  customToken?: string;
  code?: string;
  firebaseUid?: string;
}

/**
 * Find or create a Firestore users doc for the A.N user, then createCustomToken(uid).
 * adminDb / getAdminAuth injected from server to avoid circular imports.
 */
export async function issueFirebaseCustomTokenForAnUser(deps: {
  adminDb: any;
  getAdminAuth: () => any;
  anUser: {
    id: string;
    username: string;
    fullName?: string;
    role?: string;
    tenantId: string;
    email?: string;
  };
}): Promise<FirebaseBridgeResult> {
  const { adminDb, getAdminAuth, anUser } = deps;
  if (!adminDb || typeof getAdminAuth !== 'function') {
    return { ok: false, code: 'admin_unavailable' };
  }
  try {
    const email =
      (anUser.email || '').trim().toLowerCase() ||
      (anUser.username.includes('@')
        ? anUser.username.trim().toLowerCase()
        : `${anUser.username.trim().toLowerCase()}@an-local.invalid`);
    const users = adminDb.collection('users');

    // Prefer lookup by an_user_id, then email
    let uid: string | null = null;
    try {
      const byAn = await users.where('an_user_id', '==', anUser.id).limit(1).get();
      if (!byAn.empty) uid = byAn.docs[0].id;
    } catch {
      /* index optional */
    }
    if (!uid) {
      try {
        const byEmail = await users.where('email', '==', email).limit(1).get();
        if (!byEmail.empty) uid = byEmail.docs[0].id;
      } catch {
        /* ignore */
      }
    }
    if (!uid) {
      // Stable deterministic uid namespace (not a password)
      uid = 'an_' + crypto.createHash('sha256').update(anUser.tenantId + ':' + anUser.id).digest('hex').slice(0, 28);
      await users.doc(uid).set(
        {
          email,
          full_name: anUser.fullName || anUser.username,
          role: anUser.role || 'Admin',
          company_id: anUser.tenantId === 'default' ? null : anUser.tenantId,
          an_user_id: anUser.id,
          an_tenant_id: anUser.tenantId,
          is_active: true,
          auth_bridge: 'an-auth-bridge-1',
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
    } else {
      await users.doc(uid).set(
        {
          an_user_id: anUser.id,
          an_tenant_id: anUser.tenantId,
          auth_bridge: 'an-auth-bridge-1',
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    const customToken = await getAdminAuth().createCustomToken(uid, {
      an_user_id: anUser.id,
      an_tenant_id: anUser.tenantId,
    });
    return { ok: true, customToken, firebaseUid: uid };
  } catch (e: any) {
    return { ok: false, code: 'custom_token_failed' };
  }
}
