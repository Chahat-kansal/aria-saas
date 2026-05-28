export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888'

// Counter-tablet entry: owner pastes /kiosk-tablet/{id}?key={tablet_api_key} onto the
// shop tablet once. The key is validated and a 30-day session cookie is set. This URL
// is NEVER printed on a QR — it's the always-on device.
export default function KioskTabletPage({ params, searchParams }: { params: { business_id: string }; searchParams: { key?: string } }) {
  const biz = params.business_id
  const key = searchParams?.key
  if (key) redirect(`/api/public/instore/session?biz=${encodeURIComponent(biz)}&key=${encodeURIComponent(key)}`)

  return (
    <div style={{ minHeight: '100vh', background: CREAM, color: INK, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: SURFACE, border: `1.5px solid ${INK}`, borderRadius: 22, padding: 32, boxShadow: '4px 4px 0 #0a0a0a' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Counter tablet setup</h1>
        <p style={{ fontSize: 15, color: INK_SOFT, lineHeight: 1.5, margin: 0 }}>
          This link needs the tablet key. Copy the full counter-tablet URL from your dashboard Share page (it ends with <code>?key=…</code>) and open it here once.
        </p>
      </div>
    </div>
  )
}
