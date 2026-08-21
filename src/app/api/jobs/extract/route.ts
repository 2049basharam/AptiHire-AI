import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { getAIProvider } from '@/lib/ai/provider';
import { z } from 'zod';

const extractInputSchema = z.object({
  description: z.string().min(1, "Job description cannot be empty"),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on extract job requirements request', reqId);
      return NextResponse.json(
        { error: { code: 'CSRF_ERROR', message: 'Forbidden. Cross-origin request blocked.' } },
        { status: 403 }
      );
    }

    // 2. Authenticate user
    try {
      await getCurrentUserId();
    } catch (authError: unknown) {
      const errMsg = authError instanceof Error ? authError.message : String(authError);
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: errMsg } },
        { status: 401 }
      );
    }

    // 3. Validate body
    const body = await request.json();
    const result = extractInputSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Job description cannot be empty.' } },
        { status: 400 } // 400 Bad Request
      );
    }

    const { description } = result.data;

    // 4. Resolve AI provider
    const aiProvider = getAIProvider();
    if (!aiProvider) {
      logger.warn('AI provider requested but is unavailable or unconfigured', reqId);
      return NextResponse.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'AI extraction is currently unavailable. You can enter requirements manually.' } },
        { status: 503 } // 503 Service Unavailable
      );
    }

    // 5. Extract requirements via provider
    try {
      const requirements = await aiProvider.extractJobRequirements(description);
      return NextResponse.json(requirements);
    } catch (extractError: unknown) {
      const err = extractError as Error;
      const isSchemaError = err.message && err.message.includes('Zod');
      if (isSchemaError) {
        logger.error('AI provider output failed schema validation', reqId, { error: err.message });
        return NextResponse.json(
          { error: { code: 'UNPROCESSABLE_ENTITY', message: 'AI model returned structurally unusable output.' } },
          { status: 422 } // 422 Unprocessable Entity
        );
      }
      
      logger.error('AI extraction API call failed', reqId, { error: err.message });
      return NextResponse.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'AI extraction is currently unavailable. You can enter requirements manually.' } },
        { status: 503 } // 503 Service Unavailable
      );
    }
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Unexpected error during requirements extraction', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 } // 500 Internal Server Error
    );
  }
}
