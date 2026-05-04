'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface EODDebrief {
  debrief: string | null;
  stats: { today_revenue: number; today_count: number; avg_basket: number; top_product: string | null; vs_avg_pct: number | null; } | null;
}
interface Session {
  id: string; opened_at: string; status: string; opened_by: string | null;
  opening_float: number; total_cash_sales: number; total_card_sales: number;
  transaction_count?: number; closing_float?: number | null;
}

const DENOMS = [
  { label: '$100', value: 100 }, { label: '$50', value: 50 }, { label: '$20', value: 20 },
  { label: '$10', value: 10  }, { label: '$5',  value: 5   }, { label: '$2',  value: 2   },
  { label: '$1',  value: 1   }, { label: '50¢', value: 0.50}, { label: '20¢', value: 0.20},
  { label: '10¢', value: 0.10}, { label: '5¢',  value: 0.05},
];

function formatDuration(openedAt: string) {
  const ms = Date.now() - new Date(openedAt).getTime();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Spinner() {
  return <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'processing 0.7s linear infinite' }} />;
}

function DarkCard({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: '#1A1728', border: `1px solid ${accent ?? '#2A2540'}`, borderRadius: 20, overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #1C1928' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#EDE8FF' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function ClosePage() {
  const router = useRouter();
  const [session, setSession]       = useState<Session | null>(null);
  const [loading, setLoading]       = useState(true);
  const [counts, setCounts]         = useState<Record<number, string>>({});
  const [closing, setClosing]       = useState(false);
  const [done, setDone]             = useState(false);
  const [debrief, setDebrief]       = useState<EODDebrief | null>(null);
  const [debriefLoading, setDebriefLoading] = useState(false);

  useEffect(() => {
    fetch('/api/pos/sessions').then(r => r.json()).then(d => { setSession(d.openSession ?? null); setLoading(false); });
  }, []);

  const closingFloat  = DENOMS.reduce((s, d) => s + (parseFloat(counts[d.value] || '0') || 0) * d.value, 0);
  const expectedCash  = (session?.opening_float ?? 0) + (session?.total_cash_sales ?? 0);
  const variance      = closingFloat - expectedCash;

  async function closeSession() {
    if (!session || !confirm('Close the register? This action cannot be undone.')) return;
    setClosing(true);
    await fetch('/api/pos/sessions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session.id, closing_float: closingFloat }) });
    setDone(true); setClosing(false);
    fetchDebrief(session.id);
  }

  async function fetchDebrief(sessionId: string) {
    setDebriefLoading(true);
    try {
      const res = await fetch('/api/aria/pos-end-of-day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) });
      if (res.ok) {
        const data = await res.json();
        setDebrief(data);
        fetch('/api/aria/pos-end-of-day/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, debrief: data }) }).catch(() => null);
        if (data?.stats?.today_revenue > 0) {
          fetch('/api/aria/outcomes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recommendation_type: 'eod_summary', recommendation_detail: `Session closed. Revenue: A$${data.stats.today_revenue.toFixed(2)}, ${data.stats.today_count} transactions`, acted_on: true, outcome_value_cents: Math.round(data.stats.today_revenue * 100) }) }).catch(() => null);
        }
      }
    } catch { /* non-blocking */ }
    setDebriefLoading(false);
  }

  function shareReport() {
    if (!debrief?.stats) return;
    const s = debrief.stats;
    const text = [`Aria POS — End of Day Report`, `Revenue: A$${s.today_revenue.toFixed(2)}`, `Transactions: ${s.today_count}`, `Avg basket: A$${s.avg_basket.toFixed(2)}`, s.top_product ? `Top product: ${s.top_product}` : '', s.vs_avg_pct != null ? `vs 7-day avg: ${s.vs_avg_pct > 0 ? '+' : ''}${s.vs_avg_pct.toFixed(0)}%` : '', debrief.debrief ? `\n${debrief.debrief}` : ''].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text).catch(() => null);
    alert('Report copied to clipboard!');
  }

  if (loading) return (
    <div className="h-full flex items-center justify-center" style={{ background: '#0A0910' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#8B5CF6', animation: 'processing 0.7s linear infinite' }} />
    </div>
  );

  /* ── SUCCESS ─────────────────────────────────────────────────── */
  if (done) return (
    <div className="min-h-full overflow-y-auto" style={{ background: '#0A0910' }}>
      <div style={{ background: 'rgba(8,6,16,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1C1928', padding: '16px 24px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#EDE8FF' }}>Register Closed</h1>
        <p style={{ fontSize: 13, color: '#8B85A8', marginTop: 2 }}>
          Closing float: <span style={{ fontFamily: "'JetBrains Mono',monospace", color: '#EDE8FF' }}>A${closingFloat.toFixed(2)}</span>
          {' · '}Variance: <span style={{ fontFamily: "'JetBrains Mono',monospace", color: Math.abs(variance) < 0.05 ? '#22C55E' : '#EF4444' }}>{variance >= 0 ? '+' : ''}A${variance.toFixed(2)}</span>
        </p>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Success card */}
        <div style={{ background: '#1A1728', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth={2.5} width={24} height={24}><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <p style={{ fontWeight: 600, color: '#EDE8FF' }}>Session ended successfully</p>
            <p style={{ fontSize: 13, color: '#4A4565', marginTop: 2 }}>Z-Report generated · Data saved</p>
          </div>
        </div>

        {/* EOD debrief */}
        {(debriefLoading || debrief) && (
          <DarkCard title="Aria's end of day" accent="rgba(139,92,246,0.25)">
            {debriefLoading && !debrief && (
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#8B5CF6', animation: 'processing 0.7s linear infinite' }} />
                <span style={{ fontSize: 13, color: '#8B85A8' }}>Aria is analysing your day…</span>
              </div>
            )}
            {debrief?.stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid #1C1928' }}>
                {[
                  { label: 'Revenue', value: `A$${debrief.stats.today_revenue.toFixed(2)}` },
                  { label: 'Transactions', value: String(debrief.stats.today_count) },
                  { label: 'Avg basket', value: `A$${debrief.stats.avg_basket.toFixed(2)}` },
                  { label: 'vs 7-day avg', value: debrief.stats.vs_avg_pct != null ? `${debrief.stats.vs_avg_pct > 0 ? '+' : ''}${debrief.stats.vs_avg_pct.toFixed(0)}%` : '—', color: (debrief.stats.vs_avg_pct ?? 0) >= 0 ? '#22C55E' : '#EF4444' },
                ].map((s, i) => (
                  <div key={s.label} style={{ padding: '16px 20px', borderRight: i < 3 ? '1px solid #1C1928' : 'none' }}>
                    <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4A4565', marginBottom: 6 }}>{s.label}</p>
                    <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: (s as { color?: string }).color ?? '#EDE8FF' }}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}
            {debrief?.stats?.top_product && (
              <div style={{ padding: '10px 24px', borderBottom: '1px solid #1C1928' }}>
                <p style={{ fontSize: 13, color: '#8B85A8' }}>Top seller: <span style={{ color: '#EDE8FF', fontWeight: 500 }}>{debrief.stats.top_product}</span></p>
              </div>
            )}
            {debrief?.debrief && (
              <div style={{ padding: '16px 24px' }}>
                <p style={{ fontSize: 13, color: '#8B85A8', lineHeight: 1.7 }}>{debrief.debrief}</p>
              </div>
            )}
            {!debriefLoading && !debrief?.debrief && (
              <div style={{ padding: '16px 24px' }}>
                <p style={{ fontSize: 13, color: '#4A4565' }}>AI debrief not available — add your Anthropic API key to enable.</p>
              </div>
            )}
          </DarkCard>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {debrief?.stats && (
            <button onClick={shareReport} style={{ padding: '10px 20px', borderRadius: 12, border: '1px solid #2A2540', color: '#8B85A8', background: 'rgba(255,255,255,0.02)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Copy report</button>
          )}
          <button onClick={() => window.print()} style={{ padding: '10px 20px', borderRadius: 12, border: '1px solid #2A2540', color: '#8B85A8', background: 'rgba(255,255,255,0.02)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>🖨️ Print Z-Report</button>
          <button onClick={() => router.push('/pos')} style={{ padding: '10px 20px', borderRadius: 12, background: '#8B5CF6', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Back to Register</button>
        </div>
      </div>
    </div>
  );

  if (!session) return (
    <div className="h-full flex items-center justify-center" style={{ background: '#0A0910' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#8B85A8' }}>No open session — open the register first.</p>
        <button onClick={() => router.push('/pos')} style={{ marginTop: 16, padding: '8px 18px', background: '#8B5CF6', border: 'none', color: '#fff', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>Go to Register</button>
      </div>
    </div>
  );

  const totalRevenue = (session.total_cash_sales ?? 0) + (session.total_card_sales ?? 0);

  /* ── CLOSE FORM ──────────────────────────────────────────────── */
  return (
    <div className="min-h-full overflow-y-auto" style={{ background: '#0A0910' }}>
      <div style={{ background: 'rgba(8,6,16,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1C1928', padding: '16px 24px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#EDE8FF' }}>Close Register</h1>
        <p style={{ fontSize: 13, color: '#8B85A8', marginTop: 2 }}>
          Opened {new Date(session.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
          {session.opened_by && <> · {session.opened_by}</>}
          {' · '}{formatDuration(session.opened_at)} session
        </p>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Cash reconciliation */}
        <DarkCard title="Cash reconciliation">
          <div style={{ padding: '16px 24px' }}>
            {[
              { label: 'Opening float', value: session.opening_float ?? 0, color: '#8B85A8' },
              { label: 'Cash sales',    value: session.total_cash_sales ?? 0, color: '#22C55E' },
              { label: 'Expected in drawer', value: expectedCash, color: '#EDE8FF', bold: true },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1C1928' }}>
                <span style={{ fontSize: 13, color: '#8B85A8', fontWeight: row.bold ? 600 : 400 }}>{row.label}</span>
                <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono',monospace", color: row.color, fontWeight: row.bold ? 700 : 400 }}>A${row.value.toFixed(2)}</span>
              </div>
            ))}

            <p style={{ fontSize: 13, fontWeight: 600, color: '#EDE8FF', margin: '16px 0 10px' }}>Count the cash in the drawer</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {DENOMS.map(d => {
                const qty = parseFloat(counts[d.value] || '0') || 0;
                return (
                  <div key={d.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#EDE8FF', width: 40 }}>{d.label}</span>
                    <input
                      value={counts[d.value] ?? ''}
                      onChange={e => setCounts(c => ({ ...c, [d.value]: e.target.value }))}
                      type="number" min="0" placeholder="0"
                      style={{ width: 56, background: 'rgba(255,255,255,0.04)', border: '1px solid #2A2540', borderRadius: 8, padding: '6px 8px', fontSize: 13, color: '#EDE8FF', textAlign: 'center', outline: 'none', fontFamily: "'JetBrains Mono',monospace" }}
                    />
                    <span style={{ fontSize: 12, color: '#4A4565', marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace" }}>A${(qty * d.value).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            {/* Variance */}
            <div style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: Math.abs(variance) < 0.05 ? 'rgba(34,197,94,0.08)' : variance > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${Math.abs(variance) < 0.05 ? 'rgba(34,197,94,0.2)' : variance > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
              <div>
                <p style={{ fontSize: 10, color: '#8B85A8', marginBottom: 4 }}>Counted</p>
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: '#EDE8FF' }}>A${closingFloat.toFixed(2)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 10, color: '#8B85A8', marginBottom: 4 }}>Variance</p>
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: Math.abs(variance) < 0.05 ? '#22C55E' : variance > 0 ? '#F59E0B' : '#EF4444' }}>
                  {Math.abs(variance) < 0.05 ? '✓ Balanced' : `${variance >= 0 ? '+' : ''}A$${Math.abs(variance).toFixed(2)}`}
                </p>
              </div>
            </div>
          </div>
        </DarkCard>

        {/* Session summary */}
        <DarkCard title="Session summary">
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Total revenue',   value: `A$${totalRevenue.toFixed(2)}`,                          big: true  },
              { label: 'Transactions',    value: String(session.transaction_count ?? 0),                    big: true  },
              { label: 'Cash sales',      value: `A$${(session.total_cash_sales ?? 0).toFixed(2)}`,         big: false },
              { label: 'Card sales',      value: `A$${(session.total_card_sales ?? 0).toFixed(2)}`,         big: false },
              { label: 'Avg basket',      value: (session.transaction_count ?? 0) > 0 ? `A$${(totalRevenue / (session.transaction_count ?? 1)).toFixed(2)}` : '—', big: false },
              { label: 'Opening float',   value: `A$${(session.opening_float ?? 0).toFixed(2)}`,            big: false },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '12px 16px', border: '1px solid #1C1928' }}>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4A4565', marginBottom: 6 }}>{s.label}</p>
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: s.big ? 24 : 18, fontWeight: 700, color: '#EDE8FF' }}>{s.value}</p>
              </div>
            ))}
          </div>
        </DarkCard>

        {/* Close button */}
        <button onClick={closeSession} disabled={closing}
          style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: '#EF4444', color: '#fff', fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 15, cursor: closing ? 'not-allowed' : 'pointer', opacity: closing ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {closing ? <><Spinner /><span>Closing…</span></> : 'Close Register & End Session'}
        </button>
      </div>
    </div>
  );
}
