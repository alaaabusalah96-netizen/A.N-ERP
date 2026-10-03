/**
 * @file verifyP8aSession.ts
 * @description Real PostgreSQL Verification for AUTH-002: Atomic Refresh Token Rotation
 */

import crypto from 'crypto';
import argon2 from 'argon2';
import dotenv from 'dotenv';
import { spawn, ChildProcess } from 'child_process';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import { TokenService } from '../src/core/auth/TokenService';

dotenv.config();

async function main() {
  console.log('=== Starting AUTH-002 (P8a Session) Verification ===\n');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;
  if (!pool) {
    throw new Error('Postgres pool not initialized');
  }

  // 1. Resolve seed tenant from USR-ADMIN or admin user
  const adminRes = await pool.query(
    "SELECT tenant_id FROM an_users WHERE id = 'USR-ADMIN' OR username = 'admin' LIMIT 1"
  );
  if (adminRes.rows.length === 0) {
    throw new Error('Seed admin user not found in an_users');
  }
  const tenantId = adminRes.rows[0].tenant_id;
  console.log(`✓ Using seed tenant: ${tenantId}`);

  const tokenService = new TokenService(adapter);

  // 2. Setup temporary test user
  const rand = Math.floor(Math.random() * 900000 + 100000);
  const tempUserId = `USR-P8A-${rand}`;
  const tempUsername = `user_p8a_${rand}`;
  const rawPassword = `P8aPass@${rand}!`;
  const passwordHash = await argon2.hash(rawPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const createdFamilyIds: string[] = [];
  let testServerProc: ChildProcess | null = null;
  const HTTP_PORT = 3101;
  const BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;

  try {
    await pool.query(
      `INSERT INTO an_users (
        id, tenant_id, username, full_name, email, role, status,
        password_hash, two_factor_enabled, requires_password_change, created_at
      ) VALUES ($1, $2, $3, $4, $5, 'accountant', 'ACTIVE', $6, false, false, NOW())`,
      [tempUserId, tenantId, tempUsername, `مستخدم اختبار ${rand}`, `p8a_${rand}@test.local`, passwordHash]
    );
    console.log(`✓ Created temporary user: ${tempUserId} (${tempUsername})`);

    // -------------------------------------------------------------------------
    // TEST (أ): Concurrent rotateRefreshToken race test
    // -------------------------------------------------------------------------
    console.log('\n--- Running TEST (أ): Concurrent rotateRefreshToken race ---');
    const { familyId: famA, refreshToken: tokenA } = await tokenService.createRefreshTokenFamily(
      tempUserId,
      tenantId,
      `ses-p8a-${rand}`
    );
    createdFamilyIds.push(famA);

    // Call rotateRefreshToken concurrently twice with the exact same token
    const [res1, res2] = await Promise.all([
      tokenService.rotateRefreshToken(tokenA),
      tokenService.rotateRefreshToken(tokenA),
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    console.log(`Concurrent results: res1.success=${res1.success}, res2.success=${res2.success}`);

    const countSeq1Res = await pool.query(
      'SELECT count(*) FROM an_refresh_tokens WHERE family_id = $1 AND sequence = 1',
      [famA]
    );
    const countSeq1 = parseInt(countSeq1Res.rows[0].count, 10);

    const famRowRes = await pool.query(
      'SELECT is_invalidated FROM an_token_families WHERE family_id = $1',
      [famA]
    );
    const isFamInvalidated = famRowRes.rows[0]?.is_invalidated;

    console.log(`Count of seq=1 tokens in family: ${countSeq1}`);
    console.log(`Family is_invalidated: ${isFamInvalidated}`);

    if (successes.length === 2) {
      console.log('FAILED (BEFORE-RUN EXPECTED): Both concurrent rotations succeeded (race condition confirmed!)');
      throw new Error('(أ) FAILED: Two concurrent calls both succeeded!');
    }

    if (successes.length !== 1 || failures.length !== 1) {
      throw new Error(`(أ) FAILED: Expected exactly 1 success and 1 failure, got ${successes.length} successes`);
    }

    const failedCall = failures[0];
    if (!failedCall.familyRevoked) {
      throw new Error('(أ) FAILED: The losing concurrent call did not revoke family');
    }

    if (countSeq1 !== 1) {
      throw new Error(`(أ) FAILED: Count of sequence=1 tokens is ${countSeq1}, expected 1`);
    }

    if (!isFamInvalidated) {
      throw new Error('(أ) FAILED: Family was not marked is_invalidated in DB');
    }

    console.log('PASS: (أ) Exactly 1 concurrent call won, second failed with familyRevoked, family invalidated.');

    // -------------------------------------------------------------------------
    // TEST (ب): Normal sequential rotation + old token reuse detection
    // -------------------------------------------------------------------------
    console.log('\n--- Running TEST (ب): Sequential rotation & old token reuse ---');
    const { familyId: famB, refreshToken: tokenB1 } = await tokenService.createRefreshTokenFamily(
      tempUserId,
      tenantId,
      `ses-p8a-b-${rand}`
    );
    createdFamilyIds.push(famB);

    const rotB1 = await tokenService.rotateRefreshToken(tokenB1);
    if (!rotB1.success || !rotB1.newRefreshToken) {
      throw new Error(`(ب) FAILED: First rotation failed: ${rotB1.error}`);
    }
    const tokenB2 = rotB1.newRefreshToken;

    const rotB2 = await tokenService.rotateRefreshToken(tokenB2);
    if (!rotB2.success || !rotB2.newRefreshToken) {
      throw new Error(`(ب) FAILED: Second rotation failed: ${rotB2.error}`);
    }

    // Now try to reuse old tokenB1
    const reuseAttempt = await tokenService.rotateRefreshToken(tokenB1);
    if (reuseAttempt.success || !reuseAttempt.familyRevoked) {
      throw new Error('(ب) FAILED: Reusing old token did not revoke family');
    }

    const famBRow = await pool.query(
      'SELECT is_invalidated FROM an_token_families WHERE family_id = $1',
      [famB]
    );
    if (!famBRow.rows[0]?.is_invalidated) {
      throw new Error('(ب) FAILED: Family B not marked invalidated after reuse');
    }
    console.log('PASS: (ب) Sequential rotation succeeded and old token reuse cleanly invalidated family.');

    // -------------------------------------------------------------------------
    // Start HTTP server on PORT=3101 for (ج), (د), (هـ), (و)
    // -------------------------------------------------------------------------
    console.log(`\n--- Spawning test server on PORT=${HTTP_PORT} ---`);
    testServerProc = spawn('npx', ['tsx', 'server.ts'], {
      env: {
        ...process.env,
        PORT: String(HTTP_PORT),
      },
      stdio: 'pipe',
    });
    testServerProc.stderr?.on('data', (d) => console.error('3101 STDERR:', d.toString()));

    // Wait for server readiness on 3101
    let ready = false;
    for (let attempts = 0; attempts < 30; attempts++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const hRes = await fetch(`${BASE_URL}/api/health`);
        if (hRes.ok) {
          ready = true;
          break;
        }
      } catch {}
    }
    if (!ready) {
      throw new Error(`Server on port ${HTTP_PORT} failed to start`);
    }
    console.log(`✓ Test server running on ${BASE_URL}`);

    // -------------------------------------------------------------------------
    // TEST (ج): HTTP login -> POST /api/auth/refresh -> 200 + new cookies
    // -------------------------------------------------------------------------
    console.log('\n--- Running TEST (ج): HTTP login and /api/auth/refresh ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-code': 'MAIN',
      },
      body: JSON.stringify({
        tenantCode: 'MAIN',
        tenantId,
        username: tempUsername,
        password: rawPassword,
      }),
    });

    if (loginRes.status !== 200) {
      const errBody = await loginRes.text();
      throw new Error(`(ج) FAILED: Login failed with status ${loginRes.status}: ${errBody}`);
    }

    const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie') || ''];
    let initialRefreshTokenCookie = '';
    for (const c of setCookies) {
      const m = c.match(/an_refresh_token=([^;]+)/);
      if (m) initialRefreshTokenCookie = m[1];
    }
    if (!initialRefreshTokenCookie) {
      throw new Error('(ج) FAILED: No an_refresh_token cookie found in login response');
    }

    const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `an_refresh_token=${initialRefreshTokenCookie}`,
      },
    });

    if (refreshRes.status !== 200) {
      const errBody = await refreshRes.text();
      throw new Error(`(ج) FAILED: /api/auth/refresh returned ${refreshRes.status}: ${errBody}`);
    }

    const refreshSetCookies = refreshRes.headers.getSetCookie ? refreshRes.headers.getSetCookie() : [refreshRes.headers.get('set-cookie') || ''];
    let newAccessCookie = false;
    let newRefreshCookie = false;
    for (const c of refreshSetCookies) {
      if (c.includes('an_access_token=')) newAccessCookie = true;
      if (c.includes('an_refresh_token=')) newRefreshCookie = true;
    }

    if (!newAccessCookie || !newRefreshCookie) {
      throw new Error('(ج) FAILED: /api/auth/refresh did not issue both access and refresh cookies');
    }
    console.log('PASS: (ج) HTTP login + refresh returned 200 and issued both new cookies.');

    // -------------------------------------------------------------------------
    // TEST (د): Non-existent user access token -> GET /api/auth/me -> 401 or 403
    // -------------------------------------------------------------------------
    console.log('\n--- Running TEST (د): Non-existent user access token ---');
    const ghostUserId = `USR-NOPE-${rand}`;
    const ghostToken = tokenService.generateAccessToken({
      userId: ghostUserId,
      tenantId,
      role: 'accountant',
      sessionId: `ses-ghost-${rand}`,
      familyId: `fam-ghost-${rand}`,
    });

    const ghostRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: {
        Cookie: `an_access_token=${ghostToken}`,
      },
    });
    console.log(`✓ Ghost user /api/auth/me response status: ${ghostRes.status}`);
    if (ghostRes.status === 200) {
      throw new Error('(د) FAILED: Non-existent user unexpectedly returned 200 OK');
    }
    if (ghostRes.status !== 401 && ghostRes.status !== 403) {
      throw new Error(`(د) FAILED: Expected 401 or 403, got ${ghostRes.status}`);
    }
    console.log(`PASS: (د) Non-existent user properly rejected with HTTP ${ghostRes.status}.`);

    // -------------------------------------------------------------------------
    // TEST (هـ): User set to SUSPENDED via SQL -> GET /api/auth/me -> 403
    // -------------------------------------------------------------------------
    console.log('\n--- Running TEST (هـ): Suspended user access token ---');
    await pool.query("UPDATE an_users SET status = 'SUSPENDED' WHERE id = $1", [tempUserId]);

    const activeUserToken = tokenService.generateAccessToken({
      userId: tempUserId,
      tenantId,
      role: 'accountant',
      sessionId: `ses-active-${rand}`,
      familyId: `fam-active-${rand}`,
    });

    const suspendedRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: {
        Cookie: `an_access_token=${activeUserToken}`,
      },
    });
    console.log(`✓ Suspended user /api/auth/me status: ${suspendedRes.status}`);
    if (suspendedRes.status !== 403) {
      throw new Error(`(هـ) FAILED: Expected 403 for SUSPENDED user, got ${suspendedRes.status}`);
    }
    console.log('PASS: (هـ) Suspended user rejected with HTTP 403.');

    // -------------------------------------------------------------------------
    // TEST (و): Cross-tenant access token (sub=tempUser, tenantId=otherTenant) -> not 200
    // -------------------------------------------------------------------------
    console.log('\n--- Running TEST (و): Cross-tenant token verification ---');
    const otherTenantRes = await pool.query(
      'SELECT id FROM an_tenants WHERE id <> $1 LIMIT 1',
      [tenantId]
    );
    if (otherTenantRes.rows.length === 0) {
      console.log('NOT RUN: (و) No other tenant exists in an_tenants table');
    } else {
      const otherTenantId = otherTenantRes.rows[0].id;
      const crossTenantToken = tokenService.generateAccessToken({
        userId: tempUserId,
        tenantId: otherTenantId,
        role: 'accountant',
        sessionId: `ses-cross-${rand}`,
        familyId: `fam-cross-${rand}`,
      });

      const crossRes = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: {
          Cookie: `an_access_token=${crossTenantToken}`,
        },
      });
      console.log(`✓ Cross-tenant /api/auth/me status: ${crossRes.status}`);
      if (crossRes.status === 200) {
        throw new Error('(و) FAILED: Cross-tenant token unexpectedly returned 200 OK');
      }
      console.log(`PASS: (و) Cross-tenant token rejected with HTTP ${crossRes.status}.`);
    }

    console.log('\n=== ALL P8a SESSION TESTS PASSED ===');
  } finally {
    if (testServerProc) {
      testServerProc.kill('SIGKILL');
    }
    // Cleanup temporary user and token families
    try {
      if (createdFamilyIds.length > 0) {
        await pool.query(
          'DELETE FROM an_refresh_tokens WHERE family_id = ANY($1::text[])',
          [createdFamilyIds]
        );
        await pool.query(
          'DELETE FROM an_token_families WHERE family_id = ANY($1::text[])',
          [createdFamilyIds]
        );
      }
      await pool.query('DELETE FROM an_refresh_tokens WHERE user_id = $1', [tempUserId]);
      await pool.query('DELETE FROM an_users WHERE id = $1', [tempUserId]);
      console.log('✓ Cleaned up temporary test user and tokens.');
    } catch (cleanErr: any) {
      console.error('Error during cleanup:', cleanErr.message);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\nFATAL ERROR in verifyP8aSession:', err.message);
  process.exit(1);
});
