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
  eq,
} from '../../src/db';

test.describe('Real E2E Candidate Comparison & Side-by-Side Verification', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();

    // Clean Database before each test to ensure a clean state
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(candidateEvidence);
    await db.delete(candidateNotes);
    await db.delete(candidateStatusHistory);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(jobEmbeddings);
    await db.delete(jobs);
    await db.delete(memberships);
    await db.delete(organizations);
    await db.delete(users);
  });

  test('Flow 1 to 7: Candidate Selection, Matrix Scorecard, Experience Alignment, AI Summary, Cross-Tenant Rejection', async ({ page }) => {
    // 1. Sign up recruiter
    await page.goto('/register');
    await page.fill('#name', 'Compare Recruiter A');
    await page.fill('#email', 'compare.recruiter@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/login/);

    // 2. Log in
    await page.fill('#email', 'compare.recruiter@example.com');
    await page.fill('#password', 'PasswordA123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/);

    // 3. Onboard Organization
    await page.fill('#orgName', 'Comparison Org');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // 4. Create Job opening (Python Developer)
    await page.goto('/dashboard/jobs/create');
    await page.fill('#title', 'Senior Python Developer');
    await page.fill('#description', 'We need a Senior Python Developer with FastAPI and PostgreSQL. AWS is preferred. Experience required is SENIOR.');
    await page.click('button:has-text("Extract via AI")');
    await expect(page.locator('span:has-text("[AI-Generated]")')).toBeVisible();
    await page.click('button:has-text("Save Job Opening")');
    await page.waitForURL(/\/dashboard\/jobs/);

    // Navigate to details via UI to avoid database transaction race conditions
    await expect(page.locator('.card:has-text("Senior Python Developer")')).toBeVisible();
    await page.locator('.card:has-text("Senior Python Developer")').locator('a:has-text("View Details")').click();
    await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]+/);

    const url = page.url();
    const jobId = url.split('/').pop()?.split('?')[0];
    if (!jobId) throw new Error('Could not parse jobId from URL');

    // Get created job details from DB (now guaranteed to be committed)
    const dbJob = await db.query.jobs.findFirst({
      where: eq(jobs.id, jobId),
    });
    if (!dbJob) throw new Error('Job not found in DB');

    // Query organization
    const org = await db.query.organizations.findFirst();
    if (!org) throw new Error('Organization not found in DB');

    // Publish the job
    await page.click('button:has-text("Publish Job")');
    await expect(page.locator('.badge-success')).toBeVisible(); // Should be PUBLISHED now

    // 5. Insert multiple candidates directly to database for rapid E2E execution
    // Insert 5 candidates in Org A with different skills/exp
    const candidateData = [
      { firstName: 'Sarah', lastName: 'Pythonista', status: 'SHORTLISTED', email: 'sarah@example.com', skills: ['Python', 'FastAPI', 'PostgreSQL', 'AWS'], expYears: 6 },
      { firstName: 'Alex', lastName: 'Middy', status: 'INTERVIEW', email: 'alex@example.com', skills: ['Python', 'FastAPI'], expYears: 3 },
      { firstName: 'John', lastName: 'Junior', status: 'APPROVED', email: 'john@example.com', skills: ['Python'], expYears: 1 },
      { firstName: 'Daphne', lastName: 'DevOps', status: 'APPROVED', email: 'daphne@example.com', skills: ['AWS', 'PostgreSQL'], expYears: 4 },
      { firstName: 'Evan', lastName: 'Rust', status: 'APPROVED', email: 'evan@example.com', skills: ['Rust'], expYears: 2 }
    ];

    const dbCands = [];
    for (const c of candidateData) {
      const [cand] = await db.insert(candidates).values({
        organizationId: org.id,
        status: c.status,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
      }).returning();

      const [doc] = await db.insert(candidateDocuments).values({
        organizationId: org.id,
        candidateId: cand.id,
        fileName: `${c.firstName.toLowerCase()}_resume.pdf`,
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: `${c.firstName.toLowerCase()}-key.pdf`,
        rawText: `Resume for ${c.firstName} who knows ${c.skills.join(', ')} with ${c.expYears} years of experience.`
      }).returning();

      await db.insert(candidateProfiles).values({
        organizationId: org.id,
        candidateId: cand.id,
        skills: c.skills,
        experience: [{ role: 'Engineer', company: 'Software Co', startDate: '2020-01', endDate: '2023-01', description: `Used ${c.skills.join(', ')}` }],
        education: [],
      });

      for (const skill of c.skills) {
        await db.insert(candidateEvidence).values({
          organizationId: org.id,
          candidateId: cand.id,
          skill,
          sourceDocumentId: doc.id,
          excerpt: `verbatim excerpt for ${skill}`,
        });
      }

      // Generate a mock candidate embedding vector
      const embedVector = Array(768).fill(0.1);
      embedVector[0] = 0.8; // highly matchable
      await db.insert(candidateEmbeddings).values({
        organizationId: org.id,
        candidateId: cand.id,
        embedding: embedVector,
        model: 'text-embedding-004',
        version: '1.0',
      });

      dbCands.push(cand);
    }

    // 6. Refresh and navigate to matches tab
    await page.goto(`/dashboard/jobs/${dbJob.id}`);
    await page.click('#tab-matches');
    await expect(page.locator('#ranked-matches-list')).toBeVisible();

    // Flow 2: Verify compare button starts disabled
    const compareBtn = page.locator('#btn-compare-candidates');
    await expect(compareBtn).toBeVisible();
    await expect(compareBtn).toHaveClass(/disabled/);

    // Select 1 candidate
    await page.click(`#select-candidate-${dbCands[0].id}`);
    await expect(compareBtn).toHaveClass(/disabled/);
    await expect(page.locator('#selection-status-text')).toContainText('1 candidate selected');

    // Select 2nd candidate -> Compare button should become enabled!
    await page.click(`#select-candidate-${dbCands[1].id}`);
    await expect(compareBtn).not.toHaveClass(/disabled/);
    await expect(page.locator('#selection-status-text')).toContainText('2 candidates selected');

    // Select 3rd, 4th, 5th
    await page.click(`#select-candidate-${dbCands[2].id}`);
    await page.click(`#select-candidate-${dbCands[3].id}`);
    await page.click(`#select-candidate-${dbCands[4].id}`);
    await expect(page.locator('#selection-status-text')).toContainText('5 selected. Maximum reached');

    // Flow 3: Try to select a 6th candidate -> verify it is disabled/prevented!
    // Since we only inserted 5, let's insert a 6th candidate in the database to test this
    const [cand6] = await db.insert(candidates).values({
      organizationId: org.id,
      status: 'APPROVED',
      firstName: 'Frank',
      lastName: 'Sixth',
      email: 'frank@example.com',
    }).returning();
    await db.insert(candidateProfiles).values({
      organizationId: org.id,
      candidateId: cand6.id,
      skills: ['Python'],
      experience: [],
      education: [],
    });
    const embedVector6 = Array(768).fill(0.1);
    await db.insert(candidateEmbeddings).values({
      organizationId: org.id,
      candidateId: cand6.id,
      embedding: embedVector6,
      model: 'text-embedding-004',
      version: '1.0',
    });

    await page.reload();
    await page.click('#tab-matches');
    await expect(page.locator('#ranked-matches-list')).toBeVisible();

    // Reselect the first 5 candidates
    await page.click(`#select-candidate-${dbCands[0].id}`);
    await page.click(`#select-candidate-${dbCands[1].id}`);
    await page.click(`#select-candidate-${dbCands[2].id}`);
    await page.click(`#select-candidate-${dbCands[3].id}`);
    await page.click(`#select-candidate-${dbCands[4].id}`);

    // Verify 6th candidate checkbox is disabled!
    const checkbox6 = page.locator(`#select-candidate-${cand6.id}`);
    await expect(checkbox6).toBeDisabled();

    // Deselect Dafne to enable others
    await page.click(`#select-candidate-${dbCands[3].id}`);
    await expect(checkbox6).not.toBeDisabled();

    // Select Sarah, Alex, and John for the comparison redirect
    await page.click(`#select-candidate-${dbCands[4].id}`); // deselect Evan
    // Now Sarah and Alex are selected. Let's select John too.
    await page.click(`#select-candidate-${dbCands[2].id}`); // deselect John, wait
    await page.click(`#select-candidate-${dbCands[2].id}`); // select John again
    // Let's verify what is selected: Sarah, Alex, John.
    
    // Flow 1 & 4 & 5 & 6: Click Compare and verify comparison matrix details
    await page.click('#btn-compare-candidates');
    await page.waitForURL(/\/dashboard\/jobs\/[0-9a-f-]+\/compare\?candidates=/);

    // Verify Candidates name header and status badges are rendered
    await expect(page.locator('.compare-candidate-column').nth(0)).toContainText('Sarah');
    await expect(page.locator('.compare-candidate-column').nth(1)).toContainText('Alex');
    await expect(page.locator('.compare-candidate-column').nth(2)).toContainText('John');

    await expect(page.locator('.compare-candidate-column').nth(0)).toContainText('SHORTLISTED');
    await expect(page.locator('.compare-candidate-column').nth(1)).toContainText('INTERVIEW');
    await expect(page.locator('.compare-candidate-column').nth(2)).toContainText('APPROVED');

    // Verify match scores and contributions
    await expect(page.locator('.compare-match-score').first()).toContainText('%');
    await expect(page.locator('.compare-semantic-score').first()).toContainText('%');
    await expect(page.locator('.compare-required-score').first()).toContainText('%');
    await expect(page.locator('.compare-preferred-score').first()).toContainText('%');
    await expect(page.locator('.compare-experience-score').first()).toContainText('%');

    // Verify Skill Coverage Matrix
    await expect(page.locator('.compare-skill-name').first()).toContainText('Python');
    await expect(page.locator('.compare-skill-status').first()).toContainText('✓ Confirmed');

    // Verify Experience Alignment
    await expect(page.locator('.compare-experience-years').first()).toContainText('years');

    // Verify AI Summary explanation exists
    await expect(page.locator('#comparison-ai-summary-text')).toBeVisible();
    await expect(page.locator('#comparison-ai-summary-text')).toContainText('AI comparison summary for job');

    // Verify Evidence Excerpt Providence traces are grounded and visible
    await expect(page.locator('#comparison-evidence-providence')).toBeVisible();
    await expect(page.locator('#comparison-evidence-providence')).toContainText('verbatim excerpt');

    // Flow 7: Cross-tenant isolation verification
    // Onboard Org B and candidate B in DB
    const [orgB] = await db.insert(organizations).values({
      name: 'Tenant B Corp',
      slug: 'tenant-b-corp',
    }).returning();
    const [candB] = await db.insert(candidates).values({
      organizationId: orgB.id,
      status: 'APPROVED',
      firstName: 'John',
      lastName: 'CrossTenant',
      email: 'johb@example.com',
    }).returning();

    // Try navigating to comparison url containing Org B candidate ID
    await page.goto(`/dashboard/jobs/${dbJob.id}/compare?candidates=${dbCands[0].id},${candB.id}`);
    
    // Verify comparison is rejected with fail card
    await expect(page.locator('#comparison-error-card')).toBeVisible();
    await expect(page.locator('#comparison-error-card')).toContainText('not found or access denied');
  });
});
