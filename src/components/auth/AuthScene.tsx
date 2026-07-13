'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { posthog } from '@/lib/posthog'
import TurnstileWidget from '@/components/security/TurnstileWidget'
import './auth-scene.css'

// SECURITY-P1 — login/signup/reset go straight from the browser to Supabase Auth; this guard call
// hits our own server first (rate limit + Turnstile-on-signup) before the real Supabase call is
// made. See src/app/api/auth/guard/route.ts for the full rationale and its limitations.
async function checkAuthGuard(action: 'login' | 'signup' | 'reset', turnstileToken?: string): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/guard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, turnstile_token: turnstileToken }),
    })
    if (res.ok) return null
    const d = await res.json().catch(() => ({}))
    return d.error ?? 'Too many attempts — please try again shortly.'
  } catch {
    // Network error reaching our own guard endpoint must never brick login/signup — fail open here
    // (the guard's own internal checks already fail appropriately; this is only the transport).
    return null
  }
}

// AUTH-BRAND-FIX — the approved unified auth scene as a real component. The visuals (scene switching,
// speech bubble, validation ticks, parallax) are presentation only; submission goes through the
// EXISTING Supabase auth calls + redirects, unchanged. Rendered by both /login and /signup with the
// right tab pre-selected (routes preserved for links/redirects).

