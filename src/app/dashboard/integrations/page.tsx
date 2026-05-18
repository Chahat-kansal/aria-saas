'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

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
  const [status, setStatus] = useState<AllStatus | null>(null)
  const [toast, setToast] = useState('')
  const [syncing, setSyncing] = useState<string | null>(null)
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected') ?? params.get('success')
    const error = params.get('error')
    if (connected) showToast('Connected successfully!')
    if (error) showToast(`Connection failed: ${error.replace(/_/g, ' ')}`)
    loadStatus()
  }, [loadStatus]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setImporting(false)
    setCsvFile(null)
    if (fileRef.current) fileRef.current.value = ''
    showToast(`Imported ${j.imported ?? 0} products${j.skipped ? ` (${j.skipped} skipped)` : ''}`)
    loadStatus()
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
              <div>
                <p className="font-medium">Square</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Products · Customers · 12mo Sales</p>
              </div>
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
              <div>
                <p className="font-medium">Shopify</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{sh?.connected ? (sh.shop_name ?? sh.store_url ?? 'Connected') : 'Products · Customers'}</p>
              </div>
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
              <div>
                <p className="font-medium">Lightspeed X-Series</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{lsX?.connected ? (lsX.domain_prefix ?? 'Connected') : 'Products · Customers · Sales'}</p>
              </div>
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
              <div>
                <p className="font-medium">Lightspeed Kounta</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Hospitality O-Series</p>
              </div>
            </div>
            {kounta?.connected
              ? <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${statusDot(kounta.sync_status)}`} /><span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Connected</span></div>
              : <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                  {kounta?.kounta_available ? 'Available' : 'Coming soon'}
                </span>}
          </div>
          {kounta?.connected
            ? <SyncMeta conn={kounta} onSync={() => sync('kounta')} syncing={syncing === 'kounta'} />
            : <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  {kounta?.kounta_available
                    ? 'Connect your Kounta account to sync products and customers.'
                    : 'Kounta integration is pending API certification approval. Check back soon.'}
                </p>
                {kounta?.kounta_available && (
                  <a href="/api/integrations/kounta/connect" className="block text-center py-2 rounded-lg text-sm font-medium" style={{ background: '#2D5240', color: '#7FB897' }}>
                    Connect Kounta →
                  </a>
                )}
              </div>}
        </div>

        {/* CSV Import */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-medium" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>CSV</div>
            <div>
              <p className="font-medium">Universal CSV Import</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Any POS export · {(csv?.product_count ?? 0).toLocaleString()} products imported</p>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Works with Shopfront, Vend, and any standard CSV. Headers auto-detected.</p>
          <div className="space-y-2">
            <input type="file" accept=".csv,text/csv" ref={fileRef} onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }} />
            {csvFile && (
              <button onClick={importCsv} disabled={importing}
                className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#2D5240', color: '#7FB897' }}>
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
              <div>
                <p className="font-medium">Aria POS</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Built-in — always connected</p>
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Active</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>All transactions are analysed automatically.</p>
          <Link href="/pos" className="block text-center py-2 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary, #A8B5A8)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            Open Aria POS →
          </Link>
        </div>

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
