'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ── Pipel design tokens ───────────────────────────────────────────────────────

const CANVAS = '#fafafa'
const WHITE  = '#ffffff'
const INK    = '#0a0a0a'
const LIME   = '#d9f54e'
const MUTED  = '#6b7280'
const BORDER = '#e5e7eb'
const SANS   = "'Outfit', 'Inter', system-ui, sans-serif"
const SERIF  = "'Cormorant', 'Georgia', serif"

// ── Status → timeline step mapping ───────────────────────────────────────────

type StepKey = 'received' | 'preparing' | 'ready' | 'enjoy'

const STEPS: Array<{ key: StepKey; label: string; sublabel?: string }> = [
  { key: 'received',  label: 'Order received'   },
  { key: 'preparing', label: 'Preparing'         },
  { key: 'ready',     label: 'Ready for pickup'  },
  { key: 'enjoy',     label: 'Picked up ✓'       },
]

function statusToStep(status: string): number {
  if (status === 'completed') return 5
  if (status === 'ready')     return 3
  if (status === 'preparing') return 2
  return 1  // pending / accepted / confirmed
}

function isCancelled(status: string) {
  return status === 'cancelled' || status === 'rejected'
}

// ── Monotonic rank — status can only advance, never revert ────────────────────
// Stale poll responses arriving after a Realtime push are silently dropped.
const STATUS_RANK: Record<string, number> = {
  pending: 0, accepted: 1, confirmed: 1,
  preparing: 2, ready: 3, completed: 4,
  cancelled: 99, rejected: 99,
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
  initialPickedUpAt: string | null
  /** S-ORD-CONFIRM — stripe_payment_status from the order ROW, so the first paint is already truthful. */
  initialPaymentStatus?: string | null
}

// ── Food emoji helper ─────────────────────────────────────────────────────────

