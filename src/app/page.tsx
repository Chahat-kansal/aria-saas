import Link from 'next/link';

const BRIEFING_CARDS = [
  '$2,840 cash trapped in slow stock',
  '7 products below target margin',
  '4 items likely to stock out this weekend',
  '12 products to discount',
  '6 products not to reorder',
  '1 supplier price increase detected',
];

const MORNING_WORK = [
  ['Live', 'Daily AI briefing', 'Yesterday, today, and the actions waiting for approval.'],
  ['Live', 'Profit leak detection', 'Low margin products, dead stock, stockouts, and discount mistakes.'],
  ['Beta', 'Smart reordering', 'What to order, what not to order, and why.'],
  ['Beta', 'Winback SMS', 'Customers who used to buy but have gone quiet.'],
];

const LEAKS = [
  'Cash trapped in slow stock',
  'Supplier price creep',
  'Products priced below target margin',
  'Discounts eating gross profit',
  'Over-ordering on slow movers',
  'Stockouts on reliable sellers',
];

const SETUP = [
  ['Square', 'Beta'],
  ['Shopfront', 'Coming soon'],
  ['CSV upload', 'Live'],
  ['Aria POS', 'Live'],
];

const LABEL_CLASS: Record<string, string> = {
  Live: 'bg-[#1D9E75]/10 text-[#137b5b] border-[#1D9E75]/20',
  Beta: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  'Coming soon': 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f6f5f0] text-[#191a16]">
      <nav className="sticky top-0 z-50 border-b border-black/5 bg-[#f6f5f0]/90 px-5 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="text-xl font-semibold tracking-tight">aria<span className="text-[#1D9E75]">OS</span></div>
          <div className="hidden items-center gap-7 text-sm text-black/45 md:flex">
            <a href="#briefing" className="hover:text-black">Briefing</a>
            <a href="#ordering" className="hover:text-black">Ordering</a>
            <a href="#pricing" className="hover:text-black">Pricing</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-full border border-black/15 px-4 py-2 text-sm hover:border-black/40">Log in</Link>
            <Link href="/onboarding/industry" className="rounded-full bg-[#191a16] px-4 py-2 text-sm font-medium text-white hover:bg-[#2b2c25]">Get started</Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-16 md:grid-cols-[1fr_440px] md:px-8 md:pt-24">
        <div>
          <span className="inline-flex rounded-full border border-[#1D9E75]/20 bg-[#1D9E75]/10 px-3 py-1 text-xs font-semibold text-[#137b5b]">
            Built for Australian shops, cafes, bottle shops and convenience stores
          </span>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
            Wake up to today&apos;s business plan.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-black/58">
            Aria checks your sales, stock, suppliers, margins, staff, weather and customers - then tells you what to order, what to discount, and where your profit is leaking.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/onboarding/industry" className="rounded-full bg-[#1D9E75] px-7 py-3 text-center text-sm font-semibold text-white hover:bg-[#188765]">
              Get your first Aria briefing
            </Link>
            <a href="#briefing" className="rounded-full border border-black/15 px-7 py-3 text-center text-sm font-semibold hover:border-black/40">
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-black/40">A$99/month founding customer pricing. No corporate fluff, no mystery dashboard.</p>
        </div>

        <div id="briefing" className="rounded-2xl border border-black/10 bg-[#11131a] p-4 shadow-2xl shadow-black/15">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#8ff1c9]">Example briefing</p>
              <p className="mt-1 text-sm text-white/45">Illustrative only - not a real customer dashboard.</p>
            </div>
            <span className="h-2 w-2 rounded-full bg-[#1D9E75]" />
          </div>
          <div className="grid gap-3">
            {BRIEFING_CARDS.map((card, index) => (
              <div key={card} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#1D9E75]/15 text-xs font-semibold text-[#8ff1c9]">{index + 1}</span>
                  <p className="text-sm font-medium leading-snug text-white">{card}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-black/6 bg-white px-5 py-14 md:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-semibold tracking-tight">What Aria does every morning</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {MORNING_WORK.map(([label, title, copy]) => (
              <div key={title} className="rounded-2xl border border-black/8 bg-[#fbfaf7] p-5">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LABEL_CLASS[label]}`}>{label}</span>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-black/55">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:px-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Profit leaks Aria finds</h2>
          <p className="mt-3 text-sm leading-relaxed text-black/55">
            Aria is direct because owners do not need another pretty graph. It points at cash trapped in stock, supplier cost creep, and products that are quietly wasting shelf space.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {LEAKS.map(leak => (
            <div key={leak} className="rounded-xl border border-black/8 bg-white p-4 text-sm font-medium shadow-sm">{leak}</div>
          ))}
        </div>
      </section>

      <section id="ordering" className="bg-[#191a16] px-5 py-16 text-white md:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
          <div>
            <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">Beta</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Smart ordering: what to order and what not to order</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              Aria separates urgent stockouts from slow movers. The result is a short approval list, not a spreadsheet marathon.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#1D9E75]/25 bg-[#1D9E75]/10 p-5">
              <p className="text-sm font-semibold text-[#8ff1c9]">Example order list</p>
              <p className="mt-1 text-xs text-white/45">Illustrative only</p>
              <ul className="mt-4 space-y-3 text-sm text-white/75">
                <li>Coke No Sugar - 6 cartons</li>
                <li>Great Northern Original - 4 cartons</li>
                <li>Large oat milk - 12 bottles</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-5">
              <p className="text-sm font-semibold text-red-200">Example do-not-order list</p>
              <p className="mt-1 text-xs text-white/45">Illustrative only</p>
              <ul className="mt-4 space-y-3 text-sm text-white/75">
                <li>Imported ginger beer 4-pack</li>
                <li>Premium tonic 750ml</li>
                <li>Seasonal muffin mix</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1fr_1fr] md:px-8">
        <div className="rounded-2xl border border-black/8 bg-white p-6">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LABEL_CLASS.Beta}`}>Beta</span>
          <h2 className="mt-4 text-2xl font-semibold">Supplier watchdog</h2>
          <p className="mt-3 text-sm leading-relaxed text-black/55">
            Upload supplier invoices or cost files and Aria looks for price creep, invoice mismatches, late deliveries, and estimated margin impact.
          </p>
        </div>
        <div className="rounded-2xl border border-black/8 bg-white p-6">
          <h2 className="text-2xl font-semibold">Works with your setup</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {SETUP.map(([name, label]) => (
              <div key={name} className="rounded-xl border border-black/8 bg-[#fbfaf7] p-4">
                <p className="font-semibold">{name}</p>
                <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LABEL_CLASS[label]}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-black/6 bg-white px-5 py-16 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Built by an Australian retail operator</h2>
            <p className="mt-4 text-sm leading-relaxed text-black/58">
              Built by an Australian retail operator for real shops, cafes, bottle shops and convenience stores. Aria is designed for the morning decisions owners actually make: order this, do not order that, fix this margin, clear this stock.
            </p>
          </div>
          <div id="pricing" className="rounded-2xl border-2 border-[#1D9E75] bg-[#fbfaf7] p-6">
            <p className="text-sm font-semibold text-[#137b5b]">Founding customer pricing</p>
            <p className="mt-3 text-4xl font-bold">A$99<span className="text-base font-normal text-black/45">/month</span></p>
            <p className="mt-3 text-sm leading-relaxed text-black/55">Daily briefing, profit leak detection, CSV import, Ask Aria, and Aria POS access while founding customer pricing is available.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8">
        <h2 className="text-3xl font-semibold tracking-tight">What is live, beta, and coming soon</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <FeatureColumn label="Live" items={['Daily AI briefing', 'Profit leak detection', 'Aria POS', 'CSV import']} />
          <FeatureColumn label="Beta" items={['Square sync', 'Smart reordering', 'Supplier watchdog', 'Winback SMS']} />
          <FeatureColumn label="Coming soon" items={['Shopfront sync', 'Full rostering compliance', 'Cross-business benchmarking', 'Voice stocktake', 'Website AI assistant']} />
        </div>
      </section>

      <section className="px-5 pb-16 md:px-8">
        <div className="mx-auto max-w-4xl rounded-2xl bg-[#191a16] p-8 text-center text-white md:p-12">
          <h2 className="text-3xl font-semibold tracking-tight">Get your first Aria briefing</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/55">
            Start with Aria POS, connect Square beta, or upload a CSV. The point is simple: tomorrow morning, open Aria and know what to do.
          </p>
          <Link href="/onboarding/industry" className="mt-7 inline-flex rounded-full bg-[#1D9E75] px-7 py-3 text-sm font-semibold text-white hover:bg-[#188765]">
            Get your first Aria briefing
          </Link>
        </div>
      </section>

      <footer className="border-t border-black/7 px-5 py-8 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-black/40 md:flex-row md:items-center md:justify-between">
          <div className="text-xl font-semibold tracking-tight text-black">aria<span className="text-[#1D9E75]">OS</span></div>
          <p>Built in Australia for Australian small businesses.</p>
        </div>
      </footer>
    </main>
  );
}

function FeatureColumn({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-black/8 bg-white p-5">
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LABEL_CLASS[label]}`}>{label}</span>
      <ul className="mt-5 space-y-3 text-sm text-black/60">
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
