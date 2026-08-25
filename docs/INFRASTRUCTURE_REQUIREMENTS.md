# AptiHire AI — Production Infrastructure Specification

## 1. Hosting Architecture Overview

AptiHire AI is structured as a cloud-native SaaS application utilizing Next.js 15, PostgreSQL, Redis, and Google Gemini AI APIs.

---

## 2. Infrastructure Component Specifications

### 2.1 Web Server / Application Tier
- **Platform**: Vercel / Kubernetes / AWS ECS / Render
- **Node.js Runtime**: v20.x LTS or higher
- **Scale Unit**: Auto-scaling web containers handling HTTP API requests and server-rendered Next.js pages.

### 2.2 Relational Database Tier (PostgreSQL + pgvector)
- **Engine**: PostgreSQL v16+
- **Required Extension**: `vector` (`pgvector` for candidate and job embeddings cosine similarity search)
- **Connection Pool**: 10 connections per app instance (`pg` Pool configuration)
- **Mandatory Composite & Vector Indexes**:
  - `notes_org_created_idx` (`organization_id`, `created_at`)
  - `history_org_created_idx` (`organization_id`, `created_at`)
  - `history_cand_created_idx` (`organization_id`, `candidate_id`, `created_at`)
  - `candidate_embedding_hnsw_idx` (`vector_cosine_ops` HNSW index)
  - `job_embedding_hnsw_idx` (`vector_cosine_ops` HNSW index)
- **Disaster Recovery Requirement**: Automated daily backups & sub-minute Point-in-Time Recovery (PITR) WAL log archiving.

### 2.3 Caching & Queue Tier (Redis + BullMQ)
- **Engine**: Redis v7+
- **Isolation**: Dedicated IORedis connections for sliding-window rate limiting and BullMQ background workers (`maxRetriesPerRequest: null`).
- **Fail-Open Strategy**: Rate limiter fails open during Redis unavailability so core API endpoints remain online.

### 2.4 AI Services Tier (Google Gemini)
- **Models**: `gemini-2.0-flash` (Structured requirement/profile extraction, search intent parsing, match explanations), `text-embedding-004` (768-dimension embeddings).
- **Timeouts**: 15s generation timeout, 5s embedding timeout. Max 2 retries on transient HTTP 429/5xx errors.
- **Score Isolation**: Deterministic candidate matching algorithm is 100% decoupled from LLM output.
