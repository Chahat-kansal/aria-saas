'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; cost_price: number; cost: number | null; stock_quantity: number | null;
  track_stock: boolean; is_active: boolean; is_age_restricted?: boolean;
  category_id?: string | null; description?: string | null; image_url?: string | null;
  tax_rate?: number; low_stock_threshold?: number; case_quantity?: number | null;
  brand_id?: string | null; family_id?: string | null; loyalty_earn_rate?: number | null;
  supplier_id?: string | null;
}
interface Category { id: string; name: string; color: string; }
interface ClassItem { id: string; name: string; }
interface PricePoint { id: string; price_set_name: string; quantity: number; price: number; cost: number | null; margin_percent: number | null; }
interface Outlet { id: string; name: string; }

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'var(--violet)', green:'var(--success)', red:'var(--destructive)' };
const TABS = ['General','Classifications','Sell & Cost','Inventory','Barcodes','Images','Loyalty','Suppliers'] as const;

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab]           = useState<typeof TABS[number]>('General');
  const [product, setProduct]   = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands]     = useState<ClassItem[]>([]);
  const [families, setFamilies] = useState<ClassItem[]>([]);
  const [outlets, setOutlets]   = useState<Outlet[]>([]);
  const [pricePoints, setPricePoints] = useState<PricePoint[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [form, setForm]         = useState<Partial<Product>>({});

  // Price point editing state
  const [ppEditing, setPpEditing] = useState<string | null>(null);
  const [ppEdit, setPpEdit]       = useState<Partial<PricePoint>>({});
  const [ppAdding, setPpAdding]   = useState(false);
  const [ppNew, setPpNew]         = useState({ price_set_name: 'Default Price Set', quantity: '1', price: '', cost: '' });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/pos/products?id=${id}`).then(r => r.json()),
      fetch('/api/pos/categories').then(r => r.json()),
      fetch('/api/pos/classifications?type=brand').then(r => r.json()),
      fetch('/api/pos/classifications?type=family').then(r => r.json()),
      fetch(`/api/pos/price-points?product_id=${id}`).then(r => r.json()),
      fetch('/api/pos/outlets').then(r => r.json()),
    ]).then(([pd, cd, bd, fd, ppd, od]) => {
      const p = (pd.products ?? []).find((x: Product) => x.id === id) ?? null;
      setProduct(p);
      if (p) setForm(p);
      setCategories(cd.categories ?? []);
      setBrands(bd.items ?? []);
      setFamilies(fd.items ?? []);
      setPricePoints(ppd.price_points ?? []);
      setOutlets(od.outlets ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  async function save() {
    if (!id) return;
    setSaving(true);
    await fetch(`/api/pos/products?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function addPricePoint() {
    if (!ppNew.price) return;
    setPpAdding(true);
    const cost = ppNew.cost ? parseFloat(ppNew.cost) : null;
    const price = parseFloat(ppNew.price);
    const res = await fetch('/api/pos/price-points', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: id, price_set_name: ppNew.price_set_name, quantity: parseInt(ppNew.quantity) || 1, price, cost }),
    });
    const d = await res.json();
    if (d.price_point) { setPricePoints(pp => [...pp, d.price_point]); setPpNew({ price_set_name: 'Default Price Set', quantity: '1', price: '', cost: '' }); }
    setPpAdding(false);
  }

  async function savePricePoint(ppId: string) {
    const cost = ppEdit.cost ?? null;
    const price = ppEdit.price ?? 0;
    const margin_percent = cost && price > 0 ? ((price - cost) / price * 100) : null;
    await fetch(`/api/pos/price-points?id=${ppId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...ppEdit, margin_percent }),
    });
    setPricePoints(pp => pp.map(p => p.id === ppId ? { ...p, ...ppEdit, margin_percent } : p));
    setPpEditing(null);
  }

  async function deletePricePoint(ppId: string) {
    await fetch(`/api/pos/price-points?id=${ppId}`, { method: 'DELETE' });
    setPricePoints(pp => pp.filter(p => p.id !== ppId));
  }

  const F = (key: keyof Product) => ({
    value: (form[key] as string | number) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });
  const CHK = (key: keyof Product) => ({
    checked: !!form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.checked })),
  });

  const iCls = { background: 'var(--bg-input)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: "'Manrope',sans-serif", width: '100%', boxSizing: 'border-box' as const, boxShadow: 'var(--shadow-sm)' };
  const lCls = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
  const ppIcls = { background: 'var(--bg-input)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: C.text, outline: 'none', fontFamily: "'Manrope',sans-serif", width: '100%' };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: C.bg }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  if (!product) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', background: C.bg, color: C.text, gap: 12 }}>
      <p style={{ fontSize: 16, color: C.muted }}>Product not found</p>
      <Link href="/pos/products" style={{ color: C.violet, fontSize: 13 }}>← Back to products</Link>
    </div>
  );

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '15px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href={`/pos/products/${id}`} style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← {product.name}</Link>
          <span style={{ color: C.border }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Edit</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Saved</span>}
          <button onClick={save} disabled={saving}
            style={{ padding: '9px 24px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, paddingLeft: 28, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '11px 18px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? C.violet : 'transparent'}`, color: tab === t ? C.violet : C.muted, fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms', whiteSpace: 'nowrap' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '28px', maxWidth: 720 }}>

        {/* ── General ── */}
        {tab === 'General' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={lCls}>Product Name *</label>
              <input {...F('name')} style={iCls} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><label style={lCls}>SKU</label><input {...F('sku')} style={iCls} placeholder="e.g. ABC-001" /></div>
              <div><label style={lCls}>Barcode</label><input {...F('barcode')} style={iCls} placeholder="e.g. 9300675000000" /></div>
            </div>
            <div>
              <label style={lCls}>Category</label>
              <select value={form.category_id ?? ''} onChange={e => setForm(f => ({ ...f, category_id: e.target.value || null }))} style={{ ...iCls, background: 'var(--bg-input)' }}>
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lCls}>Description</label>
              <textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...iCls, resize: 'vertical' }} placeholder="Optional product description" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                ['is_active', 'Product is active (visible on terminal)'],
                ['is_age_restricted', 'Age restricted (requires ID verification at checkout)'],
                ['track_stock', 'Track inventory for this product'],
              ] as [keyof Product, string][]).map(([k, label]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" {...CHK(k)} style={{ width: 15, height: 15, accentColor: C.violet }} />
                  <span style={{ fontSize: 13, color: C.text }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Classifications ── */}
        {tab === 'Classifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: C.muted }}>
              Manage brands, families, and tags for this product. Create new ones in the{' '}
              <Link href="/pos/classifications" style={{ color: C.violet }}>Classifications</Link> section.
            </div>
            <div>
              <label style={lCls}>Brand</label>
              <select value={form.brand_id ?? ''} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value || null }))} style={{ ...iCls, background: 'var(--bg-input)' }}>
                <option value="">No brand</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lCls}>Family</label>
              <select value={form.family_id ?? ''} onChange={e => setForm(f => ({ ...f, family_id: e.target.value || null }))} style={{ ...iCls, background: 'var(--bg-input)' }}>
                <option value="">No family</option>
                {families.map(fam => <option key={fam.id} value={fam.id}>{fam.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lCls}>Case Quantity</label>
              <input type="number" min="1" value={form.case_quantity ?? 1} onChange={e => setForm(f => ({ ...f, case_quantity: parseInt(e.target.value) || 1 }))} style={iCls} />
              <p style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Number of items per case for ordering and display purposes.</p>
            </div>
          </div>
        )}

        {/* ── Sell & Cost ── */}
        {tab === 'Sell & Cost' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Standard pricing */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Standard Price</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={lCls}>Sell Price (A$) *</label>
                  <input type="number" step="0.01" min="0" value={form.price ?? ''} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} style={iCls} />
                </div>
                <div>
                  <label style={lCls}>Cost Price (A$)</label>
                  <input type="number" step="0.01" min="0" value={form.cost_price ?? ''} onChange={e => setForm(f => ({ ...f, cost_price: parseFloat(e.target.value) || 0 }))} style={iCls} />
                </div>
              </div>
              {form.price && form.cost_price && Number(form.price) > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div>
                    <p style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Gross Margin</p>
                    <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: C.green }}>
                      {(((Number(form.price) - Number(form.cost_price)) / Number(form.price)) * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Profit per Unit</p>
                    <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: C.text }}>
                      A${(Number(form.price) - Number(form.cost_price)).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label style={lCls}>Tax Rate</label>
                <select value={form.tax_rate ?? 10} onChange={e => setForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) }))} style={{ ...iCls, background: 'var(--bg-input)' }}>
                  <option value={10}>10% GST</option>
                  <option value={0}>0% GST Free</option>
                </select>
              </div>
            </div>

            {/* Price Points table */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Price Points</p>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Multi-quantity pricing tiers (e.g. 1 @ $6.99, 4 @ $25.99, 10 @ $55.99)</p>
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                      {['Price Set','Qty','Price','Cost','Margin',''].map(h => (
                        <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '8px 12px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pricePoints.map((pp, i) => {
                      const isEditing = ppEditing === pp.id;
                      const editMargin = ppEdit.price && ppEdit.cost ? ((Number(ppEdit.price) - Number(ppEdit.cost)) / Number(ppEdit.price) * 100) : pp.margin_percent;
                      return (
                        <tr key={pp.id} style={{ borderBottom: i < pricePoints.length - 1 ? `1px solid ${C.border}` : 'none', background: isEditing ? 'rgba(139,92,246,0.04)' : 'transparent' }}>
                          <td style={{ padding: '8px 12px' }}>
                            {isEditing
                              ? <input value={ppEdit.price_set_name ?? pp.price_set_name} onChange={e => setPpEdit(x => ({ ...x, price_set_name: e.target.value }))} style={ppIcls} />
                              : <span style={{ fontSize: 12, color: C.muted }}>{pp.price_set_name}</span>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {isEditing
                              ? <input type="number" min="1" value={ppEdit.quantity ?? pp.quantity} onChange={e => setPpEdit(x => ({ ...x, quantity: parseInt(e.target.value) || 1 }))} style={{ ...ppIcls, width: 60 }} />
                              : <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>{pp.quantity}</span>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {isEditing
                              ? <input type="number" step="0.01" min="0" value={ppEdit.price ?? pp.price} onChange={e => setPpEdit(x => ({ ...x, price: parseFloat(e.target.value) }))} style={{ ...ppIcls, width: 80 }} />
                              : <span style={{ fontSize: 13, fontWeight: 700, color: C.violet, fontFamily: "'JetBrains Mono',monospace" }}>A${pp.price.toFixed(2)}</span>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {isEditing
                              ? <input type="number" step="0.01" min="0" value={ppEdit.cost ?? ''} onChange={e => setPpEdit(x => ({ ...x, cost: parseFloat(e.target.value) || null }))} style={{ ...ppIcls, width: 80 }} placeholder="0.00" />
                              : <span style={{ fontSize: 12, color: C.muted, fontFamily: "'JetBrains Mono',monospace" }}>{pp.cost != null ? `A$${pp.cost.toFixed(2)}` : '—'}</span>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {isEditing
                              ? <span style={{ fontSize: 12, color: editMargin != null && editMargin > 0 ? C.green : C.muted, fontFamily: "'JetBrains Mono',monospace" }}>{editMargin != null ? `${Number(editMargin).toFixed(2)}%` : '—'}</span>
                              : <span style={{ fontSize: 12, color: pp.margin_percent != null && pp.margin_percent > 20 ? C.green : '#F59E0B', fontFamily: "'JetBrains Mono',monospace" }}>{pp.margin_percent != null ? `${pp.margin_percent.toFixed(2)}%` : '—'}</span>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {isEditing ? (
                                <>
                                  <button onClick={() => savePricePoint(pp.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: C.violet, color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                                  <button onClick={() => setPpEditing(null)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => { setPpEditing(pp.id); setPpEdit({ price_set_name: pp.price_set_name, quantity: pp.quantity, price: pp.price, cost: pp.cost ?? undefined }); }}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                                  <button onClick={() => deletePricePoint(pp.id)}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: C.red, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>🗑</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Add new row */}
                    <tr style={{ background: 'rgba(139,92,246,0.03)', borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 12px' }}>
                        <input value={ppNew.price_set_name} onChange={e => setPpNew(x => ({ ...x, price_set_name: e.target.value }))} style={ppIcls} placeholder="Default Price Set" />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input type="number" min="1" value={ppNew.quantity} onChange={e => setPpNew(x => ({ ...x, quantity: e.target.value }))} style={{ ...ppIcls, width: 60 }} />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input type="number" step="0.01" min="0" value={ppNew.price} onChange={e => setPpNew(x => ({ ...x, price: e.target.value }))} style={{ ...ppIcls, width: 80 }} placeholder="0.00" />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input type="number" step="0.01" min="0" value={ppNew.cost} onChange={e => setPpNew(x => ({ ...x, cost: e.target.value }))} style={{ ...ppIcls, width: 80 }} placeholder="0.00" />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {ppNew.price && ppNew.cost && Number(ppNew.price) > 0
                          ? <span style={{ fontSize: 12, color: C.green, fontFamily: "'JetBrains Mono',monospace" }}>{(((parseFloat(ppNew.price) - parseFloat(ppNew.cost)) / parseFloat(ppNew.price)) * 100).toFixed(2)}%</span>
                          : <span style={{ fontSize: 12, color: C.dim }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <button onClick={addPricePoint} disabled={ppAdding || !ppNew.price}
                          style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: C.violet, color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: ppNew.price ? 1 : 0.4 }}>
                          {ppAdding ? '…' : '+ Add'}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Inventory ── */}
        {tab === 'Inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: C.muted }}>
              Track stock must be enabled (General tab) for stock settings to apply.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lCls}>Current Stock Quantity</label>
                <input type="number" value={form.stock_quantity ?? ''} onChange={e => setForm(f => ({ ...f, stock_quantity: parseInt(e.target.value) || 0 }))} style={iCls} min="0" />
              </div>
              <div>
                <label style={lCls}>Low Stock Threshold</label>
                <input type="number" value={form.low_stock_threshold ?? ''} onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))} style={iCls} min="0" />
              </div>
            </div>
            <div>
              <label style={lCls}>Case Quantity (units per case)</label>
              <input type="number" min="1" value={form.case_quantity ?? 1} onChange={e => setForm(f => ({ ...f, case_quantity: parseInt(e.target.value) || 1 }))} style={iCls} />
            </div>
            {outlets.length > 0 && (
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>Outlet Stock Levels</p>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  {outlets.map((o, i) => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < outlets.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <span style={{ fontSize: 13, color: C.text }}>{o.name}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>View in Stocktake</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Barcodes ── */}
        {tab === 'Barcodes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={lCls}>Primary Barcode</label>
              <input {...F('barcode')} style={iCls} placeholder="Scan or type barcode" />
            </div>
            <div>
              <label style={lCls}>SKU / Product Code</label>
              <input {...F('sku')} style={iCls} placeholder="Internal stock code" />
            </div>
            <p style={{ fontSize: 12, color: C.dim }}>Additional barcodes can be added by scanning at the terminal — any barcode will be matched to this product.</p>
          </div>
        )}

        {/* ── Images ── */}
        {tab === 'Images' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={lCls}>Product Image URL</label>
              <input {...F('image_url')} style={iCls} placeholder="https://example.com/image.jpg" />
              <p style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Enter a URL to an image hosted externally. Supported formats: JPG, PNG, WebP.</p>
            </div>
            {form.image_url && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <img src={form.image_url as string} alt="Product preview" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>Image Preview</p>
                  <p style={{ fontSize: 11, color: C.muted, wordBreak: 'break-all' }}>{form.image_url as string}</p>
                  <button onClick={() => setForm(f => ({ ...f, image_url: null }))}
                    style={{ marginTop: 10, padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: C.red, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Remove image
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Loyalty ── */}
        {tab === 'Loyalty' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: C.muted }}>
              Configure how loyalty points are earned when this product is sold.
            </div>
            <div>
              <label style={lCls}>Loyalty Earn Rate (points per A$1 spent)</label>
              <input type="number" step="0.1" min="0" value={form.loyalty_earn_rate ?? 1.0}
                onChange={e => setForm(f => ({ ...f, loyalty_earn_rate: parseFloat(e.target.value) || 0 }))} style={iCls} />
              <p style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Default is 1.0 point per dollar. Set to 0 to exclude from loyalty program.</p>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Example: if sell price is A${Number(form.price || 0).toFixed(2)}</p>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: C.violet }}>
                {(Number(form.price || 0) * Number(form.loyalty_earn_rate || 1)).toFixed(0)} pts earned
              </p>
            </div>
          </div>
        )}

        {/* ── Suppliers ── */}
        {tab === 'Suppliers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: C.muted }}>
              Link this product to suppliers for purchasing and cost tracking. Manage suppliers in{' '}
              <Link href="/pos/purchasing" style={{ color: C.violet }}>Purchasing</Link>.
            </div>
            <div>
              <label style={lCls}>Primary Supplier ID</label>
              <input value={form.supplier_id ?? ''} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value || null as any }))} style={iCls} placeholder="Supplier UUID (link from Purchasing)" />
            </div>
            <p style={{ fontSize: 12, color: C.dim }}>Full supplier linking with purchase orders is managed in the Purchasing module.</p>
          </div>
        )}

      </div>
    </div>
  );
}
