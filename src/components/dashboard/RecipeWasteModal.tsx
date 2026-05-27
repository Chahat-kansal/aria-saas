'use client';
import { useState, useEffect } from 'react';

interface Recipe { id: string; name: string; cost_per_serve?: number | null; }
interface WasteEntry { id: string; wasted_quantity: number; unit: string; reason: string | null; waste_cost: number | null; logged_at: string; }

const REASONS = ['Overproduction', 'Quality fail', 'Expired', 'Spillage', 'Customer return', 'Other'];

export default function RecipeWasteModal({ recipe, businessId, onClose }: { recipe: Recipe; businessId: string; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('each');
  const [reason, setReason] = useState(REASONS[0]);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<WasteEntry[]>([]);

  async function load() {
    const r = await fetch(`/api/recipes/waste?business_id=${businessId}&recipe_id=${recipe.id}`).then(r => r.json()).catch(() => ({ waste: [] }));
    setEntries(r.waste ?? []);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [recipe.id]);

  async function add() {
    setSaving(true);
    const waste_cost = recipe.cost_per_serve != null ? qty * Number(recipe.cost_per_serve) : null;
    await fetch('/api/recipes/waste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, recipe_id: recipe.id, wasted_quantity: qty, unit, reason, waste_cost }),
    });
    setSaving(false);
    setQty(1);
    load();
  }

  const weekCost = entries.filter(e => Date.now() - new Date(e.logged_at).getTime() < 7 * 86400000)
    .reduce((s, e) => s + Number(e.waste_cost ?? 0), 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#13131a] rounded-2xl p-6 w-full max-w-lg border border-[rgba(255,255,255,0.1)] my-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">Log waste</h3>
            <p className="text-xs" style={{ color: '#6b7280' }}>{recipe.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">×</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <input type="number" min={0} step="0.1" value={qty} onChange={e => setQty(Number(e.target.value))}
            placeholder="Qty" className="px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]" />
          <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Unit"
            className="px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]" />
          <select value={reason} onChange={e => setReason(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]">
            {REASONS.map(r => <option key={r} value={r} style={{ background: '#1a1a2e' }}>{r}</option>)}
          </select>
        </div>
        <button onClick={add} disabled={saving}
          className="w-full py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 mb-4"
          style={{ background: '#f59e0b' }}>
          {saving ? 'Saving…' : 'Log waste'}
        </button>
        {entries.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-xs" style={{ color: '#f59e0b' }}>This week: A${weekCost.toFixed(2)} wasted</p>
          </div>
        )}
        <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
          {entries.slice(0, 10).map(e => (
            <div key={e.id} className="flex justify-between text-xs px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <span style={{ color: '#9ca3af' }}>{new Date(e.logged_at).toLocaleDateString()} · {e.reason}</span>
              <span className="text-white">{e.wasted_quantity}{e.unit} {e.waste_cost != null && `· A$${Number(e.waste_cost).toFixed(2)}`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
