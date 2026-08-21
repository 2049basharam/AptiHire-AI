# ADR-009: Asynchronous Document Processing Pipeline

## Status
Approved

## Context
Parsing resumes and invoking LLMs are long-running operations that exceed normal HTTP request timeouts (especially in serverless environments). To ensure reliability and robustness, this work must run asynchronously.

## Decision
We will establish an asynchronous document processing pipeline using the existing **BullMQ** + **Redis** worker architecture.

### Processing Workflow

```text
HTTP POST /api/candidates
  (Validate MIME & File size)
       ↓
Save to Private Storage & Create Candidate in DB (status: 'UPLOADED')
       ↓
Add job to BullMQ queue: 'candidate-processing' (status transitions to 'QUEUED')
       ↓
Worker picks up job (status transitions to 'PROCESSING')
       ↓
Extract text from file buffer:
  - If PDF: Extract using pdf-parse
  - If DOCX: Extract using mammoth
       ↓
Validate extracted text:
  - If empty / image-only / corrupted (length < 100 characters):
      Transition to 'FAILED_EXTRACTION'. OCR is explicitly deferred.
       ↓
Save raw text to database & transition to 'AI_PROCESSING'
       ↓
Invoke AIProvider to extract structured profile and evidence
       ↓
Save profile and evidence in transactions & transition to 'REVIEW_REQUIRED'
```

### Idempotency & Retry Strategy
* **Idempotency**: Processing jobs are safe to retry. Before parsing or saving AI extractions, the worker deletes any existing profile, evidence, and embedding records linked to that `candidateId`.
* **BullMQ Retry Policy**: Configure transient queue retries (e.g., up to 3 retries with exponential backoff) for external AI provider timeouts or network faults.
* **Worker Crash Recovery**: If a worker crashes mid-process, the candidate remains in `PROCESSING` or returns to `QUEUED` depending on BullMQ job status, exposing status logs in the processing UI.

## Consequences
* Protects user experience by keeping web HTTP routes fast and lightweight.
* Guarantees all documents are safely retried on transient failures.
* Recovers from crashed parsing states without corrupting candidate profiles.
