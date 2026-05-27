'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import RecipeImportTab from '@/components/dashboard/RecipeImportTab';
import ScaleModal from '@/components/dashboard/RecipeScaleModal';
import WasteModal from '@/components/dashboard/RecipeWasteModal';
import ProductionTab from '@/components/dashboard/RecipeProductionTab';
import InsightsTab from '@/components/dashboard/RecipeInsightsTab';

interface Ingredient { id?: string; ingredient_name: string; quantity: number; unit: string; cost_cents?: number | null; cost_per_unit?: number | null; supplier_id?: string | null; allergens?: string[]; notes?: string | null; }
interface Recipe { id: string; name: string; description: string | null; category: string | null; serves: number; prep_time_minutes: number | null; sell_price_cents: number | null; cost_cents: number | null; cost_per_serve?: number | null; menu_price?: number | null; margin_percent?: number | null; allergens?: string[] | null; linked_product_id?: string | null; notes: string | null; is_active: boolean; recipe_ingredients: Ingredient[]; }

const UNITS = ['g', 'kg', 'ml', 'L', 'each', 'tsp', 'tbsp', 'cup', 'slice'];
const CATEGORIES = ['coffee', 'food', 'drink', 'cocktail', 'juice', 'other'];
const ALLERGENS = ['Gluten','Dairy','Eggs','Nuts','Peanuts','Sesame','Soy','Fish','Shellfish','Lupin','Sulphites'];
const ALLERGEN_ICON: Record<string, string> = { Gluten:'🌾', Dairy:'🥛', Eggs:'🥚', Nuts:'🌰', Peanuts:'🥜', Sesame:'🌱', Soy:'🫘', Fish:'🐟', Shellfish:'🦐', Lupin:'🌼', Sulphites:'🧪' };

const BLANK_ING: Ingredient = { ingredient_name: '', quantity: 1, unit: 'g', cost_per_unit: null, supplier_id: null, allergens: [] };
const BLANK_RECIPE = { name: '', description: '', category: 'food', serves: 1, prep_time_minutes: '', sell_price_cents: '', menu_price: '', notes: '', allergens: [] as string[], linked_product_id: '', ingredients: [{ ...BLANK_ING }] };

function centsToDollars(c: number | null) { return c != null ? (c / 100).toFixed(2) : '—'; }

