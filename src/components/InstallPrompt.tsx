'use client'
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('aria_install_dismissed')) return
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    localStorage.setItem('aria_install_dismissed', '1')
    setShow(false)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') localStorage.setItem('aria_install_dismissed', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, background: '#1a2e20', border: '1px solid rgba(127,184,151,0.4)',
      borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center',
      gap: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxWidth: 380, width: 'calc(100% - 32px)',
    }}>
      <span style={{ fontSize: 26 }}>📱</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f4' }}>Install Aria OS as an app</div>
        <div style={{ fontSize: 12, color: '#7FB897', marginTop: 2 }}>Works offline · Fast · No browser chrome</div>
      </div>
      <button
        onClick={install}
        style={{ background: '#7FB897', color: '#0d1117', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Install
      </button>
      <button
        onClick={dismiss}
        style={{ background: 'transparent', color: '#6b7280', border: 'none', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