function itemEmoji(name?: string): string {
  if (!name) return '🍽️'
  const n = name.toLowerCase()
  if (n.includes('burger') || n.includes('stack') || n.includes('beef') || n.includes('patty')) return '🍔'
  if (n.includes('coffee') || n.includes('latte') || n.includes('flat') || n.includes('cappuccino') || n.includes('espresso')) return '☕'
  if (n.includes('cake') || n.includes('sweet') || n.includes('dessert')) return '🍰'
  if (n.includes('salad') || n.includes('bowl')) return '🥗'
  if (n.includes('pizza')) return '🍕'
  if (n.includes('pasta') || n.includes('noodle')) return '🍝'
  if (n.includes('juice') || n.includes('smoothie') || n.includes('shake')) return '🥤'
  if (n.includes('croissant') || n.includes('pastry') || n.includes('bread')) return '🥐'
  if (n.includes('chicken')) return '🍗'
  return '🍽️'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrderTrackingClient({
  orderId, initialStatus, orderNumber, customerName, total,
  estimatedReadyAt: initialEta, items, fulfillmentType, notes, businessName, slug, initialPickedUpAt,
  initialPaymentStatus,
}: Props) {
  const [status, setStatus] = useState(initialStatus)
  // S-ORD-CONFIRM — 'succeeded' | 'pending' | null(cash). Drives the never-pay-twice banner.
  const [paymentStatus, setPaymentStatus] = useState<string | null>(initialPaymentStatus ?? null)
  const [eta, setEta] = useState(initialEta)
  const [completedAt, setCompletedAt] = useState<string | null>(initialStatus === 'completed' ? initialPickedUpAt : null)

  // doneRef: true once we hit a terminal state — shared across both effects
  const doneRef   = useRef(initialStatus === 'completed' || isCancelled(initialStatus))
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  // rankRef: highest STATUS_RANK seen — prevents stale poll from reverting Realtime state
  const rankRef   = useRef(STATUS_RANK[initialStatus] ?? 0)
  // loggedRef: one-time diagnostic — confirms REPLICA IDENTITY FULL delivers all columns
  const loggedRef = useRef(false)

  const currentStep = statusToStep(status)
  const cancelled   = isCancelled(status)
  const secsLeft    = useCountdown(eta)

  // Load Outfit + Cormorant fonts
  useEffect(() => {
    for (const [, q] of [
      ['Outfit',    'Outfit:wght@400;600;700;800;900'],
      ['Cormorant', 'Cormorant:ital,wght@1,400;1,700;1,900'],
    ]) {
      const href = 'https://fonts.googleapis.com/css2?family=' + q + '&display=swap'
      if (!document.querySelector('link[href="' + href + '"]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'; link.href = href
        document.head.appendChild(link)
      }
    }
  }, [])

  // Supabase Realtime — instant push on pos_online_orders UPDATE for this order
  useEffect(() => {
    if (doneRef.current) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const ch = supabase
      .channel('order-track:' + orderId)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pos_online_orders', filter: 'id=eq.' + orderId },
        (payload: { new: Record<string, unknown> }) => {
          const newStatus = payload.new.status as string | undefined
          if (!newStatus) return
          if (!loggedRef.current) {
            console.log('[RT] payload.new.status:', newStatus, 'keys:', Object.keys(payload.new))
            loggedRef.current = true
          }
          const newRank = STATUS_RANK[newStatus] ?? -1
          if (newRank < rankRef.current) return  // stale Realtime payload — discard
          rankRef.current = newRank
          setStatus(newStatus)
          if (newStatus === 'completed') {
            const pua = payload.new.picked_up_at as string | null
            if (pua) setCompletedAt(pua)
            doneRef.current = true
          }
          if (isCancelled(newStatus)) doneRef.current = true
          const newEta = payload.new.estimated_ready_at as string | null | undefined
          if (newEta !== undefined) setEta(newEta ?? null)
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] order-track subscription:', status, err)
        }
      })

    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [orderId])

  // Fallback poll every 10 s — catches updates if Realtime is unavailable (e.g. RLS blocks anon)
  // Also fires immediately on mount for instant first-load accuracy
  useEffect(() => {
    if (doneRef.current) return
    let tid: ReturnType<typeof setInterval>

    async function poll() {
      if (doneRef.current) { clearInterval(tid); return }
      try {
        const res = await fetch(
          '/api/public/order-track/' + orderNumber + '?slug=' + encodeURIComponent(slug),
          { cache: 'no-store' }
        )
        if (!res.ok || doneRef.current) return
        const d = await res.json() as { status?: string; estimated_ready_at?: string | null; picked_up_at?: string | null; payment_status?: string | null; has_sale?: boolean }
        // S-ORD-CONFIRM — payment truth comes from the order row, never from a POST response.
        if (d.payment_status !== undefined) setPaymentStatus(d.payment_status ?? null)
        if (d.status) {
          const newRank = STATUS_RANK[d.status] ?? -1
          if (newRank >= rankRef.current) {
            rankRef.current = newRank
            setStatus(d.status)
            if (d.status === 'completed') {
              if (d.picked_up_at) setCompletedAt(d.picked_up_at)
              doneRef.current = true
              clearInterval(tid)
            }
            if (isCancelled(d.status)) {
              doneRef.current = true
              clearInterval(tid)
            }
          }
        }
        if (d.estimated_ready_at !== undefined) setEta(d.estimated_ready_at ?? null)
      } catch (_) {}
    }

    poll()                          // immediate — no 10 s blind spot on mount
    tid = setInterval(poll, 10000)
    return () => { clearInterval(tid) }
  }, [orderNumber, slug])

  const castItems = items as TrackItem[]
  const firstItemName = castItems[0]?.product_name ?? ''
  const heroEmoji = itemEmoji(firstItemName)

  function fmtEta() {
    if (status === 'ready' || status === 'completed') return null
    if (secsLeft === null) return '~15 min'
    if (secsLeft <= 0) return 'any moment'
    const m = Math.floor(secsLeft / 60)
    const s = secsLeft % 60
    return m > 0 ? m + ' min ' + s + 's' : s + 's'
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const etaStr = fmtEta()
  const loyaltyPoints = Math.round(total)

  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: SANS, paddingBottom: 40 }}>

      {/* S-ORD-CONFIRM — the order ROW says payment has not settled yet. The customer is here
          because the order EXISTS, so the one thing this screen must never do is imply they should
          pay again. Cash orders have payment_status null and never see this. */}
      {paymentStatus === 'pending' ? (
        <div style={{
          margin: '12px 16px 0', padding: '12px 14px', borderRadius: 12,
          background: 'rgba(255,193,7,0.12)', border: '1px solid rgba(255,193,7,0.45)',
          fontSize: 13, lineHeight: 1.5,
        }}>
          <strong>Payment is still processing.</strong> Your order is confirmed and we have it —
          please don&rsquo;t pay again. This updates on its own.
        </div>
      ) : null}

      {/* Pulse keyframes injected once */}
      <style>{`
        @keyframes pipel-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(217,245,78,0.7); }
          50%      { box-shadow: 0 0 0 10px rgba(217,245,78,0); }
        }
        .pipel-pulse { animation: pipel-pulse 1.6s ease-in-out infinite; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '32px 20px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: MUTED, fontWeight: 500, marginBottom: 8 }}>
          {'Order ' + orderNumber + ' · ' + businessName}
        </div>

        {cancelled ? (
          <div style={{ margin: '16px 20px', padding: '24px 20px', borderRadius: 20, background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✗</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', marginBottom: 4 }}>Order {status}</div>
            <div style={{ fontSize: 13, color: MUTED }}>Please contact the venue if you have questions.</div>
          </div>
        ) : status === 'completed' ? (
          <div>
            <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.1, marginBottom: 4 }}>
              <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700 }}>Enjoy! </span>
              <span style={{ fontSize: 32 }}>🎉</span>
            </div>
            <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>
              {completedAt ? 'Picked up at ' + fmtTime(completedAt) : 'Order complete'}
            </div>
          </div>
        ) : status === 'ready' ? (
          <div>
            <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.1, marginBottom: 4 }}>
              <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700 }}>Ready </span>
              <span style={{ fontFamily: SANS, fontWeight: 800 }}>to pick up!</span>
            </div>
            <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>
              {fulfillmentType === 'delivery' ? 'Your delivery is on its way' : 'Head to the counter'}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.1, marginBottom: 0 }}>
              <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700 }}>Ready </span>
              <span style={{ fontFamily: SANS, fontWeight: 500 }}>in </span>
              <span style={{ color: LIME, fontFamily: SANS, fontWeight: 800 }}>{etaStr}</span>
            </div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>
              {'for ' + customerName + ' · ' + (fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup')}
            </div>
          </div>
        )}
      </div>

      {/* Floating product hero */}
      {!cancelled && (
        <div style={{ textAlign: 'center', padding: '24px 20px 8px' }}>
          <div style={{ fontSize: 88, lineHeight: 1, filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.12))' }}>
            {heroEmoji}
          </div>
        </div>
      )}

      {/* Vertical timeline */}
      {!cancelled && (
        <div style={{ margin: '16px 20px 0', background: WHITE, borderRadius: 24, boxShadow: '0 8px 28px rgba(0,0,0,.06)', padding: '24px 20px' }}>
          {STEPS.map((step, i) => {
            const stepNum  = i + 1
            const done     = currentStep > stepNum
            const active   = currentStep === stepNum
            const upcoming = currentStep < stepNum

            let timeLabel = ''
            if (done && i === 0) timeLabel = fmtTime(initialEta ? new Date(new Date(initialEta).getTime() - 15 * 60000).toISOString() : new Date().toISOString())
            else if (active) timeLabel = 'Now'
            else if (!upcoming && i === 2 && eta) timeLabel = 'Approx. ' + fmtTime(eta)

            return (
              <div key={step.key} style={{ display: 'flex', gap: 16, paddingBottom: i < STEPS.length - 1 ? 28 : 0, position: 'relative' }}>
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div style={{
                    position: 'absolute', left: 15, top: 32, width: 2,
                    height: 28,
                    background: done ? LIME : BORDER,
                  }} />
                )}

                {/* Dot */}
                <div
                  className={active ? 'pipel-pulse' : undefined}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: done ? LIME : WHITE,
                    border: '2px solid ' + (done ? LIME : active ? LIME : BORDER),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, color: done ? INK : MUTED,
                    fontWeight: 800,
                  }}
                >
                  {done ? '✓' : active ? (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: LIME }} />
                  ) : null}
                </div>

                {/* Label + time */}
                <div style={{ paddingTop: 4 }}>
                  <div style={{
                    fontSize: 16,
                    fontWeight: active ? 800 : done ? 700 : 500,
                    color: done || active ? INK : MUTED,
                    fontFamily: SANS,
                  }}>
                    {step.label}
                  </div>
                  {timeLabel && (
                    <div style={{ fontSize: 12, color: active ? LIME : MUTED, marginTop: 2, fontWeight: active ? 600 : 400 }}>
                      {timeLabel}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Order summary */}
      {castItems.length > 0 && (
        <div style={{ margin: '12px 20px 0', background: WHITE, borderRadius: 24, boxShadow: '0 8px 28px rgba(0,0,0,.06)', padding: '20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Order summary
          </div>
          {castItems.map((item, idx) => (
            <div key={idx} style={{ marginBottom: 12, paddingBottom: idx < castItems.length - 1 ? 12 : 0, borderBottom: idx < castItems.length - 1 ? '1px solid ' + BORDER : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                  {item.quantity && item.quantity > 1 ? item.quantity + ' × ' : ''}{item.product_name ?? 'Item'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: INK, whiteSpace: 'nowrap', marginLeft: 12 }}>
                  {'$' + (Number(item.unit_price ?? 0) * (item.quantity ?? 1)).toFixed(2)}
                </div>
              </div>
              {item.config?.removed && item.config.removed.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {item.config.removed.map((r, ri) => (
                    <span key={ri} style={{ fontSize: 10, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {'NO ' + r.name.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
              {item.modifiers && item.modifiers.length > 0 && (
                <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{item.modifiers.map(m => m.name).join(', ')}</div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid ' + BORDER, marginTop: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>Total</span>
            <span style={{ fontSize: 17, fontWeight: 900, color: INK, fontFamily: SANS }}>${total.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div style={{ margin: '12px 20px 0', background: WHITE, borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,.04)', padding: '14px 16px', fontSize: 13, color: MUTED }}>
          <span style={{ fontWeight: 700, color: INK }}>Note: </span>{notes}
        </div>
      )}

      {/* Made fresh by card */}
      <div style={{ margin: '12px 20px 0', background: WHITE, borderRadius: 24, boxShadow: '0 8px 28px rgba(0,0,0,.06)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 42, lineHeight: 1, flexShrink: 0 }}>👨‍🍳</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: INK, fontFamily: SANS }}>Made fresh</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: INK, fontFamily: SANS }}>{'by ' + businessName}</div>
        </div>
      </div>

      {/* Loyalty pill */}
      <div style={{ margin: '12px 20px 0', background: LIME, borderRadius: 9999, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>🏅</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: SANS }}>
          {"You'll earn " + loyaltyPoints + ' loyalty points on pickup'}
        </span>
      </div>

      {/* View receipt outlined pill */}
      <div style={{ margin: '12px 20px 0' }}>
        <a
          href={'/menu/' + slug}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '14px 20px', borderRadius: 9999,
            border: '1.5px solid ' + BORDER,
            background: WHITE,
            color: INK, fontSize: 15, fontWeight: 700,
            textDecoration: 'none', fontFamily: SANS,
            boxShadow: '0 4px 16px rgba(0,0,0,.04)',
          }}
        >
          View receipt
        </a>
      </div>

      {/* Powered by */}
      <div style={{ textAlign: 'center', fontSize: 11, color: MUTED, marginTop: 32, letterSpacing: '0.05em' }}>
        Powered by Aria
      </div>
    </div>
  )
}