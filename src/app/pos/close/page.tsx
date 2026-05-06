'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444', amber:'#F59E0B', cyan:'#00E5FF' };

const DENOMS = [
  { value: 0.05, label: '5¢' }, { value: 0.10, label: '10¢' },
  { value: 0.20, label: '20¢' }, { value: 0.50, label: '50¢' },
  { value: 1.00, label: '$1' }, { value: 2.00, label: '$2' },
  { value: 5.00, label: '$5' }, { value: 10.00, label: '$10' },
  { value: 20.00, label: '$20' }, { value: 50.00, label: '$50' },
  { value: 100.00, label: '$100' },
];

export default function CloseRegisterPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [paymentTotals, setPaymentTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [float, setFloat] = useState('200.00');
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    fetch('/api/pos/sessions?status=open')
      .then(r => r.json())
      .then(d => {
        setSession(d.session ?? null);
        setPaymentTotals(d.payment_totals ?? {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const inDrawer = DENOMS.reduce((s, d) => s + d.value * (parseFloat(counts[d.value] || '0') || 0), 0);
  const floatAmt = parseFloat(float) || 0;
  const cashReceived = Math.max(0, inDrawer - floatAmt);
  const expectedCash = paymentTotals.cash || paymentTotals.Cash || 0;
  const expectedEftpos = paymentTotals.eftpos || paymentTotals.card || paymentTotals.Card || 0;
  const cashDiff = cashReceived - expectedCash;

  const openedAgo = session?.opened_at
    ? (() => {
        const ms = Date.now() - new Date(session.opened_at).getTime();
        const h = Math.floor(ms / 3600000);
        const mn = Math.floor((ms % 3600000) / 60000);
        return h > 0 ? `${h}h ${mn}m ago` : `${mn}m ago`;
      })()
    : '—';

  async function closeRegister() {
    if (!session) return;
    setClosing(true);
    try {
      await fetch(`/api/pos/sessions?id=${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closed_at: new Date().toISOString(),
          actual_cash_cents: Math.round(cashReceived * 100),
          expected_cash_cents: Math.round(expectedCash * 100),
          variance_cents: Math.round(cashDiff * 100),
          closure_note: note,
        }),
      });
      router.push(`/pos/reports/closures/${session.id}`);
    } catch {
      setClosing(false);
    }
  }

  const iS: React.CSSProperties = {
    background: 'rgba(10,9,16,0.8)',
    border: `1px solid ${C.border}`,
    borderRadius: 7,
    padding: '6px 10px',
    fontSize: 13,
    color: C.text,
    outline: 'none',
    fontFamily: "'JetBrains Mono',monospace",
    textAlign: 'right',
    width: '100%',
    boxSizing: 'border-box',
  };

  if (loading) return (
    <div style={{ background: C.bg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: "'Manrope',sans-serif" }}>
      Loading session…
    </div>
  );

  if (!session) return (
    <div style={{ background: C.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: C.text, fontFamily: "'Manrope',sans-serif", padding: 32 }}>
      <div style={{ fontSize: 48 }}>🔒</div>
      <p style={{ fontSize: 16, fontWeight: 700 }}>No open register session</p>
      <p style={{ fontSize: 13, color: C.muted }}>Open the register first from the POS terminal before closing.</p>
      <Link href="/pos" style={{ color: C.violet, fontSize: 13 }}>← Go to terminal</Link>
    </div>
  );

  const PAYMENT_ROWS = [
    { key: 'cash', label: '💵 Cash', expected: expectedCash, received: cashReceived, diff: cashDiff, showDrawer: true },
    { key: 'eftpos', label: '💳 EFTPOS / Card', expected: expectedEftpos, received: expectedEftpos, diff: 0, showDrawer: false },
  ];

  const EXTRA_ROWS = [
    { key: 'gift_card', label: '🎁 Gift Card', expected: paymentTotals.gift_card || 0, received: paymentTotals.gift_card || 0, diff: 0 },
    { key: 'direct_deposit', label: '🏦 Direct Deposit', expected: paymentTotals.direct_deposit || 0, received: paymentTotals.direct_deposit || 0, diff: 0 },
    { key: 'split', label: '✂️ Split', expected: paymentTotals.split || 0, received: paymentTotals.split || 0, diff: 0 },
  ];

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '18px 28px', borderBottom: `1px solid ${C.border}` }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Close Register</h1>
        <div style={{ display: 'flex', gap: 24, marginTop: 6 }}>
          <p style={{ fontSize: 12, color: C.muted }}>Open time: <span style={{ color: C.text, fontWeight: 600 }}>{openedAgo}</span></p>
          <p style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ All sales uploaded</p>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', minHeight: 'calc(100vh - 73px)' }}>

        {/* LEFT: Payment reconciliation */}
        <div style={{ padding: '24px 28px', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                  {['Payment Method', 'Expected', 'Received', 'Difference'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAYMENT_ROWS.map((row, i) => (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>
                      {row.label}
                      {row.showDrawer && (
                        <button style={{ marginLeft: 10, fontSize: 10, padding: '2px 8px', borderRadius: 5, border: `1px solid rgba(0,229,255,0.2)`, background: 'transparent', color: C.cyan, cursor: 'pointer', fontFamily: 'inherit' }}>Open Drawer</button>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: C.muted, textAlign: 'right', fontFamily: 'monospace' }}>
                      A${row.expected.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace' }}>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: row.key === 'cash' ? 700 : 400 }}>
                        A${row.received.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: Math.abs(row.diff) < 0.01 ? C.muted : row.diff >= 0 ? C.green : C.red }}>
                        {row.diff >= 0 ? '+' : ''}A${row.diff.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
                {showMore && EXTRA_ROWS.map(row => (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: C.muted }}>{row.label}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.dim, textAlign: 'right', fontFamily: 'monospace' }}>A${row.expected.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.dim, textAlign: 'right', fontFamily: 'monospace' }}>A${row.received.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.dim, textAlign: 'right', fontFamily: 'monospace' }}>A$0.00</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} style={{ padding: '8px 14px' }}>
                    <button onClick={() => setShowMore(s => !s)}
                      style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                      {showMore ? '▲ Hide extra methods' : `▼ Show ${EXTRA_ROWS.filter(r => r.expected > 0).length + 4} more payment methods`}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted, marginBottom: 6 }}>
              Register Closure Note
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Optional note for this closure…"
              style={{ width: '100%', background: 'rgba(10,9,16,0.8)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          <button onClick={closeRegister} disabled={closing}
            style={{ padding: '14px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${C.violet},#6D28D9)`, color: '#fff', fontSize: 15, fontWeight: 800, cursor: closing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: closing ? 0.6 : 1 }}>
            {closing ? 'Closing register…' : '🔒 Close Register'}
          </button>
        </div>

        {/* RIGHT: Denomination counter */}
        <div style={{ padding: '24px 20px', background: 'rgba(10,8,20,0.5)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Count Cash Denominations</p>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.dim, padding: '8px 12px' }}>Denomination</th>
                  <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.dim, padding: '8px 12px' }}>Count</th>
                  <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.dim, padding: '8px 12px' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {DENOMS.map((d, i) => {
                  const cnt = parseFloat(counts[d.value] || '0') || 0;
                  const val = cnt * d.value;
                  return (
                    <tr key={d.value} style={{ borderBottom: i < DENOMS.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <td style={{ padding: '6px 12px', fontSize: 13, color: C.muted, fontFamily: 'monospace', fontWeight: 600 }}>{d.label}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number" min="0" step="1"
                          value={counts[d.value] || ''}
                          placeholder="0"
                          onChange={e => setCounts(prev => ({ ...prev, [d.value]: e.target.value }))}
                          style={{ ...iS, width: 80 }}
                        />
                      </td>
                      <td style={{ padding: '6px 12px', fontSize: 13, textAlign: 'right', fontFamily: 'monospace', color: val > 0 ? C.text : C.dim }}>
                        A${val.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.muted }}>In Drawer</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>A${inDrawer.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.muted }}>Float (stays in register)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: C.dim }}>A$</span>
                <input type="number" min="0" step="0.01" value={float} onChange={e => setFloat(e.target.value)}
                  style={{ ...iS, width: 90 }} />
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Cash Received (Total)</span>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: cashDiff >= 0 ? C.green : C.red }}>
                A${cashReceived.toFixed(2)}
              </span>
            </div>
            {Math.abs(cashDiff) > 0.01 && (
              <div style={{ fontSize: 12, color: cashDiff >= 0 ? C.green : C.red, textAlign: 'right' }}>
                {cashDiff >= 0 ? `+A$${cashDiff.toFixed(2)} surplus` : `-A$${Math.abs(cashDiff).toFixed(2)} shortage`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
