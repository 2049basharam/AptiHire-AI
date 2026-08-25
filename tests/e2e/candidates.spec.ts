import { test, expect } from '@playwright/test';
import { db, users, organizations, memberships, jobs, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, candidates, eq, and } from '../../src/db';
import fs from 'fs';
import path from 'path';

test.describe('Real E2E Candidate Ingestion & Resume Intelligence Validation', () => {
  const mockResumePath = path.join(process.cwd(), 'temp-mock-resume.pdf');
  const corruptResumePath = path.join(process.cwd(), 'temp-corrupt-resume.pdf');

  test.beforeAll(async () => {
    // Write mock resume files
    const mockPdfBuffer = Buffer.concat([
      Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF signature
      Buffer.from('\nThis is a mock resume text with Python and PostgreSQL experience. It contains a lot of additional filler text to bypass the minimum 100 characters length requirement of the candidate ingestion worker pipeline.\n')
    ]);
    fs.writeFileSync(mockResumePath, mockPdfBuffer);

    const corruptPdfBuffer = Buffer.concat([
      Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF signature
      Buffer.from('scanned/short')
    ]);
    fs.writeFileSync(corruptResumePath, corruptPdfBuffer);

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
    if (fs.existsSync(corruptResumePath)) fs.unlinkSync(corruptResumePath);

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

  test('Flow 1: Candidate Ingestion, AI Parsing, Evidence Trace and Approval Lifecycle', async ({ page }) => {
    // 1. Sign up recruiter
    await page.goto('/register');
    await page.fill('#name', 'Recruiter Candidate E2E');
    await page.fill('#email', 'recruiter.cand@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);

    // 2. Log in
    await page.fill('#email', 'recruiter.cand@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/onboarding/);

    // 3. Onboard Organization
    await page.fill('#orgName', 'Ingest Org');
    await expect(page.locator('#orgSlug')).toHaveValue('ingest-org');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // 4. Navigate to Candidates Dashboard
    await page.goto('/dashboard/candidates');
    await expect(page.locator('h1')).toContainText('Candidates & Resumes');

    // 5. Open Ingestion Modal & Upload resume file
    await page.click('#btn-upload-resume');
    await page.locator('#resume-file-input').setInputFiles(mockResumePath);
    await page.click('#btn-submit-upload');

    // 6. Wait for file to upload and page to reload candidate row
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('table')).toContainText('temp-mock-resume.pdf');

    // 7. Poll and refresh page until asynchronous extraction worker moves status to REVIEW_REQUIRED
    let retries = 10;
    let statusText = '';
    while (retries > 0) {
      await page.reload();
      statusText = await page.locator('table tbody tr').first().locator('td').nth(2).innerText();
      if (statusText === 'Review Required') {
        break;
      }
      await page.waitForTimeout(1000);
      retries--;
    }
    expect(statusText).toBe('Review Required');

    // 8. Go to Candidate Details Page
    await page.locator('table tbody tr').first().locator('a:has-text("View Details")').click();
    await expect(page).toHaveURL(/\/dashboard\/candidates\/[0-9a-f-]+/);

    // 9. Verify detail layout includes AI-generated summary, experiences, and evidence excerpts
    await expect(page.locator('main')).toContainText('[AI-Generated]');
    await expect(page.locator('main')).toContainText('Experienced Back-End Developer specializing in Python and PostgreSQL.');
    await expect(page.locator('main')).toContainText('Developed core API services in Python');

    // 10. Click Approve Profile
    await page.click('#btn-approve-profile');
    
    // 11. Verify status updates to APPROVED
    await expect(page.locator('#candidate-status-text')).toContainText('APPROVED');

    // 12. Check that the original file can be securely downloaded via the proxy route
    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-download-resume');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('temp-mock-resume.pdf');
  });

  test('Flow 2: Recovery Safe Handling for Scanned/Corrupt PDFs', async ({ page, context }) => {
    await context.clearCookies();

    // 1. Sign up new recruiter
    await page.goto('/register');
    await page.fill('#name', 'Recruiter Corrupt E2E');
    await page.fill('#email', 'recruiter.corrupt@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    await page.fill('#email', 'recruiter.corrupt@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    await page.fill('#orgName', 'Ingest Org Corrupt');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // 2. Navigate to candidates page
    await page.goto('/dashboard/candidates');
    await expect(page.locator('h1')).toContainText('Candidates & Resumes');

    // 3. Upload corrupt file (fails text extraction length check)
    await page.click('#btn-upload-resume');
    await page.locator('#resume-file-input').setInputFiles(corruptResumePath);
    await page.click('#btn-submit-upload');

    // Wait for upload to complete and table row to render
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('table')).toContainText('temp-corrupt-resume.pdf');

    // 4. Poll and refresh page until asynchronous extraction worker fails
    let retries = 10;
    let statusText = '';
    while (retries > 0) {
      await page.reload();
      statusText = await page.locator('table tbody tr').first().locator('td').nth(2).innerText();
      if (statusText === 'Failed') {
        break;
      }
      await page.waitForTimeout(1000);
      retries--;
    }
    expect(statusText).toBe('Failed');

    // 5. Click Details and verify recovery retry options are presented
    await page.locator('table tbody tr').first().locator('a:has-text("View Details")').click();
    await expect(page.locator('#candidate-status-text')).toContainText('FAILED_EXTRACTION');
    await expect(page.locator('#btn-retry-parsing')).toBeVisible();
  });

  test('Flow 3: Tenant Isolation Boundary Constraints Enforcement', async ({ page, context }) => {
    // 1. Create candidate A in Org A programmatically directly in database to ensure it exists
    const [orgA] = await db.insert(organizations).values({
      name: 'Tenant A Org',
      slug: 'tenant-a-org'
    }).returning();

    const [candidateA] = await db.insert(candidates).values({
      organizationId: orgA.id,
      firstName: 'Alice',
      lastName: 'Security',
      status: 'APPROVED'
    }).returning();

    const [docA] = await db.insert(candidateDocuments).values({
      candidateId: candidateA.id,
      organizationId: orgA.id,
      fileName: 'alice-resume.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storageKey: 'alice-uuid-key.pdf',
      rawText: 'Alice resume text'
    }).returning();

    // 2. Clear context cookies and sign up as User B under Organization B
    await context.clearCookies();
    await page.goto('/register');
    await page.fill('#name', 'Recruiter Tenant B');
    await page.fill('#email', 'recruiter.tenantb@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');

    await page.fill('#email', 'recruiter.tenantb@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');

    await page.fill('#orgName', 'Tenant B Org');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // 3. Attempt to fetch Candidate A's details using Tenant B's session (should return 404/fail closed)
    await page.goto(`/dashboard/candidates/${candidateA.id}`);
    await expect(page.locator('body')).not.toContainText('APPROVED');
    await expect(page.locator('body')).toContainText('Candidate not found or access denied');

    // 4. Attempt to hit API route for candidate detail (should block access)
    const detailResponse = await page.request.get(`/api/candidates/${candidateA.id}`);
    expect(detailResponse.status()).toBe(404);

    // 5. Attempt to hit API download route for resume (should block access)
    const downloadResponse = await page.request.get(`/api/candidates/${candidateA.id}/documents/${docA.id}/download`);
    expect(downloadResponse.status()).toBe(404);
  });
});
