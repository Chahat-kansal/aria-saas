'use client'
import { useEffect, useState } from 'react'
import type { KdsTicket } from '@/lib/pos/kds-types'

interface TicketCardProps {
  ticket: KdsTicket & { product_name?: string; allergens?: string[] | null }
  show_modifiers: boolean
  show_allergens: boolean
  onBump: () => Promise<void>
  onUnfire: () => Promise<void>
  onExpedite: () => Promise<void>
}

function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function TicketCard({ ticket, show_modifiers, show_allergens, onBump, onUnfire, onExpedite }: TicketCardProps) {
  const [now, setNow] = useState(Date.now())
  const [bumping, setBumping] = useState(false)

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  const elapsed = Math.max(0, (now - Date.parse(ticket.fired_at)) / 1000)
  const prep = Number(ticket.prep_time_seconds) || 180
  const progress = (elapsed / prep) * 100
  const urgency: 'on-time' | 'warning' | 'overdue' =
    progress > 100 ? 'overdue' : progress > 50 ? 'warning' : 'on-time'

  const borderColor = urgency === 'overdue' ? 'border-red-500' : urgency === 'warning' ? 'border-yellow-400' : 'border-emerald-400'

  const handleBump = async () => {
    if (bumping) return
    setBumping(true)
    try { await onBump() } finally { setBumping(false) }
  }

  return (
    <div className={`bg-[var(--bg-elevated,#1A2620)] border-2 ${borderColor} rounded-lg p-3 flex flex-col gap-2`}>
      <div className="flex justify-between items-baseline">
        <div className="flex items-center gap-2">
          {ticket.expedited && (
            <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-300 rounded font-medium">RUSH</span>
          )}
          <span className="text-lg font-medium text-[var(--text-primary,#E8EDE7)]">
            {ticket.quantity > 1 ? `${ticket.quantity}× ` : ''}{ticket.product_name ?? 'Item'}
          </span>
        </div>
        <span className={`font-mono text-lg ${urgency === 'overdue' ? 'text-red-400' : urgency === 'warning' ? 'text-yellow-300' : 'text-emerald-400'}`}>
          {fmtElapsed(elapsed)}
        </span>
      </div>

      <div className="text-xs text-[var(--text-secondary,#A8B5A8)] flex flex-wrap gap-2">
        {ticket.table_label && <span>{ticket.table_label}</span>}
        {ticket.seat_number != null && <span>Seat {ticket.seat_number}</span>}
        {ticket.course != null && <span>Course {ticket.course}</span>}
      </div>

      {show_modifiers && ticket.modifiers_summary && (
        <div className="text-sm text-[var(--text-primary,#E8EDE7)] bg-black/20 rounded px-2 py-1">
          {ticket.modifiers_summary}
        </div>
      )}

      {ticket.notes && (
        <div className="text-sm italic text-[var(--text-secondary,#A8B5A8)]">Note: {ticket.notes}</div>
      )}

      {show_allergens && Array.isArray(ticket.allergens) && (ticket.allergens as string[]).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(ticket.allergens as string[]).map(a => (
            <span key={a} className="text-xs px-2 py-0.5 bg-red-500/20 text-red-300 rounded">⚠ {a}</span>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-1">
        {ticket.status === 'fired' && (
          <button onClick={() => onUnfire()} className="flex-1 py-2 text-sm bg-[rgba(255,255,255,0.06)] border border-[rgba(127,184,151,0.2)] rounded hover:bg-[rgba(255,255,255,0.1)]">
            Start
          </button>
        )}
        <button onClick={handleBump} disabled={bumping} className="flex-[2] py-3 text-base font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50">
          Bump
        </button>
        {!ticket.expedited && (
          <button onClick={() => onExpedite()} className="px-3 py-2 text-sm bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded">
            Rush
          </button>
        )}
      </div>
    </div>
  )
}
