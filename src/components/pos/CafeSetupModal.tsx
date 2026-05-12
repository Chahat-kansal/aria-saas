'use client'
import { useState } from 'react'
import { CAFE_SEED_PRODUCTS, CAFE_CATEGORIES } from '@/lib/pos/cafe-seed-products'

interface Props {
  businessName: string
  onComplete: () => void
  onSkip: () => void
}

interface PriceEdit {
  name: string
  category: string
  price: number
  is_featured: boolean
  image_url?: string | null
}

export default function CafeSetupModal({ businessName, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<'welcome' | 'prices' | 'seeding' | 'done'>('welcome')
  const [prices, setPrices] = useState<PriceEdit[]>(
    CAFE_SEED_PRODUCTS.map(p => ({
      name:       p.name,
      category:   p.category,
      price:      p.price,
      is_featured: p.is_featured,
      image_url:  p.image_url,
    }))
  )
  const [filter, setFilter] = useState(CAFE_CATEGORIES[0])
  const [error, setError] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(0)

  const filtered = prices.filter(p => p.category === filter)

  const updatePrice = (name: string, price: number) => {
    setPrices(prev => prev.map(p => p.name === name ? { ...p, price } : p))
  }

  const handleSeed = async () => {
    setStep('seeding')
    setError(null)
    try {
      const res = await fetch('/api/pos/seed-cafe-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) { onComplete(); return }
        throw new Error(data.error ?? 'Setup failed')
      }
      setSeeded(data.seeded)
      setStep('done')
    } catch (err: any) {
      setError(err.message)
      setStep('prices')
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  }
  const modal: React.CSSProperties = {
    background: '#13131a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20, width: '100%', maxWidth: 680,
    maxHeight: '90vh', display: 'flex',
    flexDirection: 'column', overflow: 'hidden',
  }

  if (step === 'welcome') return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6F4E37, #D4956A)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 40,
            margin: '0 auto 24px',
          }}>☕</div>
          <h2 style={{ color: 'white', fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>
            Welcome to Aria POS, {businessName}!
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.6, margin: '0 0 32px' }}>
            We've got {CAFE_SEED_PRODUCTS.length} cafe products ready — coffees, teas,
            breakfasts, lunches and bakery items. Just set your prices and you're open for business.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => setStep('prices')} style={{
              padding: '14px 32px', borderRadius: 12,
              background: '#2D5240', color: 'white',
              border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600,
            }}>Set my prices →</button>
            <button onClick={onSkip} style={{
              padding: '14px 20px', borderRadius: 12,
              background: 'transparent', color: 'rgba(255,255,255,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer', fontSize: 14,
            }}>Skip for now</button>
          </div>
        </div>
      </div>
    </div>
  )

  if (step === 'prices') return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 16px', fontSize: 18 }}>
            Set your prices
          </h3>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 16 }}>
            {CAFE_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setFilter(cat)} style={{
                padding: '6px 14px', borderRadius: 20,
                whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', border: 'none',
                background: filter === cat ? '#2D5240' : 'rgba(255,255,255,0.07)',
                color: filter === cat ? 'white' : 'rgba(255,255,255,0.5)',
              }}>{cat}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 12,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171', fontSize: 13,
            }}>{error}</div>
          )}
          {filtered.map(product => (
            <div key={product.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                {product.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image_url} alt={product.name}
                    style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div>
                  <p style={{ color: 'white', fontSize: 14, fontWeight: 500, margin: 0 }}>
                    {product.name}
                    {product.is_featured && (
                      <span style={{
                        marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 10,
                        background: 'rgba(127,184,151,0.15)', color: '#7FB897',
                        border: '1px solid rgba(127,184,151,0.3)',
                      }}>Popular</span>
                    )}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>A$</span>
                <input
                  type="number" min="0" step="0.50"
                  value={product.price}
                  onChange={e => updatePrice(product.name, parseFloat(e.target.value) || 0)}
                  style={{
                    width: 70, padding: '6px 8px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white', fontSize: 14, textAlign: 'right', outline: 'none',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            {prices.length} products · adjust anytime in Products
          </span>
          <button onClick={handleSeed} style={{
            padding: '10px 24px', borderRadius: 10,
            background: '#2D5240', color: 'white',
            border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>Add all products →</button>
        </div>
      </div>
    </div>
  )

  if (step === 'seeding') return (
    <div style={overlay}>
      <div style={{ ...modal, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          border: '3px solid rgba(127,184,151,0.3)', borderTopColor: '#7FB897',
          animation: 'spin 1s linear infinite', marginBottom: 24,
        }} />
        <p style={{ color: 'white', fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
          Setting up your menu...
        </p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: 0 }}>
          Adding {CAFE_SEED_PRODUCTS.length} products
        </p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )

  return (
    <div style={overlay}>
      <div style={{ ...modal, alignItems: 'center', justifyContent: 'center', padding: 48, textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', background: '#2D5240',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, marginBottom: 24,
        }}>✓</div>
        <h3 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>
          You're all set!
        </h3>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, margin: '0 0 32px' }}>
          {seeded} products added. Prices can be changed anytime in Products.
        </p>
        <button onClick={onComplete} style={{
          padding: '14px 36px', borderRadius: 12,
          background: '#2D5240', color: 'white',
          border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600,
        }}>Open POS →</button>
      </div>
    </div>
  )
}