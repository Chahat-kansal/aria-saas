'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface ConnStatus {
  connected: boolean
  sync_status?: string
  last_synced_at?: string | null
  sync_error?: string | null
  product_count?: number
  counts?: { products: number; customers: number; sales?: number }
  shop_name?: string
  store_url?: string
  domain_prefix?: string
  kounta_available?: boolean
}

interface AllStatus {
  square: ConnStatus
  shopify: ConnStatus
  lightspeed_x: ConnStatus
  kounta: ConnStatus
  csv: { product_count: number }
}

interface JournalLine { description: string; amount: number; account_code: string; type: 'debit' | 'credit' }
interface XeroPreview {
  id: string; date: string; status: 'pending' | 'synced' | 'failed'
  payload: { sales_count: number; total_revenue: number; total_tax: number; journal_lines: JournalLine[] }
  synced_at: string | null; xero_journal_id: string | null; created_at: string
}
interface LineItem { description: string; quantity: number; unit_amount: string; account_code: string; gst?: string }
interface XeroPending {
  id: string; sync_date: string; line_items: LineItem[]
  total_sales: number; total_gst: number
  payment_breakdown: Record<string, number>; notes: string | null
}
interface XeroHistory {
  id: string; sync_date: string; status: string
  total_sales: number; total_gst: number
  sent_at: string | null; xero_invoice_id: string | null
}
interface XeroStatus {
  connected: boolean; token_expired: boolean; connected_at: string | null
  auto_sync: boolean; pending: XeroPending[]; history: XeroHistory[]; previews: XeroPreview[]
}

function statusDot(s?: string) {
  if (s === 'connected' || s === 'synced') return 'bg-emerald-500'
  if (s === 'syncing') return 'bg-yellow-400 animate-pulse'
  if (s === 'error') return 'bg-red-500'
  return 'bg-gray-600'
}

