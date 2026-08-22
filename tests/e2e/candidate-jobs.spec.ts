import { test, expect } from '@playwright/test';
import {
  db,
  users,
  organizations,
  memberships,
  jobs,
  jobEmbeddings,
  candidateEmbeddings,
  candidateEvidence,
  candidateProfiles,
  candidateDocuments,
  candidates,
  auditLogs,
  candidateNotes,
  candidateStatusHistory,
} from '../../src/db';
import fs from 'fs';
import path from 'path';

const mockMatchResumePath = path.join(__dirname, 'cand-jobs-temp-mock-resume.pdf');

test.describe('Real E2E Candidate-to-Job matching & Opportunity Discovery', () => {
  test.beforeAll(async () => {
    // Write mock resume text
    const mockPdfBuffer = Buffer.concat([
      Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF signature
      Buffer.from('\nThis is a mock resume text with Python and PostgreSQL experience. It contains a lot of additional filler text to bypass the minimum 100 characters length requirement of the candidate ingestion worker pipeline.\n')
    ]);
    fs.writeFileSync(mockMatchResumePath, mockPdfBuffer);
  });

  test.afterAll(async () => {
    if (fs.existsSync(mockMatchResumePath)) fs.unlinkSync(mockMatchResumePath);
  });

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
  });

  test('Flow 1 & 2 & 3 & 4: General Matching, Score Alignment, and Status Exclusions', async ({ page, context }) => {
    await context.clearCookies();
    // Clean DB
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(candidateEvidence);
    await db.delete(candidateNotes);
    await db.delete(candidateStatusHistory);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(memberships);
    await db.delete(jobs);
    await db.delete(organizations);
    await db.delete(users);

    // 1. Sign up recruiter
    await page.goto('/register');
    await page.fill('#name', 'Matching Recruiter A');
    await page.fill('#email', 'matching.recruiter@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    // Log in
    await page.fill('#email', 'matching.recruiter@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    // Onboard Org
    await page.fill('#orgName', 'Matching Org A');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // 2. Create Job A (Python Backend - PUBLISHED)
    await page.goto('/dashboard/jobs/create');
    await page.fill('#title', 'Python Backend Engineer');
    await page.fill('#description', 'Python and PostgreSQL developer.');
    await page.click('button:has-text("Extract via AI")');
    await expect(page.locator('span:has-text("[AI-Generated]")')).toBeVisible();
    await page.click('button:has-text("Save Job Opening")');
    await page.waitForURL(/\/dashboard\/jobs/);

    // Publish Job A
    await page.locator('.card:has-text("Python Backend Engineer")').locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]+/);
    await expect(page.locator('text=Loading job details...')).not.toBeVisible();
    await page.click('button:has-text("Publish Job")');
    await expect(page.locator('.badge-success')).toBeVisible();

    // 3. Create Job B (React Frontend Architect - DRAFT)
    await page.goto('/dashboard/jobs/create');
    await page.fill('#title', 'React Frontend Architect');
    await page.fill('#description', 'React and Tailwind CSS required.');
    await page.click('button:has-text("Extract via AI")');
    await page.click('button:has-text("Save Job Opening")');
    await page.waitForURL(/\/dashboard\/jobs/);

    // 4. Ingest and approve Candidate A
    await page.goto('/dashboard/candidates');
    await page.click('#btn-upload-resume');
    await page.locator('#resume-file-input').setInputFiles(mockMatchResumePath);
    await page.click('#btn-submit-upload');

    // Wait for file to upload and page to reload candidate row
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('table')).toContainText('cand-jobs-temp-mock-resume.pdf');

    // Wait for parsing
    let retries = 10;
    let statusText = '';
    while (retries > 0) {
      await page.reload();
      const tableRow = page.locator('table tbody tr');
      if (await tableRow.count() > 0) {
        statusText = await tableRow.first().locator('td').nth(2).innerText();
        if (statusText === 'Review Required') {
          break;
        }
      }
      await page.waitForTimeout(1000);
      retries--;
    }
    expect(statusText).toBe('Review Required');

    // Approve candidate profile
    await page.locator('table tbody tr').first().locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/candidates\/[0-9a-f-]+/);
    await page.click('button:has-text("Approve Profile")');
    await expect(page.locator('#candidate-status-text')).toContainText('APPROVED');

    // 5. Navigate to "Matching Jobs" tab
    await page.locator('#tab-matching-jobs').click();
    await page.waitForURL(/\?tab=jobs/);

    // Verify matching jobs list is visible and has the published job, excluding draft job
    await expect(page.locator('#ranked-matching-jobs-list')).toBeVisible();
    await expect(page.locator('#ranked-matching-jobs-list')).toContainText('Python Backend Engineer');
    await expect(page.locator('#ranked-matching-jobs-list')).not.toContainText('React Frontend Architect');

    // Verify Match Score is visible
    await expect(page.locator('.job-match-score').first()).toContainText('%');

    // 6. View Match Details Modal
    await page.locator('#ranked-matching-jobs-list button:has-text("View Match")').first().click();
    await expect(page.locator('#modal-tab-analysis')).toBeVisible();
    await expect(page.locator('table')).toContainText('✓ Confirmed');

    // Close Modal
    await page.locator('#close-match-modal').click();
    await expect(page.locator('#modal-tab-analysis')).not.toBeVisible();
  });

  test('Flow 5: Cross-Tenant Job Isolation Boundaries', async ({ page }) => {
    // Clean DB
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(candidateEvidence);
    await db.delete(candidateNotes);
    await db.delete(candidateStatusHistory);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(memberships);
    await db.delete(jobs);
    await db.delete(organizations);
    await db.delete(users);

    // 1. Sign up recruiter A under Org A
    await page.goto('/register');
    await page.fill('#name', 'Matching Recruiter A');
    await page.fill('#email', 'matching.recruiter@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    // Log in
    await page.fill('#email', 'matching.recruiter@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    // Onboard Org A
    await page.fill('#orgName', 'Matching Org A');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Ingest and approve Candidate A in Org A
    await page.goto('/dashboard/candidates');
    await page.click('#btn-upload-resume');
    await page.locator('#resume-file-input').setInputFiles(mockMatchResumePath);
    await page.click('#btn-submit-upload');

    // Wait for file to upload and page to reload candidate row
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('table')).toContainText('cand-jobs-temp-mock-resume.pdf');

    // Wait for parsing
    let retries = 10;
    while (retries > 0) {
      await page.reload();
      const tableRow = page.locator('table tbody tr');
      if (await tableRow.count() > 0) {
        const text = await tableRow.first().locator('td').nth(2).innerText();
        if (text === 'Review Required') break;
      }
      await page.waitForTimeout(1000);
      retries--;
    }

    // Approve candidate A
    await page.locator('table tbody tr').first().locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/candidates\/[0-9a-f-]+/);
    const candidateAUrl = page.url(); // save candidate A details URL for later
    await page.click('button:has-text("Approve Profile")');
    await expect(page.locator('#candidate-status-text')).toContainText('APPROVED');

    // Log out Recruiter A programmatically
    await page.context().clearCookies();

    // 2. Sign up recruiter B under Org B
    await page.goto('/register');
    await page.fill('#name', 'Matching Recruiter B');
    await page.fill('#email', 'matching.recruiterb@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    // Log in
    await page.fill('#email', 'matching.recruiterb@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    // Onboard Org B
    await page.fill('#orgName', 'Matching Org B');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Create Job B1 (DevOps - PUBLISHED) in Org B
    await page.goto('/dashboard/jobs/create');
    await page.fill('#title', 'Kubernetes DevOps Architect');
    await page.fill('#description', 'Docker and Kubernetes container setups.');
    await page.click('button:has-text("Extract via AI")');
    await page.click('button:has-text("Save Job Opening")');
    await page.waitForURL(/\/dashboard\/jobs/);

    // Publish Job B1
    await page.locator('.card:has-text("Kubernetes DevOps Architect")').locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]+/);
    await expect(page.locator('text=Loading job details...')).not.toBeVisible();
    await page.click('button:has-text("Publish Job")');
    await expect(page.locator('.badge-success')).toBeVisible();

    // Try to access Candidate A details directly via URL using Recruiter B session (should be blocked)
    await page.goto(candidateAUrl);
    // Should show the Error card / Candidate not found
    await expect(page.locator('text=Candidate not found or access denied.')).toBeVisible();
  });
});
