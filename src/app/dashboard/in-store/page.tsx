'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'qrcode'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface KioskConfig {
  kiosk_name: string | null
  greeting: string | null
  personality: 'friendly' | 'witty' | 'professional' | null
  voice_enabled: boolean | null
  loyalty_enabled: boolean | null
  recipe_suggestions: boolean | null
  enabled: boolean | null
}

interface Insights {
  metrics: {
    conversations: number
    questions_answered: number
    items_recommended: number
    recipes_suggested: number
    emails_captured: number
    missed_demand_value_aud: number
  }
  top_asked: Array<{ name: string; count: number }>
  missed_demand: Array<{ name: string; count: number; estimated_value_aud: number }>
  aria_insight: string | null
}

const C = {
  bg: '#0d0d14', card: '#13131a', border: 'rgba(255,255,255,0.07)',
  text: '#e8ede7', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
  green: '#7FB897', sage: '#2D5240', amber: '#F59E0B', red: '#EF4444', violet: '#A78BFA',
}

const inp: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border,
  borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13,
  width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

export default function InStoreDashboardPage() {
  const [config, setConfig] = useState<KioskConfig | null>(null)
  const [bid, setBid] = useState<string>('')
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, insRes] = await Promise.all([
        fetch('/api/instore/config').then(r => r.json()),
        fetch('/api/instore/insights').then(r => r.json()),
      ])
      if (cfgRes.config) setConfig(cfgRes.config)
      if (cfgRes.business_id) setBid(cfgRes.business_id)
      if (insRes.metrics) setInsights(insRes)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Generate QR when business_id is known
  useEffect(() => {
    if (!bid) return
    const url = `https://ariaos.site/in-store/${bid}`
    QRCode.toDataURL(url, { width: 360, margin: 2, color: { dark: '#0E1812', light: '#FFFFFF' } })
      .then(setQrDataUrl)
      .catch(() => { /* non-fatal */ })
  }, [bid])

  async function save() {
    if (!config) return
    setSaving(true)
    setSaveMsg('')
    try {
      await fetch('/api/instore/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch (e: unknown) {
      setSaveMsg('Error: ' + (e as Error).message)
    }
    setSaving(false)
  }

  function downloadQR() {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = 'aria-kiosk-qr.png'
    a.click()
  }

  function printPoster() {
    const w = window.open('', '_blank')
    if (!w || !qrDataUrl || !bid) return
    const kioskName = config?.kiosk_name ?? 'Ask us anything'
    w.document.write(`<!DOCTYPE html><html><head><title>Aria Kiosk Poster</title>
      <style>
        @page { size: A5; margin: 0; }
        body { margin: 0; padding: 40px; font-family: 'Inter', -apple-system, sans-serif; background: #fff; color: #0E1812; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        h1 { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 36px; margin: 0 0 8px; }
        p { font-size: 16px; color: #2D5240; margin: 0 0 20px; }
        img { width: 280px; height: 280px; margin: 16px 0; }
        .footer { font-size: 11px; color: #888; margin-top: 16px; }
      </style></head><body>
      <h1>${kioskName}</h1>
      <p>Scan to ask us anything — recommendations, recipes, what's good today.</p>
      <img src="${qrDataUrl}" alt="Kiosk QR" />
      <p style="font-size: 12px; color: #555">ariaos.site/in-store/${bid.slice(0, 8)}…</p>
      <p class="footer">Powered by Aria</p>
      </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 400)
  }

  if (loading) return <div style={{ padding: 32, color: C.muted }}>Loading…</div>

  const kioskUrl = bid ? `https://ariaos.site/in-store/${bid}` : ''

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      <AriaSays businessId={bid || null} page="in-store" />

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>Aria In-Store Kiosk</h1>
        <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>A conversational AI customers talk to in the shop — tablet or their phone via QR.</p>
      </div>

      {/* ── Metrics row ───────────────────────────────────────────── */}
      {insights && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Conversations', value: insights.metrics.conversations, color: C.green },
            { label: 'Questions answered', value: insights.metrics.questions_answered, color: C.text },
            { label: 'Items recommended', value: insights.metrics.items_recommended, color: C.text },
            { label: 'Recipes suggested', value: insights.metrics.recipes_suggested, color: C.violet },
            { label: 'Emails captured', value: insights.metrics.emails_captured, color: C.green },
            { label: 'Missed demand', value: 'A$' + insights.metrics.missed_demand_value_aud.toFixed(0), color: insights.metrics.missed_demand_value_aud > 0 ? C.red : C.dim },
          ].map(m => (
            <div key={m.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 11, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: m.color, margin: '6px 0 0', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Two-column: config + QR ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        {/* Config */}
        <section style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Kiosk settings</h2>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 6 }}>Kiosk name</span>
            <input value={config?.kiosk_name ?? ''} onChange={e => setConfig(c => c ? { ...c, kiosk_name: e.target.value } : c)} style={inp} placeholder="Aria" />
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 6 }}>Greeting</span>
            <textarea value={config?.greeting ?? ''} onChange={e => setConfig(c => c ? { ...c, greeting: e.target.value } : c)} rows={2}
              style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} placeholder="Hi! Ask me anything." />
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 6 }}>Personality</span>
            <select value={config?.personality ?? 'friendly'} onChange={e => setConfig(c => c ? { ...c, personality: e.target.value as KioskConfig['personality'] } : c)} style={inp}>
              <option value="friendly">Friendly — warm, upbeat (default)</option>
              <option value="witty">Witty — more jokes, light</option>
              <option value="professional">Professional — minimal humour</option>
            </select>
          </label>

          {[
            { key: 'voice_enabled' as const, label: 'Voice input + speech output' },
            { key: 'loyalty_enabled' as const, label: 'Loyalty signup' },
            { key: 'recipe_suggestions' as const, label: 'Recipe suggestions' },
            { key: 'enabled' as const, label: 'Kiosk enabled' },
          ].map(t => (
            <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={config?.[t.key] !== false}
                onChange={e => setConfig(c => c ? { ...c, [t.key]: e.target.checked } : c)} />
              <span style={{ fontSize: 13, color: C.text }}>{t.label}</span>
            </label>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button onClick={save} disabled={saving} style={{ padding: '10px 18px', background: C.sage, color: C.green, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saveMsg && <span style={{ fontSize: 12, color: C.green }}>{saveMsg}</span>}
          </div>
        </section>

        {/* QR */}
        <section style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>QR code + kiosk URL</h2>
          <div ref={printRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0' }}>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Kiosk QR" style={{ width: 200, height: 200, borderRadius: 8, background: '#fff', padding: 8 }} />
            ) : (
              <div style={{ width: 200, height: 200, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }} />
            )}
            <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 4px' }}>Kiosk URL</p>
            <code style={{ fontSize: 12, color: C.green, background: 'rgba(127,184,151,0.08)', padding: '4px 10px', borderRadius: 6, wordBreak: 'break-all', textAlign: 'center', maxWidth: '100%' }}>{kioskUrl}</code>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={downloadQR} disabled={!qrDataUrl} style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'transparent', border: '1px solid ' + C.border, color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Download QR</button>
            <button onClick={printPoster} disabled={!qrDataUrl} style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'transparent', border: '1px solid ' + C.border, color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Print poster (A5)</button>
            <a href={kioskUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '8px', borderRadius: 8, background: C.sage, color: C.green, fontSize: 12, fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>Open kiosk →</a>
          </div>
          <p style={{ fontSize: 11, color: C.dim, margin: '12px 0 0', lineHeight: 1.5 }}>Bookmark the kiosk URL on any tablet — that's your in-store device.</p>
        </section>
      </div>

      {/* ── Demand insights ──────────────────────────────────────── */}
      {insights && (
        <section style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>What customers asked for</h2>
          <p style={{ fontSize: 12, color: C.muted, margin: '0 0 18px' }}>Last 7 days from in-store conversations</p>

          {insights.aria_insight && (
            <div style={{ padding: '12px 14px', background: 'rgba(127,184,151,0.08)', border: '1px solid ' + C.border, borderRadius: 10, marginBottom: 18, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
              <span style={{ color: C.green, fontWeight: 700, marginRight: 6 }}>✦ Aria</span>{insights.aria_insight}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <p style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Most asked</p>
              {insights.top_asked.length === 0 ? (
                <p style={{ fontSize: 12, color: C.dim }}>No questions yet this week.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {insights.top_asked.slice(0, 8).map(t => {
                    const max = Math.max(...insights.top_asked.map(x => x.count))
                    return (
                      <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: C.text, minWidth: 140 }}>{t.name}</span>
                        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: ((t.count / max) * 100) + '%', height: '100%', background: C.green }} />
                        </div>
                        <span style={{ fontSize: 12, color: C.muted, minWidth: 28, textAlign: 'right' }}>{t.count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <p style={{ fontSize: 11, color: C.red, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Missed demand — you don't stock these</p>
              {insights.missed_demand.length === 0 ? (
                <p style={{ fontSize: 12, color: C.dim }}>No missed demand detected.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {insights.missed_demand.slice(0, 6).map(m => (
                    <div key={m.name} style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: C.text }}>{m.name}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>{m.count} customer{m.count === 1 ? '' : 's'} asked · ~A${m.estimated_value_aud}/wk demand</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
