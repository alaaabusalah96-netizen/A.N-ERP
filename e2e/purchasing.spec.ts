import { test, expect } from '@playwright/test';

test.describe('E2E: Procurement & Supply Chain Flow', () => {
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

  test('should navigate to purchasing module and display tab controls', async ({ page }) => {
    const purchasingNav = page.locator('#nav-item-purchasing, button:has-text("إدارة المشتريات والتموين"), button:has-text("المشتريات")').first();
    await expect(purchasingNav).toBeVisible({ timeout: 10000 });
    await purchasingNav.click();

    const prTab = page.locator('button:has-text("طلبات الشراء"), button:has-text("Purchase Requests")').first();
    const poTab = page.locator('button:has-text("أوامر التوريد"), button:has-text("Purchase Orders")').first();
    const rfqTab = page.locator('button:has-text("عروض الأسعار"), button:has-text("RFQs")').first();
    const vendorsTab = page.locator('button:has-text("سجل الموردين"), button:has-text("Vendors")').first();

    await expect(prTab).toBeVisible();
    await expect(poTab).toBeVisible();
    await expect(rfqTab).toBeVisible();
    await expect(vendorsTab).toBeVisible();
  });

  test('should open purchase orders tab and display purchase orders table', async ({ page }) => {
    const purchasingNav = page.locator('#nav-item-purchasing, button:has-text("المشتريات")').first();
    await expect(purchasingNav).toBeVisible({ timeout: 10000 });
    await purchasingNav.click();

    const poTab = page.locator('button:has-text("أوامر التوريد"), button:has-text("Purchase Orders")').first();
    await poTab.click();

    const newPoBtn = page.locator('button:has-text("إصدار أمر توريد مباشر"), button:has-text("أمر توريد جديد")').first();
    await expect(newPoBtn).toBeVisible();
  });

  test('should view vendors directory and add supplier modal', async ({ page }) => {
    const purchasingNav = page.locator('#nav-item-purchasing, button:has-text("المشتريات")').first();
    await expect(purchasingNav).toBeVisible({ timeout: 10000 });
    await purchasingNav.click();

    const vendorsTab = page.locator('button:has-text("سجل الموردين"), button:has-text("Vendors")').first();
    await vendorsTab.click();

    const addVendorBtn = page.locator('button:has-text("إضافة مورد جديد"), button:has-text("New Vendor")').first();
    await expect(addVendorBtn).toBeVisible();
  });
});
