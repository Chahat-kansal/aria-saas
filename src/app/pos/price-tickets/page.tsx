'use client';
import Link from 'next/link';

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', violet:'#006AFF' };

export default function PriceTicketsPage() {
  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '40px 28px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Price Tickets</h1>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 32 }}>Print price labels for your products</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 700 }}>
        <Link href="/pos/price-tickets/everyday" style={{ textDecoration: 'none' }}>
          <div style={{ background: C.violet, borderRadius: 18, padding: '36px 28px', cursor: 'pointer', transition: 'opacity 150ms' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.9'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏷️</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Everyday Tickets</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>Print standard price labels for your products. Select multiple products and print in bulk.</p>
          </div>
        </Link>

        <Link href="/pos/price-tickets/promotional" style={{ textDecoration: 'none' }}>
          <div style={{ background: C.card, border: `2px solid ${C.border}`, borderRadius: 18, padding: '36px 28px', cursor: 'pointer', transition: 'border-color 150ms' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = C.violet}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = C.border}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8 }}>Promotional Tickets</h2>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Print promotional labels with original price crossed out and sale price highlighted.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
