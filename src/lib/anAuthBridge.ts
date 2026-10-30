/**
 * AN-AUTH-BRIDGE-1 / AN-SEC-AUTH-1 — map A.N user -> Firebase custom token (best-effort).
 * SECURITY: a KEMIT users doc is linked ONLY by (an_user_id, an_tenant_id). Never by email/username:
 * tenant-local usernames must never be able to claim an existing KEMIT account.
 */
import crypto from 'crypto';

export interface FirebaseBridgeResult {
  ok: boolean;
  customToken?: string;
  code?: string;
  firebaseUid?: string;
}

const ELEVATED_ROLES = new Set(['SystemAdmin', 'super_admin', 'system_admin']);

/** A.N role -> KEMIT users.role. Elevated roles only survive on the platform tenant ('default'). Missing role never defaults to Admin. */
export function mapAnRoleToKemitRole(role: unknown, tenantId: string): string {
  const r = String(role || '').trim();
  if (!r) return 'User';
  if (ELEVATED_ROLES.has(r)) return tenantId === 'default' ? r : 'Admin';
  return r;
}

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
    const users = adminDb.collection('users');
    let uid: string | null = null;

    // Link ONLY by the (an_user_id, an_tenant_id) pair. A failed lookup is fail-closed (no email fallback).
    let byAn: any;
    try {
      byAn = await users.where('an_user_id', '==', anUser.id).where('an_tenant_id', '==', anUser.tenantId).limit(1).get();
    } catch {
      return { ok: false, code: 'lookup_failed' };
    }
    if (!byAn.empty) uid = byAn.docs[0].id;

    if (!uid) {
      const detUid = 'an_' + crypto.createHash('sha256').update(anUser.tenantId + ':' + anUser.id).digest('hex').slice(0, 28);
      const existing = await users.doc(detUid).get();
      if (existing.exists) {
        const d = existing.data() || {};
        if (d.an_user_id && (d.an_user_id !== anUser.id || d.an_tenant_id !== anUser.tenantId)) {
          return { ok: false, code: 'uid_conflict' };
        }
      }
      // Use the real email only if no other KEMIT user owns it; otherwise a synthetic, unique one.
      const wanted =
        (anUser.email || '').trim().toLowerCase() ||
        (anUser.username.includes('@') ? anUser.username.trim().toLowerCase() : '');
      let email = `${detUid}@an-local.invalid`;
      if (wanted) {
        const owner = await users.where('email', '==', wanted).limit(1).get();
        if (owner.empty) email = wanted;
      }
      uid = detUid;
      await users.doc(uid).set(
        {
          email,
          full_name: anUser.fullName || anUser.username,
          role: mapAnRoleToKemitRole(anUser.role, anUser.tenantId),
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
        { an_user_id: anUser.id, an_tenant_id: anUser.tenantId, auth_bridge: 'an-auth-bridge-1', updated_at: new Date().toISOString() },
        { merge: true }
      );
    }

    const customToken = await getAdminAuth().createCustomToken(uid, {
      an_user_id: anUser.id,
      an_tenant_id: anUser.tenantId,
    });
    return { ok: true, customToken, firebaseUid: uid };
  } catch {
    return { ok: false, code: 'custom_token_failed' };
  }
}
