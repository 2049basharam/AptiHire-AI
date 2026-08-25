# APTIHIRE AI — PHASE 7 PRODUCTION DEPLOYMENT RUNBOOK

**Document Version**: 1.0.0  
**Target Environment**: Production / Staging Cloud Architecture  
**Primary Stack**: Vercel (Next.js 15 App Router) + Supabase (PostgreSQL 16 with pgvector) + Upstash/Render (Redis & BullMQ) + Google Gemini AI API

---

## 1. REQUIRED INFRASTRUCTURE

- **Frontend & App Router Serverless**: Vercel or Node.js server container (Next.js 15 App Router with Node.js 20 runtime).
- **Database**: Supabase PostgreSQL 16 (or AWS RDS / GCP Cloud SQL for PostgreSQL) with `pgvector` extension enabled for candidate semantic vector search.
- **Redis Connection**: Upstash Redis or Render Redis (TLS enabled, minimum 256MB RAM with sliding-window key expiration support).
- **Background Worker Process**: BullMQ worker process running in Node.js 20 environment (on Render background worker instance or AWS ECS container) listening to candidate resume parsing and code sandbox evaluation queues.
- **AI Provider**: Google Gemini API key (`GEMINI_API_KEY`) provisioned with quota for `gemini-1.5-flash` or `gemini-1.5-pro` models.

---

## 2. REQUIRED ENVIRONMENT VARIABLES CONTRACT

| Variable Name | Required | Scope | Purpose | Production Requirements | Safe Failure Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** | Server-Only | PostgreSQL connection string | TLS connection, pool max 10, Supabase/RDS URL | Throws 500 error on DB failure; caught by error handlers |
| `REDIS_URL` | **Yes** | Server-Only | Redis connection string | `rediss://` TLS URL with auth password | Fails-open for rate limits; logs warning without blocking API |
| `JWT_SECRET` | **Yes** | Server-Only | SHA-256 key for signing session tokens | Min 32 characters, high entropy string | App refuses startup if missing or <32 characters |
| `NODE_ENV` | **Yes** | Server/Client | Environment indicator | Set to `production` | Enforces HTTPS cookies & rate-limiting safeguards |
| `AI_PROVIDER_TYPE` | Optional | Server-Only | AI Adapter driver selection | Set to `gemini` (defaults to `gemini`) | Retries transient 429/503 errors up to 2 times |
| `GEMINI_API_KEY` | **Yes** | Server-Only | Gemini API authentication key | Valid API key with sufficient quota | Retries 2x; fails gracefully with fallback error |
| `DISABLE_RATE_LIMIT` | Optional | Server-Only | Rate limiter toggle | Must **NOT** be set to `true` in production | Startup schema rejects app start if set to `true` in prod |
| `ENABLE_TEST_ENDPOINTS` | Optional | Server-Only | Test route toggle | Must **NOT** be set to `true` in live production | Test endpoints like `/api/test/tenant` return 404 |

---

## 3. DATABASE MIGRATION PROCEDURE

1. **Pre-Migration Backup**: Execute Supabase automated snapshot or manually dump schema:
   ```bash
   pg_dump "$DATABASE_URL" --schema-only > pre_migration_backup.sql
   ```
2. **Schema Verification**: Check pending migrations against target PostgreSQL database:
   ```bash
   npx drizzle-kit generate
   ```
3. **Execute Non-Destructive Schema Migration**:
   ```bash
   npx drizzle-kit push
   ```
4. **Post-Migration Verification**: Confirm database tables (`users`, `organizations`, `memberships`, `jobs`, `candidates`, `assessment_templates`, `interview_sessions`, `assessment_evaluations`, `panel_evaluations`, `audit_logs`) exist with proper composite indexes and foreign keys.

---

## 4. APPLICATION BUILD PROCEDURE

1. **Install Clean Dependencies**:
   ```bash
   npm ci
   ```
2. **Execute Static Analysis & Linting**:
   ```bash
   npx tsc --noEmit
   npm run lint
   ```
3. **Build Next.js App Router Bundle**:
   ```bash
   npm run build
   ```
   *Expected Output*: `✓ Compiled successfully`, all 37 App Router routes compiled cleanly.

---

## 5. START COMMAND

- **Next.js Web Application**:
  ```bash
  npm start
  ```
- **BullMQ Background Queue Worker**:
  ```bash
  node --env-file=.env dist/workers/ingestion.js
  ```

---

## 6. HEALTH VERIFICATION

Call operational health endpoint:
```bash
curl -i https://your-domain.com/api/health
```
*Expected Response*:
```json
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-ID: health-check-uuid

{
  "status": "healthy",
  "dbStatus": "ok",
  "redisStatus": "ok",
  "queueStatus": "ok",
  "timestamp": "2026-08-25T17:00:00.000Z"
}
```

---

## 7. SMOKE TESTS PROCEDURE

1. Run standalone production unit smoke test suite:
   ```bash
   npx vitest run tests/unit/phase7-production-smoke.test.ts
   ```
2. Verify protected route rejection:
   ```bash
   curl -i https://your-domain.com/api/audit-logs/export
   # Expected: HTTP 401 Unauthorized
   ```
3. Verify test endpoint restriction:
   ```bash
   curl -i https://your-domain.com/api/test/tenant?orgId=some-id
   # Expected: HTTP 404 Not Found
   ```

---

## 8. ROLLBACK PROCEDURE

1. **Vercel Instant Deployment Rollback**: Select previous successful deployment in Vercel Dashboard -> Deployments -> Promote to Production.
2. **Database Rollback**: Schema changes in Phase 1–6 use additive, non-destructive column/table additions. Reverting application code will not break existing database tables. If necessary, restore database snapshot from pre-migration backup.
3. **Cache Clearing**: Flush Redis rate-limit keys:
   ```bash
   redis-cli -u "$REDIS_URL" FLUSHDB
   ```

---

## 9. SECRET ROTATION PROCEDURE

1. **`JWT_SECRET` Rotation**: Update `JWT_SECRET` in production environment settings. Note: Active user sessions signed with the old secret will require re-authentication.
2. **`GEMINI_API_KEY` Rotation**: Generate new API key in Google AI Studio, update `GEMINI_API_KEY` in environment variables, and redeploy without downtime.
3. **Database Credentials Rotation**: Update `DATABASE_URL` with new password string, verify pool reconnection via `/api/health`.

---

## 10. INCIDENT RESPONSE BASICS

1. **Diagnostic Correlation**: Extract `X-Request-ID` header from customer error report and query application logs:
   ```bash
   grep "X-Request-ID-value" production_app.log
   ```
2. **Database Outage Mitigation**: Inspect `/api/health` `dbStatus`. Verify Supabase database connection pool status and connection limits.
3. **Redis Outage Mitigation**: AptiHire AI rate limiter automatically degrades gracefully (fails open with warning logs) when Redis is unreachable, allowing core recruiter workflows to continue uninterrupted.
