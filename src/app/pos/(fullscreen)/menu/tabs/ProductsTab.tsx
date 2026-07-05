'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'

const ProductEditPanel = dynamic(() => import('./ProductEditPanel'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────

type Product = {
  id: string; name: string; description: string | null; price: number;
  category_id: string | null; is_active: boolean; show_online: boolean;
  ordering_mode: string; ordering_archetype: string | null; builder_type: string | null;
  kds_station: string; prep_time_seconds: number | null;
  allergens: string[]; is_gluten_free: boolean; is_vegan: boolean; is_vegetarian: boolean;
  image_url: string | null; image_thumb_url: string | null; image_source: string | null;
  sort_order: number; notes: string | null; tags: string[];
}
type Category = { id: string; name: string; color: string | null; is_active: boolean }
type Outlet = { id: string; name: string }

interface ProductsTabProps {
  businessId: string
  initialProducts: Product[]
  initialCategories: Category[]
  initialOutlets: Outlet[]
  onRefresh?: () => void
}

// ── Style constants ────────────────────────────────────────────────────────

const C = {
  bg: '#fafafa',
  ink: '#0a0a0a',
  accent: '#d9f54e',
  border: '#e5e7eb',
  dim: '#6b7280',
  sage: '#7FB897',
  forest: '#2D5240',
  cardBg: '#ffffff',
  pillBg: '#f3f4f6',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return '$' + price.toFixed(2)
}

function archetypeLabel(p: Product): string {
  if (p.ordering_archetype) return p.ordering_archetype
  if (p.ordering_mode && p.ordering_mode !== 'inherit') return p.ordering_mode
  return 'standard'
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DietaryPills({ p }: { p: Product }) {
  const pillStyle = {
    fontSize: 10,
    padding: '3px 7px',
    borderRadius: 6,
    border: '1px solid ' + C.sage,
    color: C.sage,
    fontWeight: 600,
    lineHeight: 1,
    display: 'inline-block',
    fontFamily: "'Outfit', system-ui, sans-serif",
  }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginTop: 6 }}>
      {p.is_gluten_free && <span style={pillStyle}>GF</span>}
      {p.is_vegan && <span style={pillStyle}>VG</span>}
      {p.is_vegetarian && <span style={pillStyle}>V</span>}
    </div>
  )
}

function ArchetypeBadge({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10,
      padding: '2px 6px',
      borderRadius: 5,
      border: '1px solid ' + C.border,
      color: C.dim,
      fontWeight: 500,
      fontFamily: "'Outfit', system-ui, sans-serif",
      letterSpacing: '0.02em',
      display: 'inline-block',
    }}>
      {label}
    </span>
  )
}

function Toggle86({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      title={active ? '86 this product (mark unavailable)' : 'Re-activate product'}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: active ? C.forest : C.border,
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3,
        left: active ? 18 : 3,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.15s',
      }} />
    </button>
  )
}

function OnlineToggle({ online, onToggle }: { online: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      title={online ? 'Hide from online ordering' : 'Show on online ordering'}
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        border: '1px solid ' + (online ? C.accent : C.border),
        background: online ? C.accent : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 13,
        color: online ? C.ink : C.dim,
      }}
      aria-label={online ? 'Visible online' : 'Hidden online'}
    >
      {online ? '👁' : '🚫'}
    </button>
  )
}

