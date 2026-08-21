# ADR-007: Candidate Data Model

## Status
Approved

## Context
We need to model candidates, their uploaded resumes, parsed profiles, evidence/provenance information, and vector embeddings in a multi-tenant PostgreSQL database using Drizzle ORM.

## Decision
We will introduce five tables scoped inside the Candidate Module. All tables containing organization-owned resources enforce tenant boundary isolation via `organizationId`.

### Schema Design

1. **`candidates`**: Core table representing candidate metadata and processing lifecycle status.
   * `id`: `uuid` (Primary Key, defaultRandom)
   * `organizationId`: `uuid` (FK references `organizations.id`, restrictive NO CASCADE)
   * `firstName`: `varchar(255)` (nullable)
   * `lastName`: `varchar(255)` (nullable)
   * `email`: `varchar(255)` (nullable)
   * `phone`: `varchar(50)` (nullable)
   * `status`: `varchar(50)` (Not Null, default `'UPLOADED'`) - States: `UPLOADED`, `QUEUED`, `PROCESSING`, `EXTRACTED`, `AI_PROCESSING`, `REVIEW_REQUIRED`, `APPROVED`, `FAILED_EXTRACTION`, `FAILED_AI`.
   * `createdAt`: `timestamp` (defaultNow)
   * `updatedAt`: `timestamp` (defaultNow)
   * **Indexes**: 
     * `candidate_org_idx` on `organizationId`
     * `candidate_status_idx` on `status`
     * `candidate_org_status_idx` on `(organizationId, status)`

2. **`candidate_documents`**: Stores resume document metadata and extracted raw text.
   * `id`: `uuid` (Primary Key, defaultRandom)
   * `candidateId`: `uuid` (FK references `candidates.id`, `onDelete: 'cascade'`)
   * `organizationId`: `uuid` (FK references `organizations.id`, restrictive NO CASCADE)
   * `fileName`: `varchar(255)` (sanitized)
   * `fileSize`: `integer`
   * `mimeType`: `varchar(100)`
   * `storageKey`: `varchar(255)` (secure UUID-based file path)
   * `rawText`: `text` (extracted document text)
   * `createdAt`: `timestamp` (defaultNow)
   * **Indexes**:
     * `doc_candidate_idx` on `candidateId`
     * `doc_org_idx` on `organizationId`

3. **`candidate_profiles`**: Holds Zod-validated structured profile data parsed by the AI.
   * `id`: `uuid` (Primary Key, defaultRandom)
   * `candidateId`: `uuid` (FK references `candidates.id`, `onDelete: 'cascade'`)
   * `organizationId`: `uuid` (FK references `organizations.id`, restrictive NO CASCADE)
   * `summary`: `text` (nullable)
   * `experience`: `jsonb` (Structured work history array)
   * `education`: `jsonb` (Structured degree array)
   * `skills`: `jsonb` (Normalized list of parsed skills)
   * `createdAt`: `timestamp` (defaultNow)
   * `updatedAt`: `timestamp` (defaultNow)
   * **Indexes**:
     * `profile_candidate_idx` on `candidateId`
     * `profile_org_idx` on `organizationId`

4. **`candidate_evidence`**: Traces extracted skills/claims back to raw resume snippets (provenance).
   * `id`: `uuid` (Primary Key, defaultRandom)
   * `candidateId`: `uuid` (FK references `candidates.id`, `onDelete: 'cascade'`)
   * `organizationId`: `uuid` (FK references `organizations.id`, restrictive NO CASCADE)
   * `skill`: `varchar(100)`
   * `sourceDocumentId`: `uuid` (FK references `candidate_documents.id`, `onDelete: 'cascade'`)
   * `excerpt`: `text` (raw resume snippet context)
   * `page`: `integer` (nullable)
   * `createdAt`: `timestamp` (defaultNow)
   * **Indexes**:
     * `evidence_candidate_idx` on `candidateId`
     * `evidence_org_idx` on `organizationId`

5. **`candidate_embeddings`**: Stores pgvector embeddings of candidate profiles.
   * `id`: `uuid` (Primary Key, defaultRandom)
   * `candidateId`: `uuid` (FK references `candidates.id`, `onDelete: 'cascade'`)
   * `organizationId`: `uuid` (FK references `organizations.id`, restrictive NO CASCADE)
   * `embedding`: `vector(768)` (Google `text-embedding-004` output dimensions)
   * `model`: `varchar(100)` (e.g. `'text-embedding-004'`)
   * `version`: `varchar(50)` (for future migrations)
   * `createdAt`: `timestamp` (defaultNow)
   * **Indexes**:
     * `embedding_candidate_idx` on `candidateId`
     * `embedding_org_idx` on `organizationId`

## Consequences
* Enables clean cascade deletion when removing a candidate, avoiding orphan metadata.
* Secures multi-tenancy at the query level by requiring `organizationId` on all reads and writes.
* Allows flexible audit logging on candidate review status transitions.
