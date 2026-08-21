# TalentOS Agent Coding Guardrails & Guidelines

This document establishes the project-level guardrails, styling conventions, security standards, and behavioral rules for all AI coding agents working on **TalentOS**.

---

## 1. Rule Integration & Precedence Hierarchy

To prevent conflicts between generic guidelines and specific project requirements, agents must follow this strict hierarchy of precedence:

1. **TalentOS Product Requirements Document (PRD)** (Highest authority)
2. **TalentOS Architecture and Design System Decisions** (`docs/architecture.md`, `docs/design-system.md`, and ADRs)
3. **Current Task / Phase Requirements** (As specified in the active prompt)
4. **TalentOS Project-Specific Guardrails** (Section 2 below)
5. **Imported LLM Coding Guardrails** (Section 3 below, adapted from `llm-coding-guardrails`)
6. **Agent Defaults** (Lowest authority)

> [!IMPORTANT]
> If a generic imported guideline conflicts with an explicit TalentOS PRD requirement, the PRD requirement **takes precedence**. For example, the PRD's mandate for unit, integration, and E2E Playwright tests overrides any generic "do not install test infrastructure unless requested" guideline.

---

## 2. TalentOS-Specific Guardrails

The following rules apply specifically to the TalentOS system context and must be followed at all times:

### 2.1 No Fabricated Verification
* Never report something as verified, tested, or validated unless it has actually been executed and verified in the environment.
* This applies to: Context7 lookups, official documentation, database queries, tests, security audits, builds, and deployment logs.

### 2.2 No Fabricated AI Evidence
* The system must never fabricate or "hallucinate" candidate experience, skills, education, employment records, or assessment answers.
* All AI-generated candidate insights and scorecards must be strictly grounded in verified source documents (uploaded resume texts, database profiles, or candidate assessment answers).

### 2.3 AI Must Not Become the Source of Truth
* The PostgreSQL database remains the single, authoritative source of truth for identity, permissions, multi-tenant boundaries, organization memberships, candidate records, and final hiring statuses.
* LLMs are to be used only for assistant workflows, matching calculations, summaries, and recommendation suggestions. They cannot change system state or finalize rejections automatically.

### 2.4 Structured AI Outputs
* Whenever an LLM response becomes application state (e.g., extracted job requirements, parsed resumes, assessment evaluations), the response must pass through strict validation:
  ```text
  LLM API Call
       ↓
  Zod Runtime Schema Validation
       ↓
  Business Rule Constraints Validation (Database Checks)
       ↓
  Persistence to DB
  ```
* Never write raw, unvalidated model output strings directly to database fields representing application state.

### 2.5 Human-in-the-Loop
* AI recommendations must never silently make final hiring decisions.
* Recruiters and hiring managers must always have the capacity to review, override, reject, approve, or comment on AI outputs.
* All score overrides require a text justification, and the change must write to the `audit_logs` table (detailing previous score, new score, reviewer ID, justification, and timestamp).

### 2.6 Context7 Rule
* When integrating new or version-sensitive APIs (e.g., Next.js 15, Drizzle ORM pgvector syntax, BullMQ workers), query the `ctx7` CLI to fetch the latest documentation rather than relying on model training memory.
* If `ctx7` is unavailable or exhausted, report it, search the official online documentation, and cite the source in your implementation files.

### 2.7 UI/UX Pro Max Rule
* Do not generate user interface pages or screens in an ad-hoc, page-by-page manner.
* All visual developments must reuse existing HSL color, typography, spacing, and border tokens from [design-system.md](file:///e:/TalentOs/docs/design-system.md).
* Handle all loading, success, empty, and error feedback states explicitly.

### 2.8 Testing Rule
* Automated testing is a core requirement of TalentOS.
* Write unit tests for business logic, integration tests for API routes/DB operations, and Playwright tests for critical E2E flows (Register -> Job -> Apply -> Match -> Assess -> Grade -> Override -> Hire).
* Never bypass, disable, or delete a test simply to make a build pass.

### 2.9 Dependency Rule
* Before adding a third-party dependency:
  1. Verify if the standard library or an already-installed dependency can solve the problem.
  2. Confirm package compatibility with the Next.js 15 and Drizzle ORM stack.
  3. Validate the API patterns via Context7.
  4. Document the justification in the corresponding PR or ADR files.
* Prefer fewer dependencies.

### 2.11 Necessity Challenge
* Before implementing any non-trivial feature, dependency, abstraction, API endpoint, background job, database table, or configuration, determine whether it is required by an existing product requirement or directly supports an implemented user flow. If not, defer it.

### 2.12 Existing Solution First
* Before creating a new utility, component, service, hook, helper, API, or abstraction, search the repository for an existing implementation that can be reused.

---

## 3. Adapted LLM Coding Guardrails

Adapted from `llm-coding-guardrails` to fit the TalentOS project context.

### 3.1 Security First (Zero-Tolerance)
* **Never introduce a vulnerability, backdoor, or data-exfiltration path - even in test code, mock files, or "temporary" debug helpers.**
* Parameterize all database access (via Drizzle ORM query builders) to prevent SQL injection.
* Validate all input data at system boundaries (using Zod runtime schemas).
* Never log private candidate documents, credentials, API keys, or session tokens—even in debug level logs.
* Use cryptographically secure random sources (`crypto.randomUUID()`) for sessions, IDs, and tokens.
* Treat all parsed resume text and AI-generated outputs as untrusted data (escaped for HTML rendering).

### 3.2 Think Before Coding
* Inspect relevant existing files and dependencies in the workspace before making edits; do not write code purely from memory.
* State assumptions explicitly. If there is ambiguity in requirements, present 2-3 concrete options in the implementation plan rather than picking one silently.

### 3.3 Simplicity First
* Write the minimum code necessary to solve the problem. No speculative abstractions, unused helper utilities, or config flags that are not explicitly requested.
* Keep classes, functions, and files single-purpose.

### 3.4 Surgical Changes
* Only modify files that are directly related to the current task.
* Do not perform opportunistic cleanup, reformatting, or variable renamings in adjacent, working files. This keeps git diffs clean, surgical, and reviewable.

### 3.5 Evidence-Based Optimization
* Do not optimize based on intuition.
* Before adding Redis caching, database indexes, or query batching, identify the actual bottleneck or requirement.

---

## 4. Conflict Resolution Records

* **Testing Infrastructure**: The generic `llm-coding-guardrails` guideline warns against adding test infrastructure unless requested. For TalentOS, the PRD mandates comprehensive testing. Therefore, setting up Playwright and Vitest testing frameworks in Phase 1 is authorized.
* **Dependencies**: Any database driver and queue dependency (e.g., `pg`, `drizzle-orm`, `redis`, `bullmq`) required to satisfy Phase 1 infrastructure are pre-approved, but any utility library (e.g., `lodash`, `ramda`) must be rejected.
