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
  candidateNotes,
  candidateStatusHistory,
  eq,
  and,
} from '../../src/db';
import fs from 'fs';
import path from 'path';

const mockResumePath = path.join(__dirname, 'pipeline-temp-mock-resume.pdf');

test.describe('Real E2E Candidate Recruiter Pipeline & Decisioning Validation', () => {
  test.beforeAll(async () => {
    // Write a mock valid PDF file buffer to filesystem with sufficient length (>100 chars)
    const mockPdfBuffer = Buffer.concat([
      Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF signature
      Buffer.from('\nThis is a mock resume text with Python and PostgreSQL experience. It contains a lot of additional filler text to bypass the minimum 100 characters length requirement of the candidate ingestion worker pipeline.\n')
    ]);
    fs.writeFileSync(mockResumePath, mockPdfBuffer);
  });

  test.afterAll(async () => {
    // Delete temp files
    if (fs.existsSync(mockResumePath)) fs.unlinkSync(mockResumePath);
  });

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    page.on('console', msg => {
      console.log(`[BROWSER CONSOLE]: [${msg.type()}] ${msg.text()}`);
    });
  });

  test('Flow 1: Recruiter Candidate Pipeline Progression, Rejection, Notes, Audits and Org Isolation', async ({ page, context }) => {
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
    await page.fill('#name', 'Recruiter Pipeline E2E');
    await page.fill('#email', 'recruiter.pipeline@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    // 2. Log in recruiter
    await page.fill('#email', 'recruiter.pipeline@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    // 3. Onboard Organization
    await page.fill('#orgName', 'Pipeline Org');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // 4. Create Job opening (Python Developer) and Publish
    await page.goto('/dashboard/jobs/create');
    await page.fill('#title', 'Python Engineer');
    await page.fill('#description', 'Senior Python Engineer. We require PostgreSQL and AWS credentials.');
    await page.click('button:has-text("Extract via AI")');
    await expect(page.locator('span:has-text("[AI-Generated]")')).toBeVisible();
    await page.click('button:has-text("Save Job Opening")');
    await page.waitForURL(/\/dashboard\/jobs/);

    await page.locator('.card:has-text("Python Engineer")').locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]+/);
    await expect(page.locator('text=Loading job details...')).not.toBeVisible();
    await page.click('button:has-text("Publish Job")');
    await expect(page.locator('.badge-success')).toBeVisible();

    // 5. Ingest and parse candidate
    await page.goto('/dashboard/candidates');
    await page.click('#btn-upload-resume');
    await page.locator('#resume-file-input').setInputFiles(mockResumePath);
    await page.click('#btn-submit-upload');

    // Wait for the upload modal to close before reloading the page to prevent aborting fetch request
    await expect(page.locator('text=Upload Candidate Resume')).not.toBeVisible();

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

    // 6. View Matches and Shortlist
    await page.goto('/dashboard/jobs');
    await page.locator('.card:has-text("Python Engineer")').locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]+/);
    await expect(page.locator('text=Loading job details...')).not.toBeVisible();
    await page.locator('#tab-matches').click();
    await expect(page.locator('#ranked-matches-list')).toBeVisible();

    // Shortlist Candidate
    await page.locator('#ranked-matches-list button:has-text("View Analysis")').first().click();
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).toBeVisible();
    await page.click('#btn-shortlist-candidate');

    // 7. Verify pipeline kanban column placement
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).not.toBeVisible();
    await page.locator('#tab-pipeline').click();
    await expect(page.locator('#kanban-pipeline-board')).toBeVisible();
    await expect(page.locator('.kanban-col-shortlisted')).toContainText('Candidate #');

    // 8. Open match modal from Kanban board card and switch to Pipeline & Notes tab
    await page.locator('.kanban-col-shortlisted .kanban-candidate-card').first().click();
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).toBeVisible();
    await page.click('#modal-tab-pipeline');

    // Add notes
    await page.fill('#input-candidate-note', 'Exceptional Postgres skills. Move to screening.');
    await page.click('#btn-add-note');
    await expect(page.locator('#recruiter-notes-list')).toContainText('Exceptional Postgres skills. Move to screening.');

    // Move to SCREENING
    await page.click('#btn-transition-screening');

    // 9. Verify candidate card in Kanban Column SCREENING
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).not.toBeVisible();
    await page.locator('.kanban-col-screening .kanban-candidate-card').first().click();
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).toBeVisible();
    await page.click('#modal-tab-pipeline');

    // Move to INTERVIEW
    await page.click('#btn-transition-interview');

    // 10. Open detailed history log and verify timeline entries
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).not.toBeVisible();
    await page.locator('.kanban-col-interview .kanban-candidate-card').first().click();
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).toBeVisible();
    await page.click('#modal-tab-pipeline');

    const historyTimeline = page.locator('#status-history-timeline');
    await expect(historyTimeline).toContainText('APPROVED → SHORTLISTED');
    await expect(historyTimeline).toContainText('SHORTLISTED → SCREENING');
    await expect(historyTimeline).toContainText('SCREENING → INTERVIEW');

    // Move to OFFER -> Move to HIRED
    await page.click('#btn-transition-offer');
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).not.toBeVisible();
    
    await page.locator('.kanban-col-offer .kanban-candidate-card').first().click();
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).toBeVisible();
    await page.click('#modal-tab-pipeline');
    await page.click('#btn-transition-hired');

    // Verify Hired column
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).not.toBeVisible();
    await expect(page.locator('.kanban-col-hired')).toContainText('Candidate #');

    // Move candidate back to INTERVIEW (allowed backwards transition: HIRED -> OFFER -> INTERVIEW)
    await page.locator('.kanban-col-hired .kanban-candidate-card').first().click();
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).toBeVisible();
    await page.click('#modal-tab-pipeline');
    await page.click('#btn-transition-offer');
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).not.toBeVisible();

    await page.locator('.kanban-col-offer .kanban-candidate-card').first().click();
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).toBeVisible();
    await page.click('#modal-tab-pipeline');
    await page.click('#btn-transition-interview');
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).not.toBeVisible();

    // Click on interview card to reject candidate
    await page.locator('.kanban-col-interview .kanban-candidate-card').first().click();
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).toBeVisible();
    await page.click('#modal-tab-pipeline');
    
    // Click Move to REJECTED (should trigger confirmation dialog panel)
    await page.click('#btn-transition-rejected');
    await expect(page.locator('text=Confirm Candidate Rejection?')).toBeVisible();
    
    // Confirm rejection
    await page.selectOption('#rejection-reason-select', 'Failed interview stage');
    await page.fill('#rejection-notes-textarea', 'Candidate failed coding round.');
    await page.click('#btn-confirm-rejection');

    // 11. Verify candidate is excluded from active matching recommendations list
    await expect(page.locator('h3:has-text("Candidate Match & Pipeline")')).not.toBeVisible();
    await page.locator('#tab-matches').click();
    await expect(page.locator('#ranked-matches-list')).not.toBeVisible();
    await expect(page.locator('text=No eligible candidate matches found')).toBeVisible();

    // 12. Verify candidate is still visible in history/pipeline stats counters
    await page.locator('#tab-pipeline').click();
    await expect(page.locator('text=REJECTED: 1')).toBeVisible();

    // 13. Verify Organization Isolation Boundaries
    await context.clearCookies();

    // Sign up Recruiter B under Org B
    await page.goto('/register');
    await page.fill('#name', 'Recruiter B');
    await page.fill('#email', 'recruiterb.pipeline@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    // Log in Recruiter B
    await page.fill('#email', 'recruiterb.pipeline@example.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);
    
    // Onboard Org B
    await page.fill('#orgName', 'Pipeline Org B');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Verify Org B has no jobs or active matches
    await page.goto('/dashboard/jobs');
    await expect(page.locator('text=Python Engineer')).not.toBeVisible();
  });

  test('Flow 2: Failure Path - Concurrent Transition Conflicts (409)', async ({ page }) => {
    // 1. Sign up and onboarding
    await page.goto('/register');
    await page.fill('#name', 'Conflict Recruiter');
    await page.fill('#email', 'conflict@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    await page.fill('#email', 'conflict@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    await page.fill('#orgName', 'Conflict Org');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // 2. Ingest candidate
    await page.goto('/dashboard/candidates');
    await page.click('#btn-upload-resume');
    await page.locator('#resume-file-input').setInputFiles(mockResumePath);
    await page.click('#btn-submit-upload');
    await expect(page.locator('text=Upload Candidate Resume')).not.toBeVisible();

    const [insertedUser] = await db.select().from(users).where(eq(users.email, 'conflict@example.com'));
    const [insertedMembership] = await db.select().from(memberships).where(eq(memberships.userId, insertedUser.id));
    const orgId = insertedMembership.organizationId;

    // Wait for background worker to fully complete parsing before writing status updates
    let candidateObj;
    let retries = 10;
    while (retries > 0) {
      const candidatesList = await db.select().from(candidates).where(eq(candidates.organizationId, orgId));
      if (candidatesList.length > 0) {
        const candidateStatus = candidatesList[0].status;
        if (candidateStatus === 'REVIEW_REQUIRED') {
          candidateObj = candidatesList[0];
          break;
        }
      }
      await page.waitForTimeout(1000);
      retries--;
    }
    expect(candidateObj).toBeDefined();
    if (!candidateObj) throw new Error('candidateObj is undefined');

    // Force approve the status in the DB now that worker is fully done
    await db.update(candidates).set({ status: 'APPROVED' }).where(eq(candidates.id, candidateObj.id));

    // 3. Send stale state change request (expected status is SHORTLISTED, actual is APPROVED)
    const patchResponse = await page.request.patch(`/api/candidates/${candidateObj.id}`, {
      headers: {
        origin: 'http://localhost:3000',
        referer: 'http://localhost:3000',
      },
      data: {
        status: 'SCREENING',
        expectedPreviousStatus: 'SHORTLISTED', // Stale expected state!
      }
    });

    expect(patchResponse.status()).toBe(409); // Conflict
  });

  test('Flow 3: Failure Path - Invalid State Machine Transition (400)', async ({ page }) => {
    // Log in
    await page.goto('/login');
    await page.fill('#email', 'conflict@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    const [insertedUser] = await db.select().from(users).where(eq(users.email, 'conflict@example.com'));
    const [insertedMembership] = await db.select().from(memberships).where(eq(memberships.userId, insertedUser.id));
    const orgId = insertedMembership.organizationId;
    const [candidateObj] = await db.select().from(candidates).where(eq(candidates.organizationId, orgId));

    // Ensure state in DB is APPROVED
    await db.update(candidates).set({ status: 'APPROVED' }).where(eq(candidates.id, candidateObj.id));

    // Send invalid transition (APPROVED to HIRED directly is invalid)
    const patchResponse = await page.request.patch(`/api/candidates/${candidateObj.id}`, {
      headers: {
        origin: 'http://localhost:3000',
        referer: 'http://localhost:3000',
      },
      data: {
        status: 'HIRED',
        expectedPreviousStatus: 'APPROVED',
      }
    });

    expect(patchResponse.status()).toBe(400); // Bad Request / Validation Failure
  });

  test('Flow 4: Failure Path - Cross-Tenant Access Restrictions (403/404)', async ({ page, context }) => {
    // 1. Sign up Recruiter A
    await page.goto('/register');
    await page.fill('#name', 'Recruiter Tenant A');
    await page.fill('#email', 'recruiterA@tenant.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    await page.fill('#email', 'recruiterA@tenant.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    await page.fill('#orgName', 'Tenant A Org');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Create Candidate & Job in Tenant A
    const [userA] = await db.select().from(users).where(eq(users.email, 'recruitera@tenant.com'));
    const [membershipA] = await db.select().from(memberships).where(eq(memberships.userId, userA.id));
    const orgAId = membershipA.organizationId;

    const [jobA] = await db.insert(jobs).values({
      organizationId: orgAId,
      title: 'Job A Specs',
      description: 'Senior roles',
    }).returning();

    const [candidateA] = await db.insert(candidates).values({
      organizationId: orgAId,
      firstName: 'Candidate Tenant A',
      status: 'APPROVED',
    }).returning();

    // 2. Sign up Recruiter B under Org B
    await context.clearCookies();
    await page.goto('/register');
    await page.fill('#name', 'Recruiter Tenant B');
    await page.fill('#email', 'recruiterB@tenant.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    await page.fill('#email', 'recruiterB@tenant.com');
    await page.fill('#password', 'PasswordB123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    await page.fill('#orgName', 'Tenant B Org');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // 3. Try to access Tenant A data using Tenant B session context (API testing)
    // Access Job A pipeline
    const jobResponse = await page.request.get(`/api/jobs/${jobA.id}/pipeline`);
    expect([403, 404]).toContain(jobResponse.status());

    // Access Candidate A notes
    const notesGetResponse = await page.request.get(`/api/candidates/${candidateA.id}/notes?jobId=${jobA.id}`);
    expect([403, 404]).toContain(notesGetResponse.status());

    // Add note to Candidate A
    const notesPostResponse = await page.request.post(`/api/candidates/${candidateA.id}/notes`, {
      headers: {
        origin: 'http://localhost:3000',
        referer: 'http://localhost:3000',
      },
      data: { jobId: jobA.id, content: 'Malicious note injection attempt' }
    });
    expect([403, 404]).toContain(notesPostResponse.status());

    // Access Candidate A history timeline logs
    const historyResponse = await page.request.get(`/api/candidates/${candidateA.id}/history`);
    expect([403, 404]).toContain(historyResponse.status());

    // Transition Candidate A status
    const transitionResponse = await page.request.patch(`/api/candidates/${candidateA.id}`, {
      headers: {
        origin: 'http://localhost:3000',
        referer: 'http://localhost:3000',
      },
      data: { status: 'SHORTLISTED', expectedPreviousStatus: 'APPROVED' }
    });
    expect([403, 404]).toContain(transitionResponse.status());
  });
});
