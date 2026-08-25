# AptiHire AI — Disaster Recovery & Backup Runbook

## 1. Overview & Service Level Objectives (SLOs)

AptiHire AI relies on a PostgreSQL database host with the `pgvector` extension, Redis for sliding-window rate limiting & BullMQ queues, and Google Gemini 2.0 AI services.

### Targets & SLO Boundaries
- **Recovery Point Objective (RPO)**: `<= 24 hours` (Target: Sub-minute via Continuous WAL Archiving / Point-In-Time Recovery).
- **Recovery Time Objective (RTO)**: `<= 4 hours` (Target: `< 30 minutes` for automated managed failover).

---

## 2. PostgreSQL Cloud Backup Architecture

Production PostgreSQL deployments (e.g., AWS RDS, Supabase, Neon, GCP Cloud SQL) MUST enforce the following configuration:

1. **Automated Daily Base Backups**: Continuous daily full snapshot retention for a minimum of 30 days.
2. **Point-In-Time Recovery (PITR)**: Continuous Write-Ahead Log (WAL) archiving allowing restoration to any second within the retention window.
3. **Encryption at Rest**: AWS KMS or GCP Cloud KMS customer-managed encryption keys for backup snapshots and storage volumes.
4. **Access Control**: Backup access restricted strictly to Cloud Infrastructure Admin IAM roles with MFA enforced.

---

## 3. Non-Destructive Database Restore Verification Procedure

> [!CAUTION]
> **NEVER** perform restore verification testing against the primary production database.

### Step-by-Step Staging Restore Protocol

1. **Provision Isolated Staging Host**:
   Create a temporary PostgreSQL instance (e.g., `aptihire-staging-restore-test`).
2. **Restore Latest Snapshot**:
   Restore the latest automated backup or target PITR timestamp to the staging host.
3. **Verify Extensions & Schema Integrity**:
   Connect via `psql` and verify `pgvector` extension and required composite/HNSW indexes:
   ```sql
   SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
   
   SELECT indexname FROM pg_indexes WHERE tablename IN ('candidate_notes', 'candidate_status_history', 'candidate_embeddings', 'job_embeddings');
   -- Required: notes_org_created_idx, history_org_created_idx, history_cand_created_idx, candidate_embedding_hnsw_idx, job_embedding_hnsw_idx
   ```
4. **Execute Application Verification Suite**:
   Point a staging build of the application (`DATABASE_URL=postgresql://...staging`) and execute the automated integration test suite:
   ```bash
   node --env-file=.env.staging node_modules/vitest/vitest.mjs run tests/integration/tenant.test.ts
   ```
5. **Verify Tenant Isolation Boundary**:
   Run cross-tenant query sanity checks to ensure organization ownership remains intact across candidates, jobs, and audit logs.
6. **Teardown Staging Host**:
   After verification succeeds, record execution duration and terminate the temporary restore host.

---

## 4. Status Classification

- **Backup Infrastructure Code**: `CONFIGURED`
- **Cloud Provider Production Restore**: `UNVERIFIED — REQUIRES CLOUD PROVIDER ACTION`
