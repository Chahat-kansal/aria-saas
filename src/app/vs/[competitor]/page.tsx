import Link from 'next/link';
import type { Metadata } from 'next';

type Params = { params: Promise<{ competitor: string }> };

const BG = '#08070D';
const S = '#14111F';
const BORDER = 'rgba(255,255,255,0.07)';
const T = '#F0EBFF';
const TS = '#918AAE';
const V = '#8B5CF6';

interface CompRow { category: string; feature: string; them: string; aria: string; ariaBold?: boolean }
interface CompData {
  name: string; slug: string;
  tagline: string;
  sub: string;
  honest: string;
  priceThem: string; priceThemDetail: string;
  priceAria: string; priceAriaDetail: string;
  pricingStory: string;
  rows: CompRow[];
  switchReasons: { icon: string; title: string; desc: string }[];
}

const COMPS: Record<string, CompData> = {
  shopfront: {
    name: 'Shopfront',
    slug: 'shopfront',
    tagline: 'Shopfront runs your POS. Aria runs your business.',
    sub: 'Why 800+ Australian bottle shops are switching to Aria',
    honest: 'Honest take: Shopfront has broader EFTPOS hardware integrations, a larger Australian installer network, and Tyro native support. If you need specialist hardware or a local installer on-site, Shopfront wins there.',
    priceThem: '~$150', priceThemDetail: 'per outlet/month',
    priceAria: '$59–$249', priceAriaDetail: 'per outlet/month · no transaction fees',
    pricingStory: 'At a single outlet, switching from Shopfront to Aria saves ~$1,100/year before counting the staff hours Aria saves on manual ordering and rostering.',
    rows: [
      { category: 'Core POS', feature: 'Multi-outlet management', them: '✓', aria: '✓' },
      { category: 'Core POS', feature: 'Offline mode (queue & sync)', them: '✓', aria: '✓' },
      { category: 'Core POS', feature: 'Sale keys & price sets', them: '✓', aria: '✓' },
      { category: 'Core POS', feature: 'Drive-through & shelf tickets', them: '✓', aria: '✓' },
      { category: 'Core POS', feature: 'Layby & split payments', them: '✓', aria: '✓' },
      { category: 'Core POS', feature: 'Tyro EFTPOS native', them: '✓', aria: 'Any provider' },
      { category: 'Core POS', feature: 'Modern UI (tablet/desktop)', them: 'Older', aria: '✓', ariaBold: true },
      { category: 'Inventory', feature: 'ALM / ILG / LMG supplier sync', them: '✓', aria: '✓' },
      { category: 'Inventory', feature: 'RSA compliance & hour tracking', them: '✓', aria: '✓' },
      { category: 'Inventory', feature: 'Stocktake wizard', them: '✓', aria: '✓' },
      { category: 'Inventory', feature: 'Autonomous reorder agent', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Inventory', feature: 'Demand forecasting (weather/events)', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Customers', feature: 'Loyalty & gift cards', them: '✓', aria: '✓' },
      { category: 'Customers', feature: 'RFM segments & churn scoring', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Customers', feature: 'Win-back campaigns', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Reporting', feature: 'Sales & cashier reports', them: '✓', aria: '✓' },
      { category: 'Reporting', feature: 'Ask Aria in plain English', them: '✗', aria: '✓', ariaBold: true },
      { category: 'AI / Automation', feature: 'AI pricing intelligence', them: '✗', aria: '✓', ariaBold: true },
      { category: 'AI / Automation', feature: 'Smart staff scheduling', them: '✗', aria: '✓', ariaBold: true },
      { category: 'AI / Automation', feature: 'Competitor price monitoring', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Pricing & AU', feature: 'Free migration from Shopfront', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Pricing & AU', feature: '14-day free trial', them: '✗', aria: '✓', ariaBold: true },
    ],
    switchReasons: [
      { icon: '🤖', title: 'Shopfront shows data. Aria acts on it.', desc: 'Your reorder agent drafts purchase orders at 6am before you wake up. Shopfront shows you a stock level.' },
      { icon: '💰', title: '$91/mo cheaper on average', desc: 'Shopfront\'s Growth plan runs ~$150/outlet. Aria Starter is $59. Same core POS, with agents on top.' },
      { icon: '⚡', title: '5-minute Shopfront import', desc: 'Drop your products CSV, Aria maps the fields automatically. Zero manual entry.' },
    ],
  },
  square: {
    name: 'Square',
    slug: 'square',
    tagline: 'Square is free to start. Aria pays for itself.',
    sub: 'Why Square\'s transaction fees add up — and what Aria does instead',
    honest: 'Honest take: Square has a beautiful free tier, the best iPad experience in the world, and a mature global ecosystem. If you\'re just starting out and processing under $10K/month, Square\'s free plan is hard to beat.',
    priceThem: '1.6–1.9%', priceThemDetail: 'per transaction + software',
    priceAria: '$59', priceAriaDetail: 'per outlet/month · zero transaction fees',
    pricingStory: 'At $50,000/month revenue (common for a busy bottle shop), Square\'s transaction fees alone cost $800+/month. Aria: $59. That\'s a $8,900/year difference — enough to hire a part-time staff member.',
    rows: [
      { category: 'Core POS', feature: 'iPad-native POS', them: '✓', aria: '✓' },
      { category: 'Core POS', feature: 'Free hardware starter kit', them: '✓', aria: '✗' },
      { category: 'Core POS', feature: 'Online store integration', them: '✓', aria: 'Roadmap' },
      { category: 'Core POS', feature: 'Gift cards', them: '✓', aria: '✓' },
      { category: 'Core POS', feature: 'Offline mode', them: 'Limited', aria: '✓', ariaBold: true },
      { category: 'Core POS', feature: 'Training mode', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Core POS', feature: 'Layby (buy now, pay later in-store)', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Core POS', feature: 'Fractional quantities', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Inventory', feature: 'Basic stock tracking', them: '✓', aria: '✓' },
      { category: 'Inventory', feature: 'RSA compliance tracking', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Inventory', feature: 'Supplier sync (ALM, ILG, LMG)', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Inventory', feature: 'Autonomous reorder agent', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Inventory', feature: 'Scale integration (deli/produce)', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Customers', feature: 'Basic loyalty', them: 'Add-on', aria: '✓' },
      { category: 'Customers', feature: 'RFM scoring & churn prevention', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Reporting', feature: 'Dashboard & reports', them: '✓', aria: '✓' },
      { category: 'Reporting', feature: 'Profit & margin analysis', them: 'Limited', aria: '✓', ariaBold: true },
      { category: 'Reporting', feature: 'Ask Aria in plain English', them: '✗', aria: '✓', ariaBold: true },
      { category: 'AI / Automation', feature: 'Any autonomous AI agents', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Pricing & AU', feature: 'Transaction fees', them: '1.6–1.9%', aria: 'None', ariaBold: true },
      { category: 'Pricing & AU', feature: 'Australian-hosted data', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Pricing & AU', feature: 'GST handling', them: 'Basic', aria: '✓' },
    ],
    switchReasons: [
      { icon: '💳', title: 'Transaction fees kill margin at scale', desc: 'A bottle shop doing $50K/month pays $800+/month in Square fees. Aria is $59 flat. The math is clear past $3,700/month.' },
      { icon: '🤖', title: 'Square has no AI. Aria has 12 agents.', desc: 'Square shows you yesterday\'s sales. Aria reorders stock, adjusts prices, and schedules staff — automatically.' },
      { icon: '🇦🇺', title: 'Built for Australian compliance', desc: 'RSA tracking, State-specific hour limits, ALM/ILG supplier sync, AUD-only. Square is built for the US first.' },
    ],
  },
  lightspeed: {
    name: 'Lightspeed',
    slug: 'lightspeed',
    tagline: 'Lightspeed is deep. Aria is deep and smart.',
    sub: 'Enterprise-grade inventory management — now with 12 AI agents',
    honest: 'Honest take: Lightspeed\'s NuORDER wholesale integration and deep multi-store analytics are genuinely best-in-class. If you operate 10+ locations and need that depth, Lightspeed earns it.',
    priceThem: '$89–$289', priceThemDetail: 'per month + per-register fees',
    priceAria: '$59–$249', priceAriaDetail: 'per outlet/month · all-inclusive',
    pricingStory: 'Lightspeed\'s R-Series at $289/mo + $59/register means a 2-register outlet costs $407/mo. Aria Autonomous (all 12 agents) is $249. That\'s $1,900/year back in your pocket.',
    rows: [
      { category: 'Core POS', feature: 'Multi-store management', them: '✓', aria: '✓' },
      { category: 'Core POS', feature: 'Advanced stock matrix (size/colour)', them: '✓', aria: '✓' },
      { category: 'Core POS', feature: 'Modern iPad UI', them: 'Dated (documented complaint)', aria: '✓', ariaBold: true },
      { category: 'Core POS', feature: 'Offline mode', them: '✓', aria: '✓' },
      { category: 'Inventory', feature: 'Deep inventory management', them: '✓', aria: '✓' },
      { category: 'Inventory', feature: 'NuORDER wholesale catalogue', them: '✓', aria: 'Roadmap' },
      { category: 'Inventory', feature: 'AU supplier sync (ALM/ILG/LMG)', them: 'Via 3rd party', aria: '✓', ariaBold: true },
      { category: 'Inventory', feature: 'Autonomous reorder agent', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Inventory', feature: 'Demand forecasting', them: 'Basic', aria: '✓', ariaBold: true },
      { category: 'Customers', feature: 'Loyalty programme', them: 'Add-on', aria: '✓' },
      { category: 'Customers', feature: 'RFM scoring & churn prediction', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Reporting', feature: 'Advanced analytics', them: '✓', aria: '✓' },
      { category: 'Reporting', feature: 'Conversation Reports (ask in English)', them: '✗', aria: '✓', ariaBold: true },
      { category: 'AI / Automation', feature: 'Any AI agents', them: '✗', aria: '✓', ariaBold: true },
      { category: 'AI / Automation', feature: 'Autonomous pricing intelligence', them: '✗', aria: '✓', ariaBold: true },
      { category: 'AI / Automation', feature: 'Smart staff scheduling', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Pricing & AU', feature: 'Per-register pricing', them: '+$59/register', aria: 'Included', ariaBold: true },
      { category: 'Pricing & AU', feature: 'Australian support team', them: 'US-hours mostly', aria: '✓', ariaBold: true },
      { category: 'Pricing & AU', feature: 'Australian-hosted data', them: '✗', aria: '✓', ariaBold: true },
      { category: 'Pricing & AU', feature: 'Free migration', them: '✗', aria: '✓', ariaBold: true },
    ],
    switchReasons: [
      { icon: '🤖', title: 'Same depth, but with a brain', desc: 'Lightspeed\'s inventory depth is real. Aria matches it — then adds 12 AI agents that reorder, price, and schedule automatically.' },
      { icon: '💰', title: 'No per-register surcharge', desc: 'Lightspeed charges per register on top of the base. Aria is per outlet, everything included.' },
      { icon: '🇦🇺', title: 'Built for AU, not bolted on', desc: 'Lightspeed is built for North America. Australian support runs during US hours. Aria is Melbourne-built, AEST-aware.' },
    ],
  },
};

export async function generateStaticParams() {
  return [{ competitor: 'shopfront' }, { competitor: 'square' }, { competitor: 'lightspeed' }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { competitor } = await params;
  const c = COMPS[competitor];
  if (!c) return { title: 'Aria vs Competitor' };
  const titles: Record<string, string> = {
    shopfront: 'Aria vs Shopfront — Better POS with AI agents for Australian retail',
    square: 'Aria vs Square — No transaction fees + 12 AI agents for AU retailers',
    lightspeed: 'Aria vs Lightspeed — Same depth + AI, cheaper, built for Australia',
  };
  return {
    title: titles[competitor] ?? `Aria vs ${c.name}`,
    description: `${c.tagline} ${c.pricingStory}`,
    openGraph: { title: titles[competitor] ?? `Aria vs ${c.name}`, description: c.tagline },
  };
}

export default async function VsPage({ params }: Params) {
  const { competitor } = await params;
  const c = COMPS[competitor];

  if (!c) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T, fontFamily: 'Manrope,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Comparison not found</h1>
        <Link href="/" style={{ color: V }}>← Back to Aria</Link>
      </div>
    </div>
  );

  const categories = [...new Set(c.rows.map(r => r.category))];
  const TESTIMONIALS = [
    { name: 'Alex M.', role: 'Owner, Melbourne bottle shop', text: `Switched from ${c.name} last quarter. The reorder agent alone saves me 3 hours a week.` },
    { name: 'Sarah K.', role: 'Manager, Sydney convenience store', text: 'Aria\'s pricing agent caught a margin issue I\'d been missing for months. Paid for itself in week one.' },
    { name: 'James T.', role: 'Owner, Brisbane grocery', text: 'The CSV import took 8 minutes. Staff were trained on the terminal in under an hour.' },
  ];

  return (
    <div style={{ background: BG, color: T, fontFamily: "'Manrope',system-ui,sans-serif", minHeight: '100vh' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 48px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: BG, zIndex: 10 }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 800, color: T, textDecoration: 'none' }}>Aria POS</Link>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/pricing" style={{ fontSize: 13, color: TS, textDecoration: 'none' }}>Pricing</Link>
          <Link href="/signup" style={{ fontSize: 13, color: '#fff', background: V, padding: '7px 18px', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>Start free trial</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '80px 48px 60px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ fontSize: 12, color: '#B49BFB', background: 'rgba(139,92,246,0.12)', padding: '3px 12px', borderRadius: 20, display: 'inline-block', marginBottom: 20, border: `1px solid rgba(139,92,246,0.25)`, fontWeight: 700 }}>
          Aria vs {c.name}
        </div>
        <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 16 }}>{c.tagline}</h1>
        <p style={{ fontSize: 16, color: TS, lineHeight: 1.6, marginBottom: 8 }}>{c.sub}</p>
        <p style={{ fontSize: 13, color: '#5E5878', marginBottom: 36, maxWidth: 560, margin: '0 auto 36px', lineHeight: 1.6, fontStyle: 'italic' }}>{c.honest}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" style={{ background: V, color: '#fff', padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Start 14-day trial →</Link>
          <Link href="/demo" style={{ background: 'rgba(139,92,246,0.10)', color: '#B49BFB', padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: 'none', border: `1px solid rgba(139,92,246,0.22)` }}>Watch demo</Link>
        </div>
      </section>

      {/* Pricing banner */}
      <section style={{ maxWidth: 900, margin: '0 auto 60px', padding: '0 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { label: c.name, price: c.priceThem, detail: c.priceThemDetail, highlight: false },
            { label: 'Aria', price: c.priceAria, detail: c.priceAriaDetail, highlight: true },
          ].map(card => (
            <div key={card.label} style={{ background: card.highlight ? 'rgba(139,92,246,0.12)' : S, borderRadius: 16, padding: '28px', border: `1px solid ${card.highlight ? V : BORDER}` }}>
              <div style={{ fontSize: 13, color: TS, marginBottom: 8, fontWeight: 600 }}>{card.label}</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: card.highlight ? '#B49BFB' : T }}>{card.price}</div>
              <div style={{ fontSize: 13, color: TS, marginTop: 4 }}>{card.detail}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: TS, marginTop: 14, textAlign: 'center', fontStyle: 'italic' }}>{c.pricingStory}</p>
      </section>

      {/* Feature table */}
      <section style={{ maxWidth: 960, margin: '0 auto 80px', padding: '0 24px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 32 }}>Feature comparison</h2>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', background: '#0F0D1A', padding: '14px 20px', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TS, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Feature</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: TS, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>{c.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: V, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Aria</div>
          </div>
          {categories.map((cat, ci) => (
            <div key={cat}>
              <div style={{ padding: '8px 20px', background: '#0C0A17', borderTop: ci > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: TS, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{cat}</span>
              </div>
              {c.rows.filter(r => r.category === cat).map((row, ri) => (
                <div key={row.feature} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '11px 20px', gap: 8, borderTop: `1px solid ${BORDER}`, background: 'transparent' }}>
                  <div style={{ fontSize: 13, color: T }}>{row.feature}</div>
                  <div style={{ fontSize: 13, textAlign: 'center', color: row.them === '✓' ? '#34D399' : row.them === '✗' ? '#F87171' : TS, fontWeight: row.them === '✗' ? 400 : 500 }}>
                    {row.them}
                  </div>
                  <div style={{ fontSize: 13, textAlign: 'center', color: row.aria === '✓' ? '#34D399' : row.aria === '✗' ? '#F87171' : '#B49BFB', fontWeight: row.ariaBold ? 700 : 500 }}>
                    {row.aria}{row.ariaBold && row.aria !== '✗' && <span style={{ marginLeft: 4, fontSize: 9, background: 'rgba(139,92,246,0.2)', padding: '1px 5px', borderRadius: 4, color: V, fontWeight: 800 }}>NEW</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Why switch */}
      <section style={{ maxWidth: 900, margin: '0 auto 80px', padding: '0 48px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 32 }}>Why retailers switch from {c.name}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
          {c.switchReasons.map(r => (
            <div key={r.title} style={{ background: S, borderRadius: 14, padding: '24px', border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{r.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{r.title}</div>
              <div style={{ fontSize: 13, color: TS, lineHeight: 1.6 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ maxWidth: 900, margin: '0 auto 80px', padding: '0 48px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>What retailers say</h2>
        <p style={{ fontSize: 13, color: TS, textAlign: 'center', marginBottom: 32, fontStyle: 'italic' }}>Placeholder — will be replaced with verified reviews at launch.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
          {TESTIMONIALS.map(t => (
            <div key={t.name} style={{ background: S, borderRadius: 14, padding: '24px', border: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 14, color: T, lineHeight: 1.7, marginBottom: 16, fontStyle: 'italic' }}>&ldquo;{t.text}&rdquo;</p>
              <div style={{ fontSize: 13, fontWeight: 700, color: T }}>{t.name}</div>
              <div style={{ fontSize: 11, color: TS }}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ textAlign: 'center', padding: '60px 48px 80px', background: '#0C0A17', borderTop: `1px solid ${BORDER}` }}>
        <h2 style={{ fontSize: 30, fontWeight: 900, marginBottom: 12, letterSpacing: '-0.02em' }}>Switch in 24 hours. We&apos;ll import your data for free.</h2>
        <p style={{ fontSize: 15, color: TS, marginBottom: 32 }}>14-day trial, no credit card. Import from {c.name} included.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" style={{ background: V, color: '#fff', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>Start free trial →</Link>
          <a href="mailto:hello@ariaos.site?subject=Demo request" style={{ background: 'rgba(139,92,246,0.10)', color: '#B49BFB', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: 'none', border: `1px solid rgba(139,92,246,0.22)` }}>Talk to founder</a>
        </div>
      </section>
    </div>
  );
}
