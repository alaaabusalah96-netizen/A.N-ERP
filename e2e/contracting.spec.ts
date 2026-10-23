import { test, expect } from '@playwright/test';

test.describe('E2E: Contracting & Interim Payment Certificates Flow', () => {
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

  test('should navigate to contracting module and display project tabs', async ({ page }) => {
    const contractingNav = page.locator('#nav-item-contracting, button:has-text("إدارة المقاولات والمستخلصات"), button:has-text("المقاولات")').first();
    await expect(contractingNav).toBeVisible({ timeout: 10000 });
    await contractingNav.click();

    const projectsTab = page.locator('button:has-text("المشاريع والمواقع"), button:has-text("Projects")').first();
    const claimsTab = page.locator('button:has-text("المستخلصات والاعتمادات"), button:has-text("Claims")').first();
    const subconTab = page.locator('button:has-text("مقاولو الباطن"), button:has-text("Subcontractors")').first();

    await expect(projectsTab).toBeVisible();
    await expect(claimsTab).toBeVisible();
    await expect(subconTab).toBeVisible();
  });

  test('should view subcontractors directory and interim payment claims', async ({ page }) => {
    const contractingNav = page.locator('#nav-item-contracting, button:has-text("المقاولات")').first();
    await expect(contractingNav).toBeVisible({ timeout: 10000 });
    await contractingNav.click();

    const claimsTab = page.locator('button:has-text("المستخلصات والاعتمادات"), button:has-text("Claims")').first();
    await claimsTab.click();

    const newClaimBtn = page.locator('button:has-text("إصدار مستخلص جاري جديد"), button:has-text("New Claim")').first();
    await expect(newClaimBtn).toBeVisible();
  });
});
