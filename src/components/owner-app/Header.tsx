'use client'
import { useEffect, useState } from 'react'
import { BG, INK, SUBTEXT, BORDER, FONT_MONO } from '@/app/owner/theme'

export function OwnerHeader({ businessName, suburb }: { businessName: string; suburb: string | null }) {
  // Computed post-mount only — avoids an SSR/client hydration mismatch on the clock value.
  const [synced, setSynced] = useState('')
  useEffect(() => {
    const d = new Date()
    setSynced(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'))
  }, [])
  const context = suburb ? businessName.toUpperCase() + ' · ' + suburb.toUpperCase() : businessName.toUpperCase()

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#d9f54e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: INK }}>a</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: INK, lineHeight: 1.1 }}>Aria</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: SUBTEXT, letterSpacing: '0.04em' }}>{context}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: BG, border: '1px solid ' + BORDER, borderRadius: 999, padding: '6px 12px', fontFamily: FONT_MONO, fontSize: 11, color: INK }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: INK, display: 'inline-block' }} />
        SYNCED {synced}
      </div>
    </div>
  )
}
