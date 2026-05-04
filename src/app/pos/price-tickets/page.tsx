'use client';
import Link from 'next/link';

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6' };

export default function PriceTicketsPage() {
  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>Price Tickets</h1>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 40 }}>Select the type of ticket you want to print</p>

      <div style={{ display: 'flex', gap: 20, width: '100%', maxWidth: 640 }}>
        <Link href="/pos/price-tickets/everyday" style={{ flex: 1, textDecoration: 'none' }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '36px 28px', textAlign: 'center', cursor: 'pointer', transition: 'all 200ms' }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.border = `1px solid rgba(139,92,246,0.4)`; el.style.background = 'rgba(139,92,246,0.07)'; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.border = `1px solid ${C.border}`; el.style.background = C.card; }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏷️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Everyday Tickets</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Print standard price tickets for your everyday product range</div>
          </div>
        </Link>

        <Link href="/pos/price-tickets/promotional" style={{ flex: 1, textDecoration: 'none' }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '36px 28px', textAlign: 'center', cursor: 'pointer', transition: 'all 200ms' }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.border = `1px solid rgba(239,68,68,0.4)`; el.style.background = 'rgba(239,68,68,0.07)'; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.border = `1px solid ${C.border}`; el.style.background = C.card; }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Promotional Tickets</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Print promotional shelf tickets showing sale prices</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
