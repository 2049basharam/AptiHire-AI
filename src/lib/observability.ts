import { NextResponse } from 'next/server';
import { logger } from './logger';

const VALID_REQUEST_ID_REGEX = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Resolves request correlation ID from request header or generates a crypto UUID.
 * Validates format (alphanumeric and hyphens, max 64 chars) to prevent header injection.
 */
export function resolveRequestId(request: Request): string {
  const incomingId = request.headers.get('x-request-id')?.trim();
  if (incomingId && VALID_REQUEST_ID_REGEX.test(incomingId)) {
    return incomingId;
  }
  return crypto.randomUUID();
}

export interface ObservabilityTracker {
  requestId: string;
  finish: (status: number, meta?: Record<string, unknown>) => void;
  withRequestId: (response: NextResponse) => NextResponse;
}

/**
 * Creates an execution latency and correlation tracker for API endpoints.
 */
export function createObservabilityTracker(request: Request, endpoint: string): ObservabilityTracker {
  const startTime = performance.now();
  const requestId = resolveRequestId(request);

  return {
    requestId,
    finish: (status: number, meta?: Record<string, unknown>) => {
      const durationMs = Math.round(performance.now() - startTime);
      const logMeta = {
        endpoint,
        status,
        durationMs,
        ...meta,
      };

      if (status >= 500) {
        logger.error(`API ${endpoint} failed with HTTP ${status}`, requestId, logMeta);
      } else if (durationMs > 200) {
        logger.warn(`API ${endpoint} slow request threshold exceeded (${durationMs}ms)`, requestId, logMeta);
      } else {
        logger.info(`API ${endpoint} completed with HTTP ${status}`, requestId, logMeta);
      }
    },
    withRequestId: (response: NextResponse) => {
      response.headers.set('X-Request-ID', requestId);
      return response;
    },
  };
}

/**
 * Helper to attach X-Request-ID header to a NextResponse.
 */
export function addRequestIdHeader(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-ID', requestId);
  return response;
}
