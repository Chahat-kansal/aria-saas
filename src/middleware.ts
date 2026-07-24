import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

  // CI-E2E-1 diagnostic (CI-RED-2) — proves in the server log whether
  // middleware executes at all for the routes the e2e failures centre on,
  // and whether the two client-exposed Supabase vars are actually present
  // at runtime. Boolean/length only, never a value — safe in shared logs.
  if (process.env.CI && (pathname === '/login' || pathname === '/dashboard' || pathname === '/pos/terminal' || pathname === '/')) {
    console.log('[middleware:diag]', pathname,
      'NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? `set(${process.env.NEXT_PUBLIC_SUPABASE_URL.length})` : 'MISSING',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? `set(${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length})` : 'MISSING',
    )
  }

  if (pathname.startsWith('/monitoring')) return NextResponse.next()

  // ── COMMUNITY CAFE-FIRST ENTRY — genuine HTTP redirect for a member linked to exactly one café ──
  // CX-CLARITY-1 fix: the page-level redirect() in community/page.tsx gets absorbed into the RSC
  // stream instead of surfacing as a real HTTP 307 on a fresh full-page load — confirmed live, a
  // plain GET returns 200 with the Discover feed while the RSC payload itself carries a NEXT_REDIRECT
  // marker (so an in-app/client-side nav still lands correctly, just not a fresh visit — QR code,
  // bookmark, marketing link). Doing the lookup here guarantees a true redirect for that case.
  // Isolated in its own try/catch (not the shared auth try below) — a failure here must never
  // block the page's own fallback rendering, only skip the fast-path redirect.
  if (pathname === '/community') {
    try {
      const token = request.cookies.get('aria_community_session')?.value
      if (token) {
        const { data: member } = await supabaseAdmin.from('community_members')
          .select('id').eq('session_token', token).maybeSingle()
        if (member) {
          const { data: links } = await supabaseAdmin.from('community_member_loyalty_links')
            .select('businesses(slug)').eq('member_id', (member as { id: string }).id)
          type LinkRow = { businesses: { slug: string | null } | null }
          const slugs = Array.from(new Set(
            ((links ?? []) as unknown as LinkRow[]).map(l => l.businesses?.slug).filter((s): s is string => !!s)
          ))
          if (slugs.length === 1) {
            return applySecurityHeaders(NextResponse.redirect(new URL(`/community/${slugs[0]}`, request.url), 307))
          }
        }
      }
    } catch (err) {
      console.error('[middleware] community cafe-first lookup failed — falling through to page render:', err)
    }
    return applySecurityHeaders(NextResponse.next())
  }

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

  // isProtected is used both by the main logic below AND the catch-all
  // failure fallback, so it's computed once, up front, outside the try.
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/visa') ||
    pathname.startsWith('/businesses') ||
    pathname.startsWith('/chat') ||
    pathname.startsWith('/settings')

  function makeSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('middleware: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not configured')
    return createServerClient(
      url,
      key,
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

  // Every branch below calls makeSupabase() (or checkRateLimit above, already
  // guarded). Middleware runs on nearly every route (see matcher) with no
  // Next.js error boundary of its own — an uncaught throw here previously
  // 500'd the ENTIRE site on every matched request (login included) instead
  // of degrading to "no session". Wrapping the whole auth-dependent block
  // means a missing/misconfigured Supabase env var or a transient outage
  // fails SAFE: protected routes redirect to /login exactly as they would
  // for a genuinely logged-out user, public/auth pages still render.
  try {
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
      const { data: activeBizRow } = await supabase
        .from('user_active_business')
        .select('business_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const selectedBizId: string | null = (activeBizRow as { business_id?: string } | null)?.business_id ?? null
      const { data: biz } = selectedBizId
        ? await supabase.from('businesses')
            .select('id, plan, subscription_status, trial_ends_at, plan_override_by, is_internal')
            .eq('id', selectedBizId)
            .eq('is_active', true)
            .maybeSingle()
        : await supabase.from('businesses')
            .select('id, plan, subscription_status, trial_ends_at, plan_override_by, is_internal')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()

      if (biz) {
        const now = new Date()
        const isInternal = !!(biz as { is_internal?: boolean | null }).is_internal
        const planOverridden = !!(biz as { plan_override_by?: string | null }).plan_override_by
        const status = (((biz as { subscription_status?: string | null }).subscription_status) ?? '').toLowerCase().trim()
        const isActive = status === 'active'
        const isTrialing = status === 'trial' || status === 'trialing'
        const rawTrialEnd = (biz as { trial_ends_at?: string | null }).trial_ends_at
        const trialEnd = rawTrialEnd ? new Date(rawTrialEnd) : null
        const trialExpired = isTrialing && !!trialEnd && trialEnd < now
        const isExpired = !isInternal && !planOverridden && !isActive && !(isTrialing && !trialExpired)

        const daysLeft = trialEnd && !trialExpired
          ? Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000)
          : null

        if (isExpired) {
          response.headers.set('x-trial-expired', '1')
          response.headers.set('x-subscription-status', status)
        } else if (daysLeft !== null && daysLeft <= 3) {
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
      const { data: activeBizRow } = await supabase
        .from('user_active_business')
        .select('business_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const selectedBizId: string | null = (activeBizRow as { business_id?: string } | null)?.business_id ?? null
      const { data: biz } = selectedBizId
        ? await supabase.from('businesses')
            .select('id, plan, subscription_status, trial_ends_at, plan_override_by, is_internal')
            .eq('id', selectedBizId)
            .eq('is_active', true)
            .maybeSingle()
        : await supabase.from('businesses')
            .select('id, plan, subscription_status, trial_ends_at, plan_override_by, is_internal')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()

      if (biz) {
        const now = new Date()
        const isInternal = !!(biz as { is_internal?: boolean | null }).is_internal
        const planOverridden = !!(biz as { plan_override_by?: string | null }).plan_override_by
        const status = (((biz as { subscription_status?: string | null }).subscription_status) ?? '').toLowerCase().trim()
        const isActive = status === 'active'
        const isTrialing = status === 'trial' || status === 'trialing'
        const rawTrialEnd = (biz as { trial_ends_at?: string | null }).trial_ends_at
        const trialEnd = rawTrialEnd ? new Date(rawTrialEnd) : null
        const trialExpired = isTrialing && !!trialEnd && trialEnd < now
        const isExpiredOrNoSub = !isInternal && !planOverridden && !isActive && !(isTrialing && !trialExpired)

        if (isExpiredOrNoSub) {
          if (isPOSSaleAPI) {
            return applySecurityHeaders(NextResponse.json(
              { error: 'Trial expired. Upgrade your plan to continue taking payments.', trial_expired: true },
              { status: 402 }
            ))
          }
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
      // Send authenticated users to dashboard — dashboard/page.tsx handles
      // the onboarding_complete check and redirects if needed.
      // Previously redirected to /pos/terminal which chained to /onboarding
      // via pos/layout.tsx when the business query returned empty.
      return applySecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)))
    }
    // Unauthenticated: serve the marketing landing page — no redirect
    return applySecurityHeaders(response)
  }

  return applySecurityHeaders(response)
  } catch (err) {
    // Fail safe, not hard — see the comment above the try. A misconfigured/
    // unreachable Supabase must never take the whole site down; treat it
    // the same as "no session" (protected routes -> /login, everything
    // else falls through unauthenticated) and log loudly so it's obvious
    // in server logs rather than silently swallowed.
    console.error('[middleware] auth check failed — failing safe:', err)
    if (pathname.startsWith('/admin') || isProtected) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirectTo', pathname)
      return applySecurityHeaders(NextResponse.redirect(loginUrl))
    }
    return applySecurityHeaders(response)
  }
}

export const config = {
  matcher: [
    '/',
    '/community',
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
