'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

const C = {
  bg: 'rgba(17,15,26,0.95)', card: 'rgba(26,23,40,0.9)', border: '#2A2540',
  text: '#EDE8FF', muted: '#8B85A8', dim: '#4A4565',
  violet: '#8B5CF6', green: '#22C55E', red: '#EF4444',
};

const COMPONENT_PALETTE = [
  { type: 'header',           label: 'Header',          icon: '🏪', desc: 'Business name & logo' },
  { type: 'products',         label: 'Products',        icon: '🛒', desc: 'Line items list' },
  { type: 'tax',              label: 'Tax',             icon: '🧾', desc: 'GST breakdown' },
  { type: 'totals',           label: 'Totals',          icon: '💰', desc: 'Subtotal & total' },
  { type: 'payments',         label: 'Payments',        icon: '💳', desc: 'Payment method' },
  { type: 'loyalty',          label: 'Loyalty',         icon: '⭐', desc: 'Points earned' },
  { type: 'barcode',          label: 'Barcode',         icon: '▦',  desc: 'Sale barcode' },
  { type: 'spacer',           label: 'Spacer',          icon: '—',  desc: 'Empty space' },
  { type: 'text',             label: 'Text',            icon: 'T',  desc: 'Custom text' },
  { type: 'image',            label: 'Image',           icon: '🖼',  desc: 'Logo/image' },
  { type: 'columns',          label: 'Columns',         icon: '⊞',  desc: '2-col layout' },
  { type: 'surcharge',        label: 'Surcharge',       icon: '%',  desc: 'Surcharge line' },
  { type: 'gift_cards',       label: 'Gift Cards',      icon: '🎁', desc: 'Gift card info' },
  { type: 'account',          label: 'Account',         icon: '👤', desc: 'Account balance' },
  { type: 'tax_indicator',    label: 'Tax Indicator',   icon: '🏷',  desc: 'Tax reg. number' },
  { type: 'outlet_logo',      label: 'Outlet Logo',     icon: '🏬', desc: 'Outlet branding' },
  { type: 'external_receipt', label: 'External Receipt',icon: '📄', desc: 'External slip' },
];

interface Component { type: string; id: string; }
interface Template { id: string; name: string; type: string; for_type: string; components: Component[]; }

function componentPreview(comp: Component): string {
  const previews: Record<string, string> = {
    header:           '[ AriaPOS — Your Business Name ]',
    products:         '[ Product 1 ............ $10.00 ]\n[ Product 2 ............. $5.00 ]',
    tax:              '[ GST (incl.) ............ $1.36 ]',
    totals:           '[ Subtotal .............. $15.00 ]\n[ TOTAL ................. $15.00 ]',
    payments:         '[ Card .................. $15.00 ]',
    loyalty:          '[ Points earned: 15 pts          ]',
    barcode:          '[ |||||||||||||||||||||| ]',
    spacer:           '[ ............................ ]',
    text:             '[ Thank you for your business!   ]',
    image:            '[ [Logo Image]                   ]',
    columns:          '[ Left col | Right col           ]',
    surcharge:        '[ Card surcharge (1.5%) .. $0.23 ]',
    gift_cards:       '[ Gift Card XXXX-XXXX            ]',
    account:          '[ Account: John Smith  $50.00    ]',
    tax_indicator:    '[ ABN: 12 345 678 901            ]',
    outlet_logo:      '[ [Outlet Logo]                  ]',
    external_receipt: '[ [External Receipt Slip]        ]',
  };
  return previews[comp.type] ?? `[ ${comp.type} ]`;
}

