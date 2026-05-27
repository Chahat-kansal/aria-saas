'use client';
import { useState } from 'react';

interface Ingredient { ingredient_name: string; quantity: number; unit: string; }
interface Recipe { id: string; name: string; serves: number; recipe_ingredients: Ingredient[]; }
interface Warning { ingredient: string; note: string; suggested_quantity?: number; }

export default function RecipeScaleModal({ recipe, businessId, onClose }: { recipe: Recipe; businessId: string; onClose: () => void }) {
  const [target, setTarget] = useState(recipe.serves * 2);
  const [loading, setLoading] = useState(false);
  const [scaled, setScaled] = useState<Ingredient[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [done, setDone] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch('/api/aria/recipe-scale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        recipe_name: recipe.name,
        current_serves: recipe.serves,
        target_serves: target,
        ingredients: recipe.recipe_ingredients.map(i => ({ ingredient_name: i.ingredient_name, quantity: i.quantity, unit: i.unit })),
      }),
    }).then(r => r.json()).catch(() => ({ scaled: [], warnings: [] }));
    setScaled(res.scaled ?? []);
    setWarnings(res.warnings ?? []);
    setDone(true);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#13131a] rounded-2xl p-6 w-full max-w-lg border border-[rgba(255,255,255,0.1)] my-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">✦ Scale recipe</h3>
            <p className="text-xs" style={{ color: '#6b7280' }}>{recipe.name} — current: {recipe.serves}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">×</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Target serves</label>
            <input type="number" min={1} value={target} onChange={e => setTarget(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]" />
          </div>
          <button onClick={run} disabled={loading || target < 1}
            className="w-full py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
            style={{ background: '#1D9E75' }}>
            {loading ? 'Asking Aria…' : '✦ Scale with AI intelligence'}
          </button>
          {done && (
            <>
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>Scaled ingredients ({recipe.serves} → {target})</p>
                <div className="space-y-1">
                  {scaled.map((s, i) => (
                    <div key={i} className="text-sm flex justify-between" style={{ color: '#d1d5db' }}>
                      <span>{s.ingredient_name}</span>
                      <span className="text-white">{s.quantity}{s.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
              {warnings.length > 0 && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#f59e0b' }}>✦ AI scaling warnings</p>
                  {warnings.map((w, i) => (
                    <div key={i} className="text-xs" style={{ color: '#d1d5db' }}>
                      <p className="font-medium text-white">{w.ingredient}</p>
                      <p>{w.note}</p>
                      {w.suggested_quantity != null && <p style={{ color: '#f59e0b' }}>Suggested: {w.suggested_quantity}</p>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
