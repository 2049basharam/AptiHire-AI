import { test, expect } from '@playwright/test';
import { db, users, organizations, memberships, jobs, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, candidates } from '../../src/db';

test.describe('Real E2E Infrastructure Validation', () => {
  // Clean database before starting E2E test runs to ensure independent executions
  test.beforeAll(async () => {
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(candidateEvidence);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(memberships);
    await db.delete(jobs);
    await db.delete(organizations);
    await db.delete(users);
  });

  // Clean database after completing all tests
  test.afterAll(async () => {
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(candidateEvidence);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(memberships);
    await db.delete(jobs);
    await db.delete(organizations);
    await db.delete(users);
  });


  test('Flow 1: User Registration, Login, Onboarding, Dashboard, and Logout', async ({ page }) => {
    // 1. Navigate to Registration page
    await page.goto('/register');
    await page.fill('#name', 'User A');
    await page.fill('#email', 'usera@example.com');
    await page.fill('#password', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    // 2. Expect redirect to login page with registered query param
    await expect(page).toHaveURL(/\/login\?registered=true/);

    // 3. Login with the newly registered user credentials
    await page.fill('#email', 'usera@example.com');
    await page.fill('#password', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    // 4. Expect redirect to onboarding (since no organization exists yet for User A)
    await expect(page).toHaveURL(/\/onboarding/);

    // 5. Submit Onboarding Form to create Organization A
    await page.fill('#orgName', 'Org A');
    await expect(page.locator('#orgSlug')).toHaveValue('org-a');
    await page.click('button[type="submit"]');

    // 6. Expect redirect to authenticated dashboard shell
    await expect(page).toHaveURL(/\/dashboard/);

    // 7. Verify elements on the dashboard
    await expect(page.locator('header')).toContainText('Org A');
    await expect(page.locator('header')).toContainText('User A');
    await expect(page.locator('main')).toContainText('OWNER');

    // 8. Logout of session
    await page.click('button:has-text("Logout")');

    // 9. Expect redirect back to login
    await expect(page).toHaveURL(/\/login/);

    // 10. Attempt to access dashboard unauthenticated and verify redirect back to login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fdashboard/);
  });

  test('Flow 2: Real Tenant Isolation and Cross-Tenant Security', async ({ page, context }) => {
    // Register User A
    await page.goto('/register');
    await page.fill('#name', 'User A Security');
    await page.fill('#email', 'usera-security@example.com');
    await page.fill('#password', 'SecurePasswordA!');
    await page.click('button[type="submit"]');

    // Log in as User A
    await page.goto('/login');
    await page.fill('#email', 'usera-security@example.com');
    await page.fill('#password', 'SecurePasswordA!');
    await page.click('button[type="submit"]');

    // Wait for the redirect to onboarding page naturally
    await expect(page).toHaveURL(/\/onboarding/);

    // Fill onboarding for Org A
    await page.fill('#orgName', 'Org A Security');
    await page.fill('#orgSlug', 'org-a-security');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // Fetch User A session cookies
    const userACookies = await context.cookies();

    // Clear context cookies to run a fresh signup/login flow for User B
    await context.clearCookies();

    // Register User B
    await page.goto('/register');
    await page.fill('#name', 'User B Security');
    await page.fill('#email', 'userb-security@example.com');
    await page.fill('#password', 'SecurePasswordB!');
    await page.click('button[type="submit"]');

    // Log in as User B
    await page.goto('/login');
    await page.fill('#email', 'userb-security@example.com');
    await page.fill('#password', 'SecurePasswordB!');
    await page.click('button[type="submit"]');

    // Wait for the redirect to onboarding page naturally
    await expect(page).toHaveURL(/\/onboarding/);

    // Fill onboarding for Org B
    await page.fill('#orgName', 'Org B Security');
    await page.fill('#orgSlug', 'org-b-security');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // Fetch User B session cookies
    const userBCookies = await context.cookies();

    // Retrieve Org IDs from Database to use as request variables
    const orgA = await db.query.organizations.findFirst({
      where: (org, { eq }) => eq(org.slug, 'org-a-security'),
    });
    const orgB = await db.query.organizations.findFirst({
      where: (org, { eq }) => eq(org.slug, 'org-b-security'),
    });

    expect(orgA).toBeDefined();
    expect(orgB).toBeDefined();

    // --- TEST BOUNDARY 1: User A Session Verification ---
    await context.clearCookies();
    await context.addCookies(userACookies);

    // A. User A accessing Org A should be ALLOWED
    const responseAtoA = await page.request.get(`/api/test/tenant?orgId=${orgA!.id}`);
    expect(responseAtoA.status()).toBe(200);
    const bodyAtoA = await responseAtoA.json();
    expect(bodyAtoA.success).toBe(true);
    expect(bodyAtoA.role).toBe('OWNER');

    // B. User A attempting to access Org B should be DENIED (Cross-Tenant Attack attempt)
    const responseAtoB = await page.request.get(`/api/test/tenant?orgId=${orgB!.id}`);
    expect(responseAtoB.status()).toBe(403);
    const bodyAtoB = await responseAtoB.json();
    expect(bodyAtoB.error.code).toBe('FORBIDDEN');
    expect(bodyAtoB.error.message).toBe('User is not a member of this organization');

    // --- TEST BOUNDARY 2: User B Session Verification ---
    await context.clearCookies();
    await context.addCookies(userBCookies);

    // A. User B accessing Org B should be ALLOWED
    const responseBtoB = await page.request.get(`/api/test/tenant?orgId=${orgB!.id}`);
    expect(responseBtoB.status()).toBe(200);
    const bodyBtoB = await responseBtoB.json();
    expect(bodyBtoB.success).toBe(true);
    expect(bodyBtoB.role).toBe('OWNER');

    // B. User B attempting to access Org A should be DENIED (Cross-Tenant Attack attempt)
    const responseBtoA = await page.request.get(`/api/test/tenant?orgId=${orgA!.id}`);
    expect(responseBtoA.status()).toBe(403);
    const bodyBtoA = await responseBtoA.json();
    expect(bodyBtoA.error.code).toBe('FORBIDDEN');
    expect(bodyBtoA.error.message).toBe('User is not a member of this organization');

    // --- TEST BOUNDARY 3: Unauthenticated Access ---
    await context.clearCookies();
    const responseUnauth = await page.request.get(`/api/test/tenant?orgId=${orgA!.id}`);
    expect(responseUnauth.status()).toBe(401);
    const bodyUnauth = await responseUnauth.json();
    expect(bodyUnauth.error.code).toBe('UNAUTHORIZED');
  });
});
