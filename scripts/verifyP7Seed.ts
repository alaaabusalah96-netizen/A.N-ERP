/**
 * @file verifyP7Seed.ts
 * @description Verification script for P7 — SEC-002: Seed Admin & User Lifecycle without force reset
 */

import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import argon2 from 'argon2';
import dotenv from 'dotenv';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';

dotenv.config();

const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || '';
const INITIAL_USER_PASSWORD = process.env.INITIAL_USER_PASSWORD || '';
const RESET_USER_PASSWORD = process.env.RESET_USER_PASSWORD || '';

if (!SEED_ADMIN_PASSWORD || !INITIAL_USER_PASSWORD) {
  console.error('FATAL: SEED_ADMIN_PASSWORD and INITIAL_USER_PASSWORD must be defined in env');
  process.exit(1);
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(port: number, timeoutMs: number = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await wait(250);
  }
  return false;
}

interface ServerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runServerWithEnv(
  extraEnv: Record<string, string>,
  port: number = 3101
): Promise<{ output: string; stop: () => Promise<ServerRunResult> }> {
  let combinedOutput = '';

  const proc: ChildProcess = spawn('npx', ['tsx', 'server.ts'], {
    env: {
      ...process.env,
      PORT: String(port),
      ...extraEnv,
    },
    detached: true,
  });

  proc.stdout?.on('data', (d) => {
    combinedOutput += d.toString();
  });
  proc.stderr?.on('data', (d) => {
    combinedOutput += d.toString();
  });

  const healthy = await waitForServer(port, 25000);
  if (!healthy) {
    if (proc.pid) {
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch {}
    }
    throw new Error(`Server failed to start on port ${port} within timeout. Output:\n${combinedOutput}`);
  }

  const stop = async (): Promise<ServerRunResult> => {
    return new Promise((resolve) => {
      let resolved = false;
      const done = (code: number | null) => {
        if (!resolved) {
          resolved = true;
          resolve({
            stdout: combinedOutput,
            stderr: '',
            exitCode: code,
          });
        }
      };

      proc.on('close', (code) => done(code));
      proc.on('exit', (code) => done(code));

      if (proc.pid) {
        try {
          process.kill(-proc.pid, 'SIGTERM');
        } catch {
          try {
            proc.kill('SIGTERM');
          } catch {}
        }
      }

      setTimeout(() => {
        if (proc.pid) {
          try {
            process.kill(-proc.pid, 'SIGKILL');
          } catch {
            try {
              proc.kill('SIGKILL');
            } catch {}
          }
        }
        done(0);
      }, 1500);
    });
  };

  return { output: combinedOutput, stop };
}

