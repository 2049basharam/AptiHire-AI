# AptiHire AI — Deployment Architecture & Cloud Migration Blueprint

## Current Operational Status

- **Application Readiness**: **100% VERIFIED LOCALLY**
- **Deployment Configuration**: **100% PREPARED**
- **Live Infrastructure Deployment**: **NOT CURRENTLY DEPLOYED** *(System operates in deployment-ready local mode for technical evaluation)*

---

## 1. Target Multi-Tier Cloud Architecture

When live cloud deployment is requested, AptiHire AI is architected to deploy across decoupled, specialized cloud infrastructure providers to enforce security boundaries and strict isolation:

```
Internet / Candidates / Recruiters
               │
               ▼
   [ Vercel Serverless Platform ]
   Next.js App Router & Edge Middleware
   ├── Static UI Assets & Dashboard Pages
   └── API Routes (CSRF, Auth, RBAC, Validation)
               │
       ┌───────┴───────────────────────┐
       ▼                               ▼
[ Supabase PostgreSQL ]        [ Managed Redis / Valkey ]
  - pgvector Extension           - Rate Limiting Cache
  - Cosine HNSW Indexes          - BullMQ Queue Broker
  - Connection Pooler                  │
                                       ▼
                       [ Render Dedicated Worker Cluster ]
                       BullMQ Job Consumers & Evaluation Engine
                                       │
                                       ▼
                       [ Docker Sandbox Execution Host ]
                       Isolated Docker Engine (Python 3.11 / Node 20)
                       - Security: --network=none, --read-only,
                         --memory=128m, --memory-swap=128m,
                         --cpus=0.5, --pids-limit=30, --cap-drop=ALL
```

---

## 2. Component Deployment Guides

### A. Frontend & API Layer (Vercel)
1. **Repository Link**: Connect GitHub repository to Vercel project.
2. **Framework Preset**: Next.js App Router (`npm run build`).
3. **Environment Variables**:
   - `NEXT_PUBLIC_APP_URL`
   - `DATABASE_URL` (Supabase Connection Pooler string, transaction mode)
   - `DIRECT_DATABASE_URL` (Supabase Session mode string for migrations)
   - `REDIS_URL` (Managed Redis connection string)
   - `JWT_SECRET` (Cryptographically secure string >= 32 characters)
   - `GEMINI_API_KEY` (Google Gemini AI API Key)
4. **Security Boundary**: Vercel serverless handlers **NEVER** execute candidate code or spawn Docker containers.

### B. Database Layer (Supabase PostgreSQL)
1. **Provisioning**: Create Supabase project in target region.
2. **Extension Setup**: Enable `vector` extension via SQL console or migration:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. **Migration Execution**: Apply Drizzle schema migrations:
   ```bash
   npx drizzle-kit push
   ```
4. **Index Verification**: Confirm HNSW index creation on candidate embeddings:
   ```sql
   CREATE INDEX IF NOT EXISTS candidate_embedding_hnsw_idx 
   ON candidate_embeddings 
   USING hnsw (embedding vector_cosine_ops);
   ```

### C. Queue & Cache Layer (Managed Redis / Upstash)
1. **Provisioning**: Provision Redis 7.x instance with TLS support.
2. **BullMQ Configuration**: Ensure `maxRetriesPerRequest: null` is enabled in `IORedis` connection options.

### D. Worker Layer (Render)
1. **Blueprint**: Deploy using `render.yaml` configuration.
2. **Worker Isolation**: Render workers process background tasks (`candidate-processing-queue`, `assessment-evaluation-queue`) independently of HTTP request handlers.

### E. Code Execution Sandbox (Dedicated Docker Host)
1. **Container Isolation Guarantee**: Candidate code runs exclusively inside Docker containers on dedicated worker hosts.
2. **Hardening Standard**:
   - `--network=none` (No internet access, prevents SSRF & exfiltration)
   - `--read-only` (Read-only root filesystem)
   - `--memory=128m --memory-swap=128m` (Strict memory ceiling)
   - `--cpus=0.5` (CPU quota throttling)
   - `--pids-limit=30` (Fork bomb defense)
   - `--cap-drop=ALL` (Linux capabilities dropped)
   - `--user=1000:1000` (Non-root user execution)
   - Executed via `child_process.execFile` array invocation without shell command interpolation.

---

## 3. Environment Variable Architecture

| Variable | Scope | Type | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | Public / Browser | URL | Base URL of web application |
| `DATABASE_URL` | Server & Worker | Secret URL | Supabase pooled database connection string |
| `DIRECT_DATABASE_URL` | Migration Server | Secret URL | Direct PostgreSQL connection string for migrations |
| `REDIS_URL` | Server & Worker | Secret URL | Redis cache and BullMQ connection string |
| `JWT_SECRET` | Server & Worker | Secret String | Minimum 32-character secret for JWT verification |
| `GEMINI_API_KEY` | Server & Worker | Secret String | API key for Gemini 2.0 AI Provider |
| `NODE_ENV` | Global | Enum | `development` / `production` / `test` |

---

## 4. Local Development Verification Workflow

To run AptiHire AI locally in deployment-ready mode:

```bash
# 1. Install dependencies
npm install

# 2. Configure local environment variables (.env)
cp .env.example .env

# 3. Apply database migrations
node node_modules/drizzle-kit/bin.cjs push

# 4. Execute quality gate suite
npx tsc --noEmit
npm run lint
npm test
npx playwright test

# 5. Start development server
npm run dev
```
