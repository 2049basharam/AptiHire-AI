# ADR-011: Embedding Strategy

## Status
Approved

## Context
We need to generate vector representations of candidate profiles to support semantic matching in future phases. We must choose an embedding model, specify the vector dimensions, determine the index type, and define what content is embedded.

## Decision
We will use Google's `text-embedding-004` model with the native `pgvector` extension in PostgreSQL.

### Embedding Model Details
* **Model Selected**: `text-embedding-004` (stable, state-of-the-art retrieval performance, and native to the Google Gen AI SDK).
* **Dimensionality**: 768 dimensions (native configuration).
* **API Call**: Generated via `@google/genai` sdk client:
  ```typescript
  const response = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: [textToEmbed],
    config: {
      outputDimensionality: 768
    }
  });
  ```

### What is Embedded
Instead of embedding the entire raw resume (which contains substantial noise such as headers, contact info, references, and page numbers), we will generate a single vector representing the **Candidate's Semantic Summary**.
* **Payload Structure**: A concatenated text string of the parsed profile details:
  ```text
  Summary: [Extracted Summary]
  Skills: [Skill 1, Skill 2, ...]
  Experience: [Role 1 at Company A, Role 2 at Company B, ...]
  ```
This ensures high density of relevant skills and work history in the vector, resulting in optimal cosine similarity matches.

### DB Schema & pgvector Configuration
* Table: `candidate_embeddings`
* Column type: `vector('embedding', { dimensions: 768 })`
* Operator: Cosine Distance (`cosineDistance` helper in Drizzle, mapped to `<=>` in SQL).
* **Index**: HNSW (Hierarchical Navigable Small World) index configured on `vector_cosine_ops` to accelerate large-scale vector similarity lookups:
  ```typescript
  index('candidate_embedding_hnsw_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops'))
  ```

### Migration & Versioning
* We will record metadata columns on the embedding record:
  * `model`: `'text-embedding-004'`
  * `version`: `'1.0'`
  * `generatedAt`: `timestamp`
* This allows the system to identify stale embeddings and trigger background batch updates if the embedding model is upgraded in future phases.

## Consequences
* High-performance semantic similarity queries utilizing PostgreSQL indexes.
* Decoupled vector schema that supports seamless model migrations in later phases.
* Cost-effective token usage by embedding a targeted semantic summary instead of raw documents.
