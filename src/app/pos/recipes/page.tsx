'use client'
import { useState, useEffect } from 'react'

interface Ingredient { id: string; ingredient_name: string; quantity: number; unit: string | null; cost_cents: number | null; product_id: string | null }
interface Recipe { id: string; name: string; product_id: string | null; description: string | null; category: string | null; serves: number; prep_time_minutes: number | null; cost_cents: number | null; sell_price_cents: number | null; notes: string | null; recipe_ingredients: Ingredient[] }

const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', category: '', serves: '1', prep_time_minutes: '', cost_cents: '', sell_price_cents: '', notes: '' })
  const [ingredients, setIngredients] = useState<Array<{ ingredient_name: string; quantity: string; unit: string; cost_cents: string }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/pos/recipes').then(r => r.json()).catch(() => ({ recipes: [] }))
    setRecipes(res.recipes ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function addIngredient() {
    setIngredients(i => [...i, { ingredient_name: '', quantity: '1', unit: 'g', cost_cents: '' }])
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true); setError('')
    const res = await fetch('/api/pos/recipes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, category: form.category || null,
        serves: parseInt(form.serves) || 1,
        prep_time_minutes: form.prep_time_minutes ? parseInt(form.prep_time_minutes) : null,
        cost_cents: form.cost_cents ? Math.round(parseFloat(form.cost_cents) * 100) : null,
        sell_price_cents: form.sell_price_cents ? Math.round(parseFloat(form.sell_price_cents) * 100) : null,
        notes: form.notes || null,
        ingredients: ingredients.filter(i => i.ingredient_name.trim()).map(i => ({
          ingredient_name: i.ingredient_name,
          quantity: parseFloat(i.quantity) || 1,
          unit: i.unit || null,
          cost_cents: i.cost_cents ? Math.round(parseFloat(i.cost_cents) * 100) : null,
        })),
      }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.error) { setError(res.error); setSaving(false); return }
    setShowForm(false)
    setForm({ name: '', category: '', serves: '1', prep_time_minutes: '', cost_cents: '', sell_price_cents: '', notes: '' })
    setIngredients([])
    load()
    setSaving(false)
  }

  async function del(id: string) {
    if (!confirm('Delete this recipe?')) return
    await fetch(`/api/pos/recipes?id=${id}`, { method: 'DELETE' })
    setRecipes(r => r.filter(x => x.id !== id))
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Recipes & Costing</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Link menu items to ingredients for automatic stock deduction and costing.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + New Recipe
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px' }}>New Recipe</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Name *</label>
              <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Flat White" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Category</label>
              <input style={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Coffee, Food" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Serves</label>
              <input style={inp} type="number" min={1} value={form.serves} onChange={e => setForm(f => ({ ...f, serves: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Prep time (mins)</label>
              <input style={inp} type="number" min={0} value={form.prep_time_minutes} onChange={e => setForm(f => ({ ...f, prep_time_minutes: e.target.value }))} placeholder="e.g. 3" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cost per serve (A$)</label>
              <input style={inp} type="number" step="0.01" min={0} value={form.cost_cents} onChange={e => setForm(f => ({ ...f, cost_cents: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Sell price (A$)</label>
              <input style={inp} type="number" step="0.01" min={0} value={form.sell_price_cents} onChange={e => setForm(f => ({ ...f, sell_price_cents: e.target.value }))} placeholder="0.00" />
            </div>
          </div>

          {/* Ingredients */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Ingredients</label>
              <button onClick={addIngredient} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>+ Add</button>
            </div>
            {ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 6 }}>
                <input style={inp} placeholder="Ingredient name" value={ing.ingredient_name} onChange={e => setIngredients(arr => arr.map((x, j) => j === i ? { ...x, ingredient_name: e.target.value } : x))} />
                <input style={inp} type="number" step="0.1" placeholder="Qty" value={ing.quantity} onChange={e => setIngredients(arr => arr.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                <input style={inp} placeholder="Unit" value={ing.unit} onChange={e => setIngredients(arr => arr.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                <input style={inp} type="number" step="0.01" placeholder="Cost $" value={ing.cost_cents} onChange={e => setIngredients(arr => arr.map((x, j) => j === i ? { ...x, cost_cents: e.target.value } : x))} />
                <button onClick={() => setIngredients(arr => arr.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--destructive)', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            ))}
          </div>

          {error && <p style={{ color: 'var(--destructive)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving || !form.name.trim()} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save Recipe'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Recipe list */}
      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : recipes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No recipes yet. Create one to link menu items to ingredients.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recipes.map(r => {
            const margin = r.cost_cents && r.sell_price_cents
              ? Math.round(((r.sell_price_cents - r.cost_cents) / r.sell_price_cents) * 100)
              : null
            const isOpen = expanded === r.id
            return (
              <div key={r.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
                <div onClick={() => setExpanded(isOpen ? null : r.id)}
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {r.category && <span style={{ marginRight: 8 }}>{r.category}</span>}
                      {r.serves > 1 && <span style={{ marginRight: 8 }}>Serves {r.serves}</span>}
                      {r.prep_time_minutes && <span style={{ marginRight: 8 }}>{r.prep_time_minutes} min</span>}
                      <span style={{ color: '#94A3B8' }}>{r.recipe_ingredients?.length ?? 0} ingredients</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    {r.cost_cents && <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Cost</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#EF4444' }}>A${(r.cost_cents / 100).toFixed(2)}</div>
                    </div>}
                    {r.sell_price_cents && <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Sell</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#7FB897' }}>A${(r.sell_price_cents / 100).toFixed(2)}</div>
                    </div>}
                    {margin !== null && <div style={{ fontSize: 12, padding: '3px 8px', borderRadius: 99, background: margin > 60 ? 'rgba(127,184,151,0.15)' : 'rgba(245,158,11,0.1)', color: margin > 60 ? '#7FB897' : '#F59E0B', fontWeight: 700 }}>
                      {margin}% margin
                    </div>}
                    <button onClick={e => { e.stopPropagation(); del(r.id) }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16 }}>×</button>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isOpen && r.recipe_ingredients?.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--divider)', padding: '12px 16px', background: 'var(--bg-elevated)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {['Ingredient', 'Qty', 'Unit', 'Cost'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-tertiary)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {r.recipe_ingredients.map(ing => (
                          <tr key={ing.id}>
                            <td style={{ padding: '5px 8px', color: 'var(--text-primary)' }}>{ing.ingredient_name}</td>
                            <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{ing.quantity}</td>
                            <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{ing.unit ?? '—'}</td>
                            <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{ing.cost_cents ? `A$${(ing.cost_cents / 100).toFixed(2)}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}