# ADR-008: Resume Storage

## Status
Approved

## Context
Candidates upload confidential PDF or DOCX resumes. We need to store these files securely, ensuring that they are not accessible publicly, remain strictly tenant-isolated, and utilize a provider-agnostic storage abstraction.

## Decision
We will define a generic `FileStorage` interface to decouple storage implementations:

```typescript
export interface FileStorage {
  uploadFile(key: string, fileBuffer: Buffer, mimeType: string): Promise<void>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
}
```

### Implementations
1. **`LocalStorageAdapter` (for development & testing)**: Stores files in the private local directory `storage/resumes/` within the repository root. This directory will be added to `.gitignore`.
2. **`S3StorageAdapter` (for production)**: Integrates with AWS S3 or compatible object storage.

### Security Controls
* **Sanitized Object Naming**: We will NEVER use user-provided filenames for storage paths. The file key will be generated dynamically using a cryptographically secure UUID (`crypto.randomUUID()`) plus file extension.
* **Strict Private Access**: The storage bucket/local directory is strictly private. Files are never exposed via public URLs.
* **Authenticated Proxy Downloads**: To download or view a resume, recruiters must request the authenticated route `GET /api/candidates/[id]/documents/[docId]/download`. The route handler decodes the session, verifies organization membership, enforces tenant scoping, and pipes the file stream directly from the storage adapter to the response.
* **File Validation Boundary**: Before storage, we enforce:
  * Maximum size limit: 5MB.
  * MIME type whitelist: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX).
  * Magic-byte signature checking to prevent extension spoofing.

## Consequences
* High testability using local storage during automated E2E test runs.
* Protects candidate personal information by avoiding public bucket exposure.
* Decouples the application code from cloud-provider APIs.
