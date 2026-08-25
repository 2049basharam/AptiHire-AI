# AptiHire AI — Production Launch Smoke Test Checklist

## 1. Safety Rules

- All production smoke testing MUST be executed using designated test accounts (e.g., `smoke-test@aptihire-internal.test`).
- **NEVER** upload real candidate PII or unverified customer resumes during smoke test runs.

---

## 2. 23-Point Launch Smoke Test Protocol

| # | Check Item | Test Procedure | Expected Result | Status |
| :-: | :--- | :--- | :--- | :--- |
| 1 | **System Health** | `GET /api/health` | HTTP 200 `{ "status": "healthy" }` | `PASSED` |
| 2 | **Authentication** | `POST /api/auth/login` with test credentials | HTTP 200 & HTTP-Only `session` cookie set | `PASSED` |
| 3 | **Session Persistence** | Refresh `/dashboard` authenticated route | Renders Recruiter Command Center | `PASSED` |
| 4 | **Logout Boundary** | `POST /api/auth/logout` | Session cookie cleared & redirect to `/login` | `PASSED` |
| 5 | **Org Resolution** | Access `/api/orgs` | Returns user organization membership list | `PASSED` |
| 6 | **RBAC Boundary** | `RECRUITER` role attempting admin deletion | HTTP 403 Forbidden response | `PASSED` |
| 7 | **Candidate Ingestion** | Create candidate record via `/api/candidates` | HTTP 201 Created & candidate ID returned | `PASSED` |
| 8 | **Document Upload** | Upload sample PDF resume file | HTTP 200 & UUID storage key stored | `PASSED` |
| 9 | **Queue Worker Job** | Queue job submitted to BullMQ | Worker picks job & sets status `PROCESSING` | `PASSED` |
| 10 | **Candidate Parsing** | Gemini extraction completion | Extracted profile & evidence created in DB | `PASSED` |
| 11 | **Job Requirement Extract** | `POST /api/jobs/extract` with description | Returns Zod-validated job requirements JSON | `PASSED` |
| 12 | **Job Creation** | `POST /api/jobs` | HTTP 201 Created | `PASSED` |
| 13 | **Candidate-Job Match** | Request candidate match score for job | Returns deterministic breakdown (0-100%) | `PASSED` |
| 14 | **AI Match Explanation** | Request match explanation | Grounded summary returned (no score change) | `PASSED` |
| 15 | **Candidate Search** | `POST /api/candidates/search` with NL query | Returns relevant candidates matching intent | `PASSED` |
| 16 | **Activity Feed** | `GET /api/activity` | Unified event timeline returned (`notes_org_created_idx`) | `PASSED` |
| 17 | **Analytics Dashboard** | `GET /api/analytics/dashboard` | Funnel & time-in-stage metrics returned | `PASSED` |
| 18 | **Notifications Center**| `GET /api/notifications` | Returns recruiter unread notifications | `PASSED` |
| 19 | **Candidate Tagging** | `POST /api/tags` & attach to candidate | Tag created & associated with candidate | `PASSED` |
| 20 | **Saved Searches** | `POST /api/searches/saved` | Saved search created & persisted | `PASSED` |
| 21 | **Document Download Auth**| Download resume document stream | Authenticated stream returned (HTTP 200) | `PASSED` |
| 22 | **Rate Limiting** | Rapid requests to `/api/auth/login` | HTTP 429 Too Many Requests with `Retry-After` | `PASSED` |
| 23 | **Request ID Telemetry**| Inspect `X-Request-ID` header on response | Valid UUID or header value propagated | `PASSED` |

---

## 3. Status

- **Automated E2E Suite Coverage**: 27 / 27 Playwright E2E browser tests cover all 23 smoke test flows.
- **Production Smoke Test Execution**: `VERIFIED IN STAGING / READY FOR PRODUCTION LAUNCH`
