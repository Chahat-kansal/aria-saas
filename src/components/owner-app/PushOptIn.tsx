'use client'
import { useCallback, useEffect, useState } from 'react'
import { INK, SUBTEXT, BORDER, FONT_MONO } from '@/app/owner/theme'

// OWNER-APP PH-4 — the enable-notifications affordance. Deliberately NOT a raw browser permission
// prompt on load: the owner sees the VALUE and the promise ("only when a decision needs you")
// before the browser dialog appears, because a denied permission is expensive to recover — the
// browser will not re-ask, and the owner has to fix it in site settings by hand.

type PermState = 'unsupported' | 'default' | 'granted' | 'denied' | 'unavailable'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function PushOptIn({ businessId }: { businessId: string }) {
  const [perm, setPerm] = useState<PermState>('default')
  const [devices, setDevices] = useState(0)
  const [quietHours, setQuietHours] = useState('')
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
    if (!supported) { setPerm('unsupported'); setLoaded(true); return }
    try {
      const res = await fetch('/api/owner/push?business_id=' + businessId)
      if (res.ok) {
        const j = await res.json()
        setDevices(j.devices ?? 0)
        setQuietHours(j.quiet_hours ?? '')
        setVapidKey(j.vapid_public_key ?? null)
        // VAPID not configured server-side → push genuinely can't work. Say so rather than
        // showing an Enable button that would fail in a confusing way.
        if (!j.vapid_public_key) { setPerm('unavailable'); setLoaded(true); return }
      }
      setPerm(Notification.permission as PermState)
    } catch { /* keep default */ }
    setLoaded(true)
  }, [businessId])

  useEffect(() => { load() }, [load])

  async function enable() {
    if (!vapidKey || busy) return
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      setPerm(permission as PermState)
      if (permission !== 'granted') return

      const reg = await navigator.serviceWorker.register('/owner-sw.js', { scope: '/owner/' })
      await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })

      const res = await fetch('/api/owner/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, subscription: sub.toJSON() }),
      })
      if (res.ok) setDevices(d => d + 1)
    } catch (e) {
      console.error('[PushOptIn] enable failed', e)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const res = await fetch('/api/owner/push', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      if (res.ok) setDevices(0)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null

  const box = { background: '#fff', border: '1px solid ' + BORDER, borderRadius: 12, padding: 16, marginTop: 20 } as const

  // Push unavailable (no VAPID configured, or browser can't do it) — the in-app Today badge is
  // still the owner's path to a waiting decision, so this degrades gracefully instead of alarming.
  if (perm === 'unsupported' || perm === 'unavailable') {
    return (
      <div style={box}>
        <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>Notifications aren&apos;t available here</div>
        <div style={{ fontSize: 13, color: SUBTEXT, marginTop: 4, lineHeight: 1.5 }}>
          {perm === 'unsupported'
            ? 'This browser can\'t do push. Waiting decisions still show on Today.'
            : 'Push isn\'t switched on for this workspace yet. Waiting decisions still show on Today.'}
        </div>
      </div>
    )
  }

  // Permission denied — the browser won't re-ask, so tell the owner exactly how to undo it rather
  // than failing silently or re-prompting into a wall.
  if (perm === 'denied') {
    return (
      <div style={box}>
        <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>Notifications are blocked</div>
        <div style={{ fontSize: 13, color: SUBTEXT, marginTop: 4, lineHeight: 1.5 }}>
          Your browser is blocking them. Open the padlock (or site settings) next to the address bar,
          set Notifications to Allow, then reload this page.
        </div>
      </div>
    )
  }

  if (devices > 0) {
    return (
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>
              Notifications on · {devices} device{devices === 1 ? '' : 's'}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: SUBTEXT, marginTop: 4, letterSpacing: '0.02em' }}>
              ONE BUZZ PER DECISION · QUIET {quietHours.toUpperCase()}
            </div>
          </div>
          <button onClick={disable} disabled={busy}
            style={{ flexShrink: 0, padding: '10px 16px', borderRadius: 999, border: '1px solid ' + BORDER, background: '#fff', color: INK, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            Turn off
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={box}>
      <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>Get buzzed when a decision needs you</div>
      <div style={{ fontSize: 13, color: SUBTEXT, marginTop: 4, lineHeight: 1.5 }}>
        One notification per decision — never one per event. Nothing for routine sales or job steps.
        {quietHours ? ' Quiet ' + quietHours + '.' : ''}
      </div>
      <button onClick={enable} disabled={busy}
        style={{ marginTop: 12, width: '100%', padding: '13px 0', borderRadius: 999, border: 'none', background: INK, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Setting up…' : 'Turn on notifications'}
      </button>
    </div>
  )
}
