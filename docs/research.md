# AptiHire AI Research Report

This document outlines the findings from our market research (specifically Aptivision Technologies), technology stack verification using Context7, and architectural decisions for AptiHire AI.

---

## 1. Aptivision Research

We researched the publicly available information for Aptivision Technologies (the HR-tech/consulting business, separate from the automotive technology company Aptiv).

### Verified Public Information
* **Core Product Focus**: AI-powered HR technology and business consulting, prioritizing automated recruitment pipelines.
* **Technology Stack**:
  * **Frontend**: React.js, Next.js (App Router), TypeScript, Tailwind CSS, and shadcn/ui.
  * **Backend**: Node.js, Next.js Route Handlers / Server Actions, and REST APIs.
  * **Database & Search**: PostgreSQL, Drizzle ORM, pgvector, and OpenAI API integrations for semantic vector matching.
* **Recruitment Workflows**: Scalable multi-tenant SaaS architectures, continuous integration/continuous deployment (CI/CD) pipelines, and rigorous unit/integration testing suites.

### AptiHire AI Design Decision / Assumption (Original System Layout)
* **Monolith vs. Microservices**: While Aptivision leans serverless, AptiHire AI will be implemented as a **Modular Monolith** in a single Next.js monorepo to reduce deployment complexity while maintaining clear boundary definitions between the Auth, Job Management, Assessment, and AI services.
* **ORM & Database**: We will use **Drizzle ORM** over Prisma to access PostgreSQL. Drizzle provides native, high-performance support for `pgvector` operators and outputs SQL queries that are simpler to optimize for high-density recruiter dashboards.
* **Background Jobs**: AptiHire AI will use **BullMQ** with Redis for resume parsing and assessment generation. Since LLM calls and file processing can exceed the 10-second serverless execution limits, asynchronous background queues are a hard production requirement.

---

## 2. Context7 Technology Verification

The following libraries and APIs have been resolved and verified using the Context7 registry.

### Next.js
* **Library ID**: `/vercel/next.js`
* **Version Verified**: `v15.1.11` (React 19 compatible)
* **APIs & Patterns**: App Router directory structure (`src/app/`), Route Handlers (`route.ts`) for modular API modules, and Server Actions for form submissions. Next.js Route Handlers serve as the API endpoints.

### Drizzle ORM (with pgvector)
* **Library ID**: `/drizzle-team/drizzle-orm`
* **Version Verified**: `0.31.0` and above
* **Verification Status**: Confirmed that `drizzle-team/drizzle-orm` includes native `pg_vector` support since version `0.31.0`.
* **API Schema Syntax**:
  ```ts
  import { pgTable, index, vector } from 'drizzle-orm/pg-core';

  export const candidateEmbeddings = pgTable('candidate_embeddings', {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }),
    embedding: vector('embedding', { dimensions: 1536 }) // 1536 dimensions for standard text-embedding-3-small
  }, (table) => ({
    cosineIdx: index('cosine_idx').using('hnsw', table.embedding.op('vector_cosine_ops'))
  }));
  ```
* **API Query Syntax**:
  ```ts
  import { cosineDistance } from 'drizzle-orm';
  
  // Find top matching candidates by embedding distance
  const results = await db.select()
    .from(candidateEmbeddings)
    .orderBy(cosineDistance(candidateEmbeddings.embedding, targetVector))
    .limit(10);
  ```

### BullMQ
* **Library ID**: `/taskforcesh/bullmq` (Indexed under `/taskforcesh/bull`)
* **Verification Status**: Confirmed typescript-first syntax for Queue and Worker setups. Works reliably with a centralized Redis instance to handle async resume extraction and AI evaluation jobs.

### Google Gen AI SDK
* **Library ID**: `/googleapis/js-genai` (Package: `@google/genai`)
* **Model Selected**: `gemini-2.0-flash` (production-ready, stable, and highly cost-effective) for requirements and profile extraction.
* **Embedding Model Selected**: `text-embedding-004` (768 dimensions) for candidate profile vector generation.
* **API Features**: Native structured outputs supported by setting `responseMimeType: "application/json"` and configuring `responseSchema` (using the SDK's `Type` constants). This guarantees the model's text response will be valid JSON matching the schema exactly.
* **Embedding API**: Invoked via `ai.models.embedContent({ model: "text-embedding-004", contents: [...] })` with `outputDimensionality: 768`.
* **Fallback Strategy**: If `GEMINI_API_KEY` is not set or API calls fail, the application gracefully reports that AI extraction is unavailable and falls back to manual entry inputs.

### PDF & Word Document Parsers
* **PDF Parser**: `pdf-parse` (TypeScript version: `/mehmet-kozan/pdf-parse`). Pure TypeScript, cross-platform module for extracting text and metadata from PDF files in Node.js.
* **DOCX Parser**: `mammoth` (JavaScript version: `/mwilliamson/mammoth.js`). Converts Microsoft Word `.docx` documents into clean, semantic text/HTML, preserving style hierarchies and list structures.

---

## 3. Dependency Rationale & Decisions

| Dependency | Why We Need It | Problem It Solves | Alternatives Considered | Rejection Rationale |
|---|---|---|---|---|
| **Next.js 15** | Unified frontend & backend framework. | Eliminates the overhead of managing separate web and API repositories. | Vite + Express.js | Lacks server-side rendering (SSR), and maintaining two projects introduces API deployment orchestration complexity. |
| **Drizzle ORM** | SQL query builder and schema management. | Avoids heavy runtime wrappers; provides type-safe SQL schemas. | Prisma ORM | Prisma has slower startup times in serverless contexts and historically required custom SQL patches for native `pgvector` distance functions. |
| **pgvector** | PostgreSQL vector database extension. | Enables storage and cosine-similarity searches of resume and job requirement embeddings. | Pinecone / Qdrant | Introducing a standalone vector DB is an unnecessary architectural complication for an MVP. |
| **BullMQ + Redis** | Asynchronous task processor. | Offloads long-running operations (PDF parsing, LLM calls) from HTTP requests to prevent timeouts. | In-memory arrays / setTimeouts | Volatile; tasks are lost on server restart, and there is no retry logic or concurrency control. |
| **Zod** | Runtime schema validator. | Enforces type safety on JSON APIs and validates structured outputs returned by LLM models. | Typebox / Joi | Zod integrates natively with Drizzle and LLM SDK structured outputs. |
| **Playwright** | E2E Testing Framework. | Automates multi-user testing (Recruiter -> Candidate -> Hiring Manager). | Cypress | Playwright runs faster, supports multi-tab/role workflows natively, and has better headless CI performance. |
| **pdf-parse** | PDF text extraction library. | Extracts raw text from uploaded PDF resumes in asynchronous workers. | pdf2json / pdfjs-dist | pdf2json has complex event-based listeners, and pdfjs-dist requires manual canvas/DOM hooks which are unstable in worker threads. |
| **mammoth** | Word (.docx) text converter. | Converts Word resumes to clean, semantic text in background workers. | officeparser | officeparser does not maintain paragraph formatting/lists as cleanly as mammoth, which leads to lower LLM extraction quality. |

