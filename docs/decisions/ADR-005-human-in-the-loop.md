# ADR-005: Human-in-the-Loop AI Decision Model and Audit Trails

## Status
Accepted

## Context
AI model evaluations, while powerful, are subject to errors, hallucinations, and bias. In HR tech and recruitment, automated, non-auditable candidate rejection or ranking systems present serious legal, ethical, and compliance risks. Recruiters must have the final authority over match scores and shortlisting, and any changes must be fully documented.

## Decision
We will enforce a strict **Human-in-the-Loop** model for all AI-assisted hiring recommendations. 

The AI is classified as an "assistant" rather than a "decision-maker":
1. The system will clearly badge all AI insights as `[AI-Generated]` and present them as suggestions.
2. Recruiters will have the ability to override any AI-generated score (e.g., changing a candidate's math score from `80` to `90` based on manual review).
3. If an override occurs, the system requires the recruiter to input a rationale string.
4. The system will write both the original AI score, the new overridden score, the reviewer identity, and the justification to an immutable `audit_logs` table.

## Alternatives Considered

### 1. Fully Automated AI Rejection / Shortlisting
* **Why rejected**: Black-box candidate screening without human review is highly susceptible to false negatives (e.g., rejecting an excellent candidate because their resume formatting confused the parser). It violates ethical hiring principles and leaves organizations open to regulatory scrutiny regarding algorithmic bias.

### 2. Recruiter Reviews Without Database Auditing
* **Why rejected**: If a recruiter overrides an AI score to favor a specific candidate, the lack of an audit trail makes it impossible for an organization's administrator to review hiring fairness or debug grading disputes.

## Consequences
* **Pros**:
  * Protects organizations against compliance and legal risks associated with automated decision-making.
  * Preserves human judgment for final hiring and shortlisting steps.
  * Complete transparency: candidates can never be silently filtered by an untraceable algorithm.
  * Audit logging allows for monitoring recruiter override frequency to retrain and fine-tune AI evaluation rubrics over time.
* **Cons**:
  * Introduces minor data overhead in the `audit_logs` table.
  * Adds UI complexity, requiring forms for score adjustments and justification inputs on candidate profile pages.
