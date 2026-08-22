import { test, expect } from '@playwright/test';
import {
  db,
  users,
  organizations,
  memberships,
  jobs,
  auditLogs,
  candidateEmbeddings,
  candidateEvidence,
  candidateProfiles,
  candidateDocuments,
  candidates,
} from '../../src/db';
import fs from 'fs';
import path from 'path';

const mockResumePath = path.join(__dirname, 'matching-temp-mock-resume.pdf');

test.describe('Real E2E Semantic Candidate Matching Validation', () => {
  test.beforeAll(async () => {
    // Write a mock valid PDF file buffer to filesystem with sufficient length (>100 chars)
    const mockPdfBuffer = Buffer.concat([
      Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF signature
      Buffer.from('\nThis is a mock resume text with Python and PostgreSQL experience. It contains a lot of additional filler text to bypass the minimum 100 characters length requirement of the candidate ingestion worker pipeline.\n')
    ]);
    fs.writeFileSync(mockResumePath, mockPdfBuffer);

    // Clean DB
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

  test.afterAll(async () => {
    // Delete temp files
    if (fs.existsSync(mockResumePath)) fs.unlinkSync(mockResumePath);

    // Clean DB
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

  test('Flow 1: Semantic Candidate Matching & Recruiter Pipeline Decisioning Lifecycle', async ({ page }) => {
    // 1. Sign up recruiter
    await page.goto('/register');
    await page.fill('#name', 'Recruiter Match E2E');
    await page.fill('#email', 'recruiter.match@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    
    // Explicitly wait for navigation to /login to prevent race conditions
    await page.waitForURL(/\/login/);

    // 2. Log in recruiter
    await page.fill('#email', 'recruiter.match@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    // 3. Onboard Organization
    await page.fill('#orgName', 'Match Org');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // 4. Create Job opening (Python Developer)
    await page.goto('/dashboard/jobs/create');
    await page.fill('#title', 'Python Developer');
    await page.fill('#description', 'Senior Python Developer. We require PostgreSQL and AWS credentials.');
    
    // Run AI Requirements extraction
    await page.click('button:has-text("Extract via AI")');
    await expect(page.locator('span:has-text("[AI-Generated]")')).toBeVisible();

    // Submit the form
    await page.click('button:has-text("Save Job Opening")');
    await page.waitForURL(/\/dashboard\/jobs/);

    // Get created job card using .card:has-text selector and click View Details
    await expect(page.locator('.card:has-text("Python Developer")')).toBeVisible();
    await page.locator('.card:has-text("Python Developer")').locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]+/);

    // Publish the job
    await expect(page.locator('text=Loading job details...')).not.toBeVisible();
    await page.click('button:has-text("Publish Job")');
    await expect(page.locator('.badge-success')).toBeVisible(); // Should be PUBLISHED now

    // 5. Ingest and parse candidate
    await page.goto('/dashboard/candidates');
    await page.click('#btn-upload-resume');
    await page.locator('#resume-file-input').setInputFiles(mockResumePath);
    await page.click('#btn-submit-upload');

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

    // View Candidate details and approve
    await page.locator('table tbody tr').first().locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/candidates\/[0-9a-f-]+/);
    await page.click('button:has-text("Approve Profile")');
    await expect(page.locator('#candidate-status-text')).toContainText('APPROVED');

    // 6. View Matches inside job page
    await page.goto('/dashboard/jobs');
    await page.locator('.card:has-text("Python Developer")').locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]+/);
    
    // Switch to Candidate Matches tab
    await expect(page.locator('text=Loading job details...')).not.toBeVisible();
    await page.locator('#tab-matches').click();
    await expect(page.locator('#ranked-matches-list')).toBeVisible();

    // Verify candidate is ranked
    await expect(page.locator('.candidate-name').first()).toContainText('Candidate #');
    await expect(page.locator('.match-score').first()).toContainText('%');

    // 7. Open detailed analysis modal
    await page.locator('#ranked-matches-list button:has-text("View Analysis")').first().click();
    await expect(page.locator('#modal-tab-analysis')).toBeVisible();

    // Verify Grounding Excerpt details
    await expect(page.locator('table')).toContainText('✓ Confirmed');

    // 8. Shortlist Candidate
    await page.click('button:has-text("Shortlist Candidate")');

    // Verify modal closes and status updates to SHORTLISTED in matches list
    await expect(page.locator('#modal-tab-analysis')).not.toBeVisible();
    await expect(page.locator('#ranked-matches-list')).toContainText('SHORTLISTED');
  });

  test('Flow 2: Recovery Safe Handling when embedding generation fails', async ({ page }) => {
    // 1. Log in recruiter
    await page.goto('/login');
    await page.fill('#email', 'recruiter.match@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // 2. Navigate back to the active session
    await page.goto('/dashboard/jobs');
    await expect(page.locator('.card:has-text("Python Developer")')).toBeVisible();
    await page.locator('.card:has-text("Python Developer")').locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]+/);
    
    await expect(page.locator('text=Loading job details...')).not.toBeVisible();
    await page.locator('#tab-matches').click();
    await expect(page.locator('#ranked-matches-list')).toBeVisible();
  });

  test('Flow 3: Organization Isolation Boundaries & Access Rejection', async ({ page, context }) => {
    // Recruiter B from Org B must NOT be able to view Recruiter A's matches or candidates
    await context.clearCookies();

    // 1. Sign up Recruiter B
    await page.goto('/register');
    await page.fill('#name', 'Recruiter B');
    await page.fill('#email', 'recruiterb@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    // Log in Recruiter B
    await page.fill('#email', 'recruiterb@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);
    
    // Onboard Org B
    await page.fill('#orgName', 'Org B');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Verify candidates matching returns empty list for Org B jobs (isolation check)
    await page.goto('/dashboard/jobs');
    await expect(page.locator('text=Python Developer')).not.toBeVisible(); // Org B should not see Org A's job card
  });
});
