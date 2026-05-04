'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; cost_price: number; stock_quantity: number | null;
  track_stock: boolean; is_active: boolean; is_age_restricted?: boolean;
  category_id?: string | null; description?: string | null;
  tax_rate?: number; low_stock_threshold?: number;
}
interface Category { id: string; name: string; color: string; }

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6' };
const TABS = ['General','Inventory','Pricing','Barcodes'] as const;

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [tab,       setTab]      = useState<typeof TABS[number]>('General');
  const [product,   setProduct]  = useState<Product | null>(null);
  const [categories,setCategories] = useState<Category[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [saving,    setSaving]   = useState(false);
  const [saved,     setSaved]    = useState(false);
  const [form,      setForm]     = useState<Partial<Product>>({});

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/pos/products?id=${id}`).then(r => r.json()),
      fetch('/api/pos/categories').then(r => r.json()),
    ]).then(([pd, cd]) => {
      const p = (pd.products ?? []).find((x: Product) => x.id === id) ?? null;
      setProduct(p);
      if (p) setForm(p);
      setCategories(cd.categories ?? []);
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

  const F = (key: keyof Product) => ({
    value: form[key] as string ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });
  const CHK = (key: keyof Product) => ({
    checked: !!form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.checked })),
  });

  const iCls = 'w-full bg-[#0A0910] border border-[#2A2540] rounded-lg px-3 py-2.5 text-sm text-[#EDE8FF] focus:outline-none focus:border-[#8B5CF6] placeholder-[#4A4565]';
  const lCls = 'block text-xs font-medium text-[#8B85A8] mb-1.5';

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
      <div style={{ padding: '16px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href={`/pos/products/${id}`} style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← {product.name}</Link>
          <span style={{ color: C.border }}>/</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Edit</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saved && <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 600 }}>✓ Saved</span>}
          <button onClick={save} disabled={saving}
            style={{ padding: '9px 24px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, paddingLeft: 28 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '12px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? C.violet : 'transparent'}`, color: tab === t ? C.violet : C.muted, fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '28px', maxWidth: 640 }}>

        {tab === 'General' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label className={lCls}>Product Name *</label>
              <input {...F('name')} className={iCls} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className={lCls}>SKU</label>
                <input {...F('sku')} className={iCls} placeholder="e.g. ABC-001" />
              </div>
              <div>
                <label className={lCls}>Barcode</label>
                <input {...F('barcode')} className={iCls} placeholder="e.g. 9300675000000" />
              </div>
            </div>
            <div>
              <label className={lCls}>Category</label>
              <select value={form.category_id ?? ''} onChange={e => setForm(f => ({ ...f, category_id: e.target.value || null }))} className={iCls} style={{ background: '#0A0910' }}>
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls}>Description</label>
              <textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={iCls} style={{ resize: 'vertical' }} placeholder="Optional product description" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['is_active', 'Product is active (visible on terminal)'],
                ['is_age_restricted', 'Age restricted (requires ID verification at checkout)'],
                ['track_stock', 'Track inventory for this product'],
              ].map(([k, label]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" {...CHK(k as keyof Product)} style={{ width: 16, height: 16, accentColor: C.violet }} />
                  <span style={{ fontSize: 13, color: C.text }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {tab === 'Inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: C.muted }}>
              Track stock must be enabled (General tab) for these settings to apply.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className={lCls}>Current Stock Quantity</label>
                <input type="number" value={form.stock_quantity ?? ''} onChange={e => setForm(f => ({ ...f, stock_quantity: parseInt(e.target.value) || 0 }))} className={iCls} min="0" />
              </div>
              <div>
                <label className={lCls}>Low Stock Threshold</label>
                <input type="number" value={form.low_stock_threshold ?? ''} onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))} className={iCls} min="0" />
              </div>
            </div>
          </div>
        )}

        {tab === 'Pricing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className={lCls}>Sell Price (A$) *</label>
                <input type="number" step="0.01" min="0" value={form.price ?? ''} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} className={iCls} />
              </div>
              <div>
                <label className={lCls}>Cost Price (A$)</label>
                <input type="number" step="0.01" min="0" value={form.cost_price ?? ''} onChange={e => setForm(f => ({ ...f, cost_price: parseFloat(e.target.value) || 0 }))} className={iCls} />
              </div>
            </div>
            {form.price && form.cost_price && Number(form.price) > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px' }}>
                <p style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Gross Margin</p>
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: '#22C55E' }}>
                  {(((Number(form.price) - Number(form.cost_price)) / Number(form.price)) * 100).toFixed(1)}%
                </p>
              </div>
            )}
            <div>
              <label className={lCls}>Tax Rate (%)</label>
              <select value={form.tax_rate ?? 10} onChange={e => setForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) }))} className={iCls} style={{ background: '#0A0910' }}>
                <option value={10}>10% GST</option>
                <option value={0}>0% GST Free</option>
              </select>
            </div>
          </div>
        )}

        {tab === 'Barcodes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className={lCls}>Primary Barcode</label>
              <input {...F('barcode')} className={iCls} placeholder="Scan or type barcode" />
            </div>
            <div>
              <label className={lCls}>SKU / Product Code</label>
              <input {...F('sku')} className={iCls} placeholder="Internal stock code" />
            </div>
            <p style={{ fontSize: 12, color: C.dim }}>Additional barcodes can be added by scanning at the terminal — any barcode will be matched to this product.</p>
          </div>
        )}
      </div>
    </div>
  );
}