export default function RecipesPage() {
  const { business } = useBusinessContext();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_RECIPE });
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'recipes' | 'production' | 'insights' | 'training' | 'import'>('recipes');
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [scaleModal, setScaleModal] = useState<Recipe | null>(null);
  const [wasteModal, setWasteModal] = useState<Recipe | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/recipes?business_id=${business.id}`).then(r => r.json()).catch(() => ({ recipes: [] }));
    setRecipes(res.recipes ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!business?.id) return;
    fetch(`/api/pos/suppliers?business_id=${business.id}`).then(r => r.json()).then(d => setSuppliers(d.suppliers ?? [])).catch(() => {});
    fetch(`/api/pos/products`).then(r => r.json()).then(d => setProducts(d.products ?? [])).catch(() => {});
  }, [business?.id]);

  async function getSuggestions() {
    if (!business?.id) return;
    setSuggesting(true);
    const res = await fetch('/api/aria/recipe-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    }).then(r => r.json()).catch(() => ({ suggestions: [] }));
    setSuggestions(res.suggestions ?? []);
    setSuggesting(false);
  }

  function applySuggestion(s: any) {
    setForm({
      name: s.name ?? '',
      description: s.description ?? '',
      category: s.category ?? 'food',
      serves: 1,
      prep_time_minutes: '',
      sell_price_cents: s.suggested_sell_price_dollars ? String(Math.round(s.suggested_sell_price_dollars * 100)) : '',
      menu_price: s.suggested_sell_price_dollars ? String(s.suggested_sell_price_dollars) : '',
      notes: s.reason ?? '',
      allergens: [],
      linked_product_id: '',
      ingredients: (s.ingredients ?? []).map((ing: any) => ({
        ingredient_name: ing.ingredient_name,
        quantity: ing.quantity,
        unit: ing.unit ?? 'g',
        cost_per_unit: null,
        supplier_id: null,
        allergens: [],
      })),
    });
    setEditId(null);
    setShowForm(true);
    setSuggestions([]);
  }

  function openEdit(recipe: Recipe) {
    setForm({
      name: recipe.name,
      description: recipe.description ?? '',
      category: recipe.category ?? 'food',
      serves: recipe.serves,
      prep_time_minutes: recipe.prep_time_minutes != null ? String(recipe.prep_time_minutes) : '',
      sell_price_cents: recipe.sell_price_cents != null ? String(recipe.sell_price_cents) : '',
      menu_price: recipe.menu_price != null ? String(recipe.menu_price) : '',
      notes: recipe.notes ?? '',
      allergens: recipe.allergens ?? [],
      linked_product_id: recipe.linked_product_id ?? '',
      ingredients: recipe.recipe_ingredients.length > 0
        ? recipe.recipe_ingredients.map(i => ({ ingredient_name: i.ingredient_name, quantity: i.quantity, unit: i.unit, cost_cents: i.cost_cents, cost_per_unit: i.cost_per_unit ?? null, supplier_id: i.supplier_id ?? null, allergens: i.allergens ?? [] }))
        : [{ ...BLANK_ING }],
    });
    setEditId(recipe.id);
    setShowForm(true);
  }

  function totalCost(ings: Ingredient[]): number {
    return ings.reduce((sum, i) => {
      const cpu = i.cost_per_unit ?? (i.cost_cents != null ? Number(i.cost_cents) / 100 : 0);
      return sum + (Number(i.quantity ?? 0) * Number(cpu ?? 0));
    }, 0);
  }

  async function saveRecipe() {
    if (!business?.id || !form.name.trim()) return;
    setSaving(true);
    const ings = form.ingredients.filter(i => i.ingredient_name.trim());
    const serves = Number(form.serves) || 1;
    const recipeCost = totalCost(ings);
    const cost_per_serve = serves > 0 ? recipeCost / serves : recipeCost;
    const menu_price = form.menu_price ? Number(form.menu_price) : null;
    const margin_percent = menu_price && menu_price > 0 ? ((menu_price - cost_per_serve) / menu_price) * 100 : null;
    const payload = {
      business_id: business.id,
      name: form.name,
      description: form.description || null,
      category: form.category || null,
      serves,
      prep_time_minutes: form.prep_time_minutes ? Number(form.prep_time_minutes) : null,
      sell_price_cents: form.sell_price_cents ? Number(form.sell_price_cents) : null,
      menu_price,
      cost_per_serve,
      margin_percent,
      allergens: form.allergens,
      linked_product_id: form.linked_product_id || null,
      notes: form.notes || null,
      ingredients: ings.map(i => ({
        ingredient_name: i.ingredient_name,
        quantity: Number(i.quantity),
        unit: i.unit,
        cost_cents: i.cost_cents ?? null,
        cost_per_unit: i.cost_per_unit ?? null,
        supplier_id: i.supplier_id ?? null,
        allergens: i.allergens ?? [],
      })),
    };
    if (editId) {
      await fetch(`/api/recipes/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } else {
      await fetch('/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setSaving(false);
    setShowForm(false);
    setEditId(null);
    setForm({ ...BLANK_RECIPE });
    load();
  }

  async function deleteRecipe(id: string) {
    if (!confirm('Delete this recipe?')) return;
    await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
    load();
  }

  function updateIng(index: number, field: string, value: any) {
    setForm(f => ({ ...f, ingredients: f.ingredients.map((ing, i) => i === index ? { ...ing, [field]: value } : ing) }));
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] focus:border-[rgba(29,158,117,0.4)]';

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-56" />
        <div className="h-48 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  if (business && business.industry !== 'cafe') {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-2xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-4xl mb-4">☕</div>
          <h2 className="text-white font-semibold text-xl mb-2">Recipes is a café feature</h2>
          <p className="text-sm max-w-sm mx-auto" style={{ color: '#6b7280' }}>
            This module is built for cafés — tracking drink and food recipes, ingredient costs, and staff training.
            If your business is a café, update your industry in Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Recipes</h1>
          <p style={{ color: '#6b7280' }}>Build your menu, train your staff, track ingredient costs.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={getSuggestions} disabled={suggesting}
            className="px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-40 flex items-center gap-1"
            style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
            {suggesting ? <><span className="inline-block w-2.5 h-2.5 border border-[#1D9E75] border-t-transparent rounded-full animate-spin" />Thinking…</> : '✦ Aria suggestions'}
          </button>
          <button onClick={() => { setForm({ ...BLANK_RECIPE }); setEditId(null); setShowForm(true); }}
            className="px-3 py-2 rounded-xl text-xs font-medium text-white"
            style={{ background: '#1D9E75' }}>
            + Add recipe
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['recipes', 'production', 'insights', 'import', 'training'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-medium capitalize ${activeTab === tab ? 'bg-[#1D9E75] text-white' : 'text-gray-400'}`}
            style={activeTab !== tab ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' } : {}}>
            {tab === 'training' ? 'Staff training' : tab === 'import' ? 'Import' : tab}
          </button>
        ))}
      </div>

      {/* Aria suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#1D9E75' }}>✦ Aria suggestions — click to use</p>
          <div className="grid gap-3 md:grid-cols-2">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => applySuggestion(s)}
                className="text-left rounded-xl p-4 hover:border-[rgba(29,158,117,0.4)] transition-colors"
                style={{ background: '#13131a', border: '1px solid rgba(29,158,117,0.2)' }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{s.name}</p>
                  <span className="text-xs text-[#1D9E75] shrink-0">A${s.suggested_sell_price_dollars?.toFixed(2) ?? '—'}</span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>{s.description}</p>
                <p className="text-xs mt-1.5 italic" style={{ color: '#6b7280' }}>{s.reason}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setSuggestions([])} className="mt-2 text-xs" style={{ color: '#6b7280' }}>Dismiss suggestions</button>
        </div>
      )}

      {activeTab === 'recipes' && (
        recipes.length === 0 ? (
          <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-3xl mb-3">🍳</div>
            <p className="font-semibold text-white mb-1">No recipes yet</p>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Add your first recipe or get Aria to suggest some based on your stock.</p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => { setForm({ ...BLANK_RECIPE }); setShowForm(true); }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>Add recipe</button>
              <button onClick={getSuggestions} disabled={suggesting}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
                ✦ Ask Aria
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {recipes.map(r => (
              <div key={r.id} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-medium">{r.name}</h3>
                      {r.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: 'rgba(255,255,255,0.07)', color: '#9ca3af' }}>{r.category}</span>
                      )}
                      {!r.is_active && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Inactive</span>}
                    </div>
                    {r.description && <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{r.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">A${centsToDollars(r.sell_price_cents)}</p>
                      <p className="text-xs" style={{ color: '#6b7280' }}>Serves {r.serves}</p>
                      {r.cost_cents != null && r.cost_cents > 0 && (
                        <p className="text-xs mt-0.5" style={{ color: r.sell_price_cents && r.sell_price_cents > r.cost_cents ? '#22C55E' : '#EF4444' }}>
                          cost A${centsToDollars(r.serves > 0 ? Math.round(r.cost_cents / r.serves) : r.cost_cents)}/serve
                          {r.sell_price_cents && r.sell_price_cents > 0 && (
                            <span style={{ marginLeft: 4 }}>{Math.round((1 - r.cost_cents / r.sell_price_cents) * 100)}% margin</span>
                          )}
                        </p>
                      )}
                    </div>
                    <button onClick={() => setScaleModal(r)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>Scale</button>
                    <button onClick={() => setWasteModal(r)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>Log waste</button>
                    <button onClick={() => openEdit(r)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Edit</button>
                    <button onClick={() => deleteRecipe(r.id)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Delete</button>
                  </div>
                </div>
                {r.allergens && r.allergens.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {r.allergens.map(a => (
                      <span key={a} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                        {ALLERGEN_ICON[a] ?? '⚠'} {a}
                      </span>
                    ))}
                  </div>
                )}
                {r.menu_price != null && r.cost_per_serve != null && (
                  <div className="flex items-center gap-2 mb-2">
                    {(() => {
                      const m = r.margin_percent ?? 0;
                      const color = m > 70 ? '#22C55E' : m >= 40 ? '#f59e0b' : '#ef4444';
                      return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: color + '22', color }}>● {m.toFixed(0)}% margin · A${Number(r.cost_per_serve).toFixed(2)} cost / A${Number(r.menu_price).toFixed(2)} price</span>;
                    })()}
                  </div>
                )}
                {r.recipe_ingredients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.recipe_ingredients.map((ing, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}>
                        {ing.ingredient_name} {ing.quantity}{ing.unit}
                      </span>
                    ))}
                  </div>
                )}
                {r.prep_time_minutes && (
                  <p className="text-xs mt-2" style={{ color: '#4b5563' }}>Prep: {r.prep_time_minutes} min</p>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'production' && business?.id && (
        <ProductionTab businessId={business.id} recipes={recipes} />
      )}

      {activeTab === 'insights' && business?.id && (
        <InsightsTab businessId={business.id} />
      )}

      {activeTab === 'import' && business?.id && (
        <RecipeImportTab businessId={business.id} existingRecipes={recipes.map(r => ({ id: r.id, name: r.name }))} />
      )}

      {activeTab === 'training' && business?.id && (
        <TrainingTab businessId={business.id} recipes={recipes} />
      )}

      {scaleModal && <ScaleModal recipe={scaleModal} businessId={business?.id ?? ''} onClose={() => setScaleModal(null)} />}
      {wasteModal && <WasteModal recipe={wasteModal} businessId={business?.id ?? ''} onClose={() => setWasteModal(null)} />}

      {/* Recipe form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#13131a] rounded-2xl p-6 w-full max-w-lg border border-[rgba(255,255,255,0.1)] my-8">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">{editId ? 'Edit recipe' : 'Add recipe'}</h3>
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-gray-400 hover:text-white text-lg">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Recipe name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Oat flat white" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Brief description" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                    {CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#1a1a2e' }}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Serves</label>
                  <input type="number" min={1} value={form.serves} onChange={e => setForm(f => ({ ...f, serves: Number(e.target.value) }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Prep (min)</label>
                  <input type="number" min={0} value={form.prep_time_minutes} onChange={e => setForm(f => ({ ...f, prep_time_minutes: e.target.value }))} className={inputCls} placeholder="5" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Sell price (A$ cents)</label>
                <input type="number" min={0} value={form.sell_price_cents} onChange={e => setForm(f => ({ ...f, sell_price_cents: e.target.value }))} className={inputCls} placeholder="650" />
                <p className="text-xs mt-0.5" style={{ color: '#4b5563' }}>Enter in cents, e.g. 650 = A$6.50</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">Ingredients</label>
                  <button onClick={() => setForm(f => ({ ...f, ingredients: [...f.ingredients, { ...BLANK_ING }] }))}
                    className="text-xs" style={{ color: '#1D9E75' }}>+ Add</button>
                </div>
                <div className="space-y-2">
                  {form.ingredients.map((ing, i) => (
                    <div key={i} className="space-y-1.5 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="grid grid-cols-[1fr_80px_80px_auto] gap-1.5">
                        <input value={ing.ingredient_name} onChange={e => updateIng(i, 'ingredient_name', e.target.value)} className={inputCls} placeholder="Ingredient" />
                        <input type="number" step="0.1" min={0} value={ing.quantity} onChange={e => updateIng(i, 'quantity', e.target.value)} className={inputCls} placeholder="Qty" />
                        <select value={ing.unit} onChange={e => updateIng(i, 'unit', e.target.value)} className={inputCls}>
                          {UNITS.map(u => <option key={u} value={u} style={{ background: '#1a1a2e' }}>{u}</option>)}
                        </select>
                        <button onClick={() => setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, j) => j !== i) }))}
                          className="text-red-400 hover:text-red-300 text-lg px-1">×</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input type="number" step="0.01" min={0} value={ing.cost_per_unit ?? ''} onChange={e => updateIng(i, 'cost_per_unit', e.target.value ? Number(e.target.value) : null)} className={inputCls} placeholder="Cost / unit (A$)" />
                        <select value={ing.supplier_id ?? ''} onChange={e => updateIng(i, 'supplier_id', e.target.value || null)} className={inputCls}>
                          <option value="" style={{ background: '#1a1a2e' }}>No supplier</option>
                          {suppliers.map(s => <option key={s.id} value={s.id} style={{ background: '#1a1a2e' }}>{s.name}</option>)}
                        </select>
                      </div>
                      <p className="text-xs" style={{ color: '#4b5563' }}>
                        Line cost: A${(Number(ing.quantity ?? 0) * Number(ing.cost_per_unit ?? 0)).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 rounded-lg p-2 flex items-center justify-between" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)' }}>
                  <span className="text-xs" style={{ color: '#9ca3af' }}>Total recipe cost</span>
                  <span className="text-sm font-semibold text-white">A${totalCost(form.ingredients).toFixed(2)}</span>
                </div>
                {form.menu_price && Number(form.menu_price) > 0 && (() => {
                  const serves = Number(form.serves) || 1;
                  const cps = totalCost(form.ingredients) / serves;
                  const mp = Number(form.menu_price);
                  const m = ((mp - cps) / mp) * 100;
                  const color = m > 70 ? '#22C55E' : m >= 40 ? '#f59e0b' : '#ef4444';
                  return (
                    <div className="mt-1.5 rounded-lg p-2 flex items-center justify-between" style={{ background: color + '15', border: `1px solid ${color}40` }}>
                      <span className="text-xs" style={{ color: '#9ca3af' }}>Margin (A${cps.toFixed(2)} cost / A${mp.toFixed(2)} price)</span>
                      <span className="text-sm font-semibold" style={{ color }}>● {m.toFixed(0)}%</span>
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Menu price (A$)</label>
                <input type="number" step="0.01" min={0} value={form.menu_price} onChange={e => setForm(f => ({ ...f, menu_price: e.target.value }))} className={inputCls} placeholder="6.50" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Linked product (for sales tracking)</label>
                <select value={form.linked_product_id} onChange={e => setForm(f => ({ ...f, linked_product_id: e.target.value }))} className={inputCls}>
                  <option value="" style={{ background: '#1a1a2e' }}>Not linked</option>
                  {products.map(p => <option key={p.id} value={p.id} style={{ background: '#1a1a2e' }}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Allergens</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALLERGENS.map(a => {
                    const on = form.allergens.includes(a);
                    return (
                      <button key={a} type="button"
                        onClick={() => setForm(f => ({ ...f, allergens: on ? f.allergens.filter(x => x !== a) : [...f.allergens, a] }))}
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ background: on ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.05)', color: on ? '#f59e0b' : '#9ca3af', border: `1px solid ${on ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
                        {ALLERGEN_ICON[a]} {a}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} placeholder="Preparation notes, allergens, etc." />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              <button onClick={saveRecipe} disabled={saving || !form.name.trim()} className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Add recipe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrainingTab({ businessId, recipes }: { businessId: string; recipes: Recipe[] }) {
  const [staff, setStaff] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [staffRes, trainingRes] = await Promise.all([
        fetch(`/api/staff?business_id=${businessId}`).then(r => r.json()).catch(() => ({ staff: [] })),
        fetch(`/api/recipes/training?business_id=${businessId}`).then(r => r.json()).catch(() => ({ training: [] })),
      ]);
      setStaff(staffRes.staff ?? staffRes.data ?? []);
      setTraining(trainingRes.training ?? []);
      setLoading(false);
    }
    fetchData();
  }, [businessId]);

  function getStatus(staffId: string, recipeId: string) {
    return training.find(t => t.staff_member_id === staffId && t.recipe_id === recipeId)?.status ?? 'not_started';
  }

  async function updateStatus(staffId: string, recipeId: string, status: string) {
    setSaving(true);
    await fetch('/api/recipes/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, staff_member_id: staffId, recipe_id: recipeId, status }),
    });
    const res = await fetch(`/api/recipes/training?business_id=${businessId}`).then(r => r.json()).catch(() => ({ training: [] }));
    setTraining(res.training ?? []);
    setSaving(false);
  }

  const statusColor: Record<string, string> = {
    completed: '#1D9E75',
    in_progress: '#f59e0b',
    needs_review: '#ef4444',
    not_started: '#374151',
  };

  if (loading) return <div className="h-32 animate-pulse rounded-xl" style={{ background: '#13131a' }} />;

  if (!staff.length || !recipes.length) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-white font-medium mb-1">No data to show</p>
        <p className="text-sm" style={{ color: '#6b7280' }}>{!staff.length ? 'Add staff members to track training.' : 'Add recipes to track training.'}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      <table className="w-full text-sm" style={{ background: '#0d0d14' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>Staff member</th>
            {recipes.slice(0, 8).map(r => (
              <th key={r.id} className="px-3 py-3 text-left text-xs font-medium max-w-[100px] truncate" style={{ color: '#6b7280' }} title={r.name}>{r.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td className="px-4 py-3 text-white font-medium">{s.name}</td>
              {recipes.slice(0, 8).map(r => {
                const status = getStatus(s.id, r.id);
                return (
                  <td key={r.id} className="px-3 py-3">
                    <select
                      value={status}
                      disabled={saving}
                      onChange={e => updateStatus(s.id, r.id, e.target.value)}
                      className="text-xs rounded-lg px-2 py-1 outline-none border-0"
                      style={{ background: statusColor[status] + '22', color: statusColor[status] }}>
                      <option value="not_started">Not started</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                      <option value="needs_review">Needs review</option>
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
