export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import KioskClient from './KioskClient'

const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'

function ScanLanding() {
  return (
    <div style={{ minHeight: '100vh', background: CREAM, color: INK, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: SURFACE, border: `1.5px solid ${INK}`, borderRadius: 22, padding: 32, boxShadow: '4px 4px 0 #0a0a0a' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, border: `1.5px solid ${INK}`, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 30 }}>📷</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Scan the QR in-store</h1>
        <p style={{ fontSize: 15, color: INK_SOFT, lineHeight: 1.5, margin: 0 }}>
          Scan the Aria QR code at the counter to chat with us. Sessions last a few minutes — just re-scan any time you have another question.
        </p>
      </div>
    </div>
  )
}

export default function InStorePage({ params, searchParams }: { params: { business_id: string }; searchParams: { t?: string } }) {
  const biz = params.business_id
  const t = searchParams?.t
  // Token present → redeem it (sets cookie) and bounce back to the clean URL.
  if (t) redirect(`/api/public/instore/session?biz=${encodeURIComponent(biz)}&t=${encodeURIComponent(t)}`)

  const hasSession = cookies().get(`ariakiosk_${biz}`)
  if (!hasSession) return <ScanLanding />

  return <KioskClient />
}
