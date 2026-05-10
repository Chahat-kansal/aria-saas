'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; cost_price: number | null; tax_rate: number | null;
  stock_quantity: number | null; low_stock_threshold: number | null;
  track_stock: boolean; is_active: boolean; is_age_restricted?: boolean;
  description?: string | null; image_url?: string | null;
  category_id?: string | null; supplier_id?: string | null;
  case_quantity?: number | null; brand_id?: string | null; family_id?: string | null;
  loyalty_earn_rate?: number | null; container_type?: string | null;
}
interface Category { id: string; name: string; }
interface ClassItem { id: string; name: string; }
interface Sale { id: string; created_at: string; total_amount: number; quantity: number; }

const TABS = ['Details', 'Pricing', 'Inventory', 'Sales History', 'Suppliers'] as const;
const C = {
  bg: 'var(--bg-base)', surface: 'var(--bg-surface)', elevated: 'var(--bg-elevated)',
  text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  v: 'var(--violet)', border: 'var(--divider)', success: 'var(--success)',
};
const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: 'none', borderRadius: 8,
  padding: '10px 12px', fontSize: 13, color: C.text, outline: 'none',
  fontFamily: "'Manrope',sans-serif", boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: C.muted,
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<typeof TABS[number]>('Details');
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<ClassItem[]>([]);
  const [families, setFamilies] = useState<ClassItem[]>([]);
  const [suppliers, setSuppliers] = useState<ClassItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedField, setSavedField] = useState('');
  const [form, setForm] = useState<Partial<Product>>({});
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/pos/products?id=${id}`).then(r => r.json()),
      fetch('/api/pos/categories').then(r => r.json()),
      fetch('/api/pos/classifications?type=brand').then(r => r.json()),
      fetch('/api/pos/classifications?type=family').then(r => r.json()),
      fetch('/api/pos/suppliers').then(r => r.json()).catch(() => ({ suppliers: [] })),
      fetch(`/api/pos/sales?product_id=${id}&limit=20`).then(r => r.json()).catch(() => ({ sales: [] })),
    ]).then(([pd, cd, bd, fd, sd, salD]) => {
      const p = (pd.products ?? []).find((x: Product) => x.id === id) ?? null;
      setProduct(p);
      if (p) setForm(p);
      setCategories(cd.categories ?? []);
      setBrands(bd.items ?? []);
      setFamilies(fd.items ?? []);
      setSuppliers(sd.suppliers ?? []);
      setSales(salD.sales ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  // Auto-save on blur
  const patchField = useCallback(async (patch: Partial<Product>) => {
    if (!id) return;
    setForm(f => ({ ...f, ...patch }));
    await fetch(`/api/pos/products/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const k = Object.keys(patch)[0] ?? '';
    setSavedField(k);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => setSavedField(''), 2000);
  }, [id]);

  // Toggle active directly from sidebar
  async function toggleActive() {
    if (!product) return;
    const next = !form.is_active;
    await patchField({ is_active: next });
    setProduct(p => p ? { ...p, is_active: next } : p);
  }

  const inp2 = (key: keyof Product, type = 'text') => ({
    style: inp,
    type,
    value: (form[key] as string | number) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      patchField({ [key]: type === 'number' ? parseFloat(e.target.value) || null : e.target.value || null });
    },
  });

  const margin = (() => {
    const p = Number(form.price); const c = Number(form.cost_price);
    if (!p || !c || p <= 0) return null;
    return (((p - c) / p) * 100).toFixed(1);
  })();

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: C.bg }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(127,184,151,0.3)', borderTopColor: C.v, animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  if (!product) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', background: C.bg, color: C.text, gap: 12 }}>
      <p style={{ fontSize: 16, color: C.muted }}>Product not found</p>
      <Link href="/pos/products" style={{ color: C.v, fontSize: 13 }}>← Back to products</Link>
    </div>
  );

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/pos/products" style={{ fontSize: 12, color: C.muted, textDecoration: 'none' }}>Products</Link>
        <span style={{ color: C.border }}>/</span>
        <Link href={`/pos/products/${id}`} style={{ fontSize: 12, color: C.muted, textDecoration: 'none' }}>{product.name}</Link>
        <span style={{ color: C.border }}>/</span>
        <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>Edit</span>
        {savedField && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.success, fontWeight: 600 }}>✓ Saved</span>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 0, minHeight: 'calc(100vh - 57px)' }}>

        {/* ── LEFT: Tabbed content ── */}
        <div style={{ borderRight: `1px solid ${C.border}` }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, paddingLeft: 24, overflowX: 'auto', flexShrink: 0 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '12px 18px', background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === t ? C.v : 'transparent'}`,
                color: tab === t ? C.v : C.muted,
                fontSize: 13, fontWeight: tab === t ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}>{t}</button>
            ))}
          </div>

          <div style={{ padding: '24px 28px' }}>

            {/* ── Details ── */}
            {tab === 'Details' && (
              <>
                <Field label="Product name">
                  <input {...inp2('name')} placeholder="Product name" autoFocus />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="SKU">
                    <input {...inp2('sku')} placeholder="Auto-generated" />
                  </Field>
                  <Field label="Barcode">
                    <input {...inp2('barcode')} placeholder="EAN / UPC" />
                  </Field>
                </div>
                <Field label="Description">
                  <textarea
                    style={{ ...inp, minHeight: 80, resize: 'vertical' }}
                    value={form.description ?? ''}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    onBlur={e => patchField({ description: e.target.value || null })}
                    placeholder="Optional description"
                  />
                </Field>
                <Field label="Category">
                  <select
                    style={{ ...inp, background: 'var(--bg-input)' }}
                    value={form.category_id ?? ''}
                    onChange={e => {
                      setForm(f => ({ ...f, category_id: e.target.value || null }));
                      patchField({ category_id: e.target.value || null });
                    }}
                  >
                    <option value="">No category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Container type">
                  <select
                    style={{ ...inp, background: 'var(--bg-input)' }}
                    value={form.container_type ?? 'unknown'}
                    onChange={e => {
                      setForm(f => ({ ...f, container_type: e.target.value }));
                      patchField({ container_type: e.target.value });
                    }}
                  >
                    {['unknown','bottle','can','keg','carton','box','bag','packet'].map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </Field>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                  {([
                    ['is_age_restricted', 'Age restricted (ID verification required at checkout)'],
                    ['track_stock', 'Track inventory for this product'],
                  ] as [keyof Product, string][]).map(([k, label]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!form[k]}
                        onChange={e => patchField({ [k]: e.target.checked })}
                        style={{ width: 15, height: 15, accentColor: C.v }} />
                      <span style={{ fontSize: 13 }}>{label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {/* ── Pricing ── */}
            {tab === 'Pricing' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Sale price (AUD) *">
                    <input {...inp2('price', 'number')} placeholder="0.00" />
                  </Field>
                  <Field label="Cost price (AUD)">
                    <input {...inp2('cost_price', 'number')} placeholder="0.00" />
                  </Field>
                </div>
                <Field label="GST rate">
                  <select
                    style={{ ...inp, background: 'var(--bg-input)' }}
                    value={form.tax_rate ?? 10}
                    onChange={e => {
                      setForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) }));
                      patchField({ tax_rate: parseFloat(e.target.value) });
                    }}
                  >
                    <option value="0">0% — GST exempt</option>
                    <option value="10">10% — Standard GST</option>
                  </select>
                </Field>
                {margin !== null && (
                  <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: C.muted }}>Gross margin</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: parseFloat(margin) < 20 ? 'var(--warning)' : C.success }}>
                      {margin}%
                    </span>
                  </div>
                )}
                <Field label="Loyalty earn rate (points per $1)">
                  <input {...inp2('loyalty_earn_rate', 'number')} placeholder="e.g. 1" />
                </Field>
                <div style={{ marginTop: 8 }}>
                  <label style={lbl}>Brand / Family</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <select
                      style={{ ...inp, background: 'var(--bg-input)' }}
                      value={form.brand_id ?? ''}
                      onChange={e => { setForm(f => ({ ...f, brand_id: e.target.value || null })); patchField({ brand_id: e.target.value || null }); }}
                    >
                      <option value="">No brand</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select
                      style={{ ...inp, background: 'var(--bg-input)' }}
                      value={form.family_id ?? ''}
                      onChange={e => { setForm(f => ({ ...f, family_id: e.target.value || null })); patchField({ family_id: e.target.value || null }); }}
                    >
                      <option value="">No family</option>
                      {families.map(fam => <option key={fam.id} value={fam.id}>{fam.name}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* ── Inventory ── */}
            {tab === 'Inventory' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Track inventory</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Deduct stock when sold</div>
                  </div>
                  <button onClick={() => patchField({ track_stock: !form.track_stock })} style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: form.track_stock ? C.v : 'var(--bg-elevated)', position: 'relative', transition: 'background 200ms',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: form.track_stock ? 23 : 3,
                      width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 200ms',
                    }} />
                  </button>
                </div>
                {form.track_stock && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="Current stock">
                      <input {...inp2('stock_quantity', 'number')} placeholder="0" />
                    </Field>
                    <Field label="Low stock alert">
                      <input {...inp2('low_stock_threshold', 'number')} placeholder="5" />
                    </Field>
                  </div>
                )}
                <Field label="Case quantity">
                  <input {...inp2('case_quantity', 'number')} placeholder="1" />
                </Field>
              </>
            )}

            {/* ── Sales History ── */}
            {tab === 'Sales History' && (
              <>
                {sales.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>
                    No sales recorded yet for this product.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {['Date', 'Qty', 'Total'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map(s => (
                        <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '10px 12px', color: C.muted }}>{new Date(s.created_at).toLocaleDateString('en-AU')}</td>
                          <td style={{ padding: '10px 12px' }}>{s.quantity}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>A${Number(s.total_amount ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {/* ── Suppliers ── */}
            {tab === 'Suppliers' && (
              <>
                <Field label="Primary supplier">
                  <select
                    style={{ ...inp, background: 'var(--bg-input)' }}
                    value={form.supplier_id ?? ''}
                    onChange={e => { setForm(f => ({ ...f, supplier_id: e.target.value || null })); patchField({ supplier_id: e.target.value || null }); }}
                  >
                    <option value="">No supplier linked</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <p style={{ fontSize: 12, color: C.dim }}>
                  Manage suppliers in{' '}
                  <Link href="/pos/setup/suppliers" style={{ color: C.v }}>Setup → Suppliers</Link>.
                  Linking a supplier enables the Reorder Agent to auto-propose purchase orders.
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Sticky sidebar ── */}
        <div style={{ padding: 20, position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto' }}>

          {/* Image */}
          <div style={{
            width: '100%', aspectRatio: '1', borderRadius: 12,
            background: form.image_url ? 'transparent' : 'var(--bg-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, overflow: 'hidden',
          }}>
            {form.image_url
              ? <img src={form.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ fontSize: 32, fontWeight: 800, color: C.v, opacity: 0.4 }}>{product.name[0]?.toUpperCase()}</div>
            }
          </div>

          {/* Image URL input */}
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Image URL</label>
            <input
              style={{ ...inp, fontSize: 12 }}
              value={form.image_url ?? ''}
              onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
              onBlur={e => patchField({ image_url: e.target.value || null })}
              placeholder="https://…"
            />
          </div>

          {/* Status toggle */}
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elevated)', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Active</div>
              <div style={{ fontSize: 11, color: C.muted }}>Visible on terminal</div>
            </div>
            <button onClick={toggleActive} style={{
              width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
              background: form.is_active ? C.v : 'var(--bg-surface)', position: 'relative', transition: 'background 200ms',
            }}>
              <div style={{
                position: 'absolute', top: 2, left: form.is_active ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 200ms',
              }} />
            </button>
          </div>

          {/* Quick stats */}
          {[
            { label: 'Sale price', value: `A$${Number(form.price ?? 0).toFixed(2)}` },
            { label: 'Cost price', value: form.cost_price ? `A$${Number(form.cost_price).toFixed(2)}` : '—' },
            { label: 'Margin', value: margin != null ? `${margin}%` : '—' },
            { label: 'Stock', value: form.track_stock ? (form.stock_quantity ?? 0) : 'Untracked' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
              <span style={{ color: C.muted }}>{label}</span>
              <span style={{ fontWeight: 600 }}>{value}</span>
            </div>
          ))}

          {/* Action buttons */}
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link href={`/pos/products/${id}`}
              style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: 9, border: `1px solid ${C.border}`, color: C.muted, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              View product page
            </Link>
            <button
              onClick={() => { if (confirm(`Delete "${product.name}"? This cannot be undone.`)) { fetch(`/api/pos/products/${id}`, { method: 'DELETE' }).then(() => router.push('/pos/products')); } }}
              style={{ padding: '10px', borderRadius: 9, border: '1px solid rgba(201,112,112,0.3)', background: 'rgba(201,112,112,0.06)', color: 'var(--destructive)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Delete product
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
