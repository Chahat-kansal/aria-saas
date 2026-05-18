'use client'
import Link from 'next/link'

export default function InventoryPage() {
  return (
    <div className="p-6 max-w-4xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header>
        <h1 className="text-2xl font-medium">Inventory</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Manage your products and stock levels
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/pos/products"
          className="rounded-xl p-5 block transition-colors"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="text-2xl mb-2">📦</div>
          <p className="font-medium">Products</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Browse and manage your product catalogue
          </p>
        </Link>

        <Link href="/dashboard/inventory/import"
          className="rounded-xl p-5 block transition-colors"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="text-2xl mb-2">📤</div>
          <p className="font-medium">Import products</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Bulk import from Shopfront, Lightspeed, Vend or any CSV export
          </p>
        </Link>

        <Link href="/dashboard/reorder"
          className="rounded-xl p-5 block transition-colors"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="text-2xl mb-2">🔁</div>
          <p className="font-medium">Reorder suggestions</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            AI-powered stock replenishment recommendations
          </p>
        </Link>

        <Link href="/dashboard/warehouse/stock"
          className="rounded-xl p-5 block transition-colors"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div className="text-2xl mb-2">🏪</div>
          <p className="font-medium">Stock levels</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            View and adjust current stock on hand
          </p>
        </Link>
      </div>
    </div>
  )
}