function ProductCard({
  product,
  categories,
  onClick,
  on86,
  onOnline,
}: {
  product: Product
  categories: Category[]
  onClick: () => void
  on86: () => void
  onOnline: () => void
}) {
  const cat = categories.find(c => c.id === product.category_id)
  const archLabel = archetypeLabel(product)
  const hasDietary = product.is_gluten_free || product.is_vegan || product.is_vegetarian

  return (
    <div
      onClick={onClick}
      style={{
        background: C.cardBg,
        border: '1px solid ' + C.border,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        opacity: product.is_active ? 1 : 0.55,
        transition: 'box-shadow 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#f3f4f6', flexShrink: 0 }}>
        {product.image_thumb_url || product.image_url ? (
          <img
            src={(product.image_thumb_url ?? product.image_url) as string}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f3f4f6', color: '#d1d5db', fontSize: 28,
          }}>
            ☕
          </div>
        )}
        {/* 86 / active indicator strip */}
        {!product.is_active && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            background: 'rgba(10,10,10,0.65)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            textAlign: 'center',
            padding: '3px 0',
            letterSpacing: '0.06em',
            fontFamily: "'Outfit', system-ui, sans-serif",
          }}>
            86&apos;D — UNAVAILABLE
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Name */}
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: C.ink,
          lineHeight: 1.3,
          fontFamily: "'Outfit', system-ui, sans-serif",
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
        }}>
          {product.name}
        </div>

        {/* Price */}
        <div style={{
          fontSize: 16,
          fontStyle: 'italic',
          fontWeight: 600,
          color: C.forest,
          fontFamily: "'Cormorant', Georgia, serif",
          lineHeight: 1,
        }}>
          {formatPrice(product.price)}
        </div>

        {/* Category + archetype row */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          {cat && (
            <span style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 5,
              background: cat.color ? cat.color + '22' : C.pillBg,
              border: '1px solid ' + (cat.color ?? C.border),
              color: cat.color ?? C.dim,
              fontWeight: 600,
              fontFamily: "'Outfit', system-ui, sans-serif",
              whiteSpace: 'nowrap' as const,
            }}>
              {cat.name}
            </span>
          )}
          <ArchetypeBadge label={archLabel} />
        </div>

        {/* Dietary pills */}
        {hasDietary && <DietaryPills p={product} />}

        {/* Action row */}
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8 }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: C.dim, fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 500 }}>
              {product.is_active ? 'Active' : '86\'d'}
            </span>
            <Toggle86 active={product.is_active} onToggle={on86} />
          </div>
          <OnlineToggle online={product.show_online} onToggle={onOnline} />
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ProductsTab({
  businessId,
  initialProducts,
  initialCategories,
  initialOutlets,
  onRefresh,
}: ProductsTabProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [outlets, setOutlets] = useState<Outlet[]>(initialOutlets)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)

  // Keep in sync if parent re-renders with new data
  useEffect(() => { setProducts(initialProducts) }, [initialProducts])
  useEffect(() => { setCategories(initialCategories) }, [initialCategories])
  useEffect(() => { setOutlets(initialOutlets) }, [initialOutlets])

  // ── Data reload ──────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    const res = await fetch('/api/pos/menu/products')
    const json = await res.json() as { products?: Product[]; categories?: Category[]; outlets?: Outlet[] }
    if (json.products) setProducts(json.products)
    if (json.categories) setCategories(json.categories)
    if (json.outlets) setOutlets(json.outlets)
    onRefresh?.()
  }, [onRefresh])

  // ── Mutations ────────────────────────────────────────────────────────────

  const toggle86 = async (p: Product) => {
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x))
    await fetch('/api/pos/menu/products/' + p.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !p.is_active }),
    })
  }

  const toggleOnline = async (p: Product) => {
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, show_online: !x.show_online } : x))
    await fetch('/api/pos/menu/products/' + p.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_online: !p.show_online }),
    })
  }

  // ── Filtered list ────────────────────────────────────────────────────────

  const filtered = products.filter(p => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCat = !categoryFilter || p.category_id === categoryFilter
    return matchesSearch && matchesCat
  })

  // ── Panel close ──────────────────────────────────────────────────────────

  function closePanel() {
    setSelectedProduct(null)
    setShowNewForm(false)
    void reload()
  }

  const panelOpen = !!selectedProduct || showNewForm
  const panelProduct = selectedProduct

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, position: 'relative' }}>

      {/* ── Top bar ── */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid ' + C.border,
        background: C.cardBg,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flexWrap: 'wrap' as const,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {/* Search */}
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products…"
          style={{
            flex: '1 1 180px',
            minWidth: 140,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid ' + C.border,
            background: C.bg,
            color: C.ink,
            fontSize: 13,
            fontFamily: "'Outfit', system-ui, sans-serif",
            outline: 'none',
          }}
        />

        {/* Category filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center', flex: '2 1 auto' }}>
          <button
            onClick={() => setCategoryFilter(null)}
            style={{
              padding: '6px 13px',
              borderRadius: 20,
              border: '1.5px solid ' + (!categoryFilter ? C.ink : C.border),
              background: !categoryFilter ? C.ink : 'transparent',
              color: !categoryFilter ? '#fff' : C.dim,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Outfit', system-ui, sans-serif",
              whiteSpace: 'nowrap' as const,
            }}
          >
            All
          </button>
          {categories.filter(c => c.is_active).map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id === categoryFilter ? null : cat.id)}
              style={{
                padding: '6px 13px',
                borderRadius: 20,
                border: '1.5px solid ' + (categoryFilter === cat.id ? C.ink : C.border),
                background: categoryFilter === cat.id ? C.ink : 'transparent',
                color: categoryFilter === cat.id ? '#fff' : C.dim,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Outfit', system-ui, sans-serif",
                whiteSpace: 'nowrap' as const,
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* New product button */}
        <button
          onClick={() => { setSelectedProduct(null); setShowNewForm(true) }}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: C.accent,
            color: C.ink,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: "'Outfit', system-ui, sans-serif",
            whiteSpace: 'nowrap' as const,
            flexShrink: 0,
          }}
        >
          + New Product
        </button>
      </div>

      {/* ── Count bar ── */}
      <div style={{
        padding: '8px 20px',
        borderBottom: '1px solid ' + C.border,
        fontSize: 11,
        color: C.dim,
        fontFamily: "'Outfit', system-ui, sans-serif",
        background: C.bg,
      }}>
        {filtered.length} product{filtered.length !== 1 ? 's' : ''}
        {categoryFilter && categories.find(c => c.id === categoryFilter)
          ? ' in ' + (categories.find(c => c.id === categoryFilter)?.name ?? '')
          : ''}
        {search ? ' matching "' + search + '"' : ''}
      </div>

      {/* ── Product grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {filtered.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: C.dim,
            gap: 10,
          }}>
            <div style={{ fontSize: 32 }}>☕</div>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Outfit', system-ui, sans-serif" }}>
              No products found
            </div>
            <div style={{ fontSize: 12, fontFamily: "'Outfit', system-ui, sans-serif" }}>
              {search || categoryFilter ? 'Try a different filter or search term.' : 'Add your first product to get started.'}
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}>
            {filtered.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                categories={categories}
                onClick={() => { setShowNewForm(false); setSelectedProduct(p) }}
                on86={() => void toggle86(p)}
                onOnline={() => void toggleOnline(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Slide-in edit panel ── */}
      {panelOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={closePanel}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10,10,10,0.18)',
              zIndex: 199,
            }}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 'min(520px, 100vw)',
            height: '100vh',
            overflowY: 'auto',
            background: C.bg,
            borderLeft: '1px solid ' + C.border,
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Panel header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid ' + C.border,
              background: C.cardBg,
              position: 'sticky',
              top: 0,
              zIndex: 5,
              flexShrink: 0,
            }}>
              <div style={{
                fontSize: 15,
                fontWeight: 700,
                color: C.ink,
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}>
                {showNewForm ? 'New Product' : (panelProduct?.name ?? 'Edit Product')}
              </div>
              <button
                onClick={closePanel}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: '1px solid ' + C.border,
                  background: 'transparent',
                  color: C.dim,
                  fontSize: 18,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  fontFamily: 'system-ui, sans-serif',
                }}
                aria-label="Close panel"
              >
                ×
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <ProductEditPanel
                businessId={businessId}
                product={panelProduct}
                categories={categories}
                outlets={outlets}
                onClose={closePanel}
                onSaved={closePanel}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}