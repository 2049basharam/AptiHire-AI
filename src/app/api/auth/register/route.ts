import { NextResponse } from 'next/server';
import { db, users, eq } from '@/db';
import { hashPassword } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response, getClientIp } from '@/lib/ratelimit';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    // Rate limit check by IP
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit('AUTH', clientIp);
    if (!rateLimit.success) {
      logger.warn(`Rate limit exceeded for registration attempt from IP: ${clientIp}`, reqId);
      return buildRateLimit429Response(rateLimit);
    }

    const body = await request.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { email, name, password } = result.data;
    
    // Check if email already registered
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existingUser) {
      return NextResponse.json(
        { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email address is already registered.' } },
        { status: 409 }
      );
    }

    // Hash password and persist
    const passwordHash = await hashPassword(password);
    const [newUser] = await db.insert(users).values({
      email: email.toLowerCase(),
      name,
      passwordHash,
    }).returning({
      id: users.id,
      email: users.email,
      name: users.name,
    });

    logger.info(`User registered successfully: ${newUser.id}`, reqId);
    return NextResponse.json(newUser, { status: 201 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Registration failed unexpectedly', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
