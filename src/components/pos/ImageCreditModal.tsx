'use client'
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const PACKS = [
  { id: 'single',  label: '1 image',   price: '$0.29', credits: 1,  savings: undefined },
  { id: 'pack_10', label: '10 images',  price: '$2.49', credits: 10, savings: 'Save $0.41' },
  { id: 'pack_25', label: '25 images',  price: '$5.99', credits: 25, savings: 'Save $1.26' },
  { id: 'pack_50', label: '50 images',  price: '$9.99', credits: 50, savings: 'Save $4.51' },
]

function PaymentForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const stripe   = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!stripe || !elements) return
    setLoading(true)
    setError(null)
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed')
      setLoading(false)
    } else {
      onSuccess()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PaymentElement />
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={onCancel}
          style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14 }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={loading}
          style={{ flex: 2, padding: '10px 0', borderRadius: 8, background: '#7FB897', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Processing…' : 'Pay & Add Image'}
        </button>
      </div>
    </div>
  )
}

export function ImageCreditModal({
  businessId,
  productName,
  onUseWithBackground,
  onCreditsPurchased,
  onClose,
}: {
  businessId: string
  productName: string
  onUseWithBackground: () => void
  onCreditsPurchased: (credits: number) => void
  onClose: () => void
}) {
  const [step, setStep]               = useState<'choose' | 'pay'>('choose')
  const [selectedPack, setSelectedPack] = useState('single')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)

  const handleProceedToPay = async () => {
    setLoading(true)
    const res = await fetch('/api/pos/image-credits/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, pack: selectedPack }),
    })
    const data = await res.json()
    if (data.client_secret) {
      setClientSecret(data.client_secret)
      setStep('pay')
    }
    setLoading(false)
  }

  const handlePaymentSuccess = () => {
    const pack = PACKS.find(p => p.id === selectedPack)
    onCreditsPurchased(pack?.credits ?? 1)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#1a2e20', borderRadius: 16, border: '1px solid rgba(127,184,151,0.2)', padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>✨</div>
          <h3 style={{ color: '#fff', fontSize: 17, fontWeight: 600, margin: 0 }}>
            Free image limit reached
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6 }}>
            You've used your 5 free product images.{' '}
            <strong style={{ color: '#7FB897' }}>{productName}</strong> needs one.
            Choose how to continue.
          </p>
        </div>

        {step === 'choose' && (
          <>
            {/* Option A — free with background */}
            <button onClick={onUseWithBackground}
              style={{ width: '100%', padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', textAlign: 'left', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Keep image with background</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Scene photo from our library, free forever</div>
              </div>
              <span style={{ background: 'rgba(255,255,255,0.08)', padding: '3px 10px', borderRadius: 20, fontSize: 12, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>Free</span>
            </button>

            {/* Option B — paid transparent */}
            <div style={{ border: '1px solid rgba(127,184,151,0.3)', borderRadius: 10, padding: 14, background: 'rgba(127,184,151,0.05)' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Clean transparent image</span>
                <span style={{ color: '#7FB897', fontSize: 12 }}>AI background removed</span>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 12px' }}>
                Matches the style of your other products. Looks professional on any background.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {PACKS.map(p => (
                  <button key={p.id} onClick={() => setSelectedPack(p.id)}
                    style={{ padding: '10px 8px', borderRadius: 8, cursor: 'pointer', border: selectedPack === p.id ? '1px solid #7FB897' : '1px solid rgba(255,255,255,0.08)', background: selectedPack === p.id ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.03)', textAlign: 'center', fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{p.label}</div>
                    <div style={{ fontSize: 14, color: '#7FB897', fontWeight: 700 }}>{p.price}</div>
                    {p.savings && <div style={{ fontSize: 10, color: 'rgba(127,184,151,0.7)', marginTop: 2 }}>{p.savings}</div>}
                  </button>
                ))}
              </div>

              <button onClick={handleProceedToPay} disabled={loading}
                style={{ width: '100%', padding: '11px 0', borderRadius: 8, background: '#7FB897', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Loading…' : `Continue — ${PACKS.find(p => p.id === selectedPack)?.price}`}
              </button>
            </div>

            <button onClick={onClose}
              style={{ width: '100%', marginTop: 10, padding: '8px 0', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
              Cancel — add image later
            </button>
          </>
        )}

        {step === 'pay' && clientSecret && (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night' } }}>
            <PaymentForm onSuccess={handlePaymentSuccess} onCancel={() => setStep('choose')} />
          </Elements>
        )}
      </div>
    </div>
  )
}