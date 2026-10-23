import { test, expect } from '@playwright/test';

test.describe('E2E: Authentication & Login Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display login page elements correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/KEMIT ERP/i);
    const heading = page.locator('h2');
    await expect(heading).toBeVisible();

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
  });

  test('should show error message when logging in with invalid credentials', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await emailInput.fill('wronguser@kemit.com');
    await passwordInput.fill('WrongPassword123!');
    await submitBtn.click();

    const errorMessage = page.locator('.bg-red-50, .text-red-700, .bg-red-900\\/30, [role="alert"]').first();
    await expect(errorMessage).toBeVisible();
  });

  test('should toggle interface language between Arabic and English', async ({ page }) => {
    const langBtn = page.locator('button:has-text("English"), button:has-text("العربية")').first();
    await expect(langBtn).toBeVisible();

    const initialText = await langBtn.innerText();
    await langBtn.click();

    await expect(langBtn).not.toHaveText(initialText);
  });

  test('should successfully log in with valid credentials and redirect to dashboard', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await emailInput.fill('admin@kemit.com');
    await passwordInput.fill('Password123!');
    await submitBtn.click();

    const header = page.locator('#app-header, header, [data-testid="dashboard-view"]').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('should perform logout and return to login screen', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('admin@kemit.com');
    await page.locator('input[type="password"]').fill('Password123!');
    await page.locator('button[type="submit"]').click();

    const logoutBtn = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Logout")').first();
    await expect(logoutBtn).toBeVisible({ timeout: 10000 });
    await logoutBtn.click();

    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
  });
});

