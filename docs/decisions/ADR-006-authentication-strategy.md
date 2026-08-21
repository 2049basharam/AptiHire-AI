# ADR-006: Authentication and Session Security Strategy

## Status
Accepted

## Context
TalentOS requires a secure, production-grade authentication and session management system. It must support user registration, secure login/logout, protected routes, and strict multi-tenant isolation. 

We need to decide:
1. The framework version (Next.js 15 vs LTS).
2. The authentication library/mechanism (Auth.js/NextAuth vs custom JWT session handling).
3. The session store and token claims design.
4. The password hashing implementation.
5. The CSRF mitigation strategy.

## Decision

We make the following technical decisions:

### 1. Framework Version: Next.js v15.1.11
* We select **Next.js v15.1.11** (current stable release of Next.js 15).
* **Rationale**: Next.js 15 features React 19 compatibility and shifts GET route handlers to be dynamic (uncached) by default. This is critical for a multi-tenant system to prevent accidental caching and leakage of recruiter/candidate session data across tenants.

### 2. Session Mechanism: Custom JWT Cookies via `jose` v5.x
* We will use the **`jose`** library (v5.x) to sign and verify JSON Web Tokens (JWT) stored in secure, `HttpOnly` cookies.
* **Edge Compatibility**: `jose` uses standard Web Cryptography APIs (e.g. `crypto.subtle`) rather than Node-specific native bindings, ensuring 100% compatibility with Next.js Edge Middleware runtimes.
* **Production JWT Signing Secret Requirements**:
  * Production JWT signing secrets must contain at least 256 bits of cryptographically secure random entropy (e.g., a 32-byte key).
  * **Secure Generation Method**: Generate the secret securely using Node's crypto library or OpenSSL:
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    # or
    openssl rand -hex 32
    ```
  * **Secret Management Policy**: Never print actual secrets into logs, commit histories, or documentation. Load secrets strictly via secure environment variables (`JWT_SECRET`).
* **Why not Auth.js/NextAuth**: Auth.js is complex to configure for dynamic multi-tenant context propagation. When a user has multiple memberships and switches their active organization on the fly, updating the session token with Auth.js callbacks is error-prone. Custom JWT cookies provide simple, direct, transparent control.

### 3. Database-driven Authorization & Minimal JWT Claims
* The session JWT payload will contain only the **`userId`** (and a unique session ID).
* It will **not** store organization IDs or roles.
* **Database Resolution**: Every protected API route handler and server operation will query the PostgreSQL database to resolve organization membership and roles.
* **Security boundary**: Next.js Middleware will handle early redirects (redirecting unauthenticated users to `/login`), but the database-driven queries are the primary security and tenant-isolation boundaries. This prevents stale token access (e.g. if a user is revoked from an organization, their access is blocked instantly, rather than waiting for a JWT to expire).

### 4. Password Hashing: Node's Native `crypto.scrypt`
* We will hash passwords using Node.js's native **`crypto.scrypt`** (packaged with a cryptographically secure 16-byte random salt and 64-byte key length).
* **Rationale**: Bypasses the need for third-party packages like `bcrypt` or `bcryptjs`. It avoids node-gyp C++ binary compilation failures during Windows installations (common with native `bcrypt`) while outperforming pure-JS implementations (like `bcryptjs`) by running Node's native C++ scrypt implementation.

### 5. CSRF Mitigation
* We set `SameSite=Lax` on the HttpOnly cookie to prevent the browser from attaching session cookies to cross-site requests.
* For all state-mutating API route handlers (POST, PUT, DELETE), we will enforce a strict header-validation middleware that matches the `Origin` or `Referer` headers against the host server name to block cross-origin request forgery.

## Alternatives Considered

### 1. NextAuth.js Credentials Provider
* **Why rejected**: NextAuth focuses heavily on OAuth providers. Setting up credentials authentication requires significant boilerplate and custom database adapters. It also abstracts session state in a way that makes database-driven multi-tenant checks more difficult to integrate cleanly.

### 2. `bcryptjs` pure-JS Hashing
* **Why rejected**: Requires a third-party dependency. Node's native `crypto.scrypt` is built-in, faster, and standard.

## Consequences
* **Pros**:
  * Zero third-party packages needed for password hashing.
  * Instant, database-backed access revocation (revoking a user's membership takes effect on their next query).
  * Highly secure cookies protected against XSS (`HttpOnly`) and CSRF (`SameSite=Lax` + Host/Origin matching).
  * 100% Edge-compatible middleware.
* **Cons**:
  * Slightly increased database query load since we query memberships on every protected operation. (Mitigated by Drizzle's lightweight query runner and adding an index on `memberships(user_id, organization_id)`).