export default function ReceiptBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'components' | 'settings'>('components');

  useEffect(() => {
    fetch(`/api/pos/receipt-templates/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.template) setTemplate({ ...d.template, components: d.template.components ?? [] });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const addComponent = useCallback((type: string) => {
    setTemplate(prev => {
      if (!prev) return prev;
      return { ...prev, components: [...prev.components, { type, id: `${type}-${Date.now()}` }] };
    });
  }, []);

  const removeComponent = useCallback((idx: number) => {
    setTemplate(prev => {
      if (!prev) return prev;
      const next = [...prev.components];
      next.splice(idx, 1);
      return { ...prev, components: next };
    });
  }, []);

  function handleDragStart(idx: number) { setDragIndex(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDropIndex(idx); }
  function handleDrop() {
    if (dragIndex === null || dropIndex === null || dragIndex === dropIndex) { setDragIndex(null); setDropIndex(null); return; }
    setTemplate(prev => {
      if (!prev) return prev;
      const next = [...prev.components];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, moved);
      return { ...prev, components: next };
    });
    setDragIndex(null); setDropIndex(null);
  }

  async function save() {
    if (!template) return;
    setSaving(true);
    await fetch(`/api/pos/receipt-templates/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: template.name, type: template.type, for_type: template.for_type, components: template.components }),
    });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  function openPrintPreview() {
    if (!template) return;
    const html = `<!DOCTYPE html><html><head><title>Receipt Preview</title><style>
      body{font-family:monospace;font-size:12px;max-width:300px;margin:20px auto;padding:0 10px;}
      pre{white-space:pre-wrap;word-break:break-word;}
    </style></head><body>
    <h3 style="text-align:center">${template.name}</h3>
    ${template.components.map(c => `<pre>${componentPreview(c)}</pre>`).join('')}
    </body></html>`;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  if (loading) return (
    <div style={{ minHeight: '100%', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: C.muted, fontFamily: "'Manrope',sans-serif" }}>Loading...</p>
    </div>
  );

  if (!template) return (
    <div style={{ minHeight: '100%', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, fontFamily: "'Manrope',sans-serif" }}>
      <p style={{ color: C.muted }}>Template not found</p>
      <button onClick={() => router.push('/pos/settings/receipts')} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: 'pointer', fontFamily: 'inherit' }}>
        Back to templates
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: 'rgba(26,23,40,0.8)' }}>
        <button onClick={() => router.push('/pos/settings/receipts')} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>←</button>
        <input
          value={template.name}
          onChange={e => setTemplate(prev => prev ? { ...prev, name: e.target.value } : prev)}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 16, fontWeight: 700, color: C.text, fontFamily: 'inherit' }}
        />
        <button onClick={openPrintPreview} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          Preview
        </button>
        <button onClick={save} disabled={saving} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Body: 3 columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'auto', minHeight: 0 }}>

        {/* Left: Palette + Settings */}
        <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            {(['components', 'settings'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ flex: 1, padding: '10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: activeTab === tab ? 'rgba(139,92,246,0.12)' : 'transparent', color: activeTab === tab ? C.violet : C.muted, borderBottom: activeTab === tab ? `2px solid ${C.violet}` : '2px solid transparent' }}>
                {tab === 'components' ? 'Components' : 'Settings'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {activeTab === 'components' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {COMPONENT_PALETTE.map(comp => (
                  <button
                    key={comp.type}
                    onClick={() => addComponent(comp.type)}
                    title={comp.desc}
                    style={{ padding: '8px 4px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 150ms' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.violet; (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.1)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = C.card; }}
                  >
                    <span style={{ fontSize: 16 }}>{comp.icon}</span>
                    <span style={{ fontSize: 9, color: C.muted, fontFamily: 'inherit', textAlign: 'center', lineHeight: 1.2 }}>{comp.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Receipt Type</label>
                  <select
                    value={template.type}
                    onChange={e => setTemplate(prev => prev ? { ...prev, type: e.target.value } : prev)}
                    style={{ width: '100%', background: '#0A0910', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit' }}>
                    <option value="normal">Normal (print)</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Used For</label>
                  <select
                    value={template.for_type}
                    onChange={e => setTemplate(prev => prev ? { ...prev, for_type: e.target.value } : prev)}
                    style={{ width: '100%', background: '#0A0910', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit' }}>
                    <option value="sale">Sale receipt</option>
                    <option value="payment">Payment receipt</option>
                  </select>
                </div>
                <p style={{ fontSize: 11, color: C.dim }}>Drag components in the preview panel to reorder. Click × to remove.</p>
              </div>
            )}
          </div>
        </div>

        {/* Centre: Receipt Preview (draggable) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', overflowY: 'auto', background: 'rgba(10,9,18,0.6)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 12 }}>80mm Receipt Preview</p>
          <div style={{ width: 300, background: '#fff', borderRadius: 8, padding: '16px 12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minHeight: 200 }}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}>
            {template.components.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#999', fontSize: 12 }}>
                <p>Add components from the palette</p>
              </div>
            ) : (
              template.components.map((comp, idx) => (
                <div
                  key={comp.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  style={{
                    padding: '5px 6px',
                    marginBottom: 2,
                    borderRadius: 4,
                    border: `1px solid ${dropIndex === idx && dragIndex !== idx ? '#8B5CF6' : '#e5e7eb'}`,
                    background: dragIndex === idx ? '#f3e8ff' : '#fff',
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    transition: 'border-color 100ms',
                  }}
                >
                  <span style={{ color: '#9ca3af', fontSize: 10, marginTop: 2, flexShrink: 0 }}>⋮⋮</span>
                  <pre style={{ flex: 1, fontFamily: 'monospace', fontSize: 10, color: '#1f2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, lineHeight: 1.4 }}>
                    {componentPreview(comp)}
                  </pre>
                  <button
                    onClick={() => removeComponent(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}>
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <p style={{ marginTop: 12, fontSize: 10, color: C.dim }}>Drag to reorder · Click × to remove</p>
        </div>

        {/* Right: Component count */}
        <div style={{ width: 200, flexShrink: 0, borderLeft: `1px solid ${C.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 4 }}>Summary</p>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 11, color: C.muted }}>Components</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{template.components.length}</p>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 11, color: C.muted }}>Type</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{template.type}</p>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 11, color: C.muted }}>For</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{template.for_type}</p>
          </div>
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 8 }}>Quick Add</p>
            {['header', 'products', 'totals', 'payments'].map(type => (
              <button
                key={type}
                onClick={() => addComponent(type)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', marginBottom: 4, borderRadius: 7, border: `1px solid ${C.border}`, background: C.card, color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                + {type}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
