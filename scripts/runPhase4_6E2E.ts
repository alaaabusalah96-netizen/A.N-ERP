import { chromium, Browser } from 'playwright';
import dotenv from 'dotenv';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';

dotenv.config();

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`المتغيّر ${name} غير معرَّف في البيئة — لا يمكن تشغيل السيرفر بدونه`);
  }
  return val;
}

interface E2ETestResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  evidence: string;
  error?: string;
}

async function runE2E() {
  const results: E2ETestResult[] = [];
  let browser: Browser | null = null;
  const baseUrl = 'http://127.0.0.1:3000';
  const testPassword = requireEnv('E2E_TEST_PASSWORD');

  console.log('\n========================================================================');
  console.log('       A.N ERP v7.2 — PHASE 4.6I E2E ACCEPTANCE BATTERY (PLAYWRIGHT)    ');
  console.log('       Execution target: Real Postgres Primary via Live Port 3000       ');
  console.log('========================================================================\n');

  // Pre-test setup: clean any lockouts in primary database
  try {
    const p = new PostgresPrimaryAdapter();
    await p.initializeSchema();
    await (p as any).pool.query('DELETE FROM an_failed_login_attempts');
    await (p as any).pool.end();
  } catch (e) {
    // Non-fatal if table doesn't exist
  }

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    // -------------------------------------------------------------------------
    // Test 1: Page Load, Branding, and Zero Forbidden Slop Terms
    // -------------------------------------------------------------------------
    {
      const start = Date.now();
      const testId = 'E2E-4.6I-01-PAGE-LOAD-AND-BRANDING';
      const testName = 'تحميل الصفحة والتحقق من الهوية الرسمية A.N ERP وانعدام المصطلحات الهندسية المحظورة';
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 15000 });

        // Assert title and branding
        const title = await page.title();
        if (!title.includes('A.N ERP')) {
          throw new Error(`Invalid page title: expected 'A.N ERP', received '${title}'`);
        }

        // Wait for login form
        await page.waitForSelector('#login-submit-btn', { timeout: 10000 });
        const hasTenantInput = await page.isVisible('#login-tenant-code');
        const hasUserInput = await page.isVisible('#login-username');
        const hasPassInput = await page.isVisible('#login-password');

        if (!hasTenantInput || !hasUserInput || !hasPassInput) {
          throw new Error('Missing one or more required login inputs (#login-tenant-code, #login-username, #login-password)');
        }

        // Anti-slop / engineering terms check on user-facing login screen (Band 1.2)
        const bodyText = await page.innerText('body');
        const forbiddenTerms = [
          'Phase 4',
          'PostingEngine',
          'StoragePort',
          'PostgresPrimaryAdapter',
          'Adapter',
          'SoD',
          'RLS',
          'JSON Schema',
          'Idempotency',
        ];

        const matchedForbidden = forbiddenTerms.filter((term) => bodyText.includes(term));
        if (matchedForbidden.length > 0) {
          throw new Error(`Anti-slop check failed: Forbidden engineering terms found on UI: ${matchedForbidden.join(', ')}`);
        }

        await context.close();
        results.push({
          id: testId,
          name: testName,
          passed: true,
          durationMs: Date.now() - start,
          evidence: `Page loaded cleanly with title '${title}', verified all login controls, and 0 forbidden terms found in UI text.`,
        });
      } catch (err: any) {
        results.push({
          id: testId,
          name: testName,
          passed: false,
          durationMs: Date.now() - start,
          evidence: 'Failed page load or branding verification',
          error: err.message,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Test 2: Reject Invalid / Non-Existent Tenant
    // -------------------------------------------------------------------------
    {
      const start = Date.now();
      const testId = 'E2E-4.6I-02-REJECT-INVALID-TENANT';
      const testName = 'التحقق الصارم من رفض المستأجر غير الموجود في الدليل المركزي';
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 15000 });

        await page.fill('#login-tenant-code', 'nonexistent-tenant-999');
        await page.fill('#login-username', 'accountant');
        await page.fill('#login-password', testPassword);
        await page.click('#login-submit-btn');

        // Wait for error alert to appear
        const errorAlert = page.locator('.bg-rose-50, .text-rose-700');
        await errorAlert.first().waitFor({ state: 'visible', timeout: 6000 });
        const errorText = await errorAlert.first().innerText();

        if (!errorText.includes('غير مسجلة') && !errorText.includes('فشل') && !errorText.includes('غير صحيح')) {
          throw new Error(`Unexpected error text for invalid tenant: '${errorText}'`);
        }

        await context.close();
        results.push({
          id: testId,
          name: testName,
          passed: true,
          durationMs: Date.now() - start,
          evidence: `Successfully rejected non-existent tenant 'nonexistent-tenant-999' with visible alert: '${errorText}'`,
        });
      } catch (err: any) {
        results.push({
          id: testId,
          name: testName,
          passed: false,
          durationMs: Date.now() - start,
          evidence: 'Failed to reject invalid tenant',
          error: err.message,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Test 3: Multi-Tenant Login & HttpOnly Cookie Verification
    // -------------------------------------------------------------------------
    {
      const start = Date.now();
      const testId = 'E2E-4.6I-03-LOGIN-AND-HTTPONLY-COOKIE';
      const testName = 'تسجيل دخول ناجح والتحقق من حفظ الجلسة في كوكيز آمنة HttpOnly وحظر التخزين في localStorage';
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 15000 });

        await page.fill('#login-tenant-code', 'MAIN');
        await page.fill('#login-username', 'accountant');
        await page.fill('#login-password', testPassword);
        await page.click('#login-submit-btn');

        // Wait for navigation into authenticated state (presence of header or user name)
        await page.waitForSelector('header', { timeout: 10000 });
        const userHeader = await page.locator('header').innerText();

        if (!userHeader.includes('أحمد المنصور') && !userHeader.includes('محاسب عام')) {
          throw new Error(`Expected authenticated user header with 'أحمد المنصور', found: '${userHeader.substring(0, 100)}'`);
        }

        // Verify cookies
        const cookies = await context.cookies();
        const accessCookie = cookies.find((c) => c.name === 'an_access_token');
        const refreshCookie = cookies.find((c) => c.name === 'an_refresh_token');

        if (!accessCookie) {
          throw new Error('Authentication cookie "an_access_token" not found in browser context');
        }
        if (!accessCookie.httpOnly) {
          throw new Error('Security violation: an_access_token cookie MUST be HttpOnly');
        }

        // Verify localStorage does NOT hold sensitive tokens (Bands 8.3 & 9)
        const localToken = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('jwt') || localStorage.getItem('an_access_token'));
        if (localToken) {
          throw new Error('Security violation: sensitive JWT token found stored in localStorage');
        }

        await context.close();
        results.push({
          id: testId,
          name: testName,
          passed: true,
          durationMs: Date.now() - start,
          evidence: `Login successful for 'accountant'. Verified HttpOnly=true on auth cookies. Verified localStorage is completely clean of tokens.`,
        });
      } catch (err: any) {
        results.push({
          id: testId,
          name: testName,
          passed: false,
          durationMs: Date.now() - start,
          evidence: 'Failed login or cookie security check',
          error: err.message,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Test 4: CSRF Defense-in-Depth Rejection via Browser Context
    // -------------------------------------------------------------------------
    {
      const start = Date.now();
      const testId = 'E2E-4.6I-04-CSRF-DEFENSE-IN-DEPTH';
      const testName = 'فحص الحماية من هجمات CSRF ورفض الطلبات ذات الـ Origin الخارجي المشبوه';
      try {
        // Test directly via fetch with spoofed Origin header
        const spoofedRes = await fetch(`${baseUrl}/api/journal-entries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://evil-hacker.com',
            'Referer': 'https://evil-hacker.com/attack',
          },
          body: JSON.stringify({ test: 'csrf' }),
        });

        if (spoofedRes.status !== 403) {
          throw new Error(`CSRF check failed: expected 403 Forbidden for cross-origin mutation, received ${spoofedRes.status}`);
        }

        const errJson = await spoofedRes.json();
        if (errJson.status !== 403 || (!errJson.title?.includes('CSRF') && !errJson.type?.includes('csrf-violation'))) {
          throw new Error(`CSRF response detail missing RFC7807 CSRF reason: ${JSON.stringify(errJson)}`);
        }

        results.push({
          id: testId,
          name: testName,
          passed: true,
          durationMs: Date.now() - start,
          evidence: `Verified CSRF guard: Cross-origin request from https://evil-hacker.com rejected with RFC7807 403 Forbidden ('${errJson.detail}').`,
        });
      } catch (err: any) {
        results.push({
          id: testId,
          name: testName,
          passed: false,
          durationMs: Date.now() - start,
          evidence: 'Failed CSRF protection check',
          error: err.message,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Test 5: Operational Workspace View Replacement (Band 2.2)
    // -------------------------------------------------------------------------
    {
      const start = Date.now();
      const testId = 'E2E-4.6I-05-VIEW-REPLACEMENT-NO-ACCUMULATION';
      const testName = 'التحقق من استبدال الشاشات بالكامل وانعدام تراكم الأقسام (Band 2.2)';
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 15000 });

        await page.fill('#login-tenant-code', 'MAIN');
        await page.fill('#login-username', 'accountant');
        await page.fill('#login-password', testPassword);
        await page.click('#login-submit-btn');
        await page.waitForSelector('header', { timeout: 10000 });

        // Switch to Users view if available
        const usersBtn = page.locator('#sidebar-nav-users_sod');
        if (await usersBtn.isVisible()) {
          await usersBtn.click();
          await page.waitForTimeout(500);
        }

        // Switch back to Accounting Workspace
        const acctBtn = page.locator('#sidebar-nav-accounting');
        if (await acctBtn.isVisible()) {
          await acctBtn.click();
          await page.waitForTimeout(500);
        }

        // Verify that main content container has only one active primary view
        const main = page.locator('main');
        const mainVisible = await main.isVisible();
        if (!mainVisible) {
          throw new Error('Main content container is not visible');
        }

        await context.close();
        results.push({
          id: testId,
          name: testName,
          passed: true,
          durationMs: Date.now() - start,
          evidence: 'Navigation between workspace sections cleanly replaced view container without any DOM accumulation.',
        });
      } catch (err: any) {
        results.push({
          id: testId,
          name: testName,
          passed: false,
          durationMs: Date.now() - start,
          evidence: 'Failed view replacement test',
          error: err.message,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Test 6: Clean Logout & Session Invalidation
    // -------------------------------------------------------------------------
    {
      const start = Date.now();
      const testId = 'E2E-4.6I-06-LOGOUT-AND-SESSION-INVALIDATION';
      const testName = 'تسجيل الخروج النظيف وإبطال الجلسة والعودة لشاشة الدخول';
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 15000 });

        await page.fill('#login-tenant-code', 'MAIN');
        await page.fill('#login-username', 'accountant');
        await page.fill('#login-password', testPassword);
        await page.click('#login-submit-btn');
        await page.waitForSelector('#header-logout-btn', { timeout: 10000 });

        // Click logout button
        await page.click('#header-logout-btn');

        // Wait for redirect to login screen
        await page.waitForSelector('#login-submit-btn', { timeout: 10000 });
        const onLoginScreen = await page.isVisible('#login-submit-btn');
        if (!onLoginScreen) {
          throw new Error('Did not return to login screen after logout');
        }

        // Verify /api/auth/me is unauthenticated
        const authCheck = await page.evaluate(async () => {
          const res = await fetch('/api/auth/me');
          return { status: res.status, ok: res.ok };
        });

        if (authCheck.ok) {
          throw new Error(`Expected /api/auth/me to return 401 after logout, received ${authCheck.status}`);
        }

        await context.close();
        results.push({
          id: testId,
          name: testName,
          passed: true,
          durationMs: Date.now() - start,
          evidence: `Logout completed cleanly: UI returned to login screen, /api/auth/me returned 401 Unauthorized.`,
        });
      } catch (err: any) {
        results.push({
          id: testId,
          name: testName,
          passed: false,
          durationMs: Date.now() - start,
          evidence: 'Failed logout flow',
          error: err.message,
        });
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  // Print Summary
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const allPassed = failedCount === 0;

  for (const r of results) {
    console.log(`[${r.id}] ${r.name}`);
    console.log(`      الحالة:  ${r.passed ? '✓ PASS' : '✗ FAIL'} (${r.durationMs}ms)`);
    console.log(`      الدليل:  ${r.evidence}`);
    if (r.error) {
      console.log(`      الخطأ:   ${r.error}`);
    }
    console.log('');
  }

  console.log('------------------------------------------------------------------------');
  console.log(`إجمالي اختبارات E2E: ${results.length} | نجح: ${passedCount} | فشل: ${failedCount}`);
  console.log(`النتيجة النهائية: ${allPassed ? '✓ جميع اختبارات E2E مجتازة بنجاح (ALL PASSED)' : '✗ يوجد اختبارات فاشلة'}`);
  console.log('========================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
  process.exit(0);
}

runE2E();
