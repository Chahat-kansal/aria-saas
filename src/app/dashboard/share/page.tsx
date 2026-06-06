'use client'
import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { supabase } from '@/lib/supabase'

const C = {
  bg: '#0d0d14', card: '#13131a', border: 'rgba(255,255,255,0.07)',
  text: '#e8ede7', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
  green: '#7FB897', sage: '#2D5240',
}
const APP = 'https://ariaos.site'

const CARD_LABEL: Record<string, string> = { loyalty: 'Join loyalty', booking: 'Book with us', community: 'Community', review: 'Leave a review', website: 'Visit website', order: 'Order online' }

async function qrPreview(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#0E1812', light: '#FFFFFF' } })
}

// 1200x1200 PNG, business logo composited into the centre (high error-correction).
async function qrPng(url: string, logoUrl: string | null): Promise<string> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, url, { width: 1200, margin: 3, errorCorrectionLevel: 'H', color: { dark: '#0a0a0a', light: '#ffffff' } })
  const plain = canvas.toDataURL('image/png')
  if (!logoUrl) return plain
  try {
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = logoUrl })
    const s = 1200 * 0.2, pos = (1200 - s) / 2
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(pos - 14, pos - 14, s + 28, s + 28)
    ctx.drawImage(img, pos, pos, s, s)
    return canvas.toDataURL('image/png')
  } catch { return plain }
}

