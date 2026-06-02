import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value)
  }
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/monitoring')) return NextResponse.next()

  // ── PUBLIC API ROUTES — rate limit by IP ──────────────────────────────────
  if (pathname.startsWith('/api/public/')) {
    const ip = request.headers.get('x-forwarded-for') ?? request.ip ?? 'anon'
    const rl = await checkRateLimit('public', ip)
    if (!rl.ok) {
      return applySecurityHeaders(NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      ))
    }
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-next-pathname', pathname)

  let response = NextResponse.next({ request: { headers: requestHeaders } })

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

  // ── ADMIN ROUTES ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    const { data: { user } } = await makeSupabase().auth.getUser()
    if (!user) return applySecurityHeaders(NextResponse.redirect(new URL('/login', request.url)))
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',').map(e => e.trim()).filter(Boolean)
    if (adminEmails.length > 0 && !adminEmails.includes(user.email || '')) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)))
    }
    return applySecurityHeaders(response)
  }

  // ── PROTECTED ROUTES — require auth ───────────────────────────────────────
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/visa') ||
    pathname.startsWith('/businesses') ||
    pathname.startsWith('/chat') ||
    pathname.startsWith('/settings')

  if (isProtected) {
    // Block POS employees from owner dashboard
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/settings')) {
      const posEmp = request.cookies.get('pos_emp')
      if (posEmp?.value && ['cashier', 'supervisor'].includes(posEmp.value)) {
        const { data: { user } } = await makeSupabase().auth.getUser()
        if (!user) {
          return applySecurityHeaders(NextResponse.redirect(new URL('/pos', request.url)))
        }
        const ownerCheck = await makeSupabase().from('businesses')
          .select('id').eq('user_id', user.id).limit(1).maybeSingle()
        if (!ownerCheck.data) {
          return applySecurityHeaders(NextResponse.redirect(new URL('/pos', request.url)))
        }
        response.cookies.delete('pos_emp')
      }
    }

    const { data: { user } } = await makeSupabase().auth.getUser()
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirectTo', pathname)
      return applySecurityHeaders(NextResponse.redirect(loginUrl))
    }

    // ── TRIAL / SUBSCRIPTION CHECK ─────────────────────────────────────────
    // Always allow: billing, settings, data export (owner must access their data)
    const ALWAYS_ALLOWED = [
      '/dashboard/billing',
      '/dashboard/settings',
      '/dashboard/export',
      '/api/business/export',
    ]
    const isAlwaysAllowed = ALWAYS_ALLOWED.some(p => pathname.startsWith(p))

    if (!isAlwaysAllowed && pathname.startsWith('/dashboard')) {
      const supabase = makeSupabase()
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (biz?.id) {
        const { data: sub } = await supabase
          .from('business_subscriptions')
          .select('status, trial_ends_at')
          .eq('business_id', biz.id)
          .maybeSingle()

        const now = new Date()
        const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null
        const trialExpired = sub?.status === 'trialing' && trialEnd && trialEnd < now
        const noSub = !sub || (sub.status !== 'active' && sub.status !== 'trialing')
        const isExpired = trialExpired || noSub

        // Days remaining in trial (for warning banner)
        const daysLeft = trialEnd && !trialExpired
          ? Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000)
          : null

        if (isExpired) {
          // Pass a header so the dashboard page renders a frozen/upgrade banner
          // instead of redirecting — owner keeps access to their data
          response.headers.set('x-trial-expired', '1')
          response.headers.set('x-subscription-status', sub?.status ?? 'none')
        } else if (daysLeft !== null && daysLeft <= 3) {
          // Pass warning header so dashboard shows 3-day countdown banner
          response.headers.set('x-trial-days-left', String(daysLeft))
        }
      }
    }

    return applySecurityHeaders(response)
  }

  // ── POS TERMINAL — block transactions when trial expired ──────────────────
  // /pos/terminal and /api/pos/sale are blocked on expired trial
  const isPOSTerminal = pathname === '/pos/terminal' || pathname.startsWith('/pos/terminal')
  const isPOSSaleAPI = pathname === '/api/pos/sale' || pathname.startsWith('/api/pos/sale')

  if (isPOSTerminal || isPOSSaleAPI) {
    const { data: { user } } = await makeSupabase().auth.getUser()
    if (user) {
      const supabase = makeSupabase()
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (biz?.id) {
        const { data: sub } = await supabase
          .from('business_subscriptions')
          .select('status, trial_ends_at')
          .eq('business_id', biz.id)
          .maybeSingle()

        const trialExpired = sub?.status === 'trialing' &&
          sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()
        const noSub = !sub || (sub.status !== 'active' && sub.status !== 'trialing')

        if (trialExpired || noSub) {
          if (isPOSSaleAPI) {
            return applySecurityHeaders(NextResponse.json(
              { error: 'Trial expired. Upgrade your plan to continue taking payments.', trial_expired: true },
              { status: 402 }
            ))
          }
          // POS terminal — redirect to billing
          return applySecurityHeaders(
            NextResponse.redirect(new URL('/billing?reason=trial_expired', request.url))
          )
        }
      }
    }
  }

  // ── AUTH PAGES — redirect logged-in owners away ───────────────────────────
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/auth')

  if (isAuthPage) {
    const { data: { user } } = await makeSupabase().auth.getUser()
    if (user) {
      const redirectTo = request.nextUrl.searchParams.get('redirectTo') || '/dashboard'
      return applySecurityHeaders(NextResponse.redirect(new URL(redirectTo, request.url)))
    }
    return applySecurityHeaders(response)
  }

  // ── ROOT ──────────────────────────────────────────────────────────────────
  if (pathname === '/') {
    const { data: { user } } = await makeSupabase().auth.getUser()
    if (user) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/pos/terminal', request.url)))
    }
    return applySecurityHeaders(response)
  }

  return applySecurityHeaders(response)
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
    '/api/public/:path*',
    '/pos/terminal',
    '/api/pos/sale',
  ],
}
