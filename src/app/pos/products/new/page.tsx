'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const STEPS = [
  { id: 'barcode',  question: 'What is the barcode for the product?' },
  { id: 'name',     question: 'What is the name of this product?' },
  { id: 'category', question: 'What category does {name} belong to?' },
  { id: 'tags',     question: 'What tags does {name} have?' },
  { id: 'case_qty', question: 'How many {name}s come in a case?' },
  { id: 'prices',   question: 'What prices does {name} have?' },
]

const GRADIENTS = [
  'linear-gradient(135deg, #3d9cb5, #2d8fa8)',
  'linear-gradient(135deg, #2d4f9e, #1e3a8a)',
  'linear-gradient(135deg, #2d8fa8, #1e6b8a)',
  'linear-gradient(135deg, #3d9cb5, #2d8fa8)',
  'linear-gradient(135deg, #2d4f9e, #1a3a7a)',
  'linear-gradient(135deg, #2d4f9e, #1e3a8a)',
]

const iS: React.CSSProperties = {
  width: '100%', padding: '14px 16px', fontSize: 16,
  background: 'white', color: '#111',
  border: '2px solid rgba(0,0,0,0.2)', borderRadius: 2,
  outline: 'none', boxSizing: 'border-box',
}

const thS: React.CSSProperties = {
  padding: '12px 16px', background: 'rgba(255,255,255,0.15)',
  color: 'white', fontWeight: 600, fontSize: 14,
  textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)',
}

const cellS: React.CSSProperties = {
  width: '100%', padding: '13px 16px', fontSize: 15,
  border: '1px solid rgba(0,0,0,0.15)', outline: 'none',
  background: 'white', color: '#111',
}

export default function NewProductPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [data, setData] = useState({ barcode: '', name: '', category_id: '', category_name: '', tags: [] as string[], case_quantity: '', quantity: '1', price: '' })
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [catOpen, setCatOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/pos/categories').then(r => r.json())
      .then(d => setCategories(d.categories || d || [])).catch(() => {})
  }, [])

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [step])

  const question = STEPS[step].question.replace('{name}', data.name || 'this product')
  const canNext = () => step === 1 ? data.name.trim().length > 0 : true

  const next = () => { if (step < STEPS.length - 1) setStep(s => s + 1) }
  const prev = () => { if (step > 0) setStep(s => s - 1) }
  const skip = () => { if (step < STEPS.length - 1) setStep(s => s + 1); else finish() }

  const finish = async () => {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/pos/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name || 'New Product',
          barcode: data.barcode || null,
          category_id: data.category_id || null,
          tags: data.tags,
          case_quantity: parseInt(data.case_quantity) || 1,
          price: parseFloat(data.price) || 0,
          is_active: true, stock_quantity: 0,
        }),
      })
      const created = await res.json()
      const id = created.product?.id || created.id
      router.push(id ? `/pos/products/${id}/edit` : '/pos/products')
    } catch { router.push('/pos/products') }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canNext()) { step === STEPS.length - 1 ? finish() : next() }
  }

  return (
    <div style={{ minHeight: '100vh', background: GRADIENTS[step], display: 'flex', flexDirection: 'column', fontFamily: "'Manrope',system-ui,sans-serif", color: 'white', transition: 'background 400ms ease', position: 'relative' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', position: 'relative', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {STEPS.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {i === step && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />}
            </div>
          ))}
        </div>
        <div onClick={() => router.push('/pos/products')} style={{ position: 'absolute', right: 32, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: 0.85, letterSpacing: '0.02em' }}>× CANCEL</div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 14, opacity: 0.85, letterSpacing: '0.02em', flexShrink: 0 }}>Create Product</div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', marginTop: -40 }}>
        <div style={{ fontSize: 24, fontWeight: 400, marginBottom: 20, maxWidth: 700, width: '100%' }}>{question}</div>

        {step === 0 && <input ref={inputRef} type="text" value={data.barcode} onChange={e => setData(d => ({ ...d, barcode: e.target.value }))} onKeyDown={onKey} style={iS} />}
        {step === 1 && <input ref={inputRef} type="text" value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))} onKeyDown={onKey} style={iS} />}

        {step === 2 && (
          <div style={{ position: 'relative', maxWidth: 700, width: '100%' }}>
            <div onClick={() => setCatOpen(o => !o)} style={{ ...iS, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: data.category_name ? '#000' : '#666' }}>
              <span>{data.category_name || 'Select...'}</span>
              <span style={{ fontSize: 12, color: '#666' }}>{catOpen ? '▲' : '▼'}</span>
            </div>
            {catOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', zIndex: 50, maxHeight: 300, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {categories.map(cat => (
                  <div key={cat.id} onClick={() => { setData(d => ({ ...d, category_id: cat.id, category_name: cat.name })); setCatOpen(false) }}
                    style={{ padding: '13px 16px', color: '#111', cursor: 'pointer', fontSize: 15, borderBottom: '1px solid #f0f0f0' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                    {cat.name}
                  </div>
                ))}
                {categories.length === 0 && <div style={{ padding: '13px 16px', color: '#666' }}>No categories yet</div>}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div style={{ maxWidth: 700, width: '100%' }}>
            <div style={{ ...iS, color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Select...</span><span style={{ fontSize: 12 }}>▼</span>
            </div>
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>Tags can be added later on the product edit page.</p>
          </div>
        )}

        {step === 4 && <input ref={inputRef} type="number" min="1" value={data.case_quantity} onChange={e => setData(d => ({ ...d, case_quantity: e.target.value }))} onKeyDown={onKey} style={iS} />}

        {step === 5 && (
          <div style={{ maxWidth: 700, width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
              <thead><tr><th style={thS}>Quantity</th><th style={thS}>Price</th></tr></thead>
              <tbody>
                <tr>
                  <td style={{ padding: 0 }}>
                    <input type="number" min="1" value={data.quantity} onChange={e => setData(d => ({ ...d, quantity: e.target.value }))} style={cellS} />
                  </td>
                  <td style={{ padding: 0, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#333', fontSize: 15, zIndex: 1 }}>$</span>
                    <input ref={inputRef} type="number" min="0" step="0.01" value={data.price} onChange={e => setData(d => ({ ...d, price: e.target.value }))} style={{ ...cellS, paddingLeft: 28 }} />
                  </td>
                </tr>
              </tbody>
            </table>
            <p style={{ marginTop: 12, fontSize: 13, opacity: 0.85, fontStyle: 'italic' }}>You can customise the prices further on the next page.</p>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 80px 32px', fontSize: 14, fontWeight: 600, letterSpacing: '0.04em', flexShrink: 0 }}>
        <div onClick={step > 0 ? prev : undefined} style={{ cursor: step > 0 ? 'pointer' : 'default', opacity: step > 0 ? 1 : 0 }}>← PREVIOUS</div>
        <div onClick={skip} style={{ cursor: 'pointer', opacity: 0.85 }}>SKIP</div>
        <div onClick={() => { if (!canNext()) return; step === STEPS.length - 1 ? finish() : next() }}
          style={{ cursor: canNext() ? 'pointer' : 'default', opacity: canNext() ? 1 : 0.4 }}>
          {step === STEPS.length - 1 ? 'FINISH ✓' : 'NEXT →'}
        </div>
      </div>
    </div>
  )
}
