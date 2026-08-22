import { describe, it, expect } from 'vitest';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getActivity } from '@/app/api/activity/route';
import { GET as getAnalytics } from '@/app/api/analytics/dashboard/route';
import { GET as getNotifications } from '@/app/api/notifications/route';
import { GET as getTags } from '@/app/api/tags/route';

describe('Phase 4C Observability & Health Endpoint Integration Tests', () => {
  describe('GET /api/health', () => {
    it('should return HTTP 200 and healthy status when dependencies are available', async () => {
      const req = new Request('http://localhost/api/health', {
        headers: { 'x-request-id': 'health-check-req-123' },
      });
      const response = await getHealth(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Request-ID')).toBe('health-check-req-123');
      expect(json.status).toBe('healthy');
      expect(json.checks).toEqual({
        database: 'ok',
        redis: 'ok',
        queue: 'ok',
      });
      expect(json.timestamp).toBeDefined();

      // Verify no sensitive connection details or credentials are exposed
      const jsonStr = JSON.stringify(json);
      expect(jsonStr).not.toContain('postgres');
      expect(jsonStr).not.toContain('redis://');
      expect(jsonStr).not.toContain('password');
      expect(jsonStr).not.toContain('JWT_SECRET');
    });
  });

  describe('Phase 4B Endpoints Request Correlation & X-Request-ID Propagation', () => {
    it('should attach X-Request-ID header and return 401 when unauthorized', async () => {
      const req = new Request('http://localhost/api/activity', {
        headers: { 'x-request-id': 'unauth-req-999' },
      });
      const response = await getActivity(req);
      expect(response.status).toBe(401);
      expect(response.headers.get('X-Request-ID')).toBe('unauth-req-999');
    });

    it('should attach generated X-Request-ID when incoming header is absent', async () => {
      const req = new Request('http://localhost/api/analytics/dashboard');
      const response = await getAnalytics(req);
      const reqIdHeader = response.headers.get('X-Request-ID');
      expect(reqIdHeader).toBeDefined();
      expect(reqIdHeader).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should sanitize oversized X-Request-ID and substitute valid UUID', async () => {
      const req = new Request('http://localhost/api/notifications', {
        headers: { 'x-request-id': 'x'.repeat(100) },
      });
      const response = await getNotifications(req);
      const reqIdHeader = response.headers.get('X-Request-ID');
      expect(reqIdHeader).toBeDefined();
      expect(reqIdHeader).not.toBe('x'.repeat(100));
      expect(reqIdHeader).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should attach X-Request-ID on tag endpoints', async () => {
      const req = new Request('http://localhost/api/tags', {
        headers: { 'x-request-id': 'tags-req-555' },
      });
      const response = await getTags(req);
      expect(response.headers.get('X-Request-ID')).toBe('tags-req-555');
    });
  });
});
