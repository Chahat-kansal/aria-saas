'use client'

export interface SalesFilters {
  starts_at: string
  ends_at: string
  status: string
  payment_method: string
  search: string
}

interface Props {
  filters: SalesFilters
  setFilters: (f: SalesFilters) => void
  onApply: () => void
}

export default function SalesHistoryFilters({ filters, setFilters, onApply }: Props) {
  function set(key: keyof SalesFilters, val: string) {
    setFilters({ ...filters, [key]: val })
  }
  return (
    <div className="flex flex-wrap gap-3 p-4 rounded-2xl" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
      <div className="flex flex-col gap-1 min-w-[140px]">
        <label className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>From</label>
        <input
          type="date"
          value={filters.starts_at.slice(0, 10)}
          onChange={e => set('starts_at', e.target.value ? new Date(e.target.value).toISOString() : '')}
          className="rounded-xl px-3 py-1.5 text-sm"
          style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }}
        />
      </div>
      <div className="flex flex-col gap-1 min-w-[140px]">
        <label className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>To</label>
        <input
          type="date"
          value={filters.ends_at.slice(0, 10)}
          onChange={e => set('ends_at', e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : '')}
          className="rounded-xl px-3 py-1.5 text-sm"
          style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }}
        />
      </div>
      <div className="flex flex-col gap-1 min-w-[130px]">
        <label className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Status</label>
        <select
          value={filters.status}
          onChange={e => set('status', e.target.value)}
          className="rounded-xl px-3 py-1.5 text-sm"
          style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }}
        >
          <option value="">All</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
          <option value="refunded">Refunded</option>
          <option value="parked">Parked</option>
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-[130px]">
        <label className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Payment</label>
        <select
          value={filters.payment_method}
          onChange={e => set('payment_method', e.target.value)}
          className="rounded-xl px-3 py-1.5 text-sm"
          style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }}
        >
          <option value="">All</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="gift_card">Gift card</option>
          <option value="split">Split</option>
        </select>
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
        <label className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Search</label>
        <input
          type="text"
          value={filters.search}
          onChange={e => set('search', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onApply()}
          placeholder="Sale # or customer"
          className="rounded-xl px-3 py-1.5 text-sm"
          style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }}
        />
      </div>
      <div className="flex flex-col gap-1 justify-end">
        <button onClick={onApply} className="rounded-xl px-4 py-1.5 text-sm font-semibold" style={{ background: '#2D5240', color: '#7FB897' }}>
          Apply
        </button>
      </div>
    </div>
  )
}
