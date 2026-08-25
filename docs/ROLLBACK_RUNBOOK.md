# AptiHire AI — Application & Infrastructure Rollback Runbook

## 1. Scope & Strategy

Rollbacks in AptiHire AI are categorized into **Application Level Rollbacks** (instant container/image reversion) and **Database Schema Rollbacks** (forward-fix migrations or backup restore).

---

## 2. Application Container Rollback Procedure

When an application deployment issue or runtime exception spike is detected post-release:

1. **Traffic Re-routing / Image Rollback**:
   Revert the active container image tag or deployment target in your cloud platform (Vercel / Kubernetes / AWS ECS / Render) from version `N+1` to previously verified version `N`.
2. **Health Check Verification**:
   Verify endpoint status immediately post-reversion:
   ```bash
   curl -i https://aptihire.app/api/health
   # Expected: HTTP 200 { "status": "healthy" }
   ```
3. **Queue & Worker Reconnection Verification**:
   Verify BullMQ workers reconnect to Redis and resume job processing without job duplication.

---

## 3. Database Migration Rollback Strategy

> [!IMPORTANT]
> **DO NOT** execute destructive down-migrations in production. Down-migrations can permanently delete customer candidate data or organization memberships.

### Strategy Protocol
1. **Forward-Fix Migrations**:
   If a schema change introduces a regression, author a new forward migration (`0002_fix_schema_issue.sql`) via `drizzle-kit generate` that safely patches or makes fields optional/nullable.
2. **Data Restoration from Backup**:
   If schema corruption or unintended data deletion occurs, initiate the Non-Destructive Restore Verification procedure (`docs/DISASTER_RECOVERY.md`), restore to a staging host, verify integrity, and switch connection string.

---

## 4. Status Classification

- **Application Rollback Procedure**: `VERIFIED BY STATIC INSPECTION & CONTAINER METRICS`
- **Database Forward-Fix Strategy**: `CONFIGURED`
