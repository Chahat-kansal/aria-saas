'use client'
import { INK, SUBTEXT, BORDER, FONT_MONO } from '@/app/owner/theme'

// OWNER-APP PH-1 — the Aria chat tab is PH-3 scope. Simple placeholder per the brief, not the
// full chat experience.
export default function OwnerAriaChatPage() {
  return (
    <div style={{ padding: '20px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: '#d9f54e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: INK }}>a</div>
        <div style={{ fontWeight: 700, fontSize: 26, color: INK }}>Aria</div>
      </div>
      <div style={{ fontSize: 14, color: SUBTEXT, marginTop: 4, lineHeight: 1.5 }}>
        Reading today&apos;s shift, your POS, 30 days of history and every decision you&apos;ve made.
      </div>
      <div style={{ marginTop: 40, textAlign: 'center', padding: 24, border: '1px dashed ' + BORDER, borderRadius: 12 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: SUBTEXT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Coming in PH-3</div>
        <div style={{ fontSize: 14, color: INK, marginTop: 8 }}>Chat with Aria directly from the phone lands in a later sprint.</div>
      </div>
    </div>
  )
}
