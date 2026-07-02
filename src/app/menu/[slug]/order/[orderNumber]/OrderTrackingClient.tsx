'use client'
import { useState, useEffect } from 'react'

// ── Status → timeline step mapping ───────────────────────────────────────────

type StepKey = 'received' | 'preparing' | 'ready' | 'enjoy'

const STEPS: Array<{ key: StepKey; label: string; icon: string }> = [
  { key: 'received',  label: 'Order received',  icon: '📋' },
  { key: 'preparing', label: 'Preparing',        icon: '👨‍🍳' },
  { key: 'ready',     label: 'Ready!',           icon: '🎉' },
  { key: 'enjoy',     label: 'Enjoy',            icon: '😊' },
]

function statusToStep(status: string): number {
  if (status === 'completed') return 4
  if (status === 'ready')     return 3
  if (status === 'preparing') return 2
  return 1  // pending / accepted / confirmed
}

function isCancelled(status: string) {
  return status === 'cancelled' || status === 'rejected'
}

// ── ETA countdown ─────────────────────────────────────────────────────────────

function useCountdown(estimatedReadyAt: string | null) {
  const [secsLeft, setSecsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!estimatedReadyAt) return
    function calc() {
      const diff = Math.floor((new Date(estimatedReadyAt!).getTime() - Date.now()) / 1000)
      setSecsLeft(diff)
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [estimatedReadyAt])

  return secsLeft
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackItem {
  product_name?: string
  quantity?: number
  unit_price?: number
  modifiers?: { name: string }[]
  config?: { mode?: string; removed?: { name: string }[] }
}

interface Props {
  orderId: string
  initialStatus: string
  orderNumber: string
  customerName: string
  total: number
  estimatedReadyAt: string | null
  createdAt: string
  items: unknown[]
  fulfillmentType: string
  notes: string | null
  businessName: string
  slug: string
}

// ── Component ─────────────────────────────────────────────────────────────────

const LIME   = '#d9f54e'
const FOREST = '#0e1a0f'
const CARD   = '#182019'
const MUTED  = '#7a9b7c'
const WHITE  = '#f0f5f0'

export default function OrderTrackingClient({
  initialStatus, orderNumber, customerName, total,
  estimatedReadyAt: initialEta, items, fulfillmentType, notes, businessName, slug,
}: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [eta, setEta] = useState(initialEta)

  const currentStep = statusToStep(status)
  const cancelled = isCancelled(status)
  const secsLeft  = useCountdown(eta)

  // 5-second poll for live status updates
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/public/order-track/' + orderNumber + '?slug=' + encodeURIComponent(slug))
        if (!res.ok) return
        const d = await res.json() as { status?: string; estimated_ready_at?: string | null }
        if (!cancelled) {
          if (d.status) setStatus(d.status)
          if (d.estimated_ready_at !== undefined) setEta(d.estimated_ready_at ?? null)
        }
      } catch (_) {}
    }
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [orderNumber, slug])

  const castItems = items as TrackItem[]

  function fmtEta() {
    if (secsLeft === null) return '~15 min'
    if (secsLeft <= 0) return 'any moment now'
    const m = Math.floor(secsLeft / 60)
    const s = secsLeft % 60
    return m > 0 ? m + ' min ' + s + 's' : s + 's'
  }

  return (
    <div style={{ minHeight: '100dvh', background: FOREST, color: WHITE, fontFamily: 'Inter, sans-serif', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ padding: '28px 20px 20px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{businessName}</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: LIME, fontFamily: 'Fraunces, serif', fontStyle: 'italic', letterSpacing: '-0.01em' }}>{orderNumber}</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{'for ' + customerName + ' · ' + (fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup')}</div>
      </div>

      {/* Cancelled state */}
      {cancelled && (
        <div style={{ margin: '32px 20px', padding: '24px 20px', borderRadius: 16, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✗</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', marginBottom: 6 }}>Order {status}</div>
          <div style={{ fontSize: 13, color: MUTED }}>Please contact the venue if you have questions.</div>
        </div>
      )}

      {/* ETA countdown */}
      {!cancelled && status !== 'completed' && (
        <div style={{ margin: '24px 20px 0', padding: '20px', borderRadius: 16, background: CARD, textAlign: 'center', border: '1px solid rgba(217,245,78,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            {status === 'ready' ? 'Ready now!' : 'Estimated wait'}
          </div>
          {status === 'ready' ? (
            <div style={{ fontSize: 36, fontWeight: 900, color: LIME }}>🎉</div>
          ) : (
            <div style={{ fontSize: 36, fontWeight: 900, color: LIME, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{fmtEta()}</div>
          )}
        </div>
      )}

      {/* Vertical timeline */}
      {!cancelled && (
        <div style={{ margin: '28px 20px 0', padding: '24px 20px', borderRadius: 16, background: CARD }}>
          {STEPS.map((step, i) => {
            const stepNum = i + 1
            const done    = currentStep > stepNum
            const active  = currentStep === stepNum
            const upcoming = currentStep < stepNum
            return (
              <div key={step.key} style={{ display: 'flex', gap: 16, paddingBottom: i < STEPS.length - 1 ? 24 : 0, position: 'relative' }}>
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div style={{ position: 'absolute', left: 15, top: 32, width: 2, height: 24, background: done ? LIME : 'rgba(255,255,255,0.08)' }} />
                )}
                {/* Dot */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: done ? LIME : active ? LIME + '22' : 'transparent',
                  border: '2px solid ' + (done || active ? LIME : 'rgba(255,255,255,0.12)'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14,
                }}>
                  {done ? '✓' : upcoming ? '' : step.icon}
                </div>
                {/* Label */}
                <div style={{ paddingTop: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: active ? 800 : done ? 700 : 500, color: done || active ? WHITE : MUTED }}>
                    {step.label}
                  </div>
                  {active && (
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>in progress</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Order summary */}
      {castItems.length > 0 && (
        <div style={{ margin: '16px 20px 0', padding: '20px', borderRadius: 16, background: CARD }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Order summary</div>
          {castItems.map((item, idx) => (
            <div key={idx} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: idx < castItems.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>
                  {item.quantity && item.quantity > 1 ? item.quantity + ' × ' : ''}{item.product_name ?? 'Item'}
                </div>
                <div style={{ fontSize: 13, color: LIME, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 12 }}>
                  {'A$' + ((Number(item.unit_price ?? 0) * (item.quantity ?? 1)).toFixed(2))}
                </div>
              </div>
              {item.config?.removed && item.config.removed.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {item.config.removed.map((r, ri) => (
                    <span key={ri} style={{ fontSize: 10, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {'NO ' + r.name.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
              {item.modifiers && item.modifiers.length > 0 && (
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{item.modifiers.map(m => m.name).join(', ')}</div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: WHITE }}>Total</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: LIME, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{'A$' + total.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div style={{ margin: '12px 20px 0', padding: '14px 16px', borderRadius: 12, background: CARD, fontSize: 12, color: MUTED }}>
          <span style={{ fontWeight: 700, color: WHITE }}>Note: </span>{notes}
        </div>
      )}

      {/* Powered by */}
      <div style={{ textAlign: 'center', fontSize: 11, color: MUTED + '88', marginTop: 32, letterSpacing: '0.05em' }}>Powered by Aria</div>
    </div>
  )
}