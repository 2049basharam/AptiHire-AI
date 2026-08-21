import { test, expect } from '@playwright/test';
import { db, users, organizations, memberships, jobs, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, candidates, eq } from '../../src/db';

test.describe('Real E2E Job Management & AI Extraction Validation', () => {
  // Clean database before E2E tests run
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

  // Clean database after E2E tests complete
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


  test('Flow 1: AI-Assisted Requirements Extraction & Recruiter Review Lifecycle', async ({ page }) => {
    // 1. Sign up User A
    await page.goto('/register');
    await page.fill('#name', 'Recruiter A');
    await page.fill('#email', 'recruitera@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);

    // 2. Log in User A
    await page.fill('#email', 'recruitera@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/onboarding/);

    // 3. Onboard Org A
    await page.fill('#orgName', 'Org A');
    await expect(page.locator('#orgSlug')).toHaveValue('org-a');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // 4. Navigate to Jobs Dashboard and click Create Job
    await page.goto('/dashboard/jobs');
    await page.click('a:has-text("Create Job")');
    await expect(page).toHaveURL(/\/dashboard\/jobs\/create/);

    // 5. Fill Job Details
    await page.fill('#title', 'Python Software Developer');
    // Grounding prompt triggers TestAIProvider mock return
    await page.fill('#description', 'Looking for a Python developer with PostgreSQL experience.');
    
    // 6. Click AI Extract Requirements
    await page.click('button:has-text("Extract via AI")');

    // 7. Verify structured requirements section is generated and labeled as AI-generated
    await expect(page.locator('span:has-text("[AI-Generated]")')).toBeVisible();
    await expect(page.locator('#experienceLevel')).toHaveValue('MID');
    await expect(page.locator('span:has-text("Python")')).toBeVisible();
    await expect(page.locator('span:has-text("PostgreSQL")')).toBeVisible();

    // 8. Recruiter Review & Edit: Add a skill manually
    await page.fill('input[placeholder*="Add a skill"]', 'Docker');
    await page.click('button:has-text("Add")');
    await expect(page.locator('span:has-text("Docker")')).toBeVisible();

    // 9. Save Job draft
    await page.click('button:has-text("Save Job Opening")');
    await expect(page).toHaveURL(/\/dashboard\/jobs/);

    // 10. Click View Details on jobs list (scope to Python Software Developer)
    await page.locator('.card:has-text("Python Software Developer")').locator('a:has-text("View Details")').click();
    await expect(page).toHaveURL(/\/dashboard\/jobs\/[0-9a-f-]+/);

    // 11. Verify details page lists title, status, description, and reviewed requirements
    await expect(page.locator('h1')).toContainText('Python Software Developer');
    await expect(page.locator('main')).toContainText('DRAFT');
    await expect(page.locator('main')).toContainText('Python');
    await expect(page.locator('main')).toContainText('PostgreSQL');
    await expect(page.locator('main')).toContainText('Docker');

    // 12. Publish Job
    await page.click('button:has-text("Publish Job")');
    await expect(page.locator('main')).toContainText('PUBLISHED');

    // 13. Archive Job
    await page.click('button:has-text("Archive Job")');
    await expect(page.locator('main')).toContainText('ARCHIVED');
    // Once archived, status change buttons should be hidden (terminal state)
    await expect(page.locator('button:has-text("Publish Job")')).not.toBeVisible();
    await expect(page.locator('button:has-text("Archive Job")')).not.toBeVisible();
  });

  test('Flow 2: Manual Requirements Fallback Lifecycle', async ({ page, context }) => {
    await context.clearCookies();

    // 1. Sign up User B
    await page.goto('/register');
    await page.fill('#name', 'Recruiter B');
    await page.fill('#email', 'recruiterb@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);

    // 2. Log in User B
    await page.fill('#email', 'recruiterb@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/onboarding/);

    // 3. Onboard Org B
    await page.fill('#orgName', 'Org B');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // 4. Navigate to Job create form
    await page.goto('/dashboard/jobs/create');
    await page.fill('#title', 'Manual QA Engineer');
    await page.fill('#description', 'Testing backend routes manually and writing test scripts.');

    // 5. Select Enter Manually
    await page.click('button:has-text("Enter Manually")');
    await expect(page.locator('span:has-text("[AI-Generated]")')).not.toBeVisible();

    // 6. Fill requirements manually
    await page.selectOption('#experienceLevel', 'SENIOR');
    
    await page.fill('input[placeholder*="Add a skill"]', 'Playwright');
    await page.click('button:has-text("Add")');
    
    await page.fill('input[placeholder*="Add a skill"]', 'Postgres');
    await page.click('button:has-text("Add")');

    await page.fill('input[placeholder*="Add a responsibility"]', 'Write automated tests');
    await page.locator('button:has-text("Add")').nth(1).click(); // responsibilities Add button

    // 7. Save Job draft
    await page.click('button:has-text("Save Job Opening")');
    await expect(page).toHaveURL(/\/dashboard\/jobs/);

    // 8. Verify details and publish (scope to Manual QA Engineer card)
    await page.locator('.card:has-text("Manual QA Engineer")').locator('a:has-text("View Details")').click();
    await expect(page.locator('main')).toContainText('DRAFT');
    await expect(page.locator('main')).toContainText('Playwright');
    await expect(page.locator('main')).toContainText('Postgres');

    await page.click('button:has-text("Publish Job")');
    await expect(page.locator('main')).toContainText('PUBLISHED');
  });

  test('Flow 3: Tenant Isolation Boundary & Access Rejection', async ({ page, context }) => {
    // Log in as Recruiter B (Org B context)
    await context.clearCookies();
    await page.goto('/login');
    await page.fill('#email', 'recruiterb@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // Retrieve Org A's job ID from database directly (User A created this job in Flow 1)
    const orgA = await db.query.organizations.findFirst({
      where: (o, { eq }) => eq(o.slug, 'org-a'),
    });
    
    const jobA = await db.query.jobs.findFirst({
      where: eq(jobs.organizationId, orgA!.id),
    });

    expect(jobA).toBeDefined();
    const jobAId = jobA!.id;

    // 1. Recruiter B attempting to load Job A's details page should receive NOT FOUND / ACCESS DENIED
    await page.goto(`/dashboard/jobs/${jobAId}`);
    await expect(page.locator('body')).toContainText('Job opening not found or access denied.');

    // 2. Recruiter B attempting to directly PATCH Job A's status should fail (404 Not Found scoping check)
    const response = await page.request.patch(`/api/jobs/${jobAId}`, {
      headers: {
        'Origin': 'http://localhost:3000',
      },
      data: { status: 'PUBLISHED' },
    });
    expect(response.status()).toBe(404);
  });
});
