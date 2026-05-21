'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { POSUserLogin } from '@/components/pos/POSUserLogin';

const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar      = dynamic(() => import('recharts').then(m => m.Bar),      { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const Tooltip  = dynamic(() => import('recharts').then(m => m.Tooltip),  { ssr: false });

interface Session {
  id: string; opened_at: string; opened_by: string | null;
  opening_float: number; total_cash_sales: number; total_card_sales: number;
  transaction_count: number; status: string;
}
interface DayRevenue { date: string; revenue: number; label: string; }

function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 2L28 9v14L16 30 4 23V9z" fill="rgba(0,106,255,0.10)" stroke="#006AFF" strokeWidth="1.5"/>
      <path d="M16 8l7 4v8l-7 4-7-4V12z" fill="rgba(139,92,246,0.25)" stroke="#006AFF" strokeWidth="1"/>
      <circle cx="16" cy="16" r="2.5" fill="#006AFF"/>
    </svg>
  );
}

function Orb({ style }: { style: React.CSSProperties }) {
  return <div style={{ position: 'absolute', borderRadius: '50%', pointerEvents: 'none', ...style }} />;
}

function Spinner() {
  return (
    <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'processing 0.7s linear infinite' }} />
  );
}

export default function POSHomePage() {
  const router = useRouter();
  const [session, setSession]       = useState<Session | null>(null);
  const [loading, setLoading]       = useState(true);
  const [posUser, setPosUser]       = useState<Record<string, unknown> | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('AriaPOS');
  const [openingFloat, setOpeningFloat] = useState('200');
  const [opening, setOpening]       = useState(false);
  const [openError, setOpenError]   = useState<string | null>(null);
  const [chartData, setChartData]   = useState<DayRevenue[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [topProduct, setTopProduct] = useState<string | null>(null);
  const [insightText, setInsightText] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('aria_pos_user');
      if (stored) setPosUser(JSON.parse(stored));
    } catch { /* ignore */ }
    setUserChecked(true);
  }, []);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      if (d.business_id) setBusinessId(d.business_id);
      if (d.business_name) setBusinessName(d.business_name);
    }).catch(() => null);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const r = await fetch('/api/pos/sessions');
      const d = await r.json();
      setSession(d.openSession ?? null);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSession();
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      const prods = d.products ?? [];
      setLowStockCount(prods.filter((p: { track_stock: boolean; stock_quantity: number; low_stock_threshold: number; is_active: boolean }) =>
        p.track_stock && p.stock_quantity <= (p.low_stock_threshold ?? 5) && p.is_active).length);
    }).catch(() => null);

    fetch('/api/pos/reports/closures').then(r => r.json()).then(d => {
      const sessions: { opened_at: string; total_cash_sales: number; total_card_sales: number; transaction_count: number; top_product?: string }[] = d.closures ?? [];
      const dayMap = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const dt = new Date(Date.now() - i * 86400000);
        dayMap.set(dt.toISOString().split('T')[0], 0);
      }
      for (const s of sessions) {
        const key = new Date(s.opened_at).toISOString().split('T')[0];
        if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + (s.total_cash_sales ?? 0) + (s.total_card_sales ?? 0));
      }
      setChartData(Array.from(dayMap.entries()).map(([date, revenue]) => ({
        date, revenue: Math.round(revenue * 100) / 100,
        label: new Date(date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short' }),
      })));
      const sorted = [...sessions].sort((a, b) => b.transaction_count - a.transaction_count);
      if (sorted[0]?.top_product) setTopProduct(sorted[0].top_product);
    }).catch(() => null);

    fetch('/api/aria/pos-insight?page=pos-home', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(r => r.json()).then(d => { if (d.insight) setInsightText(d.insight); }).catch(() => null);
  }, [loadSession]);

  async function openRegister() {
    setOpening(true); setOpenError(null);
    try {
      const res = await fetch('/api/pos/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0 }),
      });
      const d = await res.json();
      if (!res.ok) { setOpenError(d.error ?? 'Failed to open register'); return; }
      await loadSession();
    } catch { setOpenError('Connection error — check your network'); }
    setOpening(false);
  }

  const todayRevenue = session ? (session.total_cash_sales ?? 0) + (session.total_card_sales ?? 0) : 0;
  const txCount      = session?.transaction_count ?? 0;
  const avgBasket    = txCount > 0 ? todayRevenue / txCount : 0;
  const estCash      = session ? (session.opening_float ?? 0) + (session.total_cash_sales ?? 0) : 0;
  const openSince    = session ? new Date(session.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '';

  if (userChecked && !posUser && businessId) {
    return (
      <POSUserLogin
        businessId={businessId}
        businessName={businessName}
        onLogin={user => setPosUser(user as unknown as Record<string, unknown>)}
        onSkip={() => {
          localStorage.setItem('aria_pos_user', JSON.stringify({ id: 'owner', name: 'Owner', role: 'owner', permissions: { can_apply_discount: true, can_refund: true, max_discount_pct: 100, can_close_register: true, can_override_price: true } }));
          setPosUser({ id: 'owner', name: 'Owner', role: 'owner' });
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(0,106,255,0.15)', borderTopColor: '#006AFF', animation: 'processing 0.7s linear infinite' }} />
      </div>
    );
  }

  /* ── CLOSED: Open Register ─────────────────────────────────────── */
  if (!session) {
    return (
      <div className="h-full flex items-center justify-center p-6" style={{ background: 'var(--bg-base)', position: 'relative', overflow: 'hidden' }}>
        <Orb style={{ width: 400, height: 400, top: '-100px', left: '-100px', background: 'radial-gradient(circle,rgba(0,106,255,0.12),transparent 70%)', filter: 'blur(60px)', animation: 'orb-pulse-0 4s ease-in-out infinite' }} />
        <Orb style={{ width: 300, height: 300, bottom: '-80px', right: '-80px', background: 'radial-gradient(circle,rgba(99,102,241,0.15),transparent 70%)', filter: 'blur(50px)', animation: 'orb-pulse-1 5s ease-in-out infinite 1s' }} />
        <Orb style={{ width: 250, height: 250, top: '40%', left: '60%', background: 'radial-gradient(circle,rgba(139,92,246,0.1),transparent 70%)', filter: 'blur(40px)', animation: 'orb-pulse-2 6s ease-in-out infinite 2s' }} />

        <div className="w-full max-w-sm relative z-10 pos-scale-in" style={{ background: 'rgba(26,23,40,0.8)', backdropFilter: 'blur(24px)', border: '1px solid rgba(0,106,255,0.12)', borderRadius: 24, padding: 40, boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,106,255,0.06)' }}>
          <div className="flex flex-col items-center mb-8">
            <LogoMark />
            <p style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 28, color: '#006AFF', marginTop: 12, lineHeight: 1 }}>AriaPOS</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{businessName}</p>
          </div>

          <div className="mb-5">
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 10 }}>Opening Float</p>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #2A2540', borderRadius: 12, background: '#FAFAFA', overflow: 'hidden' }}>
              <span style={{ padding: '14px 14px 14px 16px', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-tertiary)', fontSize: 14 }}>A$</span>
              <input
                type="number" min="0" step="0.01"
                value={openingFloat}
                onChange={e => setOpeningFloat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') openRegister(); }}
                style={{ flex: 1, background: 'transparent', outline: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', padding: '10px 16px 10px 0' }}
                autoFocus
              />
            </div>
            {openError && (
              <p style={{ marginTop: 8, fontSize: 12, color: '#EF4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{openError}</p>
            )}
          </div>

          <button
            onClick={openRegister}
            disabled={opening}
            style={{
              width: '100%', height: 52, borderRadius: 14, border: 'none',
              background: '#006AFF',
              boxShadow: '0 4px 0 rgba(124,58,237,0.4), 0 6px 20px rgba(139,92,246,0.33)',
              color: '#fff', fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 15,
              cursor: opening ? 'not-allowed' : 'pointer', opacity: opening ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 150ms ease',
            }}
            onMouseEnter={e => { if (!opening) { const el = e.currentTarget; el.style.transform = 'translateY(-1px)'; el.style.boxShadow = '0 6px 0 rgba(124,58,237,0.4),0 8px 28px rgba(139,92,246,0.4)'; }}}
            onMouseLeave={e => { const el = e.currentTarget; el.style.transform = ''; el.style.boxShadow = '0 4px 0 rgba(124,58,237,0.4),0 6px 20px rgba(139,92,246,0.33)'; }}
            onMouseDown={e => { const el = e.currentTarget; el.style.transform = 'translateY(2px) scale(0.98)'; el.style.boxShadow = '0 1px 0 rgba(124,58,237,0.5),0 2px 8px rgba(139,92,246,0.44)'; }}
            onMouseUp={e => { const el = e.currentTarget; el.style.transform = 'translateY(-1px)'; el.style.boxShadow = '0 6px 0 rgba(124,58,237,0.4),0 8px 28px rgba(139,92,246,0.4)'; }}
          >
            {opening ? <><Spinner /><span>Opening…</span></> : 'Open Register'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
            You can close the register at any time from the terminal
          </p>
        </div>
      </div>
    );
  }

  /* ── OPEN: Dashboard ───────────────────────────────────────────── */
  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)', position: 'relative' }}>
      <Orb style={{ width: 300, height: 300, top: 0, left: '20%', background: 'radial-gradient(circle,rgba(0,106,255,0.08),transparent 70%)', filter: 'blur(60px)', animation: 'orb-pulse-0 4s ease-in-out infinite', pointerEvents: 'none', position: 'fixed', zIndex: 0 }} />

      {/* Session header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(8,6,16,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1C1928', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Open since <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{openSince}</span>
          {session.opened_by && <> · {session.opened_by}</>}
          {posUser && (
            <span style={{ marginLeft: 12, color: 'var(--text-tertiary)' }}>
              · 👤 {(posUser as { name: string }).name}
              <button onClick={() => { localStorage.removeItem('aria_pos_user'); setPosUser(null); }}
                style={{ marginLeft: 6, color: '#006AFF', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
                switch
              </button>
            </span>
          )}
        </p>
        <button onClick={() => router.push('/pos/close')}
          style={{ fontSize: 13, padding: '6px 14px', borderRadius: 9, border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444', background: 'rgba(239,68,68,0.06)', cursor: 'pointer' }}>
          Close Register
        </button>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px', position: 'relative', zIndex: 1 }}>
        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Revenue today',       value: `A$${todayRevenue.toFixed(2)}`, sub: `${txCount} transaction${txCount !== 1 ? 's' : ''}` },
            { label: 'Avg basket',          value: `A$${avgBasket.toFixed(2)}`,    sub: 'per transaction' },
            { label: 'Est. cash in drawer', value: `A$${estCash.toFixed(2)}`,      sub: 'float + cash sales' },
            { label: 'Best seller today',   value: topProduct ?? '—',              sub: 'by volume', isText: true },
          ].map(kpi => (
            <div key={kpi.label} style={{ background: 'var(--bg-elevated)', border: '1px solid #2A2540', borderRadius: 16, padding: '16px 20px' }}>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 8 }}>{kpi.label}</p>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: kpi.isText ? 18 : 28, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kpi.value}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* New Sale button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <button
            onClick={() => router.push('/pos/terminal')}
            style={{
              width: 280, height: 72, borderRadius: 20,
              background: '#006AFF',
              boxShadow: '0 4px 0 rgba(124,58,237,0.4), 0 8px 32px rgba(139,92,246,0.4)',
              border: 'none', cursor: 'pointer', color: '#fff',
              fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 6px 0 rgba(124,58,237,0.4),0 12px 40px rgba(139,92,246,0.5)'; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.transform = ''; el.style.boxShadow = '0 4px 0 rgba(124,58,237,0.4),0 8px 32px rgba(139,92,246,0.4)'; }}
            onMouseDown={e => { const el = e.currentTarget; el.style.transform = 'translateY(2px) scale(0.98)'; el.style.boxShadow = '0 1px 0 rgba(124,58,237,0.5),0 2px 8px rgba(139,92,246,0.44)'; }}
            onMouseUp={e => { const el = e.currentTarget; el.style.transform = 'translateY(-2px)'; }}
          >
            New Sale →
          </button>
        </div>

        {/* Mobile selling card */}
        <a href="/pos/mobile" style={{ display: 'block', background: 'var(--bg-elevated)', border: '1px solid #2A2540', borderRadius: 20, padding: '16px 20px', marginBottom: 16, textDecoration: 'none', transition: 'border 150ms ease' }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.border = '1px solid rgba(0,106,255,0.15)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.border = '1px solid #2A2540'; }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>📱</div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Mobile selling</p>
              <p style={{ fontSize: 12, color: '#3D5A73' }}>Camera barcode scanning · Works offline</p>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#006AFF', fontWeight: 600 }}>Open →</span>
          </div>
          <p style={{ fontSize: 12, color: '#3D5A73', lineHeight: 1.5 }}>
            Point your phone camera at any product barcode to add it to a sale instantly. Sales are queued offline when there&apos;s no internet.
          </p>
        </a>

        {/* Aria insight */}
        <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(0,106,255,0.10)', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
          {insightText ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <span style={{ color: '#006AFF', fontWeight: 600 }}>Aria: </span>{insightText}
            </p>
          ) : (
            <div style={{ height: 16, borderRadius: 6, background: 'rgba(139,92,246,0.1)', width: '70%', animation: 'pulse 2s ease-in-out infinite' }} />
          )}
        </div>

        {/* Low stock */}
        {lowStockCount > 0 && (
          <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#F59E0B', fontWeight: 500 }}>
              {lowStockCount} product{lowStockCount > 1 ? 's' : ''} need reordering
            </p>
            <a href="/dashboard/reorder" style={{ fontSize: 13, color: '#F59E0B', fontWeight: 700 }}>Review →</a>
          </div>
        )}

        {/* 7-day chart */}
        {chartData.length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid #2A2540', borderRadius: 16, padding: '20px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Last 7 days</p>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={chartData} barCategoryGap="30%">
                <Bar dataKey="revenue" fill="#006AFF" radius={[3, 3, 0, 0]} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid #2A2540', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }}
                  formatter={(v: unknown) => { const num = typeof v === 'number' ? v : 0; return [`A$${num.toFixed(2)}`, 'Revenue']; }}
                  labelFormatter={(l: unknown) => { const key = typeof l === 'string' ? l : ''; const item = chartData.find(d => d.label === key || d.date === key); return item?.label ?? key; }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
