# ADR-004: Centralized AI Provider Abstraction

## Status
Accepted

## Context
AptiHire AI relies heavily on LLM capabilities for structured data extraction, text embedding generation, assessment item generation, and answer rubric evaluation. Integrating a specific provider's SDK (e.g., raw OpenAI SDK or Google Gemini SDK) directly into multiple parts of our application codebase risks vendor lock-in. If pricing structures change, models deprecate, or rate limits are hit, swapping providers would require modifying dozens of files.

## Decision
We will build a centralized **AI Provider Abstraction Layer** inside a dedicated module (`src/services/ai/`). 

All LLM and embedding calls will flow through a unified `AIProvider` interface. Individual concrete classes (e.g., `OpenAIAdapter`, `GeminiAdapter`, `MockAIAdapter` for unit tests) will implement this interface.

```typescript
export interface AIProvider {
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
  generateStructured<T>(prompt: string, schema: z.Schema<T>, systemPrompt?: string): Promise<T>;
  embed(text: string): Promise<number[]>;
}
```

We will configure the active provider via environment variables (`AI_PROVIDER=openai` or `AI_PROVIDER=gemini`).

## Alternatives Considered

### 1. Direct Model Client Invocations
* **Why rejected**: Directly calling `openai.chat.completions.create` in Route Handlers makes unit testing difficult (requiring complex HTTP mocking) and creates a hard dependency on OpenAI's specific response schemas and error codes.

### 2. LangChain / LlamaIndex
* **Why rejected**: These frameworks are highly complex, add significant bundle size, and frequently release breaking changes. Writing a simple, custom TypeScript interface takes fewer than 100 lines of code, offers full type safety, and avoids third-party abstraction bloat.

## Consequences
* **Pros**:
  * Easy switching between LLM providers (e.g., using Gemini for embeddings and OpenAI for structured generation).
  * Out-of-the-box local testing capabilities using a `MockAIAdapter` that returns deterministic fixtures without spending API tokens.
  * Centralized monitoring of AI latencies, token usage, and API errors.
  * Uniform rate-limiting and exponential backoff retry strategies implemented in one place.
* **Cons**:
  * Advanced, provider-specific features (like custom tool-use hooks or multi-modal streaming APIs) may require updating the generic interface. (Mitigated by keeping the core interface minimal and focused on text and structured JSON payloads).
