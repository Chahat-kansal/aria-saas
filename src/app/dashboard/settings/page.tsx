'use client'
import { useState, useEffect } from 'react'

interface Business { id: string; name: string; industry: string; abn?: string; city?: string; address?: string; phone?: string; google_place_id?: string | null; google_average_rating?: number | null; google_total_reviews?: number | null; google_reviews_last_synced?: string | null }

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '1px solid var(--divider)',
  borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)',
  outline: 'none', fontFamily: "'Manrope',sans-serif",
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }

const TABS = ['Business Profile', 'Notifications', 'Privacy & Data']

export default function DashboardSettingsPage() {
  const [tab,     setTab]     = useState(0)
  const [biz,     setBiz]     = useState<Business | null>(null)
  const [name,    setName]    = useState('')
  const [abn,     setAbn]     = useState('')
  const [city,    setCity]    = useState('')
  const [address, setAddress] = useState('')
  const [phone,   setPhone]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [googlePlaceId, setGooglePlaceId] = useState('')
  const [syncing,    setSyncing]    = useState(false)
  const [syncResult, setSyncResult] = useState('')
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifSMS,   setNotifSMS]   = useState(false)
  const [downloading,   setDownloading]   = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting,      setDeleting]      = useState(false)
  const [deleteError,   setDeleteError]   = useState('')

  useEffect(() => {
    fetch('/api/settings/business').then(r => r.json()).then(d => {
      const b = d.business ?? d
      if (b?.id) {
        setBiz(b)
        setName(b.name ?? '')
        setAbn(b.abn ?? '')
        setCity(b.city ?? '')
        setAddress(b.address ?? '')
        setPhone(b.phone ?? '')
        setGooglePlaceId(b.google_place_id ?? '')
      }
    }).catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/settings/business', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, abn, city, address, phone, google_place_id: googlePlaceId || null }),
    }).catch(() => {})
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function downloadData() {
    setDownloading(true)
    try {
      const res = await fetch('/api/account/export')
      if (!res.ok) { setDownloading(false); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'aria-data-export.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ }
    setDownloading(false)
  }

  async function deleteAccount() {
    if (deleteConfirm !== 'DELETE MY DATA') return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/account/delete', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE MY DATA' }),
      })
      if (res.ok) { window.location.href = '/goodbye'; return }
      const d = await res.json().catch(() => ({}))
      setDeleteError(d.error ?? 'Deletion failed. Please try again.')
    } catch { setDeleteError('Network error. Please try again.') }
    setDeleting(false)
  }

  async function syncReviews() {
    setSyncing(true)
    setSyncResult('')
    const res = await fetch('/api/aria/sync-reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: biz?.id, place_id: googlePlaceId }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.error === 'not_configured') {
      setSyncResult('⚠️ Google Places API key not configured in Vercel yet')
    } else if (res.ok) {
      setSyncResult(`✅ Synced ${res.reviews_synced} new review${res.reviews_synced !== 1 ? 's' : ''} (${res.total_on_google ?? '?'} total on Google, avg ${res.rating ?? '?'}★)`)
    } else {
      setSyncResult(`❌ ${res.error ?? res.message ?? 'Sync failed'}`)
    }
    setSyncing(false)
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px', maxWidth: 740, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 24px' }}>Settings</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 28, borderBottom: '1px solid var(--divider)' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: tab === i ? 700 : 400, color: tab === i ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: tab === i ? '2px solid var(--violet)' : '2px solid transparent', marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={lbl}>Business name</label>
            <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Your business name" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>ABN</label>
              <input style={inp} value={abn} onChange={e => setAbn(e.target.value)} placeholder="12 345 678 901" />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input style={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="03 9000 0000" />
            </div>
          </div>
          <div>
            <label style={lbl}>City / Suburb</label>
            <input style={inp} value={city} onChange={e => setCity(e.target.value)} placeholder="Melbourne" />
          </div>
          <div>
            <label style={lbl}>Address</label>
            <input style={inp} value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Collins St, Melbourne VIC 3000" />
          </div>
          {/* Google Reviews */}
          <div style={{ marginTop: 8, paddingTop: 20, borderTop: '1px solid var(--divider)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Google Reviews</p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
              Enter your Google Place ID so Aria can monitor and respond to your reviews.{' '}
              <a href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
                target="_blank" rel="noopener" style={{ color: 'var(--violet)' }}>
                Find your Place ID
              </a>
            </p>
            <input
              data-tour="connect_google"
              value={googlePlaceId}
              onChange={e => setGooglePlaceId(e.target.value)}
              placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
              style={inp}
            />
            {googlePlaceId && (
              <button
                onClick={syncReviews}
                disabled={syncing}
                style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: syncing ? 'var(--bg-elevated)' : '#4285F4',
                  color: syncing ? 'var(--text-tertiary)' : '#fff',
                  fontSize: 12, fontWeight: 700, cursor: syncing ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit' }}>
                {syncing ? '⏳ Syncing…' : '🔄 Sync Reviews Now'}
              </button>
            )}
            {syncResult && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{syncResult}</p>
            )}
          </div>

          {biz?.industry && (
            <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              Industry: <strong style={{ color: 'var(--text-primary)' }}>{biz.industry}</strong> · To change industry, contact support.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 8 }}>
            <button data-tour="set_hours" onClick={save} disabled={saving}
              style={{ padding: '10px 24px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && <span style={{ fontSize: 13, color: '#7FB897', fontWeight: 600 }}>✓ Saved</span>}
          </div>
        </div>
      )}

      {tab === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            Your data is stored securely in Australia. Aria never sells your data to third parties.
          </p>

          {/* Download */}
          <div style={{ padding: '18px 20px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--divider)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Download my data</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
              Export all your business data, customers, sales, and Aria conversations as a JSON file.
            </div>
            <button onClick={downloadData} disabled={downloading}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: downloading ? 0.6 : 1 }}>
              {downloading ? '⏳ Preparing…' : '⬇ Download my data'}
            </button>
          </div>

          {/* Delete */}
          <div style={{ padding: '18px 20px', background: 'rgba(239,68,68,0.04)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Delete my account</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
              This is permanent and cannot be undone. All businesses, customers, sales history, and Aria data will be deleted immediately.
            </div>
            <label style={{ ...lbl, marginBottom: 6 }}>Type DELETE MY DATA to confirm</label>
            <input style={{ ...inp, marginBottom: 12 }} value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE MY DATA" />
            {deleteError && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>{deleteError}</p>}
            <button onClick={deleteAccount}
              disabled={deleting || deleteConfirm !== 'DELETE MY DATA'}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: deleteConfirm === 'DELETE MY DATA' ? '#ef4444' : 'var(--bg-elevated)', color: deleteConfirm === 'DELETE MY DATA' ? '#fff' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: (deleting || deleteConfirm !== 'DELETE MY DATA') ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 200ms' }}>
              {deleting ? 'Deleting…' : 'Delete Account'}
            </button>
          </div>
        </div>
      )}

      {tab === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {([
            { key: 'email', label: 'Email alerts', desc: 'Low stock alerts, reorder agent summaries, daily briefings', val: notifEmail, set: setNotifEmail },
            { key: 'sms', label: 'SMS alerts', desc: 'Critical alerts only (out of stock, large variance)', val: notifSMS, set: setNotifSMS },
          ] as const).map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--divider)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{item.desc}</div>
              </div>
              <button onClick={() => item.set((v: boolean) => !v)} style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: item.val ? 'var(--violet)' : 'var(--bg-elevated)', position: 'relative', transition: 'background 200ms',
              }}>
                <div style={{ position: 'absolute', top: 3, left: item.val ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 200ms' }} />
              </button>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Notification preferences are saved automatically.</p>
        </div>
      )}
    </div>
  )
}