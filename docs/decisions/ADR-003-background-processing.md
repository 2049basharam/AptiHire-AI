# ADR-003: Background Processing Queue via Redis and BullMQ

## Status
Accepted

## Context
TalentOS performs several heavy, resource-intensive operations that can take anywhere from 5 seconds to 2 minutes:
1. Parsing uploaded resumes (extracting text from PDFs/DOCX and converting it to structured profiles using LLMs).
2. Generating embedding vectors for candidates and jobs.
3. Automatically generating technical assessment question banks based on job requirements.
4. Parsing and evaluating candidate assessment answers against rubrics.

Executing these operations inside synchronous HTTP requests (Next.js API route handlers) leads to timeout failures (especially on serverless hosts like Vercel with a 10s-30s execution cap) and degrades the user experience due to freezing screens.

## Decision
We will implement an asynchronous background processing queue using **Redis** and **BullMQ** (v5+).

When a candidate uploads a resume or a recruiter starts an assessment generation, the Next.js API handler will push a metadata job into a BullMQ queue and immediately return a `202 Accepted` response. A separate Node.js worker process (or an asynchronous worker thread inside the monorepo) will process the jobs sequentially, writing updates back to the database.

## Alternatives Considered

### 1. Synchronous API Executions (In-line)
* **Why rejected**: Web servers would timeout on heavy workloads. Slow operations block the main single-threaded Node.js event loop, preventing other clients from receiving quick responses.

### 2. In-Memory Arrays (SetTimeout / In-Memory Queues)
* **Why rejected**: If the server restarts (e.g., during a deployment or crash recovery), all pending resume parsing and evaluations inside the node memory heap are lost. There is no job retry logic, progress reporting, or rate limiting.

### 3. Serverless Cron / AWS SQS / PG-Boss
* **Why rejected**: AWS SQS introduces vendor lock-in. PG-Boss uses PostgreSQL as a queue, which can cause table bloat and high locking overhead. BullMQ is the industry-standard TypeScript-first queuing solution with Redis, providing low-latency atomic operations and native support for job retries and progress tracking.

## Consequences
* **Pros**:
  * Decouples slow, external AI API dependencies from the web server response loop.
  * Native BullMQ support for job retries (with backoff strategy) and concurrent job limits.
  * Real-time progress updates can be written to the database (e.g., "50% parsed") and fetched via polling.
  * Isolation of processing failures (a crash in resume parsing does not crash the web server).
* **Cons**:
  * Requires a persistent Redis server instance, increasing infrastructure overhead and local setup requirements.
  * Requires running a background worker process alongside the Next.js web process.
