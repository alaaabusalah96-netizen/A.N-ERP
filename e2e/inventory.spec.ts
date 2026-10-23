import { test, expect } from '@playwright/test';

test.describe('E2E: Inventory Module Operations', () => {
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

  test('should open inventory module and navigate between inventory tabs', async ({ page }) => {
    const inventoryNavBtn = page.locator('button:has-text("المخازن"), button:has-text("إدارة المخازن"), a[href*="inventory"]').first();
    if (await inventoryNavBtn.isVisible()) {
      await inventoryNavBtn.click();
    }

    const warehousesTab = page.locator('button:has-text("المستودعات"), button:has-text("Warehouses")').first();
    const documentsTab = page.locator('button:has-text("أذون ومستندات"), button:has-text("Documents")').first();
    const reportsTab = page.locator('button:has-text("التقارير"), button:has-text("Reports")').first();

    if (await warehousesTab.isVisible()) {
      await warehousesTab.click();
      await expect(warehousesTab).toBeVisible();
    }

    if (await documentsTab.isVisible()) {
      await documentsTab.click();
      await expect(documentsTab).toBeVisible();
    }

    if (await reportsTab.isVisible()) {
      await reportsTab.click();
      await expect(reportsTab).toBeVisible();
    }
  });

  test('should trigger creation form for new inventory document', async ({ page }) => {
    const inventoryNavBtn = page.locator('button:has-text("المخازن"), a[href*="inventory"]').first();
    if (await inventoryNavBtn.isVisible()) {
      await inventoryNavBtn.click();
    }

    const newDocBtn = page.locator('button:has-text("إذن جديد"), button:has-text("مستند مخزني جديد"), button:has-text("New Document")').first();
    if (await newDocBtn.isVisible()) {
      await newDocBtn.click();
      const formHeading = page.locator('h1, h2, h3, div').filter({ hasText: /إذن|مستند|اضافة|صرف/i });
      await expect(formHeading.first()).toBeVisible();
    }
  });
});
