'use client'
import { useState, useEffect, useCallback } from 'react'
import { Bell, BellOff, Loader2, AlertCircle } from 'lucide-react'
import { C, RADIUS } from './theme'

/**
 * Web Push opt-in toggle. Handles the dance:
 *   1. Check Notification.permission + serviceWorker support
 *   2. Register the SW (at /community-sw.js) if not already
 *   3. PushManager.subscribe() with the server's VAPID public key
 *   4. POST the subscription to /api/community/push/subscribe
 * Unsubscribing reverses steps 4 → 3.
 *
 * Gracefully degrades when push isn't configured server-side (503 from /subscribe GET).
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = typeof window !== 'undefined' ? window.atob(base64) : ''
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
  return out
}

export function PushOptIn() {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('unknown')
  const [enabled, setEnabled] = useState(false)
  const [serverReady, setServerReady] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check support + current subscription on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hasSW = 'serviceWorker' in navigator
    const hasPush = 'PushManager' in window
    const hasNotif = 'Notification' in window
    setSupported(hasSW && hasPush && hasNotif)
    if (hasNotif) setPermission(Notification.permission)
    if (!hasSW || !hasPush) return

    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/community-sw.js').catch(() => null)
        if (!reg) return
        const sub = await reg.pushManager.getSubscription()
        setEnabled(!!sub)
      } catch { /* ignore */ }
    })()

    // Probe server config
    fetch('/api/community/push/subscribe').then(r => setServerReady(r.ok)).catch(() => setServerReady(false))
  }, [])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      // Permission
      if (Notification.permission === 'default') {
        const p = await Notification.requestPermission()
        setPermission(p)
        if (p !== 'granted') throw new Error('Notifications need to be allowed in your browser to enable this.')
      } else if (Notification.permission !== 'granted') {
        throw new Error('Notifications are blocked for this site. Re-enable them in your browser settings, then try again.')
      }

      // Server VAPID public key
      const keyRes = await fetch('/api/community/push/subscribe')
      if (!keyRes.ok) {
        setServerReady(false)
        throw new Error('Push isn\'t available right now — try again later.')
      }
      const { public_key } = await keyRes.json() as { public_key: string }
      if (!public_key) throw new Error('Push isn\'t configured on the server.')

      // Service worker
      const reg = await navigator.serviceWorker.register('/community-sw.js', { scope: '/community/' })
      await navigator.serviceWorker.ready

      // Subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key) as unknown as BufferSource,
      })

      // Send to server
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/community/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, user_agent: navigator.userAgent }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Could not register for push.')
      }
      setEnabled(true)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/community-sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/community/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe().catch(() => null)
      }
      setEnabled(false)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [])

  // Don't render the panel if push is genuinely unavailable on this device
  if (!supported || serverReady === false) {
    return null
  }

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: RADIUS.lg,
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: enabled ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.04)',
          color: enabled ? C.accent : C.textMuted,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, border: `1px solid ${enabled ? C.accent + '55' : C.border}`,
        }}>
          {enabled ? <Bell size={16} /> : <BellOff size={16} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: C.text }}>
            Push notifications
          </p>
          <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0', lineHeight: 1.5 }}>
            Get a notification on this device when a shop you follow posts. Per-shop and per-device — you stay anonymous.
          </p>
          {permission === 'denied' && (
            <p style={{ fontSize: 11, color: C.warning, margin: '8px 0 0', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <AlertCircle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
              Notifications are blocked. Re-enable in your browser settings.
            </p>
          )}
          {error && (
            <p style={{ fontSize: 11, color: C.danger, margin: '8px 0 0', lineHeight: 1.4 }}>{error}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Push notifications"
          disabled={busy || permission === 'denied'}
          onClick={() => (enabled ? disable() : enable())}
          style={{
            position: 'relative', width: 44, height: 26, borderRadius: 26,
            background: enabled ? C.accent : 'rgba(255,255,255,0.12)',
            border: 'none', cursor: busy || permission === 'denied' ? 'default' : 'pointer',
            transition: 'background 180ms',
            flexShrink: 0, opacity: permission === 'denied' ? 0.5 : 1,
            alignSelf: 'center',
          }}>
          <span style={{
            position: 'absolute', top: 3, left: enabled ? 21 : 3,
            width: 20, height: 20, borderRadius: '50%',
            background: '#fff', transition: 'left 180ms',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {busy && <Loader2 size={11} style={{ color: C.accent, animation: 'community-spin 1s linear infinite' }} />}
          </span>
        </button>
      </div>
    </div>
  )
}
