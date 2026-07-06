'use client'
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const INK    = '#0a0a0a'
const LIME   = '#d9f54e'
const BORDER = '#e5e7eb'
const WHITE  = '#ffffff'
const MUTED  = '#6b7280'
const SANS   = "'Outfit', 'Inter', system-ui, sans-serif"

function PayForm({ onSuccess, onClose, orderNumber, total }: {
  onSuccess: () => void
  onClose: () => void
  orderNumber: string
  total: number
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState('')

  async function handlePay() {
    if (!stripe || !elements) return
    setPaying(true); setErr('')
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (result.error) {
      setErr(result.error.message ?? 'Payment failed. Please try another card.')
      setPaying(false)
    } else {
      onSuccess()
    }
  }

  const btnDisabled = paying || !stripe
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Order {orderNumber}</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: INK, margin: '2px 0 0', fontFamily: SANS }}>{'$' + total.toFixed(2)}</p>
        </div>
        <button
          onClick={onClose}
          style={{ background: WHITE, border: '1.5px solid ' + BORDER, borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: INK, lineHeight: 1, flexShrink: 0 }}
        >×</button>
      </div>
      {/* PayID preferred — 0% surcharge, instant AU bank transfer. Surfaces automatically
          in the PaymentElement when the Stripe account has PayID enabled (Dashboard →
          Settings → Payment methods). If it does not appear, the card fallback below works.
          GROUNDING-TEETH: PayID is live only after the Stripe account enables it; card is
          always live. Pre-Oct-2026 AU surcharge ban: enabling PayID now saves ~1.5% per order. */}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#2D5240', textAlign: 'center' as const, padding: '6px 12px', background: '#f0f7f2', borderRadius: 8, marginBottom: 4 }}>
        PayID preferred · 0% surcharge · instant confirmation
      </div>
      <PaymentElement />
      {err && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{err}</p>}
      <button
        onClick={handlePay}
        disabled={btnDisabled}
        style={{ width: '100%', padding: '16px 0', borderRadius: 9999, border: 'none', background: btnDisabled ? BORDER : LIME, color: INK, fontSize: 16, fontWeight: 800, cursor: btnDisabled ? 'not-allowed' : 'pointer', fontFamily: SANS }}
      >
        {paying ? 'Processing…' : 'Pay now · $' + total.toFixed(2)}
      </button>
      <p style={{ fontSize: 11, color: MUTED, textAlign: 'center' as const, margin: 0 }}>Secured by Stripe · Card details are encrypted</p>
    </div>
  )
}

export function StripePaymentModal({ clientSecret, publishableKey, orderNumber, total, onSuccess, onClose }: {
  clientSecret: string
  publishableKey: string
  orderNumber: string
  total: number
  onSuccess: () => void
  onClose: () => void
}) {
  const [stripePromise] = useState(() => loadStripe(publishableKey))

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: WHITE, borderRadius: 24, padding: '28px 24px', maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '0 0 20px', fontFamily: SANS }}>Complete payment</h2>
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe' as const,
              variables: { fontFamily: SANS, colorPrimary: '#0a0a0a', borderRadius: '12px' },
            },
          }}
        >
          <PayForm onSuccess={onSuccess} onClose={onClose} orderNumber={orderNumber} total={total} />
        </Elements>
      </div>
    </div>
  )
}