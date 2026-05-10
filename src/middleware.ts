import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Forward pathname for server components that need it (e.g. pos/layout.tsx)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-next-pathname', pathname)

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  // One shared factory — recreates response with refreshed cookies when needed
  function makeSupabase() {
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request: { headers: requestHeaders } })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )
  }

  // ── ADMIN ROUTES — require Supabase auth + admin email ──────────────────────
  if (pathname.startsWith('/admin')) {
    const { data: { user } } = await makeSupabase().auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',').map(e => e.trim()).filter(Boolean)
    if (adminEmails.length > 0 && !adminEmails.includes(user.email || '')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // ── PROTECTED ROUTES — require Supabase auth ────────────────────────────────
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/visa') ||
    pathname.startsWith('/businesses') ||
    pathname.startsWith('/chat') ||
    pathname.startsWith('/settings')

  if (isProtected) {
    // Block POS employees from the owner dashboard
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/settings')) {
      const posEmp = request.cookies.get('pos_emp')
      if (posEmp?.value && ['cashier', 'supervisor'].includes(posEmp.value)) {
        return NextResponse.redirect(new URL('/pos', request.url))
      }
    }

    const { data: { user } } = await makeSupabase().auth.getUser()
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return response
  }

  // ── AUTH PAGES — redirect already-logged-in owners away ─────────────────────
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/auth')

  if (isAuthPage) {
    const { data: { user } } = await makeSupabase().auth.getUser()
    if (user) {
      const redirectTo = request.nextUrl.searchParams.get('redirectTo') || '/dashboard'
      return NextResponse.redirect(new URL(redirectTo, request.url))
    }
    return response
  }

  // ── ROOT — authenticated owners → POS; unauthenticated → landing page ───────
  if (pathname === '/') {
    const { data: { user } } = await makeSupabase().auth.getUser()
    if (user) {
      return NextResponse.redirect(new URL('/pos/terminal', request.url))
    }
    // Unauthenticated: serve the marketing landing page — no redirect
    return response
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/auth/:path*',
    '/admin/:path*',
    '/admin',
    '/dashboard/:path*',
    '/onboarding/:path*',
    '/businesses/:path*',
    '/businesses',
    '/visa/:path*',
    '/chat/:path*',
    '/settings/:path*',
    // NOTE: /pos is deliberately NOT here — POSAuthGate handles staff auth client-side
  ],
}