function timeAgo(iso?: string | null) {
  if (!iso) return null
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function SyncMeta({ conn, onSync, syncing }: { conn: ConnStatus; onSync: () => void; syncing: boolean }) {
  return (
    <div className="space-y-2">
      {conn.product_count !== undefined && (
        <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          {conn.product_count.toLocaleString()} products synced
        </p>
      )}
      {conn.last_synced_at && (
        <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Last synced {timeAgo(conn.last_synced_at)}
        </p>
      )}
      {conn.sync_error && <p className="text-xs text-red-400 truncate">{conn.sync_error}</p>}
      <button onClick={onSync} disabled={syncing}
        className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        style={{ background: '#2D5240', color: '#7FB897' }}>
        {syncing ? 'Syncing…' : 'Sync now'}
      </button>
    </div>
  )
}

export default function IntegrationsPage() {
  const { business } = useBusinessContext()
  const [status, setStatus] = useState<AllStatus | null>(null)
  const [xero, setXero] = useState<XeroStatus | null>(null)
  const [xeroDisconnecting, setXeroDisconnecting] = useState(false)
  const [xeroPreparingToday, setXeroPreparingToday] = useState(false)
  const [xeroModal, setXeroModal] = useState<XeroPreview | null>(null)
  const [xeroApprovedItems, setXeroApprovedItems] = useState<Set<string>>(new Set())
  const [xeroApproving, setXeroApproving] = useState(false)
  const [toast, setToast] = useState('')
  const [syncing, setSyncing] = useState<string | null>(null)
  const [bank, setBank] = useState<{ connected: boolean; accounts: Array<{ id: string; account_name: string | null; institution_name: string | null; balance: number | null; last_synced_at: string | null }>; total_balance: number } | null>(null)
  const [bankBusy, setBankBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null)
  const [shopInput, setShopInput] = useState('')
  const [lsInput, setLsInput] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const loadStatus = useCallback(async () => {
    const r = await fetch('/api/integrations/status')
    if (r.ok) setStatus(await r.json() as AllStatus)
  }, [])

  const loadXero = useCallback(async () => {
    if (!business?.id) return
    const r = await fetch(`/api/integrations/xero/status?business_id=${business.id}`)
    if (r.ok) setXero(await r.json() as XeroStatus)
  }, [business?.id])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected') ?? params.get('success')
    const error = params.get('error')
    if (connected) showToast('Connected successfully!')
    if (error) showToast(`Connection failed: ${error.replace(/_/g, ' ')}`)
    loadStatus()
  }, [loadStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadXero() }, [loadXero])

  const loadBank = useCallback(async () => {
    if (!business?.id) return
    const r = await fetch(`/api/integrations/basiq/status?business_id=${business.id}`).then(r => r.json()).catch(() => null)
    if (r) setBank(r)
  }, [business?.id])
  useEffect(() => { loadBank() }, [loadBank])

  const connectBank = async () => {
    if (!business?.id) return
    setBankBusy('connect')
    const r = await fetch('/api/integrations/basiq/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    setBankBusy(null)
    if (r.consent_url) window.location.href = r.consent_url
    else setToast(r.error ?? 'Could not start bank connection')
  }
  const syncBank = async () => {
    if (!business?.id) return
    setBankBusy('sync')
    await fetch(`/api/integrations/basiq/sync?business_id=${business.id}`).catch(() => {})
    setBankBusy(null); setToast('Bank synced.'); loadBank()
  }
  const disconnectBank = async () => {
    if (!business?.id || !confirm('Disconnect your bank? Aria will lose access to balance data.')) return
    setBankBusy('disconnect')
    await fetch('/api/integrations/basiq/disconnect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id }),
    }).catch(() => {})
    setBankBusy(null); setToast('Bank disconnected.'); loadBank()
  }

  const sync = async (platform: string) => {
    setSyncing(platform)
    const r = await fetch(`/api/integrations/${platform}/sync`, { method: 'POST' })
    const j = await r.json() as { error?: string; products?: number; customers?: number }
    setSyncing(null)
    if (r.ok) {
      showToast(`Sync complete — ${(j.products ?? 0)} products, ${(j.customers ?? 0)} customers`)
      loadStatus()
    } else {
      showToast(`Sync failed: ${j.error}`)
    }
  }

  const importCsv = async () => {
    if (!csvFile) return
    setImporting(true)
    const fd = new FormData()
    fd.append('file', csvFile)
    const r = await fetch('/api/integrations/csv', { method: 'POST', body: fd })
    const j = await r.json() as { imported?: number; skipped?: number }
    setImporting(false); setCsvFile(null)
    if (fileRef.current) fileRef.current.value = ''
    showToast(`Imported ${j.imported ?? 0} products${j.skipped ? ` (${j.skipped} skipped)` : ''}`)
    loadStatus()
  }

  const disconnectXero = async () => {
    if (!business?.id) return
    setXeroDisconnecting(true)
    await fetch('/api/integrations/xero/status?business_id=' + business.id, { method: 'DELETE' })
    setXeroDisconnecting(false); showToast('Xero disconnected.'); loadXero()
  }

  const prepareToday = async () => {
    if (!business?.id) return
    setXeroPreparingToday(true)
    const r = await fetch('/api/pos/xero-sync/prepare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    })
    const j = await r.json() as { preview?: XeroPreview; message?: string; error?: string }
    setXeroPreparingToday(false)
    if (!r.ok) { showToast(j.error ?? 'Could not prepare sync'); return }
    if (!j.preview) { showToast(j.message ?? 'No sales found for today'); return }
    const all = new Set((j.preview.payload.journal_lines ?? []).map(l => l.description))
    setXeroApprovedItems(all)
    setXeroModal(j.preview)
  }

  const approvePreview = async () => {
    if (!xeroModal) return
    setXeroApproving(true)
    const r = await fetch('/api/pos/xero-sync/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview_id: xeroModal.id, approved_items: Array.from(xeroApprovedItems) }),
    })
    const j = await r.json() as { error?: string }
    setXeroApproving(false)
    if (r.ok) { showToast('Synced to Xero!'); setXeroModal(null); loadXero() }
    else showToast(j.error ?? 'Sync failed')
  }

  const sq = status?.square
  const sh = status?.shopify
  const lsX = status?.lightspeed_x
  const kounta = status?.kounta
  const csv = status?.csv
  return (
    <div className="p-6 max-w-5xl space-y-8" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header>
        <h1 className="text-2xl font-medium">Migration Hub</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Connect your existing POS — products, customers, and sales sync automatically.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Square */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(255,255,255,0.08)' }}>SQ</div>
              <div><p className="font-medium">Square</p><p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Products · Customers · 12mo Sales</p></div>
            </div>
            {sq?.connected
              ? <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${statusDot(sq.sync_status)}`} /><span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Connected</span></div>
              : <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>Not connected</span>}
          </div>
          {sq?.connected
            ? <SyncMeta conn={sq} onSync={() => sync('square')} syncing={syncing === 'square'} />
            : <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Authorise Square once — products, customers, and 12 months of sales sync automatically.</p>
                <a href="/api/integrations/square/connect" className="block text-center py-2 rounded-lg text-sm font-medium" style={{ background: '#2D5240', color: '#7FB897' }}>Connect Square →</a>
              </div>}
        </div>

        {/* Shopify */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(149,191,71,0.15)', color: '#95bf47' }}>SH</div>
              <div><p className="font-medium">Shopify</p><p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{sh?.connected ? (sh.shop_name ?? sh.store_url ?? 'Connected') : 'Products · Customers'}</p></div>
            </div>
            {sh?.connected
              ? <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${statusDot(sh.sync_status)}`} /><span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Connected</span></div>
              : <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>Not connected</span>}
          </div>
          {sh?.connected
            ? <SyncMeta conn={sh} onSync={() => sync('shopify')} syncing={syncing === 'shopify'} />
            : <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Enter your Shopify store URL to connect.</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="yourstore.myshopify.com" value={shopInput} onChange={e => setShopInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
                  <a href={shopInput ? `/api/integrations/shopify/connect?shop=${encodeURIComponent(shopInput)}` : '#'}
                    className="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
                    style={{ background: shopInput ? '#2D5240' : 'rgba(255,255,255,0.04)', color: shopInput ? '#7FB897' : 'var(--text-secondary, #A8B5A8)', pointerEvents: shopInput ? 'auto' : 'none' }}>
                    Connect →
                  </a>
                </div>
              </div>}
        </div>

        {/* Lightspeed X-Series */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>LS</div>
              <div><p className="font-medium">Lightspeed X-Series</p><p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{lsX?.connected ? (lsX.domain_prefix ?? 'Connected') : 'Products · Customers · Sales'}</p></div>
            </div>
            {lsX?.connected
              ? <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${statusDot(lsX.sync_status)}`} /><span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Connected</span></div>
              : <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>Not connected</span>}
          </div>
          {lsX?.connected
            ? <SyncMeta conn={lsX} onSync={() => sync('lightspeed-x')} syncing={syncing === 'lightspeed-x'} />
            : <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Enter your Lightspeed store domain prefix (e.g. "mystore" from mystore.retail.lightspeed.app).</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="mystore" value={lsInput} onChange={e => setLsInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
                  <a href={lsInput ? `/api/integrations/lightspeed-x/connect?domain=${encodeURIComponent(lsInput)}` : '#'}
                    className="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
                    style={{ background: lsInput ? '#2D5240' : 'rgba(255,255,255,0.04)', color: lsInput ? '#7FB897' : 'var(--text-secondary, #A8B5A8)', pointerEvents: lsInput ? 'auto' : 'none' }}>
                    Connect →
                  </a>
                </div>
              </div>}
        </div>

        {/* Kounta */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>KO</div>
              <div><p className="font-medium">Lightspeed Kounta</p><p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Hospitality O-Series</p></div>
            </div>
            {kounta?.connected
              ? <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${statusDot(kounta.sync_status)}`} /><span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Connected</span></div>
              : <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>{kounta?.kounta_available ? 'Available' : 'Coming soon'}</span>}
          </div>
          {kounta?.connected
            ? <SyncMeta conn={kounta} onSync={() => sync('kounta')} syncing={syncing === 'kounta'} />
            : <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  {kounta?.kounta_available ? 'Connect your Kounta account to sync products and customers.' : 'Kounta integration is pending API certification approval. Check back soon.'}
                </p>
                {kounta?.kounta_available && (
                  <a href="/api/integrations/kounta/connect" className="block text-center py-2 rounded-lg text-sm font-medium" style={{ background: '#2D5240', color: '#7FB897' }}>Connect Kounta →</a>
                )}
              </div>}
        </div>

        {/* CSV Import */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-medium" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>CSV</div>
            <div><p className="font-medium">Universal CSV Import</p><p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Any POS export · {(csv?.product_count ?? 0).toLocaleString()} products imported</p></div>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Works with Shopfront, Vend, and any standard CSV. Headers auto-detected.</p>
          <div className="space-y-2">
            <input type="file" accept=".csv,text/csv" ref={fileRef} onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }} />
            {csvFile && (
              <button onClick={importCsv} disabled={importing} className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: '#2D5240', color: '#7FB897' }}>
                {importing ? 'Importing…' : `Import "${csvFile.name}"`}
              </button>
            )}
          </div>
        </div>

        {/* Aria POS */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: 'rgba(45,82,64,0.4)', color: '#7FB897' }}>A</div>
              <div><p className="font-medium">Aria POS</p><p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Built-in — always connected</p></div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Active</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>All transactions are analysed automatically.</p>
          <Link href="/pos" className="block text-center py-2 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary, #A8B5A8)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            Open Aria POS →
          </Link>
        </div>

        {/* Xero */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(19,176,170,0.15)', color: '#13b0aa' }}>XE</div>
              <div><p className="font-medium">Xero</p><p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Accounting · Review-first sync</p></div>
            </div>
            {xero?.connected && !xero.token_expired
              ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Connected</span></div>
              : xero?.token_expired
                ? <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Token expired</span>
                : <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>Not connected</span>}
          </div>
          {xero?.connected ? (
            <div className="space-y-2">
              {xero.token_expired && (
                <p className="text-xs text-amber-400">Access token expired — reconnect to resume syncing.</p>
              )}
              {!xero.token_expired && (
                <button onClick={prepareToday} disabled={xeroPreparingToday}
                  className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: '#2D5240', color: '#7FB897' }}>
                  {xeroPreparingToday ? 'Preparing…' : 'Sync today\'s sales'}
                </button>
              )}
              {!xero.token_expired && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={xero.auto_sync}
                    onChange={async e => {
                      if (!business?.id) return
                      await fetch('/api/integrations/xero/auto-sync', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ business_id: business.id, enabled: e.target.checked }),
                      })
                      loadXero()
                    }}
                    className="w-4 h-4 accent-emerald-500" />
                  <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                    Auto-sync daily (no review required)
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <a href="https://go.xero.com" target="_blank" rel="noopener noreferrer" className="flex-1 text-center py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary, #A8B5A8)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
                  View in Xero →
                </a>
                {xero.token_expired
                  ? <a href={business?.id ? '/api/integrations/xero/connect?business_id=' + business.id : '#'}
                      className="flex-1 text-center py-2 rounded-lg text-sm font-medium"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                      Reconnect →
                    </a>
                  : <button onClick={disconnectXero} disabled={xeroDisconnecting} className="flex-1 py-2 rounded-lg text-sm disabled:opacity-50" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                      {xeroDisconnecting ? '…' : 'Disconnect'}
                    </button>}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Connect Xero to review and approve daily sales syncs before anything is sent to your accounting.</p>
              <a href={business?.id ? '/api/integrations/xero/connect?business_id=' + business.id : '#'} className="block text-center py-2 rounded-lg text-sm font-medium" style={{ background: '#2D5240', color: '#7FB897' }}>
                Connect Xero →
              </a>
            </div>
          )}
        </div>

      </div>

      {/* Xero previews history */}
      {xero?.connected && (xero.previews.length > 0) && (
        <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <p className="font-medium text-sm">Xero Sync History</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  <th className="text-left py-1.5 font-medium">Date</th>
                  <th className="text-right py-1.5 font-medium">Sales</th>
                  <th className="text-right py-1.5 font-medium">GST</th>
                  <th className="text-left py-1.5 font-medium pl-4">Status</th>
                  <th className="text-right py-1.5 font-medium">Synced at</th>
                  <th className="text-right py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {xero.previews.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
                    <td className="py-2">{p.date}</td>
                    <td className="py-2 text-right tabular-nums">${Number(p.payload?.total_revenue ?? 0).toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>${Number(p.payload?.total_tax ?? 0).toFixed(2)}</td>
                    <td className="py-2 pl-4">
                      {p.status === 'synced' ? <span className="text-emerald-400">Synced</span>
                        : p.status === 'failed' ? <span className="text-red-400">Failed</span>
                        : <span style={{ color: '#f59e0b' }}>Pending</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                      {p.synced_at ? new Date(p.synced_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {p.status === 'pending' && (
                        <button onClick={() => { setXeroApprovedItems(new Set((p.payload.journal_lines ?? []).map(l => l.description))); setXeroModal(p) }}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: 'rgba(127,184,151,0.15)', color: '#7FB897' }}>
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Xero review modal */}
      {xeroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setXeroModal(null) }}>
          <div className="w-full max-w-xl rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.1))' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Review Xero sync — {xeroModal.date}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  {xeroModal.payload.sales_count} sales · ${Number(xeroModal.payload.total_revenue).toFixed(2)} total
                </p>
              </div>
              <button onClick={() => setXeroModal(null)} className="text-xl leading-none" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>×</button>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              Toggle line items to include or exclude from the Xero manual journal entry.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(xeroModal.payload.journal_lines ?? []).map((l, i) => {
                const checked = xeroApprovedItems.has(l.description)
                return (
                  <label key={i} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
                    style={{ background: checked ? 'rgba(127,184,151,0.06)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (checked ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.04)') }}>
                    <input type="checkbox" checked={checked}
                      onChange={() => {
                        setXeroApprovedItems(prev => {
                          const n = new Set(prev)
                          if (n.has(l.description)) n.delete(l.description)
                          else n.add(l.description)
                          return n
                        })
                      }}
                      className="w-4 h-4 accent-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{l.description}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                        Account {l.account_code} · {l.type === 'debit' ? 'DR' : 'CR'} ${Number(l.amount).toFixed(2)}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular-nums"
                      style={{ color: l.type === 'debit' ? '#7FB897' : 'var(--text-secondary, #A8B5A8)' }}>
                      ${Number(l.amount).toFixed(2)}
                    </span>
                  </label>
                )
              })}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={approvePreview} disabled={xeroApproving || xeroApprovedItems.size === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: '#7FB897', color: '#0E1812' }}>
                {xeroApproving ? 'Pushing to Xero…' : 'Push to Xero (' + xeroApprovedItems.size + ' items)'}
              </button>
              <button onClick={() => setXeroModal(null)} className="py-2.5 px-4 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>
                Cancel
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              This creates a manual journal in Xero. Cannot be undone from here — use Xero to reverse if needed.
            </p>
          </div>
        </div>
      )}

      {/* Bank accounts (Basiq) */}
      <div style={{ marginTop: 24, padding: 20, borderRadius: 14, background: 'rgba(127,184,151,0.04)', border: '1px solid rgba(127,184,151,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#E8EDE7', margin: 0 }}>🏦 Bank accounts</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>Connect ANZ, CommBank, NAB, Westpac, ING + more via Basiq · read-only</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {bank?.connected ? (
              <>
                <button onClick={syncBank} disabled={bankBusy !== null} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.1)', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{bankBusy === 'sync' ? '…' : '↻ Sync'}</button>
                <button onClick={disconnectBank} disabled={bankBusy !== null} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Disconnect</button>
              </>
            ) : (
              <button onClick={connectBank} disabled={bankBusy !== null} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{bankBusy === 'connect' ? 'Opening…' : 'Connect your bank'}</button>
            )}
          </div>
        </div>
        {bank?.connected ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
              {bank.accounts.map(a => (
                <div key={a.id} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{a.institution_name ?? 'Bank'}</p>
                  <p style={{ fontSize: 13, color: '#E8EDE7', margin: '4px 0 6px' }}>{a.account_name ?? 'Account'}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: '#7FB897', margin: 0 }}>A${Number(a.balance ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</p>
                  {a.last_synced_at && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '4px 0 0' }}>synced {new Date(a.last_synced_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Total balance: <strong style={{ color: '#7FB897' }}>A${Number(bank.total_balance ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</strong></p>
          </>
        ) : (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>🔒 Read-only access · Aria can see balances but can never move money. Disconnect anytime.</p>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg z-50"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.08))' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