type Scene = 'pos' | 'welcome' | 'eyes' | 'cheer'
const IMG: Record<Scene, string> = {
  pos: '/auth/auth-scene-pos.png',
  welcome: '/auth/auth-scene-welcome.png',
  eyes: '/auth/auth-scene-eyes.png',
  cheer: '/auth/auth-scene-cheer.png',
}
const SAY = {
  welcome: "Hi! I'm Aria 👋 Let's get you set up.",
  name: 'Nice to meet you! What should I call you?',
  email: "I'll send your verification link there.",
  pass: "Eyes closed — promise I'm not peeking! 🙈",
  ok: "Looking good — you're all set!",
  success: "You're in! Welcome to the team 🎉",
  back: 'Welcome back! 👋',
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AuthScene({ initialTab }: { initialTab: 'login' | 'signup' }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [signup, setSignup] = useState(initialTab === 'signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErr, setFieldErr] = useState<{ name?: string; email?: string; password?: string }>({})
  const [turnstileToken, setTurnstileToken] = useState('')

  const [scene, setScene] = useState<Scene>(initialTab === 'signup' ? 'welcome' : 'pos')
  const [speech, setSpeech] = useState(initialTab === 'signup' ? SAY.welcome : SAY.back)
  const [speechHide, setSpeechHide] = useState(false)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => { if (sayTimer.current) clearTimeout(sayTimer.current) }, [])

  function say(text: string) {
    setSpeechHide(true)
    if (sayTimer.current) clearTimeout(sayTimer.current)
    sayTimer.current = setTimeout(() => { setSpeech(text); setSpeechHide(false) }, 300)
  }
  function showScene(s: Scene, text?: string) {
    setScene(prev => (prev === s ? prev : s))
    if (text) say(text)
  }

  const nameValid = name.trim().length > 0
  const emailValid = EMAIL_RE.test(email.trim())
  const passwordValidStrong = password.length >= 8
  // signup gates on strong rules; login only needs both fields present (don't block legacy passwords).
  const ctaEnabled = signup ? (nameValid && emailValid && passwordValidStrong) : (email.trim().length > 0 && password.length > 0)

  // Focus handlers drive the scene (mockup parity).
  const onNameFocus = () => showScene('welcome', SAY.name)
  const onEmailFocus = () => showScene('welcome', SAY.email)
  const onPassFocus = () => showScene('eyes', SAY.pass)
  const onPassBlur = () => { if (signup) showScene('welcome') }

  // When the whole form becomes valid, nudge to the "looking good" scene.
  useEffect(() => {
    if (ctaEnabled && scene !== 'cheer' && signup) showScene('welcome', SAY.ok)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctaEnabled])

  function switchTab(toSignup: boolean) {
    setSignup(toSignup)
    setError(''); setFieldErr({})
    showScene(toSignup ? 'welcome' : 'pos', toSignup ? SAY.welcome : SAY.back)
  }

  // ── REAL auth (preserved exactly) ─────────────────────────────────────────
  async function handleGoogle() {
    if (!supabase) { setError('Configuration error — please contact support.'); return }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  async function handleLogin() {
    if (!supabase) { setError('Configuration error — please contact support.'); return }
    setLoading(true); setError('')
    const guardErr = await checkAuthGuard('login')
    if (guardErr) { setError(guardErr); setLoading(false); return }
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (authError) { setError(authError.message); setLoading(false); return }
    if (posthog.__loaded && authData.user?.id) {
      posthog.identify(authData.user.id, { email: authData.user.email })
    }
    showScene('cheer', SAY.success)
    const redirectTo = searchParams.get('redirectTo') || '/dashboard'
    router.push(redirectTo)
    router.refresh()
  }

  async function handleSignup() {
    if (!supabase) { setError('Configuration error — please contact support.'); return }
    const errs: { name?: string; email?: string; password?: string } = {}
    if (!nameValid) errs.name = 'Please enter your full name'
    if (!emailValid) errs.email = 'Enter a valid email address'
    if (!passwordValidStrong) errs.password = 'Password must be at least 8 characters'
    setFieldErr(errs)
    if (Object.keys(errs).length > 0) { setError(''); return }
    setLoading(true); setError('')
    const guardErr = await checkAuthGuard('signup', turnstileToken)
    if (guardErr) { setError(guardErr); setLoading(false); return }
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? location.origin}/auth/callback`,
        },
      })
      if (err) { setError(err.message); return }
      showScene('cheer', SAY.success)
      if (!data.session) {
        router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`)
      } else {
        router.push('/onboarding')
      }
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (signup) handleSignup(); else handleLogin()
  }

  function onMouseMove(e: React.MouseEvent) {
    const r = stageRef.current?.querySelector('.left')?.getBoundingClientRect()
    if (!r) return
    const dx = (e.clientX - r.left) / r.width - 0.5
    const dy = (e.clientY - r.top) / r.height - 0.5
    setParallax({ x: dx * -10, y: dy * -8 })
  }

  const ctaLabel = loading
    ? (signup ? 'Creating account…' : 'Signing in…')
    : (signup ? 'Create account' : 'Sign in')

  return (
    <div className="aria-auth">
      <div className="stage" ref={stageRef} onMouseMove={onMouseMove}>
        {/* LEFT — cafe scene */}
        <div className="left">
          <div className="scene-layer" style={{ transform: `translate(${parallax.x}px, ${parallax.y}px)` }}>
            {(Object.keys(IMG) as Scene[]).map(s => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s} className={`scene scene-zoom${scene === s ? ' on' : ''}`} src={IMG[s]} alt="" />
            ))}
          </div>
          <div className="scene-overlay" />
          <div className="brand"><div className="brand-mark" /><div className="brand-name">aria<b>OS</b></div></div>
          <div className="tagline"><h2>Your business has a <span className="a">second brain</span> now.</h2></div>
          <div className={`speech${speechHide ? ' hide' : ''}`}>{speech}</div>
        </div>

        {/* RIGHT — form */}
        <div className="right">
          <div className="tabs">
            <button type="button" className={`tab${!signup ? ' active' : ''}`} onClick={() => switchTab(false)}>Sign in</button>
            <button type="button" className={`tab${signup ? ' active' : ''}`} onClick={() => switchTab(true)}>Start free trial</button>
          </div>
          <div className="ftitle">{signup ? 'Start your free trial' : 'Welcome back'}</div>
          <div className="fsub">{signup ? '14 days free · No credit card required' : 'Sign in to your dashboard'}</div>

          <button type="button" className="gbtn" onClick={handleGoogle}><span className="gi" /> Continue with Google</button>
          <div className="dv">{signup ? 'or sign up with email' : 'or continue with email'}</div>

          <form onSubmit={onSubmit}>
            {signup && (
              <div className="field">
                <label className="fl">Full name</label>
                <div className="fw">
                  <input
                    className={`fin${name.length === 0 ? '' : nameValid ? ' valid' : ' error'}`}
                    placeholder="Jane Smith" autoComplete="name" value={name}
                    onFocus={onNameFocus}
                    onChange={e => { setName(e.target.value); if (fieldErr.name) setFieldErr(p => ({ ...p, name: undefined })) }}
                  />
                  <span className={`fic${name.length === 0 ? '' : nameValid ? ' show ok' : ' show err'}`}>{nameValid ? '✓' : '✕'}</span>
                </div>
                {fieldErr.name && <div className="fhint show">{fieldErr.name}</div>}
              </div>
            )}

            <div className="field">
              <label className="fl">Email</label>
              <div className="fw">
                <input
                  type="email" className={`fin${email.length === 0 ? '' : emailValid ? ' valid' : ' error'}`}
                  placeholder="you@example.com" autoComplete="email" value={email}
                  onFocus={onEmailFocus}
                  onChange={e => { setEmail(e.target.value); if (fieldErr.email) setFieldErr(p => ({ ...p, email: undefined })) }}
                />
                <span className={`fic${email.length === 0 ? '' : emailValid ? ' show ok' : ' show err'}`}>{emailValid ? '✓' : '✕'}</span>
              </div>
              {fieldErr.email && <div className="fhint show">{fieldErr.email}</div>}
            </div>

            <div className="field">
              <label className="fl">Password</label>
              <div className="fw">
                <input
                  type="password" className={`fin${password.length === 0 ? '' : (signup ? passwordValidStrong : true) ? ' valid' : ' error'}`}
                  placeholder={signup ? 'Min 8 characters' : '••••••••'} autoComplete={signup ? 'new-password' : 'current-password'} value={password}
                  onFocus={onPassFocus} onBlur={onPassBlur}
                  onChange={e => { setPassword(e.target.value); if (fieldErr.password) setFieldErr(p => ({ ...p, password: undefined })) }}
                />
                <span className={`fic${password.length === 0 ? '' : (signup ? (passwordValidStrong ? ' show ok' : ' show err') : ' show ok')}`}>{signup && !passwordValidStrong ? '✕' : '✓'}</span>
              </div>
              {signup && <div className={`fhint${(!passwordValidStrong && password.length > 0) || fieldErr.password ? ' show' : ''}`}>{fieldErr.password ?? 'Must be at least 8 characters'}</div>}
            </div>

            {error && <div className="errbox">{error}</div>}

            {signup && <TurnstileWidget onToken={setTurnstileToken} />}

            <button type="submit" className="cta" disabled={loading || !ctaEnabled}>{ctaLabel}</button>
          </form>

          {!signup && (
            <div className="foot"><a onClick={() => router.push('/forgot-password')}>Forgot password?</a></div>
          )}
          <div className="foot">
            {signup
              ? <>Already have an account? <a onClick={() => switchTab(false)}>Sign in</a></>
              : <>New here? <a onClick={() => switchTab(true)}>Start free trial</a></>}
          </div>
          <div className="staff">Staff member? <a href="/pos">Go to POS →</a></div>
        </div>
      </div>
    </div>
  )
}
