'use client'

interface SyncCardProps {
  name: string
  icon: string
  connected: boolean
  syncStatus?: string
  lastSyncedAt?: string | null
  syncError?: string | null
  productCount?: number
  customerCount?: number
  onSync?: () => void
  syncing?: boolean
  connectHref?: string
  children?: React.ReactNode
}

function statusColor(s?: string) {
  if (s === 'connected' || s === 'synced') return '#22c55e'
  if (s === 'syncing') return '#f59e0b'
  if (s === 'error') return '#ef4444'
  return '#6b7280'
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

export function SyncCard({
  name, icon, connected, syncStatus, lastSyncedAt, syncError,
  productCount, customerCount, onSync, syncing, connectHref, children,
}: SyncCardProps) {
  return (
    <div className="rounded-xl p-5 space-y-4"
      style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--text-primary, #E8EDE7)' }}>
            {icon}
          </div>
          <p className="font-medium" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{name}</p>
        </div>
        {connected ? (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full"
              style={{ background: statusColor(syncStatus), boxShadow: syncStatus === 'syncing' ? `0 0 6px ${statusColor(syncStatus)}` : 'none' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              {syncStatus === 'syncing' ? 'Syncing…' : 'Connected'}
            </span>
          </div>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #A8B5A8)' }}>
            Not connected
          </span>
        )}
      </div>

      {connected ? (
        <div className="space-y-2">
          {(productCount !== undefined || customerCount !== undefined) && (
            <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              {productCount !== undefined && <span>{productCount.toLocaleString()} products</span>}
              {customerCount !== undefined && <span>{customerCount.toLocaleString()} customers</span>}
            </div>
          )}
          {lastSyncedAt && (
            <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              Last synced {timeAgo(lastSyncedAt)}
            </p>
          )}
          {syncError && <p className="text-xs text-red-400 truncate">{syncError}</p>}
          {onSync && (
            <button onClick={onSync} disabled={syncing}
              className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: '#2D5240', color: '#7FB897' }}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {children}
          {connectHref && (
            <a href={connectHref}
              className="block text-center py-2 rounded-lg text-sm font-medium"
              style={{ background: '#2D5240', color: '#7FB897' }}>
              Connect {name} →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