async function main() {
  console.log('=== P7 SEC-002 Seed Verification ===');

  const adapter = new PostgresPrimaryAdapter();
  await adapter.initializeSchema();
  const pool = (adapter as any).pool;

  // 1. Fetch original hashes & statuses for admin and accountant
  const origRes = await pool.query(
    "SELECT username, password_hash, status FROM an_users WHERE tenant_id = 'tenant-main' AND username IN ('admin', 'accountant')"
  );

  const originalState: Record<string, { hash: string; status: string }> = {};
  for (const row of origRes.rows) {
    originalState[row.username] = {
      hash: row.password_hash,
      status: row.status,
    };
  }

  if (!originalState.admin || !originalState.accountant) {
    await pool.end();
    throw new Error('Original users "admin" and "accountant" not found in tenant-main');
  }

  try {
    // Generate different test hash
    const otherHash = await argon2.hash('Other#Pass123', { type: argon2.argon2id });

    // Set custom hash on admin and accountant
    await pool.query(
      "UPDATE an_users SET password_hash = $1 WHERE tenant_id = 'tenant-main' AND username IN ('admin', 'accountant')",
      [otherHash]
    );

    // Verify database actually holds otherHash
    const checkOther = await pool.query(
      "SELECT username, password_hash, status FROM an_users WHERE tenant_id = 'tenant-main' AND username IN ('admin', 'accountant')"
    );
    for (const row of checkOther.rows) {
      if (row.password_hash !== otherHash) {
        throw new Error(`Failed to seed otherHash for ${row.username}`);
      }
    }

    // =========================================================================
    // (أ) Boot without SEED_FORCE_RESET -> hashes & status must NOT change
    // =========================================================================
    console.log('--- Testing (أ): Boot without SEED_FORCE_RESET ---');
    const runA = await runServerWithEnv({ SEED_FORCE_RESET: 'false' }, 3101);
    const stopResultA = await runA.stop();

    const afterResA = await pool.query(
      "SELECT username, password_hash, status FROM an_users WHERE tenant_id = 'tenant-main' AND username IN ('admin', 'accountant')"
    );

    for (const row of afterResA.rows) {
      if (row.password_hash !== otherHash) {
        throw new Error(`(أ) FAILED: ${row.username} hash was overwritten without SEED_FORCE_RESET!`);
      }
    }
    console.log('✓ (أ) Hashes remained untouched without SEED_FORCE_RESET.');

    // =========================================================================
    // (ب) Boot with SEED_FORCE_RESET=true -> hashes must be updated to env passwords
    // =========================================================================
    console.log('--- Testing (ب): Boot with SEED_FORCE_RESET=true ---');
    const runB = await runServerWithEnv({ SEED_FORCE_RESET: 'true' }, 3102);
    const stopResultB = await runB.stop();

    console.log('Server B output:\n' + stopResultB.stdout);

    const afterResB = await pool.query(
      "SELECT username, password_hash, status FROM an_users WHERE tenant_id = 'tenant-main' AND username IN ('admin', 'accountant')"
    );

    for (const row of afterResB.rows) {
      if (row.status !== 'ACTIVE') {
        throw new Error(`(ب) FAILED: ${row.username} status is not ACTIVE (got ${row.status})`);
      }
      const targetPass = row.username === 'admin' ? SEED_ADMIN_PASSWORD : INITIAL_USER_PASSWORD;
      const matches = await argon2.verify(row.password_hash, targetPass);
      console.log(`Verify ${row.username}: matches=${matches}`);
      if (!matches) {
        throw new Error(`(ب) FAILED: ${row.username} password does not verify against env password after SEED_FORCE_RESET`);
      }
    }
    console.log('✓ (ب) Hashes successfully synchronized with env passwords and statuses are ACTIVE.');

    // =========================================================================
    // (ج) Captured logs must NOT contain secret values
    // =========================================================================
    console.log('--- Testing (ج): Leak check in captured server logs ---');
    const forbiddenSecrets = [SEED_ADMIN_PASSWORD, INITIAL_USER_PASSWORD];
    if (RESET_USER_PASSWORD) forbiddenSecrets.push(RESET_USER_PASSWORD);

    const allLogs = stopResultA.stdout + '\n' + stopResultB.stdout;

    for (const sec of forbiddenSecrets) {
      if (sec && sec.length >= 6 && allLogs.includes(sec)) {
        throw new Error('(ج) FAILED: Secret detected in server stdout/stderr!');
      }
    }
    console.log('✓ (ج) Zero secrets detected in stdout/stderr.');

    // =========================================================================
    // (د) Static code check on server.ts
    // =========================================================================
    console.log('--- Testing (د): Static audit for console.log with credentials ---');
    const serverCode = fs.readFileSync('server.ts', 'utf8');
    const forbiddenRegex = /console\.(log|info|warn|error)\(.*(seedAdminPass|adminTotpSecret|adminBackupCodes|standardPass)/;
    if (forbiddenRegex.test(serverCode)) {
      throw new Error('(د) FAILED: server.ts still contains console statements logging secrets');
    }
    console.log('✓ (د) Static inspection clean.');

    console.log('=== ALL P7 TESTS PASSED ===');
  } finally {
    // Restore original state
    console.log('Restoring original database hashes & statuses...');
    for (const [username, state] of Object.entries(originalState)) {
      await pool.query(
        "UPDATE an_users SET password_hash = $1, status = $2 WHERE tenant_id = 'tenant-main' AND username = $3",
        [state.hash, state.status, username]
      );
    }
    await pool.end();
    console.log('✓ Original user state restored.');
  }
}

main().catch((err) => {
  console.error('FATAL P7 TEST FAILURE:', err);
  process.exit(1);
});
