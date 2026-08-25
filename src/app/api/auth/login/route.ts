import { NextResponse } from 'next/server';
import { db, users, eq } from '@/db';
import { verifyPassword, signToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { checkRateLimit, buildRateLimit429Response, getClientIp } from '@/lib/ratelimit';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    // Rate limit check by IP
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit('AUTH', clientIp);
    if (!rateLimit.success) {
      logger.warn(`Rate limit exceeded for login attempt from IP: ${clientIp}`, reqId);
      return buildRateLimit429Response(rateLimit);
    }

    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { email, password } = result.data;
    
    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (!user) {
      return NextResponse.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
        { status: 401 }
      );
    }

    // Verify password hash
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
        { status: 401 }
      );
    }

    // Create session token containing only the userId
    const token = await signToken({ userId: user.id });

    // Set cookie
    const response = NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    response.cookies.set('session', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours in seconds
    });

    logger.info(`User logged in successfully: ${user.id}`, reqId);
    return response;
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Login failed unexpectedly', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
