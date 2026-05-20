'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import {
  Coffee, UtensilsCrossed, Cookie, Wine, ShoppingBag, ShoppingCart,
  Shirt, Gift, Pill, Smartphone, Scissors, Store, Check,
} from 'lucide-react'

interface Option {
  id: string         // matches POS Industry type
  label: string
  description: string
  Icon: typeof Coffee
  features: string[]
}

const INDUSTRIES: Option[] = [
  {
    id: 'cafe',
    label: 'Café / Coffee shop',
    description: 'Modifiers, kitchen display, table service',
    Icon: Coffee,
    features: ['Modifiers & sizes', 'Kitchen display', 'Table/seat tracking', 'Recipes & costing'],
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    description: 'Full-service dining with course tracking',
    Icon: UtensilsCrossed,
    features: ['Table layouts', 'Course timing', 'Modifiers', 'Split bills'],
  },
  {
    id: 'bakery',
    label: 'Bakery / Patisserie',
    description: 'Recipes, daily production, expiry tracking',
    Icon: Cookie,
    features: ['Recipe costing', 'Waste log', 'Modifiers', 'Production planning'],
  },
  {
    id: 'liquor',
    label: 'Liquor / Bottle shop',
    description: 'Age verification, supplier integrations',
    Icon: Wine,
    features: ['Age verification', 'Laybys', 'Future prices', 'Supplier feeds'],
  },
  {
    id: 'convenience',
    label: 'Convenience store',
    description: 'Fast checkout, varied product mix',
    Icon: ShoppingBag,
    features: ['Mobile scanner', 'Future prices', 'Shelf tickets'],
  },
  {
    id: 'grocery',
    label: 'Grocery / Supermarket',
    description: 'Weight-based items, fresh produce',
    Icon: ShoppingCart,
    features: ['Future prices', 'Shelf tickets', 'Waste log'],
  },
  {
    id: 'clothing',
    label: 'Clothing / Footwear',
    description: 'Size & colour variants, fitting rooms',
    Icon: Shirt,
    features: ['Laybys', 'Shelf tickets', 'Mobile scanner'],
  },
  {
    id: 'gift',
    label: 'Gift / Homewares',
    description: 'Gift cards, seasonal inventory',
    Icon: Gift,
    features: ['Laybys', 'Gift cards', 'Promotions'],
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy / Chemist',
    description: 'Expiry tracking, waste log',
    Icon: Pill,
    features: ['Waste log', 'Shelf tickets', 'Mobile scanner'],
  },
  {
    id: 'electronics',
    label: 'Electronics / Phone shop',
    description: 'Serial number tracking, high-value items',
    Icon: Smartphone,
    features: ['Laybys', 'Shelf tickets', 'Mobile scanner'],
  },
  {
    id: 'beauty',
    label: 'Beauty / Salon',
    description: 'Appointments, services, products',
    Icon: Scissors,
    features: ['Promotions', 'Loyalty', 'Gift cards'],
  },
  {
    id: 'other',
    label: 'Other retail',
    description: 'Generic retail with full feature access',
    Icon: Store,
    features: ['All features available'],
  },
]

const C = {
  bg:    'var(--bg-base)',
  card:  'var(--bg-surface)',
  text:  'var(--text-primary)',
  muted: 'var(--text-secondary)',
  dim:   'var(--text-tertiary)',
  violet: '#8B5CF6',
  green:  '#22C55E',
  border: 'rgba(255,255,255,0.08)',
}

