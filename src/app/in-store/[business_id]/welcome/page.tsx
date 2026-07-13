export const dynamic = 'force-dynamic'

import { hasValidKioskSession } from '@/lib/kiosk/cookie'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'

const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`

export default async function WelcomePage({ params, searchParams }: { params: { business_id: string }; searchParams: { t?: string } }) {
  const biz = params.business_id
  const t = searchParams?.t
  if (t) redirect(`/api/public/instore/session?biz=${encodeURIComponent(biz)}&t=${encodeURIComponent(t)}&next=welcome`)

  if (!hasValidKioskSession(biz)) redirect(`/in-store/${biz}`)

  // Only show the chooser if the business opted into scan-and-go; otherwise straight to chat.
  const { data: cfg } = await supabaseAdmin.from('instore_kiosk_configs').select('scan_and_go_enabled').eq('business_id', biz).maybeSingle()
  if (!cfg?.scan_and_go_enabled) redirect(`/in-store/${biz}`)

  const card: React.CSSProperties = { display: 'block', textDecoration: 'none', color: INK, background: SURFACE, border: BORDER, borderRadius: 18, padding: '22px 20px', boxShadow: '4px 4px 0 #0a0a0a', textAlign: 'center' }

  return (
    <div style={{ minHeight: '100vh', background: CREAM, color: INK, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 18px', textAlign: 'center', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Welcome in 👋</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Link href={`/in-store/${biz}`} style={card}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Ask Aria a question</div>
            <div style={{ fontSize: 13, color: INK_SOFT, marginTop: 4 }}>What&apos;s good today, what&apos;s in stock, gift ideas…</div>
          </Link>
          <Link href={`/in-store/${biz}/cart`} style={{ ...card, background: ACCENT }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🛒</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Skip the queue — scan as you shop</div>
            <div style={{ fontSize: 13, color: INK, opacity: 0.7, marginTop: 4 }}>Scan items with your phone, show one code at the till.</div>
          </Link>
        </div>
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: INK_SOFT }}>Powered by Aria</div>
      </div>
    </div>
  )
}
