# AptiHire AI — Production Operations Runbook

## 1. Prerequisites & Environment Setup

Production deployment requires Node.js v20.x or higher, a PostgreSQL database (v16+) with the `pgvector` extension enabled, and Redis (v7+).

### Environment Variable Checklist

```bash
NODE_ENV=production
JWT_SECRET=<32_PLUS_CHAR_SECURE_RANDOM_STRING>
DATABASE_URL=postgresql://user:password@host:5432/aptihire_db?sslmode=require
REDIS_URL=rediss://user:password@redis-host:6379
AI_PROVIDER_TYPE=gemini
GEMINI_API_KEY=<VALID_GOOGLE_GEMINI_API_KEY>
DISABLE_RATE_LIMIT=false
```

---

## 2. Deployment Sequence

1. **Pre-Deployment Validation**:
   ```bash
   node node_modules/typescript/lib/tsc.js --noEmit
   node node_modules/next/dist/bin/next lint
   node --env-file=.env node_modules/vitest/vitest.mjs run
   ```

2. **Database Migration Execution**:
   Apply versioned Drizzle Kit database migrations before deploying application code:
   ```bash
   npx drizzle-kit migrate
   ```

3. **Application Build & Startup**:
   ```bash
   npm run build
   npm run start
   ```

4. **Background Queue Worker Deployment**:
   Start the standalone background queue worker process for processing resume PDFs and candidate parsing:
   ```bash
   node -e "require('./src/services/queue').startCandidateWorker()"
   ```

---

## 3. Incident Monitoring & Incident Response

### Key Health Monitoring Check

- Endpoint: `GET /api/health`
- Healthy (HTTP 200): All checks (`database`, `redis`, `queue`) return `"ok"`.
- Degraded (HTTP 503): One or more dependencies unreachable; alerts must trigger infrastructure team notification.

### Log Audit Safeguards

All application logs must be ingested via a centralized collector (Datadog, Grafana Loki, AWS CloudWatch). Confirm:
- Logs include `X-Request-ID` correlation identifiers.
- Prompts, raw candidate resumes, JWT tokens, and database passwords are automatically sanitized and absent from logs.
