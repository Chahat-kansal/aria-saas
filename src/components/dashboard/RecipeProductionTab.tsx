'use client';
import { useEffect, useState } from 'react';

interface Recipe { id: string; name: string; linked_product_id?: string | null; serves: number; }

interface DayPlan { date: string; dayName: string; suggested: number; override: number; }

export default function RecipeProductionTab({ businessId, recipes }: { businessId: string; recipes: Recipe[] }) {
  const [velocity, setVelocity] = useState<Record<string, number[]>>({});
  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function go() {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 28 * 86400000).toISOString();
        const res = await fetch(`/api/pos/sales?business_id=${businessId}&since=${since}&limit=500`).then(r => r.json()).catch(() => ({ sales: [] }));
        const buckets: Record<string, number[]> = {};
        const sales = res.sales ?? res.data ?? [];
        for (const r of recipes) {
          if (!r.linked_product_id) continue;
          const perDay = [0, 0, 0, 0, 0, 0, 0];
          for (const s of sales) {
            const items = s.pos_sale_items ?? s.items ?? [];
            for (const it of items) {
              if (it.product_id === r.linked_product_id) {
                const dow = new Date(s.created_at ?? s.sale_date ?? Date.now()).getDay();
                perDay[dow] += Number(it.quantity ?? 0);
              }
            }
          }
          buckets[r.id] = perDay.map(v => Math.round(v / 4));
        }
        setVelocity(buckets);
      } catch { /* non-fatal */ }
      setLoading(false);
    }
    if (businessId) go();
  }, [businessId, recipes]);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function plan(recipeId: string): DayPlan[] {
    const v = velocity[recipeId] ?? [0, 0, 0, 0, 0, 0, 0];
    return days.map((d, i) => {
      const suggested = Math.ceil(v[i] * 1.1); // +10% variance buffer
      const ov = overrides[recipeId]?.[d];
      return { date: d, dayName: d, suggested, override: ov ?? suggested };
    });
  }

  function setOverride(recipeId: string, day: string, val: number) {
    setOverrides(o => ({ ...o, [recipeId]: { ...(o[recipeId] ?? {}), [day]: val } }));
  }

  function printSheet() { window.print(); }

  const linked = recipes.filter(r => r.linked_product_id);

  if (loading) return <div className="h-32 animate-pulse rounded-xl" style={{ background: '#13131a' }} />;

  if (linked.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-white font-medium mb-1">No linked recipes</p>
        <p className="text-sm" style={{ color: '#6b7280' }}>Link a recipe to a POS product to see sales-based production planning.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: '#6b7280' }}>Based on the last 4 weeks of sales · adjust quantities and print</p>
        <button onClick={printSheet} className="px-3 py-1.5 rounded-xl text-xs font-medium" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.25)' }}>Print sheet</button>
      </div>
      {linked.map(r => {
        const p = plan(r.id);
        return (
          <div key={r.id} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <h3 className="text-white font-medium mb-3">{r.name}</h3>
            <div className="grid grid-cols-7 gap-2">
              {p.map(d => (
                <div key={d.date} className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{d.dayName}</p>
                  <input type="number" min={0} value={d.override} onChange={e => setOverride(r.id, d.date, Number(e.target.value))}
                    className="w-full text-center text-sm text-white outline-none rounded px-1 py-1 bg-transparent" />
                  <p className="text-xs mt-1" style={{ color: '#4b5563' }}>~{d.suggested}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
