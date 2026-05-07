import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Aria POS — AI for Australian Retail.',
};

const S: React.CSSProperties = { background: '#0A0E1E', border: '1px solid #1A2240', borderRadius: 16, padding: '28px 32px', marginBottom: 16 };
const H: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: 'rgba(220,240,255,0.93)', marginBottom: 16 };
const P: React.CSSProperties = { fontSize: 14, color: 'rgba(130,160,200,0.75)', lineHeight: 1.75, marginBottom: 10 };

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#030510', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 768, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link href="/" style={{ display: 'inline-block', fontSize: 13, color: 'rgba(130,160,200,0.6)', textDecoration: 'none', marginBottom: 40 }}>← Back to Aria</Link>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#F0EBFF', marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ fontSize: 13, color: 'rgba(130,160,200,0.5)', marginBottom: 48 }}>Last updated 8 May 2026</p>

        <div style={S}>
          <h2 style={H}>1. Service</h2>
          <p style={P}>Aria POS is a cloud-based point-of-sale and AI agent platform for Australian retail businesses, operated by Aria POS Pty Ltd (ABN pending), Melbourne, Australia.</p>
        </div>

        <div style={S}>
          <h2 style={H}>2. Pricing</h2>
          <p style={P}><strong>Starter</strong> — $59/outlet/month: POS + Reorder Agent</p>
          <p style={P}><strong>Growth</strong> — $129/outlet/month: 5 agents + Voice + Concierge</p>
          <p style={P}><strong>Autonomous</strong> — $249/outlet/month: All 12 agents + CCTV vision</p>
          <p style={P}>All prices are in AUD and exclude GST. GST is added at checkout for Australian businesses.</p>
        </div>

        <div style={S}>
          <h2 style={H}>3. Cancellation</h2>
          <p style={P}>You may cancel at any time from Settings → Subscription. Cancellation takes effect at the end of your current billing period. No partial refunds.</p>
        </div>

        <div style={S}>
          <h2 style={H}>4. Refund Policy</h2>
          <p style={P}>Refunds are available within 7 days of initial subscription for new customers if the service does not function as described. Contact support with details. Agent subscription fees are non-refundable after the 14-day free trial.</p>
        </div>

        <div style={S}>
          <h2 style={H}>5. AI Agent Autonomy</h2>
          <p style={P}>Aria&apos;s autonomous agents (Reorder, Pricing, Smart Schedule, etc.) take actions on your behalf based on your configuration and AI analysis. <strong>You, the business owner, are responsible for reviewing and approving autonomous decisions</strong> before they result in external commitments (e.g., purchase orders).</p>
          <p style={P}>Aria provides a decision log and approval queue. For high-impact decisions (orders over your configured threshold), human approval is required by default. You may change approval thresholds in Settings → AI Agents.</p>
          <p style={P}>Aria is not liable for business decisions made by autonomous agents that you have approved or configured to auto-approve.</p>
        </div>

        <div style={S}>
          <h2 style={H}>6. SLA</h2>
          <p style={P}>Aria targets 99.5% uptime for the POS terminal and reporting modules. Planned maintenance is announced 48 hours in advance. Compensation for downtime exceeding SLA is limited to a credit of one day&apos;s subscription per hour of excess downtime, capped at 30 days.</p>
        </div>

        <div style={S}>
          <h2 style={H}>7. Acceptable Use</h2>
          <p style={P}>You must not use Aria to process illegal transactions, circumvent RSA requirements, or export data for competitor analysis tools. Breach may result in immediate suspension.</p>
        </div>

        <div style={S}>
          <h2 style={H}>8. Governing Law</h2>
          <p style={P}>These terms are governed by the laws of Victoria, Australia. Disputes are subject to the jurisdiction of Victorian courts.</p>
        </div>

        <p style={{ fontSize: 12, color: 'rgba(130,160,200,0.35)', textAlign: 'center', marginTop: 40 }}>
          Questions? <a href="mailto:cnkansal1105@gmail.com" style={{ color: 'rgba(130,160,200,0.5)', textDecoration: 'none' }}>cnkansal1105@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
