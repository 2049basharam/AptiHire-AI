import { headers } from 'next/headers';

/**
 * Validates that a state-changing request originated from the same host to prevent CSRF attacks.
 */
export async function verifyCSRF(): Promise<boolean> {
  // In Next.js 15, headers() is an async function
  const headersList = await headers();
  const origin = headersList.get('origin');
  const host = headersList.get('host');
  const referer = headersList.get('referer');

  // If both origin and referer are missing, reject the mutating request
  if (!origin && !referer) {
    return false;
  }

  // If origin is present, compare its host part with the Host header
  if (origin) {
    try {
      const originUrl = new URL(origin);
      // In development, host can contain port, which is correct to compare
      return originUrl.host === host;
    } catch {
      return false;
    }
  }

  // Fallback to checking the referer host
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return refererUrl.host === host;
    } catch {
      return false;
    }
  }

  return false;
}
