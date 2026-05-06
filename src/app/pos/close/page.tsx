'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444', amber:'#F59E0B', cyan:'#00E5FF' };

const DENOMS = [0.05, 0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50, 100];

export default function CloseRegisterPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [float, setFloat] = useState('200.00');
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    fetch('/api/pos/sessions?open=true')
      .then(r => r.json())
      .then(d => { setSession(d.session ?? d.openSession ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const inDrawer = DENOMS.reduce((s, d) => s + d * (parseFloat(counts[d] || '0') || 0), 0);
  const floatAmt = parseFloat(float) || 0;
  const cashReceived = Math.max(0, inDrawer - floatAmt);
  const expectedCash = session?.total_cash_sales || 0;
  const expectedCard = session?.total_card_sales || 0;
  const diff = cashReceived - expectedCash;

  async function closeRegister() {
    if (!session) return;
    setClosing(true);
    const res = await fetch(`/api/pos/sessions?id=${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        closed_at: new Date().toISOString(),
        closing_float_cents: Math.round(floatAmt * 100),
        actual_cash_cents: Math.round(cashReceived * 100),
        expected_cash_cents: Math.round(expectedCash * 100),
        variance_cents: Math.round(diff * 100),
        notes: note,
      }),
    });
    const d = await res.json();
    setClosing(false);
    if (d.ok || d.session) {
      router.push(`/pos/reports/closures/${session.id}`);
    }
  }

  const iS: React.CSSProperties = { background:'rgba(10,9,16,0.8)', border:`1px solid ${C.border}`, borderRadius:8, padding:'7px 10px', fontSize:14, color:C.text, outline:'none', fontFamily:"'JetBrains Mono',monospace", textAlign:'right' };

  if (loading) return <div style={{ background:C.bg, minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:C.muted }}>Loading…</div>;

  if (!session) return (
    <div style={{ background:C.bg, minHeight:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, color:C.text, fontFamily:"'Manrope',sans-serif" }}>
      <div style={{ fontSize:48 }}>🔒</div>
      <p style={{ fontSize:16, fontWeight:700 }}>No open register session</p>
      <p style={{ fontSize:13, color:C.muted }}>Open the register first before closing.</p>
    </div>
  );

  return (
    <div style={{ minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Manrope',sans-serif" }}>
      <div style={{ padding:'20px 28px', borderBottom:`1px solid ${C.border}` }}>
        <h1 style={{ fontSize:20, fontWeight:800 }}>Close Register</h1>
        <p style={{ fontSize:12, color:C.muted, marginTop:2 }}>
          Opened {session.opened_at ? new Date(session.opened_at).toLocaleString('en-AU') : '—'}
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 400px', gap:0, minHeight:'calc(100% - 65px)' }}>

        {/* Left — payment reconciliation */}
        <div style={{ padding:'24px 28px', borderRight:`1px solid ${C.border}` }}>
          <p style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:14 }}>Payment Reconciliation</p>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden', marginBottom:20 }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.02)', borderBottom:`1px solid ${C.border}` }}>
                  {['Payment Method','Expected','Received','Difference'].map(h => (
                    <th key={h} style={{ textAlign:h==='Payment Method'?'left':'right', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, padding:'10px 14px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:'12px 14px', fontSize:13, color:C.text, fontWeight:600 }}>💵 Cash</td>
                  <td style={{ padding:'12px 14px', fontSize:13, color:C.muted, textAlign:'right', fontFamily:'monospace' }}>A${expectedCash.toFixed(2)}</td>
                  <td style={{ padding:'12px 14px', textAlign:'right' }}>
                    <span style={{ fontSize:13, color:C.text, fontFamily:'monospace' }}>A${cashReceived.toFixed(2)}</span>
                  </td>
                  <td style={{ padding:'12px 14px', fontSize:13, textAlign:'right', fontFamily:'monospace', color: diff >= 0 ? C.green : C.red, fontWeight:700 }}>
                    {diff >= 0 ? '+' : ''}A${diff.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding:'12px 14px', fontSize:13, color:C.text, fontWeight:600 }}>💳 EFTPOS / Card</td>
                  <td style={{ padding:'12px 14px', fontSize:13, color:C.muted, textAlign:'right', fontFamily:'monospace' }}>A${expectedCard.toFixed(2)}</td>
                  <td style={{ padding:'12px 14px', fontSize:13, color:C.muted, textAlign:'right', fontFamily:'monospace' }}>A${expectedCard.toFixed(2)}</td>
                  <td style={{ padding:'12px 14px', fontSize:13, color:C.dim, textAlign:'right', fontFamily:'monospace' }}>A$0.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Closure Note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Optional note for this closure…"
              style={{ width:'100%', background:'rgba(10,9,16,0.8)', border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.text, outline:'none', fontFamily:'inherit', resize:'vertical', boxSizing:'border-box' }} />
          </div>

          <button onClick={closeRegister} disabled={closing}
            style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${C.violet},#6D28D9)`, color:'#fff', fontSize:15, fontWeight:800, cursor:closing?'not-allowed':'pointer', fontFamily:'inherit', opacity:closing?0.6:1 }}>
            {closing ? 'Closing…' : '🔒 Close Register'}
          </button>
        </div>

        {/* Right — denomination counter */}
        <div style={{ padding:'24px 20px' }}>
          <p style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:14 }}>Count Cash Denominations</p>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden', marginBottom:16 }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.02)', borderBottom:`1px solid ${C.border}` }}>
                  {['Denomination','Count','Value'].map(h => (
                    <th key={h} style={{ textAlign:h==='Denomination'?'left':'right', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, padding:'8px 12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DENOMS.map((d, i) => {
                  const cnt = parseFloat(counts[d] || '0') || 0;
                  const val = cnt * d;
                  return (
                    <tr key={d} style={{ borderBottom: i < DENOMS.length-1 ? `1px solid ${C.border}` : 'none' }}>
                      <td style={{ padding:'7px 12px', fontSize:13, color:C.muted, fontFamily:'monospace' }}>
                        {d >= 1 ? `$${d.toFixed(0)}` : `${(d*100).toFixed(0)}¢`}
                      </td>
                      <td style={{ padding:'7px 8px', textAlign:'right' }}>
                        <input type="number" min="0" value={counts[d] || ''} placeholder="0"
                          onChange={e => setCounts(prev => ({ ...prev, [d]: e.target.value }))}
                          style={{ ...iS, width:70 }} />
                      </td>
                      <td style={{ padding:'7px 12px', fontSize:13, color: val > 0 ? C.text : C.dim, textAlign:'right', fontFamily:'monospace' }}>
                        A${val.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, color:C.muted }}>In Drawer</span>
              <span style={{ fontSize:15, fontWeight:700, color:C.text, fontFamily:'monospace' }}>A${inDrawer.toFixed(2)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:13, color:C.muted }}>Float (stays in register)</span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13, color:C.dim }}>A$</span>
                <input type="number" value={float} onChange={e => setFloat(e.target.value)} min="0" step="0.01"
                  style={{ ...iS, width:90 }} />
              </div>
            </div>
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:8, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:14, fontWeight:700, color:C.text }}>Cash Received</span>
              <span style={{ fontSize:18, fontWeight:800, color:C.green, fontFamily:'monospace' }}>A${cashReceived.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
