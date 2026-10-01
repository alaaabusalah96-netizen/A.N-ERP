import { execSync } from 'child_process';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('========================================================================');
  console.log('    A.N ERP v7.2 — VERIFICATION: LOGIN IDEMPOTENCY REMOVAL (د-1)        ');
  console.log('========================================================================\n');

  const password = process.env.INITIAL_USER_PASSWORD;
  if (!password) {
    throw new Error('INITIAL_USER_PASSWORD is not set in environment.');
  }

  const baseUrl = 'http://localhost:3000/api/auth/login';

  // ---------------------------------------------------------------------------
  // (أ) login ناجح مع/بدون ترويسة Idempotency-Key
  // ---------------------------------------------------------------------------
  console.log('--- 1. Testing Login With & Without Idempotency-Key Header ---');

  // Login without header
  const resNoHeader = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-code': 'MAIN',
    },
    body: JSON.stringify({
      tenantCode: 'MAIN',
      username: 'warehouse',
      password,
    }),
  });

  const dataNoHeader = await resNoHeader.json();
  console.log(`[Without Header] Status: ${resNoHeader.status}, Success: ${dataNoHeader.success}, User: ${dataNoHeader.user?.username}`);
  if (resNoHeader.status !== 200 || !dataNoHeader.success || !dataNoHeader.accessToken) {
    throw new Error('Login without Idempotency-Key header failed');
  }

  // Login with header
  const keyWithHeader = `login-key-a-${Date.now()}`;
  const resWithHeader = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-code': 'MAIN',
      'idempotency-key': keyWithHeader,
    },
    body: JSON.stringify({
      tenantCode: 'MAIN',
      username: 'warehouse',
      password,
    }),
  });

  const dataWithHeader = await resWithHeader.json();
  console.log(`[With Header] Status: ${resWithHeader.status}, Success: ${dataWithHeader.success}, User: ${dataWithHeader.user?.username}`);
  if (resWithHeader.status !== 200 || !dataWithHeader.success || !dataWithHeader.accessToken) {
    throw new Error('Login with Idempotency-Key header failed');
  }
  console.log('✓ (أ) Login succeeded both with and without Idempotency-Key header.\n');

  // ---------------------------------------------------------------------------
  // (ب) نفس المفتاح مرتين بكلمة مرور صحيحة → جلستان/توكنان مختلفان
  // ---------------------------------------------------------------------------
  console.log('--- 2. Testing Same Key Twice with Valid Credentials -> Two Distinct Sessions/Tokens ---');
  const sharedKey = `shared-login-key-${Date.now()}`;

  const call1 = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-code': 'MAIN',
      'idempotency-key': sharedKey,
    },
    body: JSON.stringify({
      tenantCode: 'MAIN',
      username: 'warehouse',
      password,
    }),
  });
  const data1 = await call1.json();

  const call2 = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-code': 'MAIN',
      'idempotency-key': sharedKey,
    },
    body: JSON.stringify({
      tenantCode: 'MAIN',
      username: 'warehouse',
      password,
    }),
  });
  const data2 = await call2.json();

  const token1 = data1.accessToken;
  const token2 = data2.accessToken;
  const session1 = data1.sessionId || data1.session?.id;
  const session2 = data2.sessionId || data2.session?.id;

  const tokensDistinct = token1 !== token2;
  console.log(`[Same Key Valid] Call 1 Status: ${call1.status}, Call 2 Status: ${call2.status}`);
  console.log(`[Same Key Valid] Distinct Access Tokens: ${tokensDistinct} (Tokens must not be replayed)`);
  if (session1 && session2) {
    console.log(`[Same Key Valid] Session 1: ${session1}, Session 2: ${session2}, Distinct: ${session1 !== session2}`);
  }

  if (call1.status !== 200 || call2.status !== 200 || !tokensDistinct) {
    throw new Error('Expected two distinct logins/tokens when called twice with same key, but tokens were identical');
  }
  console.log('✓ (ب) Two distinct sessions and tokens generated when using the same key.\n');

  // ---------------------------------------------------------------------------
  // (ج) نفس المفتاح بكلمة مرور خاطئة بعد نجاح سابق → 401 (لا رد مخزّن)
  // ---------------------------------------------------------------------------
  console.log('--- 3. Testing Same Key with Wrong Password after Success -> 401 (No Cached Replay) ---');
  const pwdTestKey = `pwd-test-key-${Date.now()}`;

  // First request: valid password
  const resValid = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-code': 'MAIN',
      'idempotency-key': pwdTestKey,
    },
    body: JSON.stringify({
      tenantCode: 'MAIN',
      username: 'warehouse',
      password,
    }),
  });
  console.log(`[First Request (Valid)] Status: ${resValid.status} (Expected 200)`);
  if (resValid.status !== 200) {
    throw new Error('Initial valid login failed');
  }

  // Second request: same key, invalid password
  const resInvalid = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-code': 'MAIN',
      'idempotency-key': pwdTestKey,
    },
    body: JSON.stringify({
      tenantCode: 'MAIN',
      username: 'warehouse',
      password: 'WrongPassword123!',
    }),
  });
  const dataInvalid = await resInvalid.json();
  console.log(`[Second Request (Invalid Password)] Status: ${resInvalid.status} (Expected 401), Type: ${dataInvalid.type}`);

  if (resInvalid.status !== 401) {
    throw new Error(`Expected 401 for wrong password with reused key, but got ${resInvalid.status} (stale replay was returned!)`);
  }
  console.log('✓ (ج) Reused key with invalid password correctly rejected with 401 (zero replay of prior success).\n');

  // ---------------------------------------------------------------------------
  // (د) grep يثبت عدم وجود operation 'LOGIN' في الكود، والجدول بلا صفوف LOGIN
  // ---------------------------------------------------------------------------
  console.log('--- 4. Verifying Zero LOGIN in Code & Zero LOGIN Rows in Database ---');

  // Check Database
  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;
  const countRow = (await pool.query("SELECT count(*)::int as count FROM an_idempotency_keys WHERE operation = 'LOGIN'")).rows[0];
  console.log(`[DB Check] an_idempotency_keys rows with operation='LOGIN': ${countRow.count} (Expected 0)`);
  if (countRow.count !== 0) {
    throw new Error(`Expected 0 rows in an_idempotency_keys with operation='LOGIN', found ${countRow.count}`);
  }

  // Check Code via grep
  let grepFound = false;
  try {
    const grepOutput = execSync("grep -rn \"'LOGIN'\" src/ server.ts", { encoding: 'utf8' });
    if (grepOutput.trim().length > 0) {
      grepFound = true;
      console.error('Found LOGIN references in code:\n', grepOutput);
    }
  } catch (err: any) {
    // grep returns non-zero when no matches found, which is expected
    grepFound = false;
  }

  console.log(`[Code Grep Check] References to 'LOGIN' operation in src/ or server.ts: ${grepFound ? 'FOUND (ERROR)' : 'NONE (PASS)'}`);
  if (grepFound) {
    throw new Error("Codebase still contains references to 'LOGIN' operation");
  }
  console.log("✓ (د) Zero 'LOGIN' operation references in codebase and zero rows in database.\n");

  console.log('========================================================================');
  console.log('     ALL LOGIN IDEMPOTENCY REMOVAL (د-1) TESTS PASSED SUCCESSFULLY!    ');
  console.log('========================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