export default function SharePage() {
  const { business } = useBusinessContext()
  const [slug, setSlug] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [hubQr, setHubQr] = useState('')
  const [kioskQr, setKioskQr] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [stats, setStats] = useState<{ visits_7d: number; total_clicks_7d: number; top_card: { target: string; count: number } | null } | null>(null)
  const [kioskToken, setKioskToken] = useState<string | null>(null)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const [tabletKey, setTabletKey] = useState<string | null>(null)
  const [showTablet, setShowTablet] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [hubStatus, setHubStatus] = useState<{ loyalty: boolean; booking: boolean; review: boolean; website: boolean; community: boolean } | null>(null)

  const bid = business?.id ?? null
  const hubUrl = slug ? `${APP}/${slug}` : ''
  const kioskUrl = bid ? `${APP}/in-store/${bid}/welcome${kioskToken ? `?t=${kioskToken}` : ''}` : ''
  const tabletUrl = bid && tabletKey ? `${APP}/kiosk-tablet/${bid}?key=${tabletKey}` : ''

  useEffect(() => {
    if (!bid) return
    supabase.from('businesses').select('slug, logo_url, name').eq('id', bid).single().then((res: { data: { slug: string | null; logo_url: string | null; name: string | null } | null }) => {
      const data = res.data
      if (data) { setSlug(data.slug); setLogoUrl(data.logo_url); setName(data.name ?? '') }
    })
    fetch('/api/dashboard/hub-analytics').then(r => r.json()).then(d => { if (!d.error) setStats(d) }).catch(() => {})
    fetch('/api/dashboard/kiosk-share').then(r => r.json()).then(d => { if (!d.error) { setKioskToken(d.token ?? null); setDaysLeft(d.days_left ?? null); setTabletKey(d.tablet_api_key ?? null) } }).catch(() => {})
    fetch('/api/dashboard/hub-status').then(r => r.json()).then(d => { if (!d.error) setHubStatus(d) }).catch(() => {})
  }, [bid])

  async function rotateTabletKey() {
    setRotating(true)
    try { const d = await fetch('/api/dashboard/kiosk-share', { method: 'POST' }).then(r => r.json()); if (d.tablet_api_key) setTabletKey(d.tablet_api_key) } catch (e) { console.warn('[non-fatal]', e) }
    setRotating(false)
  }

  useEffect(() => { if (hubUrl) qrPreview(hubUrl).then(setHubQr) }, [hubUrl])
  useEffect(() => { if (kioskUrl) qrPreview(kioskUrl).then(setKioskQr) }, [kioskUrl])

  const copy = useCallback((url: string, key: string) => {
    navigator.clipboard.writeText(url).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1800) })
  }, [])

  async function downloadPng(url: string, fileName: string) {
    const data = await qrPng(url, logoUrl)
    const a = document.createElement('a'); a.href = data; a.download = fileName; a.click()
  }

  function printPoster(url: string, title: string, cta: string) {
    const w = window.open('', '_blank'); if (!w) return
    qrPreview(url).then(qr => {
      w.document.write(`<html><head><title>${title}</title><style>
        @page { size: A5; margin: 0 }
        body { margin: 0; padding: 36px; font-family: 'Inter', -apple-system, sans-serif; background: #fafafa; color: #0a0a0a; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        h1 { font-size: 30px; margin: 0 0 6px } p { font-size: 15px; color: #555; margin: 0 0 22px }
        img { width: 340px; height: 340px; border: 3px solid #0a0a0a; border-radius: 18px; padding: 10px; background: #fff }
        .url { margin-top: 18px; font-size: 13px; color: #0a0a0a; font-weight: 600 }
      </style></head><body>
        <h1>${name || title}</h1><p>${cta}</p>
        <img src="${qr}" alt="QR" />
        <div class="url">${url.replace(/^https?:\/\//, '')}</div>
      </body></html>`)
      w.document.close(); setTimeout(() => w.print(), 350)
    })
  }

  if (!business) return null

  const cardBox: React.CSSProperties = { background: C.card, border: '1px solid ' + C.border, borderRadius: 16, padding: 22 }
  const btn = (primary?: boolean): React.CSSProperties => ({ padding: '9px 14px', borderRadius: 9, border: primary ? 'none' : '1px solid ' + C.border, background: primary ? C.sage : 'transparent', color: primary ? C.green : C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: '32px 28px', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px' }}>Share</h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px' }}>Two links, two QR codes. Your customer hub for everything, and your in-store kiosk.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {/* Customer hub */}
          <div style={cardBox}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Your customer hub</div>
            <p style={{ fontSize: 12.5, color: C.dim, margin: '0 0 14px' }}>One link for loyalty, bookings, community, reviews and your website.</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              {hubQr ? <img src={hubQr} alt="Hub QR" style={{ width: 200, height: 200, borderRadius: 12, border: '1px solid ' + C.border, background: '#fff', padding: 6 }} /> : <div style={{ width: 200, height: 200 }} />}
            </div>
            <code style={{ display: 'block', fontSize: 12, color: C.green, background: 'rgba(127,184,151,0.08)', padding: '8px 10px', borderRadius: 8, wordBreak: 'break-all', textAlign: 'center', marginBottom: 12 }}>{hubUrl || 'Generating…'}</code>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={btn()} onClick={() => copy(hubUrl, 'hub')}>{copied === 'hub' ? 'Copied!' : 'Copy URL'}</button>
              <button style={btn()} onClick={() => downloadPng(hubUrl, `${slug ?? 'hub'}-qr.png`)} disabled={!hubUrl}>Download QR</button>
              <button style={btn(true)} onClick={() => printPoster(hubUrl, 'Find us on Aria', 'Scan for loyalty, bookings & more')} disabled={!hubUrl}>A5 poster</button>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Where to put this:</div>
              receipt footer · Instagram bio · Google Business profile · email signature
            </div>
          </div>

          {/* Kiosk */}
          <div style={cardBox}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Your in-store kiosk QR</div>
            <p style={{ fontSize: 12.5, color: C.dim, margin: '0 0 14px' }}>Print this by the till — customers scan it with their phone to chat with Aria in-store.</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              {kioskQr ? <img src={kioskQr} alt="Kiosk QR" style={{ width: 200, height: 200, borderRadius: 12, border: '1px solid ' + C.border, background: '#fff', padding: 6 }} /> : <div style={{ width: 200, height: 200 }} />}
            </div>
            <code style={{ display: 'block', fontSize: 12, color: C.green, background: 'rgba(127,184,151,0.08)', padding: '8px 10px', borderRadius: 8, wordBreak: 'break-all', textAlign: 'center', marginBottom: 12 }}>{kioskUrl}</code>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={btn()} onClick={() => copy(kioskUrl, 'kiosk')}>{copied === 'kiosk' ? 'Copied!' : 'Copy URL'}</button>
              <button style={btn()} onClick={() => downloadPng(kioskUrl, 'kiosk-qr.png')} disabled={!kioskUrl}>Download QR</button>
              <button style={btn(true)} onClick={() => printPoster(kioskUrl, 'Ask us anything', 'Scan to chat with our in-store assistant')} disabled={!kioskUrl}>A5 poster</button>
            </div>
            {daysLeft != null && daysLeft <= 2 && (
              <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12, color: '#F59E0B', lineHeight: 1.5 }}>
                ⚠ Your current poster expires in {daysLeft} day{daysLeft === 1 ? '' : 's'} — reprint it so customers can keep scanning. The QR rotates for security.
              </div>
            )}
            <p style={{ fontSize: 11, color: C.dim, margin: '10px 0 0', lineHeight: 1.5 }}>QR rotates daily; each printed poster stays valid for 5 days.</p>
          </div>
        </div>

        {/* Hub checklist — what's live on the customer hub + setup links for the rest */}
        {hubStatus && (
          <div style={{ ...cardBox, marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>What&apos;s on your hub</div>
            <p style={{ fontSize: 12.5, color: C.dim, margin: '0 0 14px' }}>Cards only appear to customers once their data is set. Finish the unchecked ones below.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { key: 'loyalty', label: 'Loyalty', ok: 'Configured', set: 'Not yet configured — set up loyalty', href: '/dashboard/loyalty' },
                { key: 'booking', label: 'Bookings', ok: 'Link set', set: 'No booking link yet — set it up', href: '/dashboard/settings/business' },
                { key: 'review', label: 'Reviews', ok: 'Link set', set: 'Add your Google review link', href: '/dashboard/settings/business' },
                { key: 'website', label: 'Website', ok: 'Set', set: 'Add your website', href: '/dashboard/community/profile' },
                { key: 'community', label: 'Community', ok: 'Profile live', set: 'Set up your community profile', href: '/dashboard/community/profile' },
              ] as const).map(item => {
                const on = (hubStatus as Record<string, boolean>)[item.key]
                return (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid ' + C.border }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: on ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (on ? C.green : C.border), color: on ? C.green : C.dim }}>{on ? '✓' : '!'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, width: 88 }}>{item.label}</span>
                    {on
                      ? <span style={{ fontSize: 12.5, color: C.green }}>{item.ok}</span>
                      : <a href={item.href} style={{ fontSize: 12.5, color: C.dim, textDecoration: 'underline' }}>{item.set}</a>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Counter tablet — always-on, never printed on a QR */}
        <div style={{ ...cardBox, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Set up a counter tablet</div>
              <p style={{ fontSize: 12.5, color: C.dim, margin: '4px 0 0' }}>An always-on device on your counter. Paste this URL once — it never expires. Keep it private; don&apos;t print it.</p>
            </div>
            <button style={btn()} onClick={() => setShowTablet(s => !s)}>{showTablet ? 'Hide' : 'Reveal'}</button>
          </div>
          {showTablet && (
            <div style={{ marginTop: 12 }}>
              <code style={{ display: 'block', fontSize: 12, color: C.green, background: 'rgba(127,184,151,0.08)', padding: '8px 10px', borderRadius: 8, wordBreak: 'break-all', marginBottom: 10 }}>{tabletUrl || 'No tablet key yet — rotate to create one.'}</code>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={btn()} onClick={() => tabletUrl && copy(tabletUrl, 'tablet')} disabled={!tabletUrl}>{copied === 'tablet' ? 'Copied!' : 'Copy URL'}</button>
                <button style={btn()} onClick={rotateTabletKey} disabled={rotating}>{rotating ? 'Rotating…' : 'Rotate key'}</button>
              </div>
            </div>
          )}
        </div>

        {/* Analytics strip */}
        <div style={{ ...cardBox, marginTop: 16, display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.green }}>{stats?.visits_7d ?? '—'}</div>
            <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hub visits · last 7 days</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{stats?.total_clicks_7d ?? '—'}</div>
            <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Card taps · last 7 days</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{stats?.top_card ? CARD_LABEL[stats.top_card.target] ?? stats.top_card.target : '—'}</div>
            <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top-clicked card</div>
          </div>
        </div>
      </div>
    </div>
  )
}
