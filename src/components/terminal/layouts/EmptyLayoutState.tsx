'use client'
import { Package, Search } from 'lucide-react'

export function EmptyLayoutState({
  reason,
  searchQuery,
}: {
  reason: 'no-search-match' | 'category-empty' | 'no-products'
  searchQuery?: string
}) {
  let icon = <Package size={48} />
  let title = ''
  let body = ''

  if (reason === 'no-search-match') {
    icon = <Search size={48} />
    title = `No matches for "${searchQuery}"`
    body = 'Try a different search, or scan the barcode directly.'
  } else if (reason === 'category-empty') {
    icon = <Package size={48} />
    title = 'No products in this category'
    body = 'Switch categories or add products in Inventory.'
  } else {
    icon = <Package size={48} />
    title = 'No products yet'
    body = 'Add your first product in Inventory, or import from your old POS.'
  }

  return (
    <div style={{
      height: '100%', minHeight: 400,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 40, textAlign: 'center',
      color: 'var(--text-tertiary)',
    }}>
      <div style={{ color: 'var(--violet)', opacity: 0.5 }}>{icon}</div>
      <p style={{
        fontFamily: "'Instrument Serif',Georgia,serif",
        fontSize: 22, fontStyle: 'italic',
        color: 'var(--text-primary)', margin: 0,
      }}>{title}</p>
      <p style={{ fontSize: 13, maxWidth: 360, margin: 0, lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  )
}
