'use client'
import { useEffect, useRef, useId } from 'react'

// SECURITY-P1 — Cloudflare Turnstile widget. Renders nothing (and never blocks the form) when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set, matching the server-side fail-open-when-unconfigured
// behavior in src/lib/security/turnstile.ts. onToken fires with the verification token once solved;
// callers pass that token as `turnstile_token` in their submit payload.

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, opts: {
        sitekey: string
        callback: (token: string) => void
        'expired-callback'?: () => void
        'error-callback'?: () => void
        theme?: 'light' | 'dark' | 'auto'
      }) => string
      remove: (widgetId: string) => void
    }
  }
}

let scriptLoadPromise: Promise<void> | null = null
function loadTurnstileScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.turnstile) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Turnstile script'))
    document.head.appendChild(script)
  })
  return scriptLoadPromise
}

export default function TurnstileWidget({ onToken, theme = 'auto' }: { onToken: (token: string) => void; theme?: 'light' | 'dark' | 'auto' }) {
  const containerId = useId().replace(/:/g, '-')
  const widgetIdRef = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    loadTurnstileScript().then(() => {
      if (cancelled || !window.turnstile) return
      widgetIdRef.current = window.turnstile.render('#' + containerId, {
        sitekey: siteKey,
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
        theme,
      })
    }).catch(e => console.error('[turnstile-widget]', e))
    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* widget already gone */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, containerId])

  if (!siteKey) return null
  return <div id={containerId} />
}
