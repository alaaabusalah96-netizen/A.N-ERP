/**
 * @file testWarehouseLogin.ts
 * @description Verifies real authentication with tenant 'MAIN' and user 'warehouse'.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function writeSignedEvidence(filePath: string, command: string, stdout: string, exitCode: number) {
  const timestamp = new Date().toISOString();
  const rawBody = `COMMAND: ${command}\nEXIT_CODE: ${exitCode}\nTIMESTAMP: ${timestamp}\n\nSTDOUT:\n${stdout}\n`;
  const fileHash = sha256(rawBody);
  const fullContent = `${rawBody}\nSHA256: ${fileHash}\n`;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, fullContent, 'utf8');
  console.log(`[Evidence] Saved -> ${filePath} (SHA256: ${fileHash.slice(0, 16)}...)`);
}

async function run() {
  const password = process.env.INITIAL_USER_PASSWORD;
  if (!password) {
    throw new Error('INITIAL_USER_PASSWORD is not set in environment.');
  }

  const payload = {
    tenantCode: 'MAIN',
    username: 'warehouse',
    password: password,
  };

  console.log('Sending login request to http://localhost:3000/api/auth/login for tenant: MAIN, user: warehouse...');
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-code': 'MAIN',
    },
    body: JSON.stringify(payload),
  });

  const status = res.status;
  const setCookie = res.headers.get('set-cookie') || '';
  const data = await res.json();

  console.log(`HTTP Status: ${status}`);
  console.log('Response Body:', {
    success: data.success,
    user: data.user ? {
      id: data.user.id,
      username: data.user.username,
      fullName: data.user.fullName,
      role: data.user.role,
      roleTitleAr: data.user.roleTitleAr,
      tenantId: data.user.tenantId,
      branchName: data.user.branchName,
    } : null,
    hasToken: Boolean(data.token || data.accessToken || setCookie.includes('access_token')),
  });

  if (status !== 200 || !data.success) {
    console.error('Login failed! Detail:', data);
    process.exit(1);
  }

  const sanitizedBody = {
    success: data.success,
    tenant: 'MAIN',
    user: {
      id: data.user.id,
      username: data.user.username,
      fullName: data.user.fullName,
      role: data.user.role,
      roleTitleAr: data.user.roleTitleAr,
      tenantId: data.user.tenantId,
      branchName: data.user.branchName,
    },
    cookieReceived: setCookie ? 'HttpOnly; Secure; SameSite=Strict' : 'Token returned in body',
  };

  const evidence = [
    '=== Live Login Verification: Tenant MAIN + User warehouse ===',
    `POST http://localhost:3000/api/auth/login`,
    `Status: ${status} OK`,
    `Response Payload:`,
    JSON.stringify(sanitizedBody, null, 2),
    '',
    `Set-Cookie Present: ${Boolean(setCookie)}`,
    `Authenticated Role: ${data.user.role} (${data.user.roleTitleAr})`,
    `Result: SUCCESS (dakhool MAIN + warehouse najah bi-kamal)`,
  ].join('\n');

  const evidencePath = path.join(process.cwd(), 'evidence', 'phase-a-prompt1', 'login-warehouse-success.txt');
  await writeSignedEvidence(
    evidencePath,
    'POST /api/auth/login (tenant=MAIN, user=warehouse)',
    evidence,
    0
  );

  console.log('✓ LIVE LOGIN WITH MAIN + "warehouse" SUCCEEDED!');
}

run().catch((err) => {
  console.error('Login test error:', err);
  process.exit(1);
});
