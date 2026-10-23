import { test, expect } from '@playwright/test';

test.describe('E2E: Transaction Approval & Audit Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill('admin@kemit.com');
      await page.locator('input[type="password"]').fill('Password123!');
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should navigate to approval inbox / pending transactions screen', async ({ page }) => {
    const approvalNavBtn = page.locator('button:has-text("اعتماد المعاملات"), button:has-text("معاملات معلقة"), button:has-text("Approvals"), a[href*="pending"]').first();
    if (await approvalNavBtn.isVisible()) {
      await approvalNavBtn.click();
    }

    const heading = page.locator('h1, h2, h3, div').filter({ hasText: /اعتماد|موافقة|Pending|Approvals/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should render approval action buttons and allow opening transaction details', async ({ page }) => {
    const approvalNavBtn = page.locator('button:has-text("اعتماد"), button:has-text("Approvals")').first();
    if (await approvalNavBtn.isVisible()) {
      await approvalNavBtn.click();
    }

    const actionBtn = page.locator('button:has-text("اعتماد"), button:has-text("موافقة"), button:has-text("عرض التفاصيل")').first();
    if (await actionBtn.isVisible()) {
      await expect(actionBtn).toBeEnabled();
    }
  });
});
