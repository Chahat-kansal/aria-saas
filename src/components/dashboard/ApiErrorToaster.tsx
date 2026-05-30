'use client'
import { useEffect, useState } from 'react'
import { API_ERROR_EVENT } from '@/lib/api/client'

interface Item { id: number; message: string }

// Listens for global 'api-error' events emitted by apiFetch and surfaces them as
// dismissible toasts, so a failed dashboard request never silently shows an empty
// state. Mounted once in the dashboard layout.
export default function ApiErrorToaster() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    function addToast(message: string) {
      const id = Date.now() + Math.random()
      setItems(prev => [...prev.slice(-3), { id, message }])
      setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 6000)
    }

    function onApiError(e: Event) {
      const detail = (e as CustomEvent).detail as { message?: string } | undefined
      addToast(detail?.message ?? 'Something went wrong — please try again.')
    }

    function onUnhandledRejection(e: PromiseRejectionEvent) {
      const r = e.reason
      // Only surface errors from internal API calls, not random third-party errors
      if (!r || typeof r !== 'object') return
      if ('url' in r && typeof (r as { url: unknown }).url === 'string') {
        const url = (r as { url: string }).url
        if (!url.startsWith('/')) return
        e.preventDefault()
        const msg = 'name' in r && (r as { name: unknown }).name === 'ApiError'
          ? (r as { message: string }).message
          : 'Request failed — please try again.'
        addToast(msg)
      }
    }

    window.addEventListener(API_ERROR_EVENT, onApiError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener(API_ERROR_EVENT, onApiError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(i => (
        <div key={i.id} role="alert" style={{
          background: 'var(--bg-base, #0E1611)', border: '1px solid rgba(239,68,68,0.3)',
          borderLeft: '3px solid #EF4444', borderRadius: 10, padding: '12px 16px', maxWidth: 340,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <span style={{ fontSize: 15, color: '#EF4444' }}>✕</span>
          <span style={{ fontSize: 13, color: 'var(--text-primary, #F5F3EC)', flex: 1, lineHeight: 1.4 }}>{i.message}</span>
          <button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary, #9ca3af)', cursor: 'pointer', fontSize: 16, padding: 0 }}
            aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  )
}
