# ADR-002: PostgreSQL + pgvector for Storage and Vector Match

## Status
Accepted

## Context
TalentOS requires a database that can handle highly relational data (multi-tenancy, memberships, job descriptions, applications, candidate scores) while also supporting high-speed semantic matching between job requirements and parsed candidate resumes. We need to select a primary database and vector storage system that ensures referential integrity, strong multi-tenant boundaries, and easy query building.

## Decision
We will use **PostgreSQL** as our primary database, equipped with the **`pgvector`** extension for storing and querying vector embeddings. 

We will access PostgreSQL via **Drizzle ORM** (v0.31.0+), leveraging Drizzle's native support for `pg_vector` types, custom operators, and helper functions (such as `cosineDistance` and `l2Distance`).

## Alternatives Considered

### 1. Separate Vector Database (e.g., Pinecone, Qdrant) + PostgreSQL
* **Why rejected**: Running a dedicated vector database in addition to our relational database creates a double-writing and synchronization problem. When a candidate deletes their profile, we would need a transaction system that deletes records in both PostgreSQL and Pinecone. If Pinecone is down, the databases drift. This introduces unnecessary complexity and latency compared to keeping all candidate data inside a single ACID-compliant database.

### 2. Prisma ORM (without pgvector native types)
* **Why rejected**: Prisma's native vector support has historically been limited, requiring developers to write raw SQL fragments for cosine distance calculation. Drizzle ORM provides a type-safe schema declaration for vector columns and helper functions out of the box, matching our modular monolith developer velocity target.

## Consequences
* **Pros**:
  * Single database instance simplifies hosting, backup recovery, and local Docker setup.
  * Atomic operations (ACID transactions) across both relational tables and vector embeddings.
  * Ability to combine semantic search with traditional SQL filters (e.g., "Find candidates matching this embedding AND residing in 'New York'").
  * High-performance indexing (HNSW) is supported directly in Drizzle schemas via the `pgvector` operators.
* **Cons**:
  * Under very high vector dimensions (>10M items), PostgreSQL's memory foot-print for HNSW indexes can impact standard transactional query caching. (Mitigated by indexing fields selectively and setting strict connection limits).
