import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as jose from 'jose';

// TextEncoder for decoding secret bytes in the Edge runtime
const JWT_SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET || 'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2'
);

const PROTECTED_ROUTES = ['/dashboard', '/onboarding'];
const AUTH_ROUTES = ['/login', '/register'];

/**
 * Next.js Edge Middleware for early redirect and routing boundary checks.
 * Note: Database membership/role verification happens inside endpoints, not here.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('session')?.value;

  let isAuthenticated = false;
  if (sessionCookie) {
    try {
      // Edge-compatible verification using jose
      await jose.jwtVerify(sessionCookie, JWT_SECRET_BYTES);
      isAuthenticated = true;
    } catch {
      // Token invalid or expired
      isAuthenticated = false;
    }
  }

  const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    // Remember target route to redirect back after login
    loginUrl.searchParams.set('redirectTo', pathname);
    
    // Clear invalid session cookie if present
    const response = NextResponse.redirect(loginUrl);
    if (sessionCookie) {
      response.cookies.delete('session');
    }
    return response;
  }

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, icons)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)',
  ],
};
