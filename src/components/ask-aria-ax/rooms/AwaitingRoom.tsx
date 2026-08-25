'use client'
import type { ReactNode } from 'react'
import type { AxContext } from '@/lib/aria/ax-context-types'

/**
 * The "Awaiting you" room.
 *
 * Real: it renders the pending rows of `aria_actions`, which held 55 pending decisions for Sip when
 * this was written and is written to daily. The tab badge is a live server-side COUNT of those rows.
 *
 * ⚠️ ONE .ax-room, AND ONLY ONE. This component owns the room's scroll container. The first version
 * was wrapped in a second `<div className="ax-room">` by its caller so the audit log could sit
 * beside it, and because `.ax-room` is `flex:1` + `overflow-y:auto` + padding, nesting two of them
 * produced two competing scroll areas — the content collapsed to a sliver with a dead white gap
 * below it, which is what the founder saw on screen. Extra content now comes in as `children`, so
 * there is exactly one container.
 *
 * It deliberately does NOT approve anything from here: approval runs through the proposal card and
 * the existing `/api/aria/ask/action` endpoint. A second approval path is what MS16 phase 5 exists
 * to prevent.
 */

export interface AwaitingRoomProps {
  ctx: AxContext | null
  loading?: boolean
  unreadable?: boolean
  onPrompt: (prompt: string) => void
  /** Rendered inside this room's single container — e.g. the audit log. */
  children?: ReactNode
}

export default function AwaitingRoom({ ctx, loading, unreadable, onPrompt, children }: AwaitingRoomProps) {
  if (loading) {
    return <div className="ax-room"><div className="ax-room-note">Reading what&apos;s waiting…</div></div>
  }

  if (unreadable || !ctx) {
    return (
      <div className="ax-room">
        <div className="ax-room-note warn">
          Your decisions couldn&apos;t be read just now, so this is showing nothing rather than
          guessing. That&apos;s a problem at our end, not an empty queue.
        </div>
        {children}
      </div>
    )
  }

  const shown = ctx.awaiting.length
  const total = ctx.awaitingTotal

  return (
    <div className="ax-room">
      <div className="ax-room-h">
        Awaiting you
        {total > 0 && <span>{total}</span>}
      </div>

      {total === 0 ? (
        <div className="ax-room-note">Nothing is waiting on you.</div>
      ) : (
        <>
          {/* Say plainly that this is a page, not the whole queue. Showing six of fifty-five
              without saying so is how a count turns into a wrong impression. */}
          {total > shown && (
            <div className="ax-room-note">
              Showing the {shown} most recent of {total}.
            </div>
          )}

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
        </>
      )}

      {children}
    </div>
  )
}
