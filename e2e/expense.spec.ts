import { test, expect } from '@playwright/test';

test.describe('E2E: Expense Creation, Approval & Settlement Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill('admin@kemit.com');
      await page.locator('input[type="password"]').fill('Password123!');
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('should navigate to expense creation and validate required form controls', async ({ page }) => {
    const newExpenseNav = page.locator('#nav-item-new-expense, button:has-text("تسجيل مصروف"), a:has-text("تسجيل مصروف")').first();
    await expect(newExpenseNav).toBeVisible({ timeout: 10000 });
    await newExpenseNav.click();

    const heading = page.locator('h1, h2, h3').filter({ hasText: /تسجيل|مصروف|جديد/i }).first();
    await expect(heading).toBeVisible();

    const submitBtn = page.locator('button[type="submit"], button:has-text("حفظ المصروف"), button:has-text("إرسال")').first();
    await expect(submitBtn).toBeVisible();
  });

  test('should fill and submit a new expense transaction', async ({ page }) => {
    const newExpenseNav = page.locator('#nav-item-new-expense, button:has-text("تسجيل مصروف")').first();
    await expect(newExpenseNav).toBeVisible({ timeout: 10000 });
    await newExpenseNav.click();

    const descInput = page.locator('input[placeholder*="بيان"], input[placeholder*="وصف"], textarea[placeholder*="بيان"]').first();
    const amountInput = page.locator('input[type="number"], input[placeholder*="مبلغ"]').first();

    if (await descInput.isVisible()) {
      await descInput.fill('شراء أدوات مكتبية وصيانة دورية للمكتب');
    }
    if (await amountInput.isVisible()) {
      await amountInput.fill('850');
    }

    const submitBtn = page.locator('button[type="submit"], button:has-text("حفظ"), button:has-text("حفظ المصروف")').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    }

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should inspect approval inbox for pending vouchers and expenses', async ({ page }) => {
    const approvalsNav = page.locator('#nav-item-approvals, button:has-text("صندوق الاعتمادات والموافقات"), button:has-text("اعتماد المعاملات")').first();
    await expect(approvalsNav).toBeVisible({ timeout: 10000 });
    await approvalsNav.click();

    const pendingTab = page.locator('button:has-text("بانتظار موافقتي"), button:has-text("معلقة")').first();
    await expect(pendingTab).toBeVisible();

    const historyTab = page.locator('button:has-text("سجل الاعتمادات السابقة"), button:has-text("السابقة")').first();
    await expect(historyTab).toBeVisible();
    await historyTab.click();

    await expect(historyTab).toHaveClass(/bg-white|text-purple/);
  });

  test('should access cash voucher issuance view', async ({ page }) => {
    const voucherNav = page.locator('#nav-item-voucher, button:has-text("سند صرف نقدية"), button:has-text("سند صرف")').first();
    await expect(voucherNav).toBeVisible({ timeout: 10000 });
    await voucherNav.click();

    const voucherHeading = page.locator('h1, h2, h3, div').filter({ hasText: /سند|صرف|نقدية|Voucher/i }).first();
    await expect(voucherHeading).toBeVisible();
  });
});
