'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * MS16 PHASE 5 — the blue-outlined proposal card, on the contract's own class names
 * (.prop .ph .pb .ord .oh .li .tt .pf .go .gh .kb .done). Not one of them is re-authored.
 *
 * IT CREATES NO NEW APPROVAL PATH AND MOVES NO MONEY. Approve posts to `/api/aria/ask/action` with
 * `intent: 'confirm'` — the SAME endpoint the current UI already calls, behind the same kill switch,
 * role gate and mass-confirm guard MS13 hardened. This is a new way to LOOK at a pending decision,
 * not a new way to make one happen.
 *
 * THE TOTAL IS HONEST: priced lines only, with unpriced lines counted beside it ("+ 1 unpriced"),
 * never folded in as $0.00. A total that silently swallows unknowns is what an owner approves
 * without knowing what they approved.
 */

export interface ProposalLine { label: string; detail?: string; amount?: number | null }

export interface ProposalCardProps {
  title: string
  body?: string
  supplier?: string
  lines: ProposalLine[]
  /** Priced-lines-only total, in dollars. null when NOTHING is priced. */
  total: number | null
  unpricedCount?: number
  conversationId: string | null
  expiresLabel?: string
  onApproved?: (result: unknown) => void
  onDismiss?: () => void
}

const money = (n: number) =>
  '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ProposalCard({
  title, body, supplier, lines, total, unpricedCount = 0,
  conversationId, expiresLabel, onApproved, onDismiss,
}: ProposalCardProps) {
  const [state, setState] = useState<'pending' | 'working' | 'approved' | 'error'>('pending')
  const [message, setMessage] = useState<string | null>(null)

  const approve = useCallback(async () => {
    if (state === 'working' || state === 'approved') return
    if (!conversationId) {
      setState('error')
      setMessage('This proposal is not attached to a conversation, so it cannot be approved.')
      return
    }
    setState('working')
    setMessage(null)
    try {
      // THE EXISTING ENDPOINT. Repointing this is what the phase's mutation check catches.
      const res = await fetch('/api/aria/ask/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'confirm', message: 'confirm', conversation_id: conversationId }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok || data.error) {
        setState('error')
        setMessage(data.error ?? 'That could not be approved just now — nothing has changed.')
        return
      }
      setState('approved')
      onApproved?.(data)
    } catch (e) {
      setState('error')
      setMessage((e as Error).message + ' — nothing has changed.')
    }
  }, [conversationId, onApproved, state])

  // ⌘↵ / Ctrl+↵, per the contract's .kb hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void approve() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [approve])

  const approved = state === 'approved'

  return (
    <div className="prop" style={approved ? { borderColor: 'var(--blue-b)' } : undefined}>
      <div className="ph">
        <span className="d">✦</span>
        <b>{approved ? 'Approved' : title}</b>
        {expiresLabel && !approved && <em>{expiresLabel}</em>}
      </div>

      {body && <div className="pb">{body}</div>}

      {lines.length > 0 && (
        <div className="ord">
          <div
            className="oh"
            style={approved
              ? { background: 'var(--blue-l)', color: 'var(--blue-d)' }
              : undefined}
          >{approved ? '✓ Approved' : '⚑ Awaiting you'}</div>

          {supplier && <div className="li"><span>{supplier}</span><span /></div>}

          {lines.map((l, i) => (
            <div className="li" key={l.label + i}>
              <span>{l.label}</span>
              {/* An unpriced line says so. It never shows $0.00. */}
              <span>{l.amount != null ? money(l.amount) : (l.detail ?? 'no recorded cost')}</span>
            </div>
          ))}

          <div className="tt">
            <span style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>Order total</span>
            <span>
              <b>{total != null ? money(total) : 'Not known'}</b>
              {unpricedCount > 0 && <em> + {unpricedCount} unpriced</em>}
            </span>
          </div>
        </div>
      )}

      {approved ? (
        <div className="done" style={{ display: 'block' }}>
          ✓ Approved — it&apos;s in your queue. Nothing was sent to a supplier.
        </div>
      ) : (
        <div className="pf">
          <button className="go" onClick={approve} disabled={state === 'working'}>
            {state === 'working' ? 'Approving…' : 'Approve'}
          </button>
          <button className="gh" onClick={onDismiss}>Edit</button>
          <button className="gh" onClick={onDismiss}>Not now</button>
          <span className="kb">⌘↵</span>
        </div>
      )}

      {message && <div className="pb errline">{message}</div>}
    </div>
  )
}
