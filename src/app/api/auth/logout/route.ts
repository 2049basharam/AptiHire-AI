import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST() {
  const reqId = crypto.randomUUID();
  try {
    const response = NextResponse.json({ success: true });
    
    // Clear session cookie and mock organization state cookie
    response.cookies.delete('session');
    response.cookies.delete('org_created');

    logger.info('User logged out successfully', reqId);
    return response;
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Logout failed unexpectedly', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
