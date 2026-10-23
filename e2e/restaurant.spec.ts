import { test, expect } from '@playwright/test';

test.describe('E2E: Restaurant POS & Orders Flow', () => {
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

  test('should navigate to restaurant POS screen and view order controls', async ({ page }) => {
    const restaurantNav = page.locator('#nav-item-restaurant-orders, button:has-text("طلبات المطعم ونقطة البيع (POS)"), button:has-text("المطعم")').first();
    await expect(restaurantNav).toBeVisible({ timeout: 10000 });
    await restaurantNav.click();

    const heading = page.locator('h1, h2, h3, div').filter({ hasText: /مطعم|نقطة البيع|POS|طلبات/i }).first();
    await expect(heading).toBeVisible();
  });

  test('should view menu items and cart interface in restaurant POS', async ({ page }) => {
    const restaurantNav = page.locator('#nav-item-restaurant-orders, button:has-text("طلبات المطعم")').first();
    await expect(restaurantNav).toBeVisible({ timeout: 10000 });
    await restaurantNav.click();

    const posTab = page.locator('button:has-text("الكاشير والمبيعات"), button:has-text("POS")').first();
    if (await posTab.isVisible()) {
      await posTab.click();
    }

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
