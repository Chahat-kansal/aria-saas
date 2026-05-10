'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import AriaInsightCard from '@/components/reports/AriaInsightCard';

interface Customer {
  id: string; name: string; email: string | null; phone: string | null;
  loyalty_points: number; total_spent: number; created_at: string;
  address: string | null; notes: string | null;
  rfm_score?: string | null; customer_segment?: string | null;
  churn_risk?: number | null; predicted_next_visit?: string | null;
  group_name?: string | null;
}
interface Sale { id: string; created_at: string; total_amount: number; payment_method: string; sale_number?: string; }

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const TABS = ['Purchase History','Loyalty','Notes'];

const SEGMENT_COLORS: Record<string, string> = {
  Champions: '#34D399', Loyal: '#60A5FA', Promising: '#A78BFA',
  'At Risk': '#FBBF24', Lost: '#F87171', New: '#94A3B8',
};

function initials(name: string) { return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function relTime(d: string) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Purchase History');
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [insight, setInsight] = useState<string[] | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<'sent' | 'error' | null>(null);
  const [ariaSmsLoading, setAriaSmsLoading] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    // Coordinate both fetches; generate insight after both complete
    let custRef: Customer | null = null;
    let salesRef: Sale[] = [];
    let done = 0;

    function tryInsight() {
      done++;
      if (done < 2 || !custRef) return;
      const lastDate = salesRef[0]?.created_at ?? null;
      const daysSince = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000) : null;
      const ltvComp = salesRef.reduce((s, sale) => s + (sale.total_amount ?? 0), 0);
      const avgOrd = salesRef.length > 0 ? ltvComp / salesRef.length : 0;
      const predictedDays = custRef.predicted_next_visit
        ? Math.ceil((new Date(custRef.predicted_next_visit).getTime() - Date.now()) / 86400000)
        : null;
      fetch('/api/pos/customers/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: custRef.name,
          total_orders: salesRef.length,
          ltv: ltvComp,
          avg_order: avgOrd,
          days_since_last_visit: daysSince,
          segment: custRef.customer_segment ?? 'New',
          churn_risk: custRef.churn_risk ?? 0,
          predicted_next_visit_days: predictedDays,
        }),
      }).then(r => r.json()).then(d => { setInsight(d.bullets ?? null); setInsightLoading(false); })
        .catch(() => setInsightLoading(false));
    }

    fetch(`/api/pos/customers?id=${id}`).then(r => r.json()).then(d => {
      custRef = d.customer ?? null;
      setCustomer(custRef);
      setNotes(custRef?.notes ?? '');
      setLoading(false);
      tryInsight();
    }).catch(() => { setLoading(false); tryInsight(); });

    fetch(`/api/pos/sales?customer_id=${id}&limit=200`).then(r => r.json()).then(d => {
      salesRef = d.sales ?? [];
      setSales(salesRef);
      tryInsight();
    }).catch(() => tryInsight());
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function getAriaSms() {
    if (!customer) return;
    setAriaSmsLoading(true);
    try {
      const res = await fetch('/api/pos/customers/sms-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: customer.name, segment: customer.customer_segment ?? 'New', days_since: daysSinceLast, ltv }),
      });
      const d = await res.json();
      if (d.message) setSmsText(d.message.slice(0, 160));
    } catch {}
    setAriaSmsLoading(false);
  }

  async function sendSms() {
    if (!customer?.phone || !smsText.trim()) return;
    setSmsSending(true);
    try {
      const res = await fetch('/api/pos/customers/sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customer.id, message: smsText.trim() }),
      });
      setSmsResult(res.ok ? 'sent' : 'error');
      if (res.ok) { setTimeout(() => { setShowSmsModal(false); setSmsResult(null); setSmsText(''); }, 1500); }
    } catch { setSmsResult('error'); }
    setSmsSending(false);
  }

  async function saveNotes() {
    if (!customer) return;
    setNotesSaving(true);
    await fetch(`/api/pos/customers?id=${customer.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) }).catch(() => {});
    setNotesSaving(false);
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: C.bg }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  if (!customer) return (
    <div style={{ padding: 32, background: C.bg, minHeight: '100%', color: C.text }}>
      <Link href="/pos/customers" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← Customers</Link>
      <p style={{ marginTop: 24, color: C.muted }}>Customer not found.</p>
    </div>
  );

  const seg = customer.customer_segment ?? 'New';
  const segColor = SEGMENT_COLORS[seg] ?? '#94A3B8';
  const churnRisk = customer.churn_risk ?? 0;
  const churnCssVar = churnRisk > 60 ? 'var(--destructive)' : churnRisk > 30 ? 'var(--warning)' : 'var(--success)';
  const churnLabel = churnRisk > 60 ? 'High' : churnRisk > 30 ? 'Medium' : 'Low';
  const totalOrders = sales.length;
  // Compute LTV directly from fetched sales using total_amount (dollars, no /100)
  const ltv = sales.reduce((sum, s) => sum + (s.total_amount ?? 0), 0);
  const avgOrder = totalOrders > 0 ? ltv / totalOrders : 0;
  const lastSale = sales[0];
  const daysSinceLast = lastSale ? Math.floor((Date.now() - new Date(lastSale.created_at).getTime()) / 86400000) : null;
  const sparkData = [...sales].reverse().map((s, i) => ({ i, v: s.total_amount }));

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/pos/customers" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← Customers</Link>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--violet-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: C.violet }}>{initials(customer.name)}</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{customer.name}</h1>
              {customer.group_name && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'var(--violet-dim)', color: C.violet, fontWeight: 700 }}>{customer.group_name}</span>}
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${segColor}22`, color: segColor, fontWeight: 700 }}>{seg}</span>
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>Member since {new Date(customer.created_at).toLocaleDateString('en-AU')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/pos/customers/${id}/edit`} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: C.muted, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>✏️ Edit</Link>
          {customer.phone && (
            <button onClick={() => { setSmsText(''); setSmsResult(null); setShowSmsModal(true); }} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              💬 Send SMS
            </button>
          )}
          <Link href={`/pos/terminal?customer_id=${id}`} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.violet}`, background: 'rgba(139,92,246,0.12)', color: C.violet, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🛒 New Sale</Link>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }}>
        <AriaInsightCard bullets={insight ?? undefined} loading={insightLoading} />

        {/* 5 metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
          {[
            { label: 'Lifetime Value', value: `A$${ltv.toFixed(0)}`, color: C.violet },
            { label: 'Total Orders', value: String(totalOrders), color: C.text },
            { label: 'Avg Order', value: `A$${avgOrder.toFixed(2)}`, color: C.text },
            { label: 'Last Visit', value: lastSale ? relTime(lastSale.created_at) : 'Never', color: C.text },
            {
              label: 'Predicted Next',
              value: customer.predicted_next_visit ? relTime(customer.predicted_next_visit) : 'Not enough visits',
              color: customer.predicted_next_visit ? C.text : C.dim,
            },
          ].map(m => (
            <div key={m.label} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '13px 16px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 5 }}>{m.label}</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono',monospace" }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Churn risk */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Churn Risk</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: churnCssVar }}>{churnLabel} ({churnRisk}%)</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
              <div style={{ height: 8, borderRadius: 4, width: `${churnRisk}%`, background: churnCssVar, transition: 'width 600ms' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
              {churnRisk <= 30 && daysSinceLast !== null && `Risk: Low — likely to return soon · ${daysSinceLast}d since last visit`}
              {churnRisk > 30 && churnRisk <= 60 && daysSinceLast !== null && `Risk: Medium — hasn't visited in ${daysSinceLast} days`}
              {churnRisk > 60 && daysSinceLast !== null && `Risk: High — ${daysSinceLast} days since last visit, intervention needed`}
              {daysSinceLast === null && 'No purchase history'}
            </div>
          </div>
          {sparkData.length >= 2 && (
            <div style={{ width: 120, height: 40, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkData}>
                  <Line type="monotone" dataKey="v" stroke={C.violet} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: 'none', fontSize: 11 }} formatter={(v: unknown) => [`A$${Number(v).toFixed(2)}`, 'Sale']} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--divider)' }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '9px 18px', border: 'none', borderBottom: `2px solid ${activeTab === tab ? C.violet : 'transparent'}`, background: 'transparent', color: activeTab === tab ? C.violet : C.muted, fontSize: 13, fontWeight: activeTab === tab ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Purchase History */}
        {activeTab === 'Purchase History' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden' }}>
            {sales.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.dim, fontSize: 13 }}>No purchases on record.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#29b6f6' }}>
                    {['Date','Sale #','Payment','Total'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#fff', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s, i) => (
                    <tr key={s.id} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13 }}>{new Date(s.created_at).toLocaleDateString('en-AU')}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: C.violet }}>{s.sale_number ?? s.id.slice(-8)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{s.payment_method ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>A${(s.total_amount ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Loyalty */}
        {activeTab === 'Loyalty' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.dim, marginBottom: 4 }}>Points Balance</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#00E5FF', fontFamily: "'JetBrains Mono',monospace" }}>{customer.loyalty_points ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.dim, marginBottom: 4 }}>RFM Segment</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: segColor }}>{seg}</div>
                {customer.rfm_score && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Score: {customer.rfm_score}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {activeTab === 'Notes' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20 }}>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={6}
              placeholder="Add notes about this customer…"
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: C.text, borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }} />
            <button onClick={saveNotes} disabled={notesSaving}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: notesSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: notesSaving ? 0.6 : 1 }}>
              {notesSaving ? 'Saving…' : 'Save Notes'}
            </button>
          </div>
        )}
      </div>

      {showSmsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, maxWidth: 420, width: '92%', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Send SMS to {customer.name}</h3>
              <button onClick={() => setShowSmsModal(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>To: {customer.phone}</div>
            <textarea
              value={smsText}
              onChange={e => setSmsText(e.target.value.slice(0, 160))}
              rows={4}
              placeholder="Type your message…"
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: C.text, borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', marginBottom: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 11, color: C.dim }}>
              <button onClick={getAriaSms} disabled={ariaSmsLoading} style={{ background: 'none', border: 'none', color: C.violet, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>
                {ariaSmsLoading ? 'Writing…' : '✨ Let Aria write it'}
              </button>
              <span style={{ color: smsText.length > 140 ? '#FBBF24' : C.dim }}>{smsText.length}/160</span>
            </div>
            {smsResult === 'sent' && <div style={{ marginBottom: 12, color: '#34D399', fontSize: 13, fontWeight: 600 }}>✓ SMS sent</div>}
            {smsResult === 'error' && <div style={{ marginBottom: 12, color: '#F87171', fontSize: 13 }}>Send failed — check TWILIO_* env vars in Settings</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowSmsModal(false)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'transparent', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={sendSms} disabled={smsSending || !smsText.trim()} style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: smsText.trim() ? C.violet : 'var(--bg-elevated)', color: smsText.trim() ? '#fff' : C.dim, fontSize: 13, fontWeight: 700, cursor: (!smsText.trim() || smsSending) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {smsSending ? 'Sending…' : 'Send SMS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
