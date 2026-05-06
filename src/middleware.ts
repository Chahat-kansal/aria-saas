import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Forward the pathname to server components via a request header
  // (used by pos/layout.tsx to detect /pos/login without auth check)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-next-pathname', pathname);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ── Block dashboard/settings access for active POS employees ─────────────
  // Cashier or supervisor who logged in via POS PIN cannot reach the
  // owner dashboard. The cookie is set by POSShell when they log in.
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/settings')) {
    const posEmp = request.cookies.get('pos_emp');
    if (posEmp?.value && ['cashier', 'supervisor'].includes(posEmp.value)) {
      return NextResponse.redirect(new URL('/pos', request.url));
    }
  }

  // ── Supabase auth client ──────────────────────────────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // ── Admin route protection ────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (!user) return NextResponse.redirect(new URL('/login', request.url));
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
    if (!adminEmails.includes(user.email || '')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return response;
  }

  // ── Protected routes ──────────────────────────────────────────────────────
  // /pos/login is PUBLIC — it handles its own auth state detection
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/onboarding') ||
    (pathname.startsWith('/pos') && pathname !== '/pos/login') ||
    pathname.startsWith('/visa') ||
    pathname.startsWith('/businesses') ||
    pathname.startsWith('/chat') ||
    pathname.startsWith('/settings');

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // ── Authenticated users hitting auth pages → redirect away ───────────────
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password';

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/businesses', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/admin',
    '/dashboard/:path*',
    '/onboarding/:path*',
    '/businesses/:path*',
    '/businesses',
    '/pos/:path*',
    '/pos/login',
    '/visa/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/chat/:path*',
    '/settings/:path*',
  ],
};
