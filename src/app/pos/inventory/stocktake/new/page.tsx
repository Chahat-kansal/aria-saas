'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AriaInsightCard from '@/components/reports/AriaInsightCard';
import { track } from '@/lib/analytics';

const SESSION_KEY = 'aria_stocktake_session';

interface Outlet { id: string; name: string; }
interface Product { id: string; name: string; sku: string | null; stock_quantity: number | null; }
interface CountRow { product: Product; counted: string; recount: number; }

const iS: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '7px 11px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' };

export default function NewStocktakePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'category' | 'supplier'>('all');
  const [counts, setCounts] = useState<Record<string, CountRow>>({});
  const [barcodeInput, setBarcodeInput] = useState('');
  const [anomaly, setAnomaly] = useState<{ product: Product; system: number; counted: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [insight, setInsight] = useState<string[] | null>(null);
  const [resumeSession, setResumeSession] = useState<{ outlet: Outlet; startedAt: string; counts: Record<string, CountRow> } | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { document.title = 'New Stocktake | Aria POS'; }, [])

  useEffect(() => {
    fetch('/api/pos/outlets').then(r => r.json()).then(d => setOutlets(d.outlets ?? [])).catch(() => {});
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as { outlet: Outlet; startedAt: string; counts: Record<string, CountRow> };
        if (session?.outlet && session?.counts) setResumeSession(session);
      }
    } catch (e) { console.error('[silent-catch]', e) }
  }, []);

  function loadProducts(outletId: string, existingCounts?: Record<string, CountRow>) {
    fetch(`/api/pos/products?outlet_id=${outletId}&limit=500`).then(r => r.json()).then(d => {
      const prods: Product[] = d.products ?? [];
      setProducts(prods);
      const initCounts: Record<string, CountRow> = {};
      for (const p of prods) initCounts[p.id] = existingCounts?.[p.id] ?? { product: p, counted: '', recount: 0 };
      setCounts(initCounts);
      track('stocktake_started', { outlet: outletId, product_count: prods.length });
    }).catch(() => {});
  }

  const saveSession = useCallback((outlet: Outlet, updatedCounts: Record<string, CountRow>) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ outlet, startedAt: new Date().toISOString(), counts: updatedCounts }));
    } catch (e) { console.error('[silent-catch]', e) }
  }, []);

  function handleCountChange(productId: string, val: string, product: Product) {
    const sys = product.stock_quantity ?? 0;
    const cnt = parseInt(val);
    if (val !== '' && sys > 5 && Math.abs(cnt - sys) / sys > 0.5) {
      setAnomaly({ product, system: sys, counted: cnt });
      return;
    }
    const newCounts = (prev: Record<string, CountRow>) => ({ ...prev, [productId]: { ...prev[productId], counted: val } });
    setCounts(prev => {
      const updated = newCounts(prev);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        if (selectedOutlet) saveSession(selectedOutlet, updated);
      }, 500);
      return updated;
    });
  }

  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = barcodeInput.trim();
    if (!trimmed) return;
    const match = products.find(p => p.sku === trimmed);
    if (match) {
      const row = counts[match.id];
      const newCounted = String((parseInt(row.counted) || 0) + 1);
      const system = match.stock_quantity ?? 0;
      const counted = parseInt(newCounted);
      if (system > 5 && Math.abs(counted - system) / system > 0.5) {
        setAnomaly({ product: match, system, counted });
      } else {
        setCounts(c => ({ ...c, [match.id]: { ...c[match.id], counted: newCounted } }));
      }
    }
    setBarcodeInput('');
    barcodeRef.current?.focus();
  }

  async function commit() {
    if (!selectedOutlet) return;
    setSaving(true);
    const items = Object.values(counts).filter(r => r.counted !== '').map(r => ({
      product_id: r.product.id, system_qty: r.product.stock_quantity ?? 0,
      counted_qty: parseInt(r.counted) || 0, recount_count: r.recount,
    }));
    const variances = items.filter(i => i.counted_qty !== i.system_qty);
    await fetch('/api/pos/stock-takes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outlet_id: selectedOutlet.id, items }) }).catch(() => {});
    track('stocktake_committed', { variance_count: variances.length, total_variance_cents: variances.reduce((s, i) => s + Math.abs(i.counted_qty - i.system_qty), 0) });
    setSaving(false);
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { console.error('[silent-catch]', e) }
    router.push('/pos/stocktake');
  }

  const variances = Object.values(counts).filter(r => r.counted !== '' && parseInt(r.counted) !== (r.product.stock_quantity ?? 0));
  const totalVariance = variances.reduce((s, r) => s + (parseInt(r.counted) - (r.product.stock_quantity ?? 0)), 0);

  const STEP_LABELS = ['Select Outlet', 'Filter Products', 'Count Stock', 'Review & Commit'];

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      {/* Progress bar */}
      <div style={{ padding: '16px 28px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, maxWidth: 600 }}>
          {STEP_LABELS.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: step > i + 1 ? '#34D399' : step === i + 1 ? 'var(--violet)' : 'var(--bg-elevated)', color: step > i + 1 ? '#fff' : step === i + 1 ? '#fff' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 12, color: step === i + 1 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: step === i + 1 ? 700 : 400, whiteSpace: 'nowrap' }}>{label}</span>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 2, background: step > i + 1 ? '#34D399' : 'var(--bg-overlay)', margin: '0 8px' }} />}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '28px', maxWidth: 800 }}>
        {/* STEP 1 — Select outlet */}
        {step === 1 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Which outlet are you counting?</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 24 }}>
              {outlets.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading outlets…</div>}
              {outlets.map(o => (
                <div key={o.id} onClick={() => setSelectedOutlet(o)}
                  style={{ background: selectedOutlet?.id === o.id ? 'var(--violet-dim)' : 'var(--bg-surface)', border: `2px solid ${selectedOutlet?.id === o.id ? 'var(--violet)' : 'transparent'}`, borderRadius: 12, padding: '18px 20px', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
                  🏪 {o.name}
                </div>
              ))}
            </div>
            <button disabled={!selectedOutlet} onClick={() => { loadProducts(selectedOutlet!.id); setStep(2); }}
              style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: selectedOutlet ? 'var(--violet)' : 'var(--bg-elevated)', color: selectedOutlet ? '#fff' : 'var(--text-tertiary)', fontSize: 14, fontWeight: 700, cursor: selectedOutlet ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              Continue →
            </button>
          </>
        )}

        {/* STEP 2 — Filter products */}
        {step === 2 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Filter products to count</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>Will count <strong>{products.length}</strong> products</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {(['all', 'category', 'supplier'] as const).map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                  <input type="radio" name="filter" checked={filterMode === m} onChange={() => setFilterMode(m)} style={{ accentColor: 'var(--violet)' }} />
                  {m === 'all' ? 'All products' : m === 'category' ? 'By category' : 'By supplier'}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
              <button onClick={() => setStep(3)} style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Start Counting →</button>
            </div>
          </>
        )}

        {/* STEP 3 — Count */}
        {step === 3 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Count — {selectedOutlet?.name}</h2>
              <button onClick={() => setStep(4)} style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Review →</button>
            </div>
            <form onSubmit={handleBarcodeSubmit} style={{ marginBottom: 16 }}>
              <input ref={barcodeRef} autoFocus value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)}
                placeholder="Scan barcode or enter SKU…"
                style={{ ...iS, width: '100%', fontSize: 14, padding: '10px 14px', boxSizing: 'border-box' }} />
            </form>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden', maxHeight: '55vh', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    {['PRODUCT','SKU','SYSTEM','COUNTED','VARIANCE'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', background: '#29b6f6', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => {
                    const row = counts[p.id];
                    const system = p.stock_quantity ?? 0;
                    const counted = row?.counted !== '' ? parseInt(row.counted) : null;
                    const variance = counted !== null ? counted - system : null;
                    return (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                        <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono',monospace" }}>{p.sku ?? '—'}</td>
                        <td style={{ padding: '8px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>{system}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <input type="number" min="0" value={row?.counted ?? ''} onChange={e => handleCountChange(p.id, e.target.value, p)} style={{ ...iS, width: 72, textAlign: 'center', padding: '4px 6px', borderColor: variance !== null && variance !== 0 ? '#FBBF24' : 'var(--border-default)' }} />
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: variance === null ? 'var(--text-tertiary)' : variance > 0 ? '#34D399' : variance < 0 ? '#F87171' : 'var(--text-secondary)' }}>
                          {variance === null ? '—' : variance > 0 ? `+${variance}` : String(variance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* STEP 4 — Review */}
        {step === 4 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Review & Commit</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Items Counted', value: String(Object.values(counts).filter(r => r.counted !== '').length) },
                { label: 'With Variances', value: String(variances.length), color: variances.length > 0 ? '#FBBF24' : '#34D399' },
                { label: 'Total Variance', value: `${totalVariance > 0 ? '+' : ''}${totalVariance} units`, color: totalVariance !== 0 ? '#F87171' : '#34D399' },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: m.color ?? 'var(--text-primary)', fontFamily: "'JetBrains Mono',monospace" }}>{m.value}</div>
                </div>
              ))}
            </div>

            <AriaInsightCard bullets={insight ?? undefined} loading={false} />

            {variances.length > 0 && (
              <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    {['PRODUCT','SYSTEM','COUNTED','VARIANCE'].map(h => <th key={h} style={{ padding: '9px 14px', background: '#29b6f6', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'left' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{variances.sort((a, b) => Math.abs(parseInt(b.counted) - (b.product.stock_quantity ?? 0)) - Math.abs(parseInt(a.counted) - (a.product.stock_quantity ?? 0))).map((r, i) => {
                    const v = parseInt(r.counted) - (r.product.stock_quantity ?? 0);
                    return (
                      <tr key={r.product.id} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                        <td style={{ padding: '9px 14px', fontSize: 13 }}>{r.product.name}</td>
                        <td style={{ padding: '9px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>{r.product.stock_quantity ?? 0}</td>
                        <td style={{ padding: '9px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>{r.counted}</td>
                        <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: v > 0 ? '#34D399' : '#F87171' }}>{v > 0 ? `+${v}` : String(v)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(3)} style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
              <button onClick={() => { if (window.confirm('Commit this stocktake? This will adjust inventory and cannot be undone.')) commit(); }}
                disabled={saving} style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: saving ? 'var(--bg-elevated)' : '#34D399', color: saving ? 'var(--text-secondary)' : '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Committing…' : '✓ Commit & Adjust Inventory'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Resume session modal */}
      {resumeSession && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, maxWidth: 420, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔄</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Resume your count?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              You have an unfinished stock count for <strong>{resumeSession.outlet.name}</strong> started {new Date(resumeSession.startedAt).toLocaleString('en-AU')}. Pick up where you left off?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => {
                try { localStorage.removeItem(SESSION_KEY); } catch (e) { console.error('[silent-catch]', e) }
                setResumeSession(null);
              }} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Start fresh
              </button>
              <button onClick={() => {
                setSelectedOutlet(resumeSession.outlet);
                loadProducts(resumeSession.outlet.id, resumeSession.counts);
                setStep(3);
                setResumeSession(null);
              }} style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                ↩ Resume count
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anomaly modal */}
      {anomaly && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, maxWidth: 400, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Recount?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              System shows <strong>{anomaly.system}</strong>, you entered <strong>{anomaly.counted}</strong> for <strong>{anomaly.product.name}</strong>. That&apos;s a {Math.round(Math.abs(anomaly.counted - anomaly.system) / anomaly.system * 100)}% difference.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => {
                setCounts(c => ({ ...c, [anomaly.product.id]: { ...c[anomaly.product.id], counted: String(anomaly.counted) } }));
                setAnomaly(null);
              }} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>No, save</button>
              <button onClick={() => {
                setCounts(c => ({ ...c, [anomaly.product.id]: { ...c[anomaly.product.id], counted: '', recount: (c[anomaly.product.id]?.recount ?? 0) + 1 } }));
                setAnomaly(null);
              }} style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', background: '#FBBF24', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Yes, recount</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
