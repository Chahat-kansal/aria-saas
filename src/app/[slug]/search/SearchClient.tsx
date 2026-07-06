'use client'

import { useState, useRef } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#fafafa'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const CARD_BG = '#fff'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category: string | null
  is_available: boolean | null
}

export function SearchClient({ slug, products }: {
  slug: string
  products: Product[]
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const q = query.trim().toLowerCase()
  const results = q.length < 1 ? [] : products.filter(p => {
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      (p.category ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 16px' }}>
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 30, margin: '0 0 16px' }}>
          Search
        </h1>

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <svg
            width="18" height="18" viewBox="0 0 18 18"
            fill="none" stroke={INK_MUTED} strokeWidth="1.5" strokeLinecap="round"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="8" cy="8" r="5"/>
            <path d="M17 17l-3.5-3.5"/>
          </svg>
          <input
            ref={inputRef}
            autoFocus
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a menu item…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '14px 14px 14px 42px',
              border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 14,
              fontFamily: FB, fontSize: 16, color: INK, background: CARD_BG,
              outline: 'none',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(0,0,0,0.08)', border: 'none', borderRadius: '50%',
                width: 24, height: 24, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" stroke={INK_MUTED} strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l8 8M10 2L2 10"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div style={{ padding: '0 16px' }}>
        {q.length < 1 ? (
          <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, textAlign: 'center', paddingTop: 60 }}>
            Start typing to search the menu
          </p>
        ) : results.length === 0 ? (
          <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, textAlign: 'center', paddingTop: 60 }}>
            {'No results for "' + query + '"'}
          </p>
        ) : (
          <>
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, marginBottom: 12 }}>
              {results.length + ' result' + (results.length !== 1 ? 's' : '')}
            </p>
            {results.map(product => {
              const available = product.is_available !== false
              return (
                <a
                  key={product.id}
                  href={'/' + slug + '/item/' + product.id}
                  style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}
                >
                  <div style={{
                    background: CARD_BG, borderRadius: 16, padding: '14px 16px',
                    display: 'flex', gap: 14, alignItems: 'center',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                    opacity: available ? 1 : 0.6,
                  }}>
                    {/* Thumbnail */}
                    <div style={{
                      width: 68, height: 68, flexShrink: 0, borderRadius: 12,
                      background: product.image_url
                        ? ('url(' + product.image_url + ') center/cover no-repeat #f0ede8')
                        : '#f0ede8',
                    }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {product.category && (
                        <p style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>
                          {product.category}
                        </p>
                      )}
                      <p style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: INK, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {product.name}
                      </p>
                      {product.description && (
                        <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {product.description}
                        </p>
                      )}
                    </div>

                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: INK, margin: '0 0 6px', fontWeight: 700 }}>
                        {'$' + Number(product.price).toFixed(2)}
                      </p>
                      <span style={{
                        display: 'inline-block', background: ACCENT, color: ACCENT_TEXT,
                        fontFamily: FB, fontSize: 11, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 999,
                      }}>
                        Order
                      </span>
                    </div>
                  </div>
                </a>
              )
            })}
          </>
        )}
      </div>

      <CxTabBar slug={slug} active="search" />
    </div>
  )
}