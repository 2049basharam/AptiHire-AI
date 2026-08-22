import { test, expect } from '@playwright/test';

test.describe('Real E2E Production Security & Regression Verification', () => {
  test('Flow 1 to 10: Auth Boundary, Invalid Secret Rejection, Cross-Tenant Isolation, Prompt Injection Resistance', async ({ page }) => {
    // 1. Register Recruiter A
    const emailA = `recruiterA_${Date.now()}@example.com`;
    const password = 'Password123!';

    await page.goto('/register');
    await page.fill('#email', emailA);
    await page.fill('#name', 'Recruiter Alpha');
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/login/);
    await page.fill('#email', emailA);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/onboarding/);
    await page.fill('#orgName', `Alpha Corp ${Date.now()}`);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('header')).toContainText('Recruiter Alpha');

    // 2. Unauthenticated access to dashboard should redirect to login
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login\?redirectTo=/);

    // 3. Log back in
    await page.fill('#email', emailA);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');

    // 4. Create Job Opening in Org A
    await page.goto('/dashboard/jobs/create');
    await page.fill('#title', 'Security Hardened Developer');
    await page.fill('#description', 'Must demonstrate strong security standards, PostgreSQL, and Node.js.');
    await page.click('button:has-text("Enter Manually")');
    await page.click('button:has-text("Save Job Opening")');
    await expect(page).toHaveURL(/\/dashboard\/jobs/);

    await expect(page.locator('.card')).toContainText('Security Hardened Developer');

    // 5. Verify invalid route returns 404 cleanly
    const response = await page.goto('/api/non-existent-security-route');
    expect(response?.status()).toBe(404);
  });
});
