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
}

interface AllStatus {
  square: ConnStatus
  shopify: ConnStatus
  lightspeed: ConnStatus
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

export default function IntegrationsPage() {
  const [status, setStatus] = useState<AllStatus | null>(null)
  const [toast, setToast] = useState('')
  const [syncing, setSyncing] = useState<string | null>(null)
  const [shopInput, setShopInput] = useState('')
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
    if (connected) showToast(`Connected successfully!`)
    if (error) showToast(`Connection failed: ${error.replace(/_/g, ' ')}`)
    loadStatus()
  }, [loadStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async (platform: 'square' | 'shopify') => {
    setSyncing(platform)
    const r = await fetch(`/api/integrations/${platform}/sync`, { method: 'POST' })
    const j = await r.json() as { error?: string; products?: number; customers?: number }
    setSyncing(null)
    if (r.ok) {
      showToast(`${platform} sync complete — ${(j.products ?? 0)} products, ${(j.customers ?? 0)} customers`)
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
    const j = await r.json() as { imported?: number; skipped?: number; errors?: string[] }
    setImporting(false)
    setCsvFile(null)
    if (fileRef.current) fileRef.current.value = ''
    showToast(`Imported ${j.imported ?? 0} products${j.skipped ? ` (${j.skipped} skipped)` : ''}`)
    loadStatus()
  }

  const sq = status?.square
  const sh = status?.shopify
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
        <div className="rounded-xl p-5 space-y-4"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                style={{ background: 'rgba(255,255,255,0.08)' }}>SQ</div>
              <div>
                <p className="font-medium">Square</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Products · Customers · 12mo Sales</p>
              </div>
            </div>
            {sq?.connected ? (
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${statusDot(sq.sync_status)}`} />
                <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  {sq.sync_status === 'syncing' ? 'Syncing…' : 'Connected'}
                </span>
              </div>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>
                Not connected
              </span>
            )}
          </div>

          {sq?.connected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Products', val: sq.counts?.products ?? sq.product_count ?? 0 },
                  { label: 'Customers', val: sq.counts?.customers ?? 0 },
                  { label: 'Sales', val: sq.counts?.sales ?? 0 },
                ].map(c => (
                  <div key={c.label} className="text-center rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <div className="text-sm font-medium">{c.val.toLocaleString()}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{c.label}</div>
                  </div>
                ))}
              </div>
              {sq.last_synced_at && (
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  Last synced {timeAgo(sq.last_synced_at)}
                </p>
              )}
              {sq.sync_error && (
                <p className="text-xs text-red-400 truncate">{sq.sync_error}</p>
              )}
              <button onClick={() => sync('square')} disabled={syncing === 'square'}
                className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#2D5240', color: '#7FB897' }}>
                {syncing === 'square' ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                Authorise Square once and Aria pulls all your products, customers, and 12 months of sales — automatically.
              </p>
              <a href="/api/integrations/square/connect"
                className="block text-center py-2 rounded-lg text-sm font-medium"
                style={{ background: '#2D5240', color: '#7FB897' }}>
                Connect Square →
              </a>
            </div>
          )}
        </div>

        {/* Shopify */}
        <div className="rounded-xl p-5 space-y-4"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                style={{ background: 'rgba(149,191,71,0.15)', color: '#95bf47' }}>SH</div>
              <div>
                <p className="font-medium">Shopify</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  {sh?.connected ? (sh.shop_name ?? sh.store_url ?? 'Connected') : 'Products · Customers'}
                </p>
              </div>
            </div>
            {sh?.connected ? (
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${statusDot(sh.sync_status)}`} />
                <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Connected</span>
              </div>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>
                Not connected
              </span>
            )}
          </div>

          {sh?.connected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Products', val: sh.counts?.products ?? sh.product_count ?? 0 },
                  { label: 'Customers', val: sh.counts?.customers ?? 0 },
                ].map(c => (
                  <div key={c.label} className="text-center rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <div className="text-sm font-medium">{c.val.toLocaleString()}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{c.label}</div>
                  </div>
                ))}
              </div>
              {sh.last_synced_at && (
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Last synced {timeAgo(sh.last_synced_at)}</p>
              )}
              <button onClick={() => sync('shopify')} disabled={syncing === 'shopify'}
                className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#2D5240', color: '#7FB897' }}>
                {syncing === 'shopify' ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                Enter your Shopify store URL to connect.
              </p>
              <div className="flex gap-2">
                <input type="text" placeholder="yourstore.myshopify.com" value={shopInput}
                  onChange={e => setShopInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
                <a href={shopInput ? `/api/integrations/shopify/connect?shop=${encodeURIComponent(shopInput)}` : '#'}
                  className="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
                  style={{ background: shopInput ? '#2D5240' : 'rgba(255,255,255,0.04)', color: shopInput ? '#7FB897' : 'var(--text-secondary, #A8B5A8)', pointerEvents: shopInput ? 'auto' : 'none' }}>
                  Connect →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* CSV Import */}
        <div className="rounded-xl p-5 space-y-4"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-medium"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>CSV</div>
            <div>
              <p className="font-medium">Universal CSV Import</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                Any POS export · {(csv?.product_count ?? 0).toLocaleString()} products imported
              </p>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Works with Lightspeed, Vend, Shopfront, and any standard CSV export. Headers are auto-detected.
          </p>
          <div className="space-y-2">
            <input type="file" accept=".csv,text/csv" ref={fileRef}
              onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded file:text-xs file:font-medium file:cursor-pointer"
              style={{ color: 'var(--text-secondary, #A8B5A8)' }} />
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
        <div className="rounded-xl p-5 space-y-4"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                style={{ background: 'rgba(45,82,64,0.4)', color: '#7FB897' }}>A</div>
              <div>
                <p className="font-medium">Aria POS</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Built-in — always connected</p>
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Active</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Your built-in POS data is always available. All transactions are analysed automatically.
          </p>
          <Link href="/pos" className="block text-center py-2 rounded-lg text-sm"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary, #A8B5A8)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
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
