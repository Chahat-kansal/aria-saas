'use client';
import { useState, useEffect, useCallback } from 'react';
import Receipt from '@/components/pos/Receipt';
import type { ReceiptTemplate, ReceiptSettings } from '@/components/pos/Receipt';
import ReturnModal from '@/components/pos/ReturnModal';

interface SaleItem { id: string; product_id?: string | null; product_name: string; quantity: number; returned_quantity?: number; unit_price: number; line_total: number; tax_rate: number; discount_percent: number; }
interface Sale {
  id: string; sale_number?: string; total_amount: number; tax_amount?: number;
  payment_method?: string; status?: string; created_at: string;
  served_by?: string | null; customer_id?: string | null;
  internal_comment?: string | null; external_notes?: string | null; notes?: string | null;
  pos_customers?: { name: string; email?: string } | null;
  pos_sale_items?: SaleItem[];
}
interface AuditEntry {
  id: string; action: string; field_changed?: string | null;
  old_value?: unknown; new_value?: unknown; reason?: string | null;
  edited_by?: string | null; created_at: string;
}

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#006AFF' };
const PAY: Record<string, string> = { card:'#3B82F6', cash:'#00B140', eftpos:'#38BDF8', split:'#F59E0B' };

function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString('en-AU');
}

export default function HistoryPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [detail, setDetail] = useState<Sale | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [from, setFrom] = useState(() => fmtDate(new Date()));
  const [to, setTo] = useState(() => fmtDate(new Date()));
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplate | null>(null);
  const [posSettings, setPosSettings] = useState<ReceiptSettings | undefined>(undefined);
  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({ served_by: '', notes: '', internal_comment: '', external_notes: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  // Return state
  const [returnMode, setReturnMode] = useState(false);
  const [returnItems, setReturnItems] = useState<Record<string, boolean>>({});
  const [processing, setProcessing] = useState(false);
  // ── Sprint C ReturnModal ──
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState<{ return_number: string; total_refund: number; store_credit_code?: string | null } | null>(null);
  // Audit trail
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  // Email receipt
  const [emailAddr, setEmailAddr] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/pos/reports/sales?from=${from}&to=${to}`);
      const d = await r.json();
      setSales(d.sales ?? []);
    } catch { setSales([]); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/pos/receipt-templates').then(r => r.json()).then(d => {
      const templates: ReceiptTemplate[] = d.templates || [];
      if (templates.length > 0) {
        const def = templates.find(t => t.is_default) ?? templates[0];
        if (def?.elements?.length) setReceiptTemplate(def);
      }
    }).catch(() => null);
    fetch('/api/pos/settings').then(r => r.json()).then(d => {
      if (d?.settings) setPosSettings(d.settings);
    }).catch(() => null);
  }, []);

  async function loadDetail(sale: Sale) {
    setSelected(sale);
    setDetail(null); setDetailLoading(true);
    setEditMode(false); setReturnMode(false); setReturnItems({});
    setShowAudit(false); setAuditTrail([]);
    setEmailAddr((sale.pos_customers as any)?.email ?? '');
    setEmailMsg('');
    try {
      const r = await fetch(`/api/pos/sales/${sale.id}`);
      const d = await r.json();
      if (d.sale) {
        setDetail(d.sale);
        setEditFields({
          served_by: d.sale.served_by ?? '',
          notes: d.sale.notes ?? '',
          internal_comment: d.sale.internal_comment ?? '',
          external_notes: d.sale.external_notes ?? '',
        });
        setEmailAddr((d.sale.pos_customers as any)?.email ?? '');
      }
    } catch { setDetail(sale); }
    setDetailLoading(false);
  }

  async function loadAudit(saleId: string) {
    setAuditLoading(true);
    try {
      const r = await fetch(`/api/pos/sales/${saleId}?action=audit`);
      const d = await r.json();
      setAuditTrail(d.edits ?? []);
    } catch { setAuditTrail([]); }
    setAuditLoading(false);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true); setSaveMsg('');
    const res = await fetch(`/api/pos/sales/${selected.id}?action=modify_metadata`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editFields),
    });
    const d = await res.json();
    setSaving(false);
    if (res.ok) {
      setSaveMsg(d.message === 'no_changes' ? 'No changes' : `Saved ${d.changes} field(s)`);
      setEditMode(false);
      if (detail) setDetail({ ...detail, ...editFields });
    } else {
      setSaveMsg(d.message ?? d.error ?? 'Save failed');
    }
  }

  async function processReturn() {
    if (!selected || !detail) return;
    const items = (detail.pos_sale_items ?? []).filter(i => returnItems[i.id]).map(i => ({ sale_item_id: i.id, qty: i.quantity }));
    if (!items.length) return;
    setProcessing(true);
    const r = await fetch('/api/pos/sales/return', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale_id: selected.id, items, reason: 'Customer return' }),
    });
    const d = await r.json();
    setProcessing(false);
    if (d.refund_sale) { setReturnMode(false); load(); alert(`Refund of A$${Math.abs(d.total).toFixed(2)} processed.`); }
    else alert('Return failed: ' + (d.error ?? 'Unknown error'));
  }

  async function sendEmailReceipt() {
    if (!selected || !emailAddr) return;
    setEmailSending(true); setEmailMsg('');
    try {
      const res = await fetch('/api/pos/email-receipt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: selected.id, email: emailAddr, business_id: (detail as any)?.business_id ?? selected.id }),
      });
      if (res.status === 503) {
        const b = await res.json().catch(() => ({}));
        setEmailMsg(b.error ?? 'Email service not configured. Set RESEND_API_KEY in Vercel.');
      } else if (res.ok) {
        setEmailMsg('Receipt sent ✓');
      } else {
        const b = await res.json().catch(() => ({}));
        setEmailMsg(b.error ?? 'Failed to send email receipt');
      }
    } catch { setEmailMsg('Failed to send email receipt'); }
    setEmailSending(false);
  }

  const filtered = sales.filter(s => {
    const matchSearch = !search || (s.sale_number ?? '').toLowerCase().includes(search.toLowerCase()) || (s.pos_customers as any)?.name?.toLowerCase().includes(search.toLowerCase()) || (s.served_by ?? '').toLowerCase().includes(search.toLowerCase());
    const matchPay = !payFilter || s.payment_method === payFilter;
    return matchSearch && matchPay;
  });
  const totalRev = filtered.reduce((sum, s) => sum + (s.total_amount ?? 0), 0);

  const inp: React.CSSProperties = { width: '100%', background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Left: list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${C.border}` }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 2 }}>Sale History</h1>
              <p style={{ fontSize: 12, color: C.muted }}>{filtered.length} sales · A${totalRev.toFixed(2)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <span style={{ color: C.dim, alignSelf: 'center', fontSize: 12 }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sale #, customer, cashier…" style={{ flex: 1, minWidth: 160, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <select value={payFilter} onChange={e => setPayFilter(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
              <option value="">All payment</option>
              {['card','cash','eftpos','split'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : !filtered.length ? (
            <div style={{ textAlign: 'center', padding: '64px 24px', color: C.dim }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
              <p style={{ fontSize: 14 }}>No sales found for this period</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: 'rgba(26,23,40,0.98)', borderBottom: `1px solid ${C.border}` }}>
                  {['Date/Time','Sale #','Customer','Cashier','Payment','Total'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 16px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const isActive = selected?.id === s.id;
                  return (
                    <tr key={s.id} onClick={() => loadDetail(s)}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: isActive ? 'rgba(139,92,246,0.1)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 100ms' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.muted }}>{new Date(s.created_at).toLocaleDateString('en-AU')}<br/><span style={{ fontSize: 10, color: C.dim }}>{new Date(s.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span></td>
                      <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: isActive ? C.violet : '#7C3AED' }}>{s.sale_number ?? s.id.slice(-8).toUpperCase()}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.muted }}>{(s.pos_customers as any)?.name ?? '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.muted }}>{s.served_by ?? '—'}</td>
                      <td style={{ padding: '10px 16px' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, textTransform: 'capitalize', background: `${PAY[s.payment_method ?? 'card'] ?? C.violet}22`, color: PAY[s.payment_method ?? 'card'] ?? C.violet }}>{s.payment_method ?? '—'}</span></td>
                      <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, color: C.text }}>A${s.total_amount.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {selected && (
        <div style={{ width: 400, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, background: C.card }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>{selected.sale_number ?? selected.id.slice(-8).toUpperCase()}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{new Date(selected.created_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} · {new Date(selected.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <button onClick={() => { setSelected(null); setDetail(null); }} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
            {detailLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} /></div>
            ) : (<>
              {/* Summary */}
              <div style={{ background: '#FAFAFA', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                {[
                  ['Status', <span key="s" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: 'rgba(34,197,94,0.15)', color: '#00B140' }}>{detail?.status ?? 'completed'}</span>],
                  ['Cashier', detail?.served_by ?? selected.served_by ?? '—'],
                  ['Customer', (detail?.pos_customers as any)?.name ?? '—'],
                  ['Tender', <span key="t" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><strong>{selected.payment_method?.toUpperCase() ?? '—'}</strong><span style={{ fontSize: 10, color: C.dim }}>read-only</span></span>],
                ].map(([l, v]) => (
                  <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{String(l)}</span>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Financials */}
              <div style={{ background: '#FAFAFA', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 8 }}>Financials</p>
                {[['Subtotal (excl. GST)', `A$${((selected.total_amount ?? 0) / 1.1).toFixed(2)}`], ['GST (10%)', `A$${((selected.total_amount ?? 0) - (selected.total_amount ?? 0) / 1.1).toFixed(2)}`]].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ fontSize: 12, color: C.muted }}>{l}</span><span style={{ fontSize: 12, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>{v}</span></div>
                ))}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 7, marginTop: 3, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>TOTAL</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>A${(selected.total_amount ?? 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Items */}
              {(detail?.pos_sale_items ?? []).length > 0 && (
                <div style={{ background: '#FAFAFA', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 8 }}>Items</p>
                  {(detail?.pos_sale_items ?? []).map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      {returnMode && <input type="checkbox" checked={!!returnItems[item.id]} onChange={e => setReturnItems(r => ({ ...r, [item.id]: e.target.checked }))} style={{ flexShrink: 0, width: 14, height: 14, accentColor: C.violet }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                        <div style={{ fontSize: 10, color: C.dim }}>{item.quantity} × A${item.unit_price?.toFixed(2)}</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>A${item.line_total?.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Edit form */}
              {editMode && (
                <div style={{ background: 'rgba(139,92,246,0.06)', border: `1px solid rgba(139,92,246,0.2)`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.violet, marginBottom: 10 }}>Modify Details</p>
                  {[
                    { label: 'Cashier name', key: 'served_by' as const, type: 'input' },
                    { label: 'Notes (receipt)', key: 'notes' as const, type: 'textarea' },
                    { label: 'External notes', key: 'external_notes' as const, type: 'textarea' },
                    { label: 'Internal comment (not on receipt)', key: 'internal_comment' as const, type: 'textarea' },
                  ].map(({ label, key, type }) => (
                    <div key={key} style={{ marginBottom: 8 }}>
                      <label style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 3 }}>{label}</label>
                      {type === 'input'
                        ? <input value={editFields[key]} onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value }))} style={inp} />
                        : <textarea value={editFields[key]} onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value }))} rows={2} style={{ ...inp, resize: 'none' }} />
                      }
                    </div>
                  ))}
                  <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: C.dim }}>Tender: <strong style={{ color: C.muted }}>{selected.payment_method?.toUpperCase()}</strong> — cannot change. Void and re-ring if needed.</span>
                  </div>
                  {saveMsg && <p style={{ fontSize: 11, color: saveMsg.includes('fail') || saveMsg.includes('Error') ? '#EF4444' : '#00B140', marginBottom: 6 }}>{saveMsg}</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button onClick={() => { setEditMode(false); setSaveMsg(''); }} style={{ flex: 1, padding: '7px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button onClick={saveEdit} disabled={saving} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              )}

              {/* Return confirm */}
              {returnMode && Object.values(returnItems).some(Boolean) && (
                <div style={{ marginBottom: 12 }}>
                  <button onClick={processReturn} disabled={processing} style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: '#EF4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: processing ? 0.5 : 1 }}>
                    {processing ? 'Processing…' : `Return ${Object.values(returnItems).filter(Boolean).length} item(s)`}
                  </button>
                </div>
              )}

              {/* Email receipt */}
              <div style={{ background: '#FAFAFA', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 8 }}>Email Receipt</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={emailAddr} onChange={e => setEmailAddr(e.target.value)} placeholder="customer@email.com" type="email"
                    style={{ ...inp, flex: 1 }} />
                  <button onClick={sendEmailReceipt} disabled={emailSending || !emailAddr}
                    style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: (emailSending || !emailAddr) ? 0.5 : 1 }}>
                    {emailSending ? '…' : 'Send'}
                  </button>
                </div>
                {emailMsg && <p style={{ fontSize: 11, color: emailMsg.includes('✓') ? '#00B140' : '#EF4444', marginTop: 5 }}>{emailMsg}</p>}
              </div>

              {/* Audit trail */}
              <div style={{ background: '#FAFAFA', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                <button onClick={() => { setShowAudit(v => !v); if (!showAudit && auditTrail.length === 0) loadAudit(selected.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', width: '100%', padding: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim }}>Modification History</span>
                  <span style={{ fontSize: 11, color: C.dim }}>{showAudit ? '▲' : '▼'}</span>
                </button>
                {showAudit && (
                  <div style={{ marginTop: 10 }}>
                    {auditLoading ? <p style={{ fontSize: 12, color: C.dim }}>Loading…</p>
                    : auditTrail.length === 0 ? <p style={{ fontSize: 12, color: C.dim }}>No modifications recorded.</p>
                    : auditTrail.map(e => (
                      <div key={e.id} style={{ borderTop: `1px solid ${C.border}`, paddingTop: 7, marginTop: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'capitalize' }}>{e.action.replace(/_/g, ' ')}</span>
                          <span style={{ fontSize: 10, color: C.dim }} title={new Date(e.created_at).toLocaleString('en-AU')}>{relTime(e.created_at)}</span>
                        </div>
                        {e.field_changed && <p style={{ fontSize: 11, color: C.dim }}>{e.field_changed}: <em>{String(e.old_value ?? '—')}</em> → <em>{String(e.new_value ?? '—')}</em></p>}
                        {e.reason && <p style={{ fontSize: 11, color: C.dim }}>Reason: {e.reason}</p>}
                        {e.edited_by && <p style={{ fontSize: 10, color: C.dim, opacity: 0.6 }}>{e.edited_by}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>)}
          </div>

          {/* Action buttons */}
          <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setShowReceipt(true)} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#FAFAFA', color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>🖨️ Reprint</button>
              <button onClick={() => { setEditMode(e => !e); setReturnMode(false); }} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#FAFAFA', color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✏️ Modify</button>
            </div>
            <button onClick={() => { if (selected) setShowReturnModal(true) }} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.07)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              ↩️ Return Items
            </button>
          </div>
        </div>
      )}

      {showReceipt && selected && (
        <Receipt
          sale={{ ...selected, served_by: selected.served_by ?? undefined, cartSnapshot: (detail?.pos_sale_items ?? []).map(i => ({ product: { name: i.product_name }, qty: i.quantity, unitPrice: i.unit_price, label: i.product_name, discount_percent: i.discount_percent })) }}
          settings={posSettings}
          template={receiptTemplate}
          onClose={() => setShowReceipt(false)}
        />
      )}
      {showReturnModal && selected && detail && (
        <ReturnModal
          saleId={selected.id}
          saleItems={(detail.pos_sale_items ?? []).map(i => ({
            id: i.id,
            product_id: (i as SaleItem).product_id ?? null,
            product_name: i.product_name,
            quantity: Number(i.quantity) || 0,
            returned_quantity: Number((i as SaleItem).returned_quantity) || 0,
            unit_price: Number(i.unit_price) || 0,
          }))}
          paymentMethod={selected.payment_method ?? 'card'}
          customerId={selected.customer_id ?? null}
          onClose={() => setShowReturnModal(false)}
          onSuccess={result => { setShowReturnModal(false); setReturnSuccess(result); load(); }}
        />
      )}
      {returnSuccess && (
        <div onClick={() => setReturnSuccess(null)} style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:600, background:'#0d1a10', border:'1px solid rgba(127,184,151,0.4)', borderRadius:12, padding:'14px 20px', cursor:'pointer', boxShadow:'0 8px 32px rgba(0,0,0,0.6)', minWidth:280 }}>
          <p style={{ fontWeight:700, color:'#006AFF', margin:'0 0 4px', fontSize:14 }}>✓ Return {returnSuccess.return_number} processed</p>
          <p style={{ color:'rgba(255,255,255,0.6)', fontSize:12, margin:0 }}>
            A${(Number(returnSuccess.total_refund)||0).toFixed(2)} refunded{returnSuccess.store_credit_code ? ` · Store credit code: ${returnSuccess.store_credit_code}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
