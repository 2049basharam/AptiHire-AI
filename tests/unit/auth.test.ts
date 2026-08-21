import { describe, it, expect, vi } from 'vitest';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../../src/lib/auth';
import { verifyCSRF } from '../../src/lib/csrf';

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

describe('Unit Tests: Authentication Utilities', () => {
  describe('Password Hashing (Node native crypto.scrypt)', () => {
    it('should hash a password and produce a formatted salt:hash string', async () => {
      const password = 'my-super-secret-password-123';
      const hash = await hashPassword(password);
      
      expect(hash).toContain(':');
      const parts = hash.split(':');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toHaveLength(32); // Hex salt
      expect(parts[1]).toHaveLength(128); // Hex scrypt derived key (64 bytes = 128 chars)
    });

    it('should verify correct password successfully', async () => {
      const password = 'my-super-secret-password-123';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should fail verification for incorrect password', async () => {
      const password = 'my-super-secret-password-123';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword('wrong-password', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Session Tokens (jose)', () => {
    it('should sign and verify minimal JWT tokens', async () => {
      const userId = 'user-uuid-123-abc';
      const token = await signToken({ userId });
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      const decoded = await verifyToken(token);
      expect(decoded.userId).toBe(userId);
    });

    it('should throw error for expired or invalid tokens', async () => {
      await expect(verifyToken('invalid.token.here')).rejects.toThrow();
    });
  });

  describe('CSRF Validation', () => {
    it('should allow mutating request when Origin matches Host', async () => {
      const mockHeaders = {
        get: (key: string) => {
          if (key === 'origin') return 'http://localhost:3000';
          if (key === 'host') return 'localhost:3000';
          return null;
        },
      };
      
      const { headers } = await import('next/headers');
      vi.mocked(headers).mockResolvedValue(mockHeaders as any);
      
      const isValid = await verifyCSRF();
      expect(isValid).toBe(true);
    });

    it('should reject mutating request when Origin host does not match Host', async () => {
      const mockHeaders = {
        get: (key: string) => {
          if (key === 'origin') return 'http://attacker-site.com';
          if (key === 'host') return 'localhost:3000';
          return null;
        },
      };
      
      const { headers } = await import('next/headers');
      vi.mocked(headers).mockResolvedValue(mockHeaders as any);
      
      const isValid = await verifyCSRF();
      expect(isValid).toBe(false);
    });

    it('should fallback to Referer if Origin is missing and check host match', async () => {
      const mockHeaders = {
        get: (key: string) => {
          if (key === 'origin') return null;
          if (key === 'referer') return 'http://localhost:3000/dashboard';
          if (key === 'host') return 'localhost:3000';
          return null;
        },
      };
      
      const { headers } = await import('next/headers');
      vi.mocked(headers).mockResolvedValue(mockHeaders as any);
      
      const isValid = await verifyCSRF();
      expect(isValid).toBe(true);
    });

    it('should reject mutating request when both Origin and Referer are missing', async () => {
      const mockHeaders = {
        get: (key: string) => null,
      };
      
      const { headers } = await import('next/headers');
      vi.mocked(headers).mockResolvedValue(mockHeaders as any);
      
      const isValid = await verifyCSRF();
      expect(isValid).toBe(false);
    });
  });
});