export default function BusinessTypePage() {
  const router = useRouter()
  const { refreshBusiness } = useBusinessContext()
  const [currentIndustry, setCurrentIndustry] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    fetch('/api/settings/business')
      .then(r => r.json())
      .then((d: { business?: { industry?: string | null } }) => {
        const raw = d.business?.industry ?? null
        // Normalize legacy industry values to POS industry IDs
        const normalized = normalizeIndustryClient(raw)
        setCurrentIndustry(normalized)
        setSelected(normalized)
      })
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!selected || selected === currentIndustry) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/business', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ industry: selected }),
      })
      if (!res.ok) throw new Error('Save failed')
      setCurrentIndustry(selected)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      // Reload BusinessProvider so sidebar picks up new industry immediately
      await refreshBusiness()
      router.refresh()
    } catch {
      alert('Could not save business type — please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100%', background: C.bg, color: C.text, padding: 40, fontFamily: "'Manrope',sans-serif" }}>
        <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Business type</h1>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
          Aria tailors the POS to your business. Pick the type that best matches what you sell — the sidebar, AI suggestions, and reports will adapt.
        </p>
      </div>

      {/* Current indicator */}
      {currentIndustry && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 999,
          background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
          marginBottom: 20,
        }}>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Currently set as</span>
          <span style={{ fontSize: 12, color: C.violet, fontWeight: 700 }}>
            {INDUSTRIES.find(i => i.id === currentIndustry)?.label ?? currentIndustry}
          </span>
        </div>
      )}

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 14,
        marginBottom: 24,
      }}>
        {INDUSTRIES.map(opt => {
          const isSelected = selected === opt.id
          const isCurrent  = currentIndustry === opt.id
          const Icon = opt.Icon
          return (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              style={{
                textAlign: 'left',
                padding: 16,
                borderRadius: 14,
                background: isSelected ? 'rgba(139,92,246,0.08)' : C.card,
                border: `1px solid ${isSelected ? 'rgba(139,92,246,0.5)' : C.border}`,
                color: C.text,
                cursor: 'pointer',
                transition: 'border-color 120ms, background 120ms, transform 120ms',
                fontFamily: 'inherit',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = C.border }}
            >
              {isCurrent && (
                <span style={{
                  position: 'absolute', top: 12, right: 12,
                  fontSize: 9, fontWeight: 700, padding: '3px 8px',
                  borderRadius: 999, background: 'rgba(34,197,94,0.12)', color: C.green,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  Active
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: isSelected ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color={isSelected ? C.violet : C.muted} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{opt.description}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {opt.features.map(f => (
                  <span key={f} style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 999,
                    background: 'rgba(255,255,255,0.04)', color: C.dim,
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>{f}</span>
                ))}
              </div>
              {isSelected && !isCurrent && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  width: 22, height: 22, borderRadius: '50%',
                  background: C.violet, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={13} color="#fff" strokeWidth={3} />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Save bar */}
      <div style={{
        position: 'sticky', bottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '12px 16px', borderRadius: 12,
        background: 'var(--bg-elevated, #1a1525)', border: `1px solid ${C.border}`,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ fontSize: 12, color: C.muted }}>
          {selected && selected !== currentIndustry
            ? <>Switching from <strong style={{ color: C.text }}>{INDUSTRIES.find(i => i.id === currentIndustry)?.label ?? '—'}</strong> to <strong style={{ color: C.violet }}>{INDUSTRIES.find(i => i.id === selected)?.label}</strong>. Sidebar updates after save.</>
            : 'Pick a business type to see what changes.'}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Saved</span>}
          <button
            onClick={save}
            disabled={saving || !selected || selected === currentIndustry}
            style={{
              padding: '9px 22px', borderRadius: 9, border: 'none',
              background: selected && selected !== currentIndustry ? C.violet : 'rgba(139,92,246,0.2)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: selected && selected !== currentIndustry && !saving ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save business type'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Normalize any DB industry value to a POS industry ID
function normalizeIndustryClient(raw: string | null | undefined): string {
  if (!raw) return 'other'
  const s = raw.toLowerCase().trim()
  if (s.includes('cafe') || s.includes('coffee')) return 'cafe'
  if (s.includes('restaurant') || s.includes('dining')) return 'restaurant'
  if (s.includes('bakery') || s.includes('pastry')) return 'bakery'
  if (s.includes('liquor') || s.includes('bottle') || s.includes('alcohol')) return 'liquor'
  if (s.includes('convenience') || s.includes('mini')) return 'convenience'
  if (s.includes('grocery') || s.includes('supermarket')) return 'grocery'
  if (s.includes('clothing') || s.includes('apparel') || s.includes('fashion') || s.includes('footwear')) return 'clothing'
  if (s.includes('gift') || s.includes('homeware') || s.includes('florist')) return 'gift'
  if (s.includes('pharmacy') || s.includes('chemist')) return 'pharmacy'
  if (s.includes('electronic') || s.includes('phone') || s.includes('computer')) return 'electronics'
  if (s.includes('beauty') || s.includes('salon') || s.includes('hair')) return 'beauty'
  return 'other'
}
