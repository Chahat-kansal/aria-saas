'use client'
import type { AxContext } from '@/lib/aria/ax-context-types'

/**
 * MS17 PHASE 3 — the "Awaiting you" room.
 *
 * Real: it renders the pending rows of `aria_actions`, which holds 409 rows for Sip (54 pending) and
 * was written to today. The tab's badge is a live count of exactly these rows — never a constant.
 *
 * Clicking an item asks Aria about it, which is the same path the noticed cards use. It deliberately
 * does NOT approve anything from here: approval runs through the proposal card and the existing
 * `/api/aria/ask/action` endpoint, and adding a second approval path is precisely what MS16 phase 5
 * was written to prevent.
 */

export interface AwaitingRoomProps {
  ctx: AxContext | null
  loading?: boolean
  unreadable?: boolean
  onPrompt: (prompt: string) => void
}

export default function AwaitingRoom({ ctx, loading, unreadable, onPrompt }: AwaitingRoomProps) {
  if (loading) return <div className="ax-room"><div className="ax-room-note">Reading what&apos;s waiting…</div></div>

  if (unreadable || !ctx) {
    return (
      <div className="ax-room">
        <div className="ax-room-note warn">
          Your decisions couldn&apos;t be read just now, so this is showing nothing rather than
          guessing. That&apos;s a problem at our end, not an empty queue.
        </div>
      </div>
    )
  }

  if (ctx.awaiting.length === 0) {
    return (
      <div className="ax-room">
        <div className="ax-room-note">Nothing is waiting on you.</div>
      </div>
    )
  }

  return (
    <div className="ax-room">
      <div className="ax-room-h">Awaiting you<span>{ctx.awaiting.length}</span></div>
      {ctx.awaiting.map(a => (
        <button className="nt" key={a.id} onClick={() => onPrompt(a.prompt)}>
          <span className={a.tone === 'amber' ? 'p' : 'p c'} />
          <span>
            <span className="h">{a.title}</span>
            {a.subtitle && <span className="s">{a.subtitle}</span>}
          </span>
          <span className="arrow">→</span>
        </button>
      ))}
    </div>
  )
}
