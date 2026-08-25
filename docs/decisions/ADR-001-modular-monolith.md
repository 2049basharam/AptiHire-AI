# ADR-001: Modular Monolith Architecture

## Status
Accepted

## Context
AptiHire AI requires strict logical boundaries between its core service domains: Authentication, Multi-tenant Isolation, Job Management, Candidate Management, Technical Assessment, and AI Processing. We need to select a deployment and repository architecture that allows the product to scale while maintaining high developer velocity, ease of continuous deployment, and simple local testability.

## Decision
We will build AptiHire AI as a **Modular Monolith** within a single Next.js monorepo. 

All logical modules (e.g., job processing, candidate search, AI generation) will be organized into clean directories inside a unified codebase, sharing a single database instances and configuration files. Next.js App Router Route Handlers will serve as the API endpoints for these modules.

## Alternatives Considered

### 1. Microservices Architecture
* **Why rejected**: Creating standalone microservices (e.g., Auth service, AI service, Assessment service) would introduce significant overhead. It requires managing multiple service repositories, complex orchestration (Docker Compose, Kubernetes), cross-service API authentication, and distributed data consistency (e.g., Sagas). For our MVP portfolio target, this overhead slows down development and increases infrastructure costs without providing proportional scaling benefits.

### 2. Multi-repo Monolith
* **Why rejected**: Splitting the frontend (Vite/React) and backend (Express/NestJS) into separate repositories introduces configuration duplication and complex local setup requirements. Next.js provides server-side APIs out-of-the-box, rendering separate backend services redundant for initial MVP requirements.

## Consequences
* **Pros**:
  * Unified codebase for simple deployment (single deployment target on platforms like Vercel or Docker).
  * Fast local testing (unit, integration, and E2E Playwright tests run in a single environment).
  * Direct module function invocation without HTTP latency or network failure points.
  * Shared types across frontend and backend boundaries via TypeScript.
* **Cons**:
  * If one module experiences a high memory leak (e.g., heavy PDF parsing), it can impact the performance of other modules. (Mitigated by offloading heavy work to background workers in BullMQ).
  * Unchecked imports could lead to tight coupling. (Mitigated by enforcing code ownership rules and namespace separation).
