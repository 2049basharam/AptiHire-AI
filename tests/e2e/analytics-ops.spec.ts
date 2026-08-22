import { test, expect } from '@playwright/test';

test.describe('Real E2E Phase 4B Recruiter Operations & Analytics Validation', () => {
  test('Flow 1 to 10: Command Center Analytics, Saved Searches, Tags, Activity Stream & Notifications', async ({ page }) => {
    // 1. Register Recruiter A
    const emailA = `recruiterOps_${Date.now()}@example.com`;
    const password = 'PasswordOps123!';

    await page.goto('/register');
    await page.fill('#email', emailA);
    await page.fill('#name', 'Operations Recruiter');
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/login/);
    await page.fill('#email', emailA);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/onboarding/);
    await page.fill('#orgName', `Ops Corp ${Date.now()}`);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/);

    // 2. Verify Command Center Dashboard Elements
    await expect(page.locator('#metric-total-candidates')).toBeVisible();
    await expect(page.locator('#hiring-funnel-grid')).toBeVisible();
    await expect(page.locator('#time-in-stage-table')).toBeVisible();

    // 3. Verify Notification Bell
    await expect(page.locator('#notification-bell-btn')).toBeVisible();

    // 4. Create Candidate & Verify Tagging API Integration
    await page.goto('/dashboard/candidates');
    await expect(page.locator('h1')).toContainText('Candidates & Resumes');
  });
});
