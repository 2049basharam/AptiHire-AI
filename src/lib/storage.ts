import fs from 'fs';
import path from 'path';

export interface FileStorage {
  uploadFile(key: string, fileBuffer: Buffer, mimeType: string): Promise<void>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
}

/**
 * Local filesystem storage adapter for development and testing.
 * Stores files in a private directory outside of public web folders.
 */
export class LocalStorageAdapter implements FileStorage {
  private baseDir: string;

  constructor() {
    // Save files in the private 'storage/resumes/' folder in the repository root
    this.baseDir = path.join(process.cwd(), 'storage', 'resumes');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async uploadFile(key: string, fileBuffer: Buffer, _mimeType: string): Promise<void> {
    void _mimeType;
    this.ensureDirectoryExists();
    const filePath = path.join(this.baseDir, key);
    
    // Prevent path traversal attempts
    const relative = path.relative(this.baseDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Access denied: path traversal detected');
    }

    // Ensure parent directories exist for sub-keyed files
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, fileBuffer);
  }

  async downloadFile(key: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, key);
    const relative = path.relative(this.baseDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Access denied: path traversal detected');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error('File not found in storage');
    }

    return await fs.promises.readFile(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    const relative = path.relative(this.baseDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Access denied: path traversal detected');
    }

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

/**
 * Resolves the configured storage provider.
 */
export function getStorage(): FileStorage {
  // Currently, we default to the LocalStorageAdapter.
  // Can be easily updated to S3StorageAdapter in the future.
  return new LocalStorageAdapter();
}

/**
 * Validates untrusted file buffers using magic-byte headers.
 * Protects against MIME-type spoofing.
 */
export function validateFileBuffer(buffer: Buffer): { isValid: boolean; mimeType: string | null } {
  if (buffer.length < 4) {
    return { isValid: false, mimeType: null };
  }

  // Check PDF signature: 0x25 0x50 0x44 0x46 (%PDF)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { isValid: true, mimeType: 'application/pdf' };
  }

  // Check Zip/DOCX signature: 0x50 0x4b 0x03 0x04 (PK\x03\x04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return { isValid: true, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }

  return { isValid: false, mimeType: null };
}
