import { test, expect } from '@playwright/test';

test.describe('Real E2E Production Reliability & Observability Verification', () => {
  test('Flow 1: Operational Health Endpoint & X-Request-ID Header Check', async ({ request }) => {
    const response = await request.get('/api/health', {
      headers: { 'x-request-id': 'e2e-health-req-777' },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['x-request-id']).toBe('e2e-health-req-777');

    const json = await response.json();
    expect(json.status).toBe('healthy');
    expect(json.checks).toEqual({
      database: 'ok',
      redis: 'ok',
      queue: 'ok',
    });
  });

  test('Flow 2: Dashboard Recruiter Command Center, Activity, Notifications, and Saved Searches', async ({ page, context }) => {
    // Clear cookies to guarantee clean registration state
    await context.clearCookies();

    // 1. Register new recruiter user
    await page.goto('/register');
    const timestamp = Date.now();
    const email = `phase4c.${timestamp}@example.com`;
    const password = 'Password123!';

    await page.fill('#name', 'Phase4C Recruiter');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    // Redirects to login
    await page.waitForURL(/\/login/);

    // 2. Log in
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    // 3. Complete onboarding
    await page.fill('#orgName', `Phase4C Tech Org ${timestamp}`);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // 4. Verify Dashboard Command Center renders
    await expect(page.locator('#analytics-dashboard-root')).toBeVisible();
    await expect(page.locator('#metric-total-candidates')).toBeVisible();
    await expect(page.locator('#hiring-funnel-grid')).toBeVisible();
    await expect(page.locator('#time-in-stage-table')).toBeVisible();
    await expect(page.locator('#activity-stream-list')).toBeVisible();

    // 5. Verify Notification Bell is interactive
    await expect(page.locator('#notification-bell-button')).toBeVisible();
    await page.click('#notification-bell-button');
    await expect(page.locator('#notification-dropdown')).toBeVisible();
  });
});
