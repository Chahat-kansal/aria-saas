import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Admin route protection — must be admin email
  if (pathname.startsWith('/admin')) {
    if (!user) return NextResponse.redirect(new URL('/login', request.url));
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
    if (!adminEmails.includes(user.email || '')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return response;
  }

  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/pos') ||
    pathname.startsWith('/visa') ||
    pathname.startsWith('/businesses') ||
    pathname.startsWith('/chat') ||
    pathname.startsWith('/settings');

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

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
    '/visa/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/chat/:path*',
    '/settings/:path*',
  ],
};