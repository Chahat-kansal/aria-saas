'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { apiFetch } from '@/lib/api/client';
import RecipeImportTab from '@/components/dashboard/RecipeImportTab';
import ScaleModal from '@/components/dashboard/RecipeScaleModal';
import WasteModal from '@/components/dashboard/RecipeWasteModal';
import ProductionTab from '@/components/dashboard/RecipeProductionTab';
import InsightsTab from '@/components/dashboard/RecipeInsightsTab';

interface Ingredient {
  id?: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  cost_cents?: number | null;
  cost_per_unit?: number | null;
  wastage_pct?: number | null;
  supplier_id?: string | null;
  allergens?: string[];
  notes?: string | null;
  product_id?: string | null;
  effective_cost_per_unit?: number | null;
}
interface Recipe {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  serves: number;
  prep_time_minutes: number | null;
  sell_price_cents: number | null;
  cost_cents: number | null;
  cost_per_serve?: number | null;
  cost_per_serving?: number | null;
  menu_price?: number | null;
  margin_percent?: number | null;
  margin?: number | null;
  allergens?: string[] | null;
  linked_product_id?: string | null;
  notes: string | null;
  is_active: boolean;
  recipe_ingredients: Ingredient[];
  total_cost?: number | null;
  yield_qty?: number | null;
  yield_unit?: string | null;
  source?: string | null;
  ingredient_count?: number;
  suggested_price?: number | null;
  last_costed_at?: string | null;
  last_cost_updated_at?: string | null;
}

const UNITS = ['g', 'kg', 'ml', 'L', 'each', 'tsp', 'tbsp', 'cup', 'slice'];
const CATEGORIES = ['coffee', 'food', 'drink', 'cocktail', 'juice', 'other'];
const ALLERGENS = ['Gluten','Dairy','Eggs','Nuts','Peanuts','Sesame','Soy','Fish','Shellfish','Lupin','Sulphites'];
const ALLERGEN_ICON: Record<string, string> = { Gluten:'🌾', Dairy:'🥛', Eggs:'🥚', Nuts:'🌰', Peanuts:'🥜', Sesame:'🌱', Soy:'🫘', Fish:'🐟', Shellfish:'🦐', Lupin:'🌼', Sulphites:'🧪' };
const MARGIN_COLOR = (m: number | null | undefined) => m == null ? '#9ca3af' : m >= 50 ? '#22C55E' : m >= 30 ? '#f59e0b' : '#ef4444';
const MARGIN_TIER = (m: number | null | undefined): 'healthy' | 'warning' | 'critical' | null => m == null ? null : m >= 50 ? 'healthy' : m >= 30 ? 'warning' : 'critical';

const BLANK_ING: Ingredient = { ingredient_name: '', quantity: 1, unit: 'g', cost_per_unit: null, wastage_pct: 0, supplier_id: null, allergens: [] };
const BLANK_RECIPE = { name: '', description: '', category: 'food', serves: 1, prep_time_minutes: '', sell_price_cents: '', menu_price: '', notes: '', allergens: [] as string[], linked_product_id: '', ingredients: [{ ...BLANK_ING }] };

function fmt(n: number | null | undefined, prefix = 'A$') { return n != null ? prefix + Number(n).toFixed(2) : '—'; }
function centsToDollars(c: number | null) { return c != null ? (c / 100).toFixed(2) : '—'; }

// ── Header stat card ─────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', minWidth: 110 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? '#fff', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

export default function RecipesPage() {
  const { business } = useBusinessContext();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_RECIPE });
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, unknown>[]>([]);
  const [activeTab, setActiveTab] = useState<'recipes' | 'production' | 'insights' | 'training' | 'import'>('recipes');
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [scaleModal, setScaleModal] = useState<Recipe | null>(null);
  const [wasteModal, setWasteModal] = useState<Recipe | null>(null);
  const [detailModal, setDetailModal] = useState<Recipe | null>(null);
  const [recalculating, setRecalculating] = useState<string | null>(null);
  const [detectingAllergens, setDetectingAllergens] = useState<string | null>(null);
  const [scaleInput, setScaleInput] = useState('');
  const [scaleResult, setScaleResult] = useState<{ ingredients: Array<{ ingredient_name: string; quantity: number; unit: string; line_cost: number | null }>; total_cost: number; cost_per_serving: number | null } | null>(null);
  const [scaling, setScaling] = useState(false);
  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMarginTier, setFilterMarginTier] = useState('');
  const [filterAllergen, setFilterAllergen] = useState('');
  // Last import info
  const [lastImportDate, setLastImportDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [recRes, importRes] = await Promise.all([
      fetch('/api/pos/recipes?business_id=' + business.id).then(r => r.json()).catch(() => ({ recipes: [] })),
      fetch('/api/pos/recipes/import?business_id=' + business.id).then(r => r.json()).catch(() => ({ imports: [] })),
    ]);
    setRecipes(recRes.recipes ?? []);
    const imports = importRes.imports ?? [];
    if (imports.length > 0) {
      const last = imports[0].imported_at ?? imports[0].created_at;
      setLastImportDate(last ? new Date(last).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
    }
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!business?.id) return;
    fetch('/api/pos/suppliers?business_id=' + business.id).then(r => r.json()).then(d => setSuppliers(d.suppliers ?? [])).catch(() => {});
    fetch('/api/pos/products').then(r => r.json()).then(d => setProducts(d.products ?? [])).catch(() => {});
  }, [business?.id]);

  // Header stats
  const totalRecipes = recipes.length;
  const withMargin = recipes.filter(r => r.margin != null || r.margin_percent != null);
  const avgMargin = withMargin.length
    ? Math.round(withMargin.reduce((s, r) => s + (Number(r.margin ?? r.margin_percent ?? 0)), 0) / withMargin.length)
    : null;
  const belowThirty = recipes.filter(r => {
    const m = r.margin ?? r.margin_percent;
    return m != null && m < 30;
  }).length;

  // Filtered recipe list
  const visibleRecipes = recipes.filter(r => {
    if (filterCategory && r.category !== filterCategory) return false;
    if (filterMarginTier) {
      const tier = MARGIN_TIER(r.margin ?? r.margin_percent);
      if (tier !== filterMarginTier) return false;
    }
    if (filterAllergen) {
      if (!r.allergens?.includes(filterAllergen)) return false;
    }
    return true;
  });

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

  function applySuggestion(s: Record<string, unknown>) {
    setForm({
      name: (s.name as string) ?? '',
      description: (s.description as string) ?? '',
      category: (s.category as string) ?? 'food',
      serves: 1,
      prep_time_minutes: '',
      sell_price_cents: s.suggested_sell_price_dollars ? String(Math.round(Number(s.suggested_sell_price_dollars) * 100)) : '',
      menu_price: s.suggested_sell_price_dollars ? String(s.suggested_sell_price_dollars) : '',
      notes: (s.reason as string) ?? '',
      allergens: [],
      linked_product_id: '',
      ingredients: ((s.ingredients as Record<string, unknown>[]) ?? []).map(ing => ({
        ingredient_name: (ing.ingredient_name as string) ?? '',
        quantity: (ing.quantity as number) ?? 1,
        unit: (ing.unit as string) ?? 'g',
        cost_per_unit: null,
        wastage_pct: 0,
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
        ? recipe.recipe_ingredients.map(i => ({ ingredient_name: i.ingredient_name, quantity: i.quantity, unit: i.unit, cost_cents: i.cost_cents, cost_per_unit: i.cost_per_unit ?? null, wastage_pct: i.wastage_pct ?? 0, supplier_id: i.supplier_id ?? null, allergens: i.allergens ?? [] }))
        : [{ ...BLANK_ING }],
    });
    setEditId(recipe.id);
    setShowForm(true);
  }

  function totalCost(ings: Ingredient[]): number {
    return ings.reduce((sum, i) => {
      const cpu = i.cost_per_unit ?? (i.cost_cents != null ? Number(i.cost_cents) / 100 : 0);
      const wastage = i.wastage_pct ?? 0;
      return sum + (Number(i.quantity ?? 0) * Number(cpu ?? 0) * (1 + wastage / 100));
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
        wastage_pct: i.wastage_pct ?? 0,
        supplier_id: i.supplier_id ?? null,
        allergens: i.allergens ?? [],
      })),
    };
    if (editId) {
      await fetch('/api/pos/recipes/' + editId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } else {
      await fetch('/api/pos/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setSaving(false);
    setShowForm(false);
    setEditId(null);
    setForm({ ...BLANK_RECIPE });
    load();
  }

  async function deleteRecipe(id: string) {
    if (!confirm('Delete this recipe?')) return;
    await fetch('/api/pos/recipes/' + id, { method: 'DELETE' });
    load();
  }

  async function recalcCost(id: string) {
    setRecalculating(id);
    try {
      const res = await fetch('/api/pos/recipes/' + id + '/cost').then(r => r.json());
      if (res.total_cost != null) {
        setRecipes(prev => prev.map(r => r.id === id ? { ...r, total_cost: res.total_cost, margin: res.margin ?? r.margin, suggested_price: res.suggested_price } : r));
      }
    } catch { /* ignore */ }
    setRecalculating(null);
  }

  async function detectAllergens(id: string) {
    setDetectingAllergens(id);
    try {
      const res = await fetch('/api/pos/recipes/' + id + '/allergens', { method: 'POST' }).then(r => r.json());
      if (Array.isArray(res.allergens)) {
        setRecipes(prev => prev.map(r => r.id === id ? { ...r, allergens: res.allergens } : r));
        if (detailModal?.id === id) setDetailModal(prev => prev ? { ...prev, allergens: res.allergens } : null);
      }
    } catch { /* ignore */ }
    setDetectingAllergens(null);
  }

  async function scaleRecipe(id: string, servings: number) {
    setScaling(true);
    try {
      const res = await fetch('/api/pos/recipes/' + id + '/scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servings }),
      }).then(r => r.json());
      if (res.ingredients) setScaleResult(res);
    } catch { /* ignore */ }
    setScaling(false);
  }

  function updateIng(index: number, field: string, value: unknown) {
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
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Recipes</h1>
          <p style={{ color: '#6b7280' }}>Build your menu, track ingredient costs, and train your staff.</p>
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

      {/* Stats bar */}
      {totalRecipes > 0 && (
        <div className="flex gap-3 mb-5 flex-wrap">
          <StatCard label="Total recipes" value={totalRecipes} />
          <StatCard label="Avg margin" value={avgMargin != null ? avgMargin + '%' : '—'} color={avgMargin != null ? MARGIN_COLOR(avgMargin) : undefined} />
          <StatCard label="Below 30% margin" value={belowThirty} color={belowThirty > 0 ? '#ef4444' : '#22C55E'} />
          {lastImportDate && <StatCard label="Last import" value={lastImportDate} color="rgba(255,255,255,0.5)" />}
        </div>
      )}

      {/* Low margin alert banner */}
      {belowThirty > 0 && activeTab === 'recipes' && (
        <div className="mb-4 rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <p className="text-sm text-white">
            <strong style={{ color: '#ef4444' }}>{belowThirty} recipe{belowThirty > 1 ? 's' : ''}</strong> {belowThirty > 1 ? 'have' : 'has'} margin below 30% — prices may need updating.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {(['recipes', 'production', 'insights', 'import', 'training'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={'px-4 py-2 rounded-xl text-xs font-medium capitalize ' + (activeTab === tab ? 'bg-[#1D9E75] text-white' : 'text-gray-400')}
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
                  <p className="text-sm font-semibold text-white">{s.name as string}</p>
                  <span className="text-xs text-[#1D9E75] shrink-0">A${s.suggested_sell_price_dollars != null ? Number(s.suggested_sell_price_dollars).toFixed(2) : '—'}</span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>{s.description as string}</p>
                <p className="text-xs mt-1.5 italic" style={{ color: '#6b7280' }}>{s.reason as string}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setSuggestions([])} className="mt-2 text-xs" style={{ color: '#6b7280' }}>Dismiss suggestions</button>
        </div>
      )}

      {activeTab === 'recipes' && (
        <>
          {/* Filter bar */}
          {recipes.length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Filter:</span>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="text-xs rounded-lg px-2 py-1 outline-none"
                style={{ background: filterCategory ? 'rgba(29,158,117,0.12)' : 'rgba(255,255,255,0.06)', color: filterCategory ? '#1D9E75' : '#9ca3af', border: '1px solid ' + (filterCategory ? 'rgba(29,158,117,0.3)' : 'rgba(255,255,255,0.08)') }}>
                <option value="">All categories</option>
                {CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#1a1a2e' }}>{c}</option>)}
              </select>
              <select value={filterMarginTier} onChange={e => setFilterMarginTier(e.target.value)}
                className="text-xs rounded-lg px-2 py-1 outline-none"
                style={{ background: filterMarginTier ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.06)', color: filterMarginTier ? '#f59e0b' : '#9ca3af', border: '1px solid ' + (filterMarginTier ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)') }}>
                <option value="">All margins</option>
                <option value="healthy" style={{ background: '#1a1a2e' }}>Healthy (&gt;50%)</option>
                <option value="warning" style={{ background: '#1a1a2e' }}>Warning (30–50%)</option>
                <option value="critical" style={{ background: '#1a1a2e' }}>Critical (&lt;30%)</option>
              </select>
              <select value={filterAllergen} onChange={e => setFilterAllergen(e.target.value)}
                className="text-xs rounded-lg px-2 py-1 outline-none"
                style={{ background: filterAllergen ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.06)', color: filterAllergen ? '#f59e0b' : '#9ca3af', border: '1px solid ' + (filterAllergen ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)') }}>
                <option value="">All allergens</option>
                {ALLERGENS.map(a => <option key={a} value={a} style={{ background: '#1a1a2e' }}>{ALLERGEN_ICON[a]} {a}</option>)}
              </select>
              {(filterCategory || filterMarginTier || filterAllergen) && (
                <button onClick={() => { setFilterCategory(''); setFilterMarginTier(''); setFilterAllergen(''); }}
                  className="text-xs px-2 py-1 rounded-lg" style={{ color: '#9ca3af' }}>✕ Clear</button>
              )}
              <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>{visibleRecipes.length} of {recipes.length}</span>
            </div>
          )}

          {visibleRecipes.length === 0 ? (
            <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-3xl mb-3">🍳</div>
              {recipes.length === 0 ? (
                <>
                  <p className="font-semibold text-white mb-1">No recipes yet</p>
                  <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Import your first recipe — CSV, PDF, or photo — or add manually.</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button onClick={() => setActiveTab('import')} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>Import recipe</button>
                    <button onClick={() => { setForm({ ...BLANK_RECIPE }); setShowForm(true); }} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Add manually</button>
                    <button onClick={getSuggestions} disabled={suggesting} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>✦ Ask Aria</button>
                  </div>
                </>
              ) : <p className="text-sm" style={{ color: '#6b7280' }}>No recipes match the current filters.</p>}
            </div>
          ) : (
            <div className="grid gap-3">
              {visibleRecipes.map(r => {
                const marginVal = r.margin ?? r.margin_percent;
                const marginColor = MARGIN_COLOR(marginVal);
                const cpu = r.cost_per_serving ?? r.cost_per_serve;
                return (
                  <div key={r.id} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {/* Card header row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-white font-medium text-sm">{r.name}</h3>
                          {r.category && <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: 'rgba(255,255,255,0.07)', color: '#9ca3af' }}>{r.category}</span>}
                          {r.yield_qty && <span className="text-xs" style={{ color: '#6b7280' }}>Yield: {r.yield_qty}{r.yield_unit ? ' ' + r.yield_unit : ''}</span>}
                        </div>
                        {r.description && <p className="text-xs mt-0.5 truncate" style={{ color: '#6b7280' }}>{r.description}</p>}
                      </div>
                      {/* Margin badge */}
                      {marginVal != null && (
                        <div className="shrink-0 text-center" style={{ minWidth: 64 }}>
                          <div className="text-lg font-bold" style={{ color: marginColor }}>{Math.round(marginVal)}%</div>
                          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>margin</div>
                        </div>
                      )}
                    </div>

                    {/* Cost / price row */}
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      {cpu != null && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}>Cost/serve: {fmt(cpu)}</span>}
                      {r.total_cost != null && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}>Total cost: {fmt(r.total_cost)}</span>}
                      {r.menu_price != null && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>Sell: {fmt(r.menu_price)}</span>}
                      {r.suggested_price != null && !r.menu_price && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>Suggested: {fmt(r.suggested_price)}</span>}
                      {r.last_costed_at && <span className="text-xs" style={{ color: '#4b5563' }}>Costed: {new Date(r.last_costed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}
                    </div>

                    {/* Allergen badges */}
                    {r.allergens && r.allergens.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {r.allergens.map(a => (
                          <span key={a} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                            {ALLERGEN_ICON[a] ?? '⚠'} {a}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Ingredient chips */}
                    {r.recipe_ingredients.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {r.recipe_ingredients.slice(0, 6).map((ing, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af' }}>
                            {ing.ingredient_name} {ing.quantity}{ing.unit}
                          </span>
                        ))}
                        {r.recipe_ingredients.length > 6 && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ color: '#6b7280' }}>+{r.recipe_ingredients.length - 6} more</span>}
                      </div>
                    )}

                    {/* Action row */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <button onClick={() => setDetailModal(r)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(127,184,151,0.1)', color: '#7FB897' }}>Detail</button>
                      <button onClick={() => recalcCost(r.id)} disabled={recalculating === r.id} className="text-xs px-2 py-1 rounded-lg disabled:opacity-40" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>{recalculating === r.id ? '…' : '↻ Costs'}</button>
                      <button onClick={() => detectAllergens(r.id)} disabled={detectingAllergens === r.id} className="text-xs px-2 py-1 rounded-lg disabled:opacity-40" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>{detectingAllergens === r.id ? '…' : '⚠ Allergens'}</button>
                      <button onClick={() => setScaleModal(r)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>Scale</button>
                      <button onClick={() => setWasteModal(r)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>Waste</button>
                      <button onClick={() => openEdit(r)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Edit</button>
                      <button onClick={() => deleteRecipe(r.id)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', color: '#ef4444' }}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'production' && business?.id && <ProductionTab businessId={business.id} recipes={recipes} />}
      {activeTab === 'insights' && business?.id && <InsightsTab businessId={business.id} />}
      {activeTab === 'import' && business?.id && (
        <RecipeImportTab businessId={business.id} existingRecipes={recipes.map(r => ({ id: r.id, name: r.name }))} onImported={load} />
      )}
      {activeTab === 'training' && business?.id && <TrainingTab businessId={business.id} recipes={recipes} />}

      {/* Scale/waste modals */}
      {scaleModal && <ScaleModal recipe={scaleModal} businessId={business?.id ?? ''} onClose={() => setScaleModal(null)} />}
      {wasteModal && <WasteModal recipe={wasteModal} businessId={business?.id ?? ''} onClose={() => setWasteModal(null)} />}

      {/* Detail drawer */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-end z-50 p-4" onClick={() => { setDetailModal(null); setScaleResult(null); setScaleInput(''); }}>
          <div className="bg-[#13131a] rounded-2xl p-5 w-full max-w-lg border border-[rgba(255,255,255,0.1)] overflow-y-auto" style={{ maxHeight: 'calc(100vh - 32px)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-white font-semibold text-base">{detailModal.name}</h3>
                {detailModal.category && <span className="text-xs capitalize" style={{ color: '#6b7280' }}>{detailModal.category}</span>}
                {detailModal.yield_qty && <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Yield: {detailModal.yield_qty} {detailModal.yield_unit ?? ''}</p>}
              </div>
              <button onClick={() => { setDetailModal(null); setScaleResult(null); setScaleInput(''); }} className="text-gray-400 hover:text-white text-xl leading-none ml-3">×</button>
            </div>

            {/* Cost breakdown */}
            <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Cost breakdown</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span style={{ color: '#9ca3af' }}>Ingredient cost</span>
                <span className="text-right text-white font-medium">{fmt(detailModal.total_cost)}</span>
                {detailModal.cost_per_serving != null && <>
                  <span style={{ color: '#9ca3af' }}>Cost / serving</span>
                  <span className="text-right text-white">{fmt(detailModal.cost_per_serving)}</span>
                </>}
                {detailModal.suggested_price != null && <>
                  <span style={{ color: '#9ca3af' }}>Suggested sell (65% GM)</span>
                  <span className="text-right font-medium" style={{ color: '#f59e0b' }}>{fmt(detailModal.suggested_price)}</span>
                </>}
                {detailModal.menu_price != null && <>
                  <span style={{ color: '#9ca3af' }}>Current price</span>
                  <span className="text-right" style={{ color: '#1D9E75' }}>{fmt(detailModal.menu_price)}</span>
                </>}
                {(detailModal.margin ?? detailModal.margin_percent) != null && <>
                  <span style={{ color: '#9ca3af' }}>Margin</span>
                  <span className="text-right font-bold" style={{ color: MARGIN_COLOR(detailModal.margin ?? detailModal.margin_percent) }}>
                    {Math.round(Number(detailModal.margin ?? detailModal.margin_percent))}%
                    {Number(detailModal.margin ?? detailModal.margin_percent) < 30 ? ' ⚠' : ''}
                  </span>
                </>}
              </div>
            </div>

            {/* Ingredient table */}
            {detailModal.recipe_ingredients.length > 0 && (
              <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-xs font-medium uppercase tracking-wider px-3 py-2" style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Ingredients</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['Ingredient', 'Qty', 'Unit cost', 'Wastage', 'Eff. cost', 'Line'].map(h => (
                        <th key={h} className="px-2 py-1.5 text-right first:text-left font-medium" style={{ color: '#6b7280' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailModal.recipe_ingredients.map((ing, i) => {
                      const cpu = ing.cost_per_unit ?? (ing.cost_cents != null ? ing.cost_cents / 100 : null);
                      const wastage = ing.wastage_pct ?? 0;
                      const effectiveCpu = cpu != null ? cpu * (1 + wastage / 100) : null;
                      const line = effectiveCpu != null ? effectiveCpu * ing.quantity : null;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td className="px-2 py-1.5 text-white font-medium">{ing.ingredient_name}</td>
                          <td className="px-2 py-1.5 text-right" style={{ color: '#9ca3af' }}>{ing.quantity} {ing.unit}</td>
                          <td className="px-2 py-1.5 text-right" style={{ color: '#9ca3af' }}>{cpu != null ? 'A$' + cpu.toFixed(3) : '—'}</td>
                          <td className="px-2 py-1.5 text-right" style={{ color: wastage > 0 ? '#f59e0b' : '#4b5563' }}>{wastage > 0 ? wastage + '%' : '—'}</td>
                          <td className="px-2 py-1.5 text-right" style={{ color: '#9ca3af' }}>{effectiveCpu != null ? 'A$' + effectiveCpu.toFixed(3) : '—'}</td>
                          <td className="px-2 py-1.5 text-right font-medium" style={{ color: '#fff' }}>{line != null ? 'A$' + line.toFixed(2) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Allergens */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Allergens</span>
                <button onClick={() => detectAllergens(detailModal.id)} disabled={detectingAllergens === detailModal.id}
                  className="text-xs px-2 py-0.5 rounded-lg disabled:opacity-40"
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                  {detectingAllergens === detailModal.id ? '…' : '↻ Auto-detect'}
                </button>
              </div>
              {detailModal.allergens && detailModal.allergens.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detailModal.allergens.map(a => (
                    <span key={a} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                      {ALLERGEN_ICON[a] ?? '⚠'} {a}
                    </span>
                  ))}
                </div>
              ) : <p className="text-xs" style={{ color: '#4b5563' }}>No allergens detected. Click Auto-detect to scan ingredients.</p>}
            </div>

            {/* Scale to servings */}
            <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Scale to servings</div>
              <div className="flex gap-2">
                <input type="number" min={1} value={scaleInput} onChange={e => setScaleInput(e.target.value)} placeholder={String(detailModal.yield_qty ?? 1)}
                  className="flex-1 px-2 py-1.5 rounded-lg text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                <button onClick={() => scaleRecipe(detailModal.id, Number(scaleInput) || 1)} disabled={scaling || !scaleInput}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                  style={{ background: '#3b82f6', color: '#fff' }}>
                  {scaling ? '…' : 'Scale'}
                </button>
              </div>
              {scaleResult && (
                <div className="mt-3">
                  <div className="text-xs font-medium mb-1" style={{ color: '#3b82f6' }}>Scaled to {scaleResult.total_cost != null ? Math.round(Number(scaleInput)) : '—'} servings:</div>
                  <div className="space-y-0.5">
                    {scaleResult.ingredients.map((ing, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span style={{ color: '#9ca3af' }}>{ing.ingredient_name}</span>
                        <span className="text-white">{ing.quantity} {ing.unit}{ing.line_cost != null ? ' · A$' + Number(ing.line_cost).toFixed(2) : ''}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 flex justify-between text-xs font-semibold" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: '#9ca3af' }}>Total cost</span>
                    <span className="text-white">{fmt(scaleResult.total_cost)}</span>
                  </div>
                  {scaleResult.cost_per_serving != null && (
                    <div className="flex justify-between text-xs">
                      <span style={{ color: '#9ca3af' }}>Cost / serving</span>
                      <span className="text-white">{fmt(scaleResult.cost_per_serving)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Link to product */}
            <div className="mb-4">
              <label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Link to product</label>
              <select
                value={detailModal.linked_product_id ?? ''}
                onChange={async e => {
                  const lid = e.target.value || null;
                  const res = await fetch('/api/pos/recipes/' + detailModal.id, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ linked_product_id: lid }),
                  }).then(r => r.json());
                  if (res.recipe) {
                    setDetailModal(prev => prev ? { ...prev, linked_product_id: lid, margin: res.recipe.margin, suggested_price: res.recipe.suggested_price } : null);
                    setRecipes(prev => prev.map(r => r.id === detailModal.id ? { ...r, linked_product_id: lid, margin: res.recipe.margin } : r));
                  }
                }}
                className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                <option value="" style={{ background: '#1a1a2e' }}>Not linked</option>
                {products.map(p => <option key={p.id} value={p.id} style={{ background: '#1a1a2e' }}>{p.name}</option>)}
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={() => recalcCost(detailModal.id).then(() => load())} disabled={recalculating === detailModal.id}
                className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-40"
                style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
                {recalculating === detailModal.id ? 'Recalculating…' : '↻ Recalculate costs'}
              </button>
              <button onClick={() => { openEdit(detailModal); setDetailModal(null); }}
                className="flex-1 py-2 rounded-xl text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)' }}>
                Edit recipe
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <button onClick={() => setForm(f => ({ ...f, ingredients: [...f.ingredients, { ...BLANK_ING }] }))} className="text-xs" style={{ color: '#1D9E75' }}>+ Add</button>
                </div>
                <div className="space-y-2">
                  {form.ingredients.map((ing, i) => (
                    <div key={i} className="space-y-1.5 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="grid grid-cols-[1fr_70px_70px_auto] gap-1.5">
                        <input value={ing.ingredient_name} onChange={e => updateIng(i, 'ingredient_name', e.target.value)} className={inputCls} placeholder="Ingredient" />
                        <input type="number" step="0.1" min={0} value={ing.quantity} onChange={e => updateIng(i, 'quantity', e.target.value)} className={inputCls} placeholder="Qty" />
                        <select value={ing.unit} onChange={e => updateIng(i, 'unit', e.target.value)} className={inputCls}>
                          {UNITS.map(u => <option key={u} value={u} style={{ background: '#1a1a2e' }}>{u}</option>)}
                        </select>
                        <button onClick={() => setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, j) => j !== i) }))} className="text-red-400 hover:text-red-300 text-lg px-1">×</button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <input type="number" step="0.001" min={0} value={ing.cost_per_unit ?? ''} onChange={e => updateIng(i, 'cost_per_unit', e.target.value ? Number(e.target.value) : null)} className={inputCls} placeholder="Cost/unit A$" />
                        <input type="number" step="1" min={0} max={100} value={ing.wastage_pct ?? 0} onChange={e => updateIng(i, 'wastage_pct', Number(e.target.value))} className={inputCls} placeholder="Wastage %" />
                        <select value={ing.supplier_id ?? ''} onChange={e => updateIng(i, 'supplier_id', e.target.value || null)} className={inputCls}>
                          <option value="" style={{ background: '#1a1a2e' }}>No supplier</option>
                          {suppliers.map(s => <option key={s.id} value={s.id} style={{ background: '#1a1a2e' }}>{s.name}</option>)}
                        </select>
                      </div>
                      <p className="text-xs" style={{ color: '#4b5563' }}>
                        Line cost: A${(Number(ing.quantity ?? 0) * Number(ing.cost_per_unit ?? 0) * (1 + (ing.wastage_pct ?? 0) / 100)).toFixed(2)}
                        {(ing.wastage_pct ?? 0) > 0 && <span style={{ color: '#f59e0b' }}> (incl {ing.wastage_pct}% wastage)</span>}
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
                  const color = MARGIN_COLOR(m);
                  return (
                    <div className="mt-1.5 rounded-lg p-2 flex items-center justify-between" style={{ background: color + '18', border: '1px solid ' + color + '40' }}>
                      <span className="text-xs" style={{ color: '#9ca3af' }}>Margin (A${cps.toFixed(2)} cost / A${mp.toFixed(2)} price)</span>
                      <span className="text-sm font-semibold" style={{ color }}>● {m.toFixed(0)}%</span>
                    </div>
                  );
                })()}
                {/* Suggested price preview */}
                {totalCost(form.ingredients) > 0 && (
                  <div className="mt-1.5 rounded-lg p-2 flex items-center justify-between" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <span className="text-xs" style={{ color: '#9ca3af' }}>Suggested sell price (65% GM)</span>
                    <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>A${(totalCost(form.ingredients) / 0.35).toFixed(2)}</span>
                  </div>
                )}
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
                        style={{ background: on ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.05)', color: on ? '#f59e0b' : '#9ca3af', border: '1px solid ' + (on ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)') }}>
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
  const [staff, setStaff] = useState<Record<string, unknown>[]>([]);
  const [training, setTraining] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [staffRes, trainingRes] = await Promise.all([
        fetch('/api/staff?business_id=' + businessId).then(r => r.json()).catch(() => ({ staff: [] })),
        apiFetch<{ training?: unknown[] }>('/api/recipes/training?business_id=' + businessId).catch(() => ({ training: [] })),
      ]);
      setStaff(staffRes.staff ?? staffRes.data ?? []);
      setTraining((trainingRes.training ?? []) as Record<string, unknown>[]);
      setLoading(false);
    }
    fetchData();
  }, [businessId]);

  function getStatus(staffId: string, recipeId: string) {
    return (training.find(t => t.staff_member_id === staffId && t.recipe_id === recipeId)?.status as string) ?? 'not_started';
  }

  async function updateStatus(staffId: string, recipeId: string, status: string) {
    setSaving(true);
    await apiFetch('/api/recipes/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, staff_member_id: staffId, recipe_id: recipeId, status }),
    }).catch(() => {});
    const res = await apiFetch<{ training?: unknown[] }>('/api/recipes/training?business_id=' + businessId).catch(() => ({ training: [] }));
    setTraining((res.training ?? []) as Record<string, unknown>[]);
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
            <tr key={s.id as string} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td className="px-4 py-3 text-white font-medium">{s.name as string}</td>
              {recipes.slice(0, 8).map(r => {
                const status = getStatus(s.id as string, r.id);
                return (
                  <td key={r.id} className="px-3 py-3">
                    <select value={status} disabled={saving} onChange={e => updateStatus(s.id as string, r.id, e.target.value)}
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
