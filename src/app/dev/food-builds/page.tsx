'use client'
// DEV ONLY — demonstrates food-build archetypes with live add/remove
import { ProductCustomiser } from '@/components/order/ProductCustomiser'

const ARCHETYPES: {
  label: string
  archetype: string
  price: number
  description: string
}[] = [
  {
    label: 'Salad Bowl',
    archetype: 'salad',
    price: 16.50,
    description: 'Bowl layout — tap to add/remove toppings',
  },
  {
    label: 'Brekky Bowl',
    archetype: 'brekky',
    price: 14.00,
    description: 'Bowl layout — granola, yoghurt, berries base',
  },
  {
    label: 'Toastie',
    archetype: 'toastie',
    price: 11.50,
    description: 'Stack layout — stacked fillings on toast',
  },
  {
    label: 'Wrap',
    archetype: 'wrap',
    price: 13.00,
    description: 'Stack layout — fillings inside a wrap',
  },
  {
    label: 'Cooked Breakfast',
    archetype: 'breakfast',
    price: 19.00,
    description: 'Scatter layout — items orbit the toast base',
  },
]

export default function FoodBuildsPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#f7f7f5',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 20px 200px',
      gap: 0,
    }}>
      <h1 style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 20,
        fontWeight: 700,
        color: '#0a0a0a',
        margin: '0 0 6px',
        letterSpacing: '-0.02em',
      }}>
        ORD-FOOD-BUILDS — dev preview
      </h1>
      <p style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        color: '#6b7280',
        margin: '0 0 48px',
        textAlign: 'center',
      }}>
        Each archetype uses the existing LayeredProduct + ProductCustomiser engine.
        Tap tiles to add/remove. Drag to drop zone.
      </p>

      {ARCHETYPES.map((item, idx) => (
        <section
          key={item.archetype}
          style={{
            width: '100%',
            maxWidth: 540,
            marginBottom: 64,
          }}
        >
          {/* Section header */}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            padding: '0 0 16px',
            borderBottom: '1px solid #e5e7eb',
            marginBottom: 8,
          }}>
            <span style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 11,
              fontWeight: 700,
              color: '#9ca3af',
              minWidth: 24,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>
              {String(idx + 1).padStart(2, '0')}
            </span>
            <span style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 18,
              fontWeight: 700,
              color: '#0a0a0a',
              letterSpacing: '-0.02em',
            }}>
              {item.label}
            </span>
            <span style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#6b7280',
              background: '#f3f4f6',
              padding: '2px 8px',
              borderRadius: 6,
            }}>
              {item.archetype}
            </span>
            <span style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              color: '#9ca3af',
              marginLeft: 'auto',
            }}>
              {item.description}
            </span>
          </div>

          {/* Customiser */}
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}>
            <ProductCustomiser
              archetype={item.archetype}
              productPrice={item.price}
              size={220}
            />
          </div>
        </section>
      ))}
    </div>
  )
}