'use client'
import { Booking } from './types'

const STATUS_COLOR: Record<string, string> = { confirmed: '#7FB897', pending: '#f59e0b', cancelled: '#ef4444', no_show: '#6b7280', completed: '#A8B5A8' }

export function BookingCard({ b, onStatus, onRemind, sending, onClick }: {
  b: Booking
  onStatus: (id: string, s: string) => void
  onRemind: (b: Booking) => void
  sending: boolean
  onClick?: (b: Booking) => void
}) {
  const sc = STATUS_COLOR[b.status] || '#888'
  const C = { green: '#7FB897', amber: '#f59e0b', red: '#ef4444', muted: 'var(--text-secondary,#A8B5A8)', text: '#F0F4F0', border: 'rgba(127,184,151,0.15)', card: 'var(--bg-surface)' }

  function fmtTime(t: string | null) { if (!t) return '—'; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m}${hr >= 12 ? 'pm' : 'am'}` }

  return (
    <div
      onClick={() => onClick?.(b)}
      style={{ background: C.card, borderRadius: 12, padding: '14px 18px', marginBottom: 8, borderLeft: '3px solid ' + sc, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{b.customer_name}</p>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: sc + '20', color: sc, fontWeight: 600, textTransform: 'capitalize' as const }}>{b.status}</span>
          {b.booking_services && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: b.booking_services.color + '20', color: b.booking_services.color }}>📋 {b.booking_services.name}</span>}
          {b.no_show_score !== null && b.no_show_score !== undefined && b.no_show_score >= 70 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', color: C.red, fontWeight: 600 }}>⚠ No-show risk {b.no_show_score}%</span>}
          {b.reminder_sent_at && <span style={{ fontSize: 10, color: C.muted }}>✉️ reminder sent</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: C.muted }}>
          <span>📅 {new Date(b.booking_date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          {b.booking_time && <span>🕐 {fmtTime(b.booking_time)}</span>}
          <span>👥 {b.party_size} {b.party_size === 1 ? 'person' : 'people'}</span>
          {b.customer_phone && <span>📱 {b.customer_phone}</span>}
        </div>
        {b.notes && <p style={{ fontSize: 12, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>"{b.notes}"</p>}
      </div>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {b.status === 'confirmed' && !b.reminder_sent_at && b.customer_phone && (
          <button onClick={() => onRemind(b)} disabled={sending}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)', cursor: 'pointer', minHeight: 32 }}>
            {sending ? 'Sending…' : '📱 Send reminder'}
          </button>
        )}
        {b.status === 'confirmed' && (
          <button onClick={() => onStatus(b.id, 'completed')}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(127,184,151,0.1)', color: C.green, border: '1px solid rgba(127,184,151,0.25)', cursor: 'pointer', minHeight: 32 }}>
            ✓ Complete
          </button>
        )}
        {b.status !== 'cancelled' && b.status !== 'completed' && (
          <button onClick={() => onStatus(b.id, 'cancelled')}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: C.red, border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', minHeight: 32 }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
