import Link from 'next/link';

const FEATURES = [
  { icon: '💬', name: 'Conversational sales insights', desc: "Ask Aria anything about your business. 'What's my best margin product this month?' returns instantly with a chart." },
  { icon: '🍽️', name: 'Recipe → ingredient tracking', desc: 'Upload your menu PDF. Aria extracts every dish\'s ingredients and deducts stock automatically with every sale.' },
  { icon: '📸', name: 'Receipt photo → instant stock-in', desc: 'Photograph a supplier invoice. Aria reads it and updates your inventory in seconds — no manual entry.' },
  { icon: '🔮', name: 'Predictive reordering', desc: 'Aria factors in your sales history, upcoming public holidays, local events and weather to recommend exactly what to order and when.' },
  { icon: '📦', name: 'Dead stock recovery', desc: 'Aria finds capital tied up in slow-moving stock and writes you a recovery plan — bundle ideas, markdown suggestions, placement tips.' },
  { icon: '💬', name: 'Customer winback on autopilot', desc: 'When a regular goes quiet, Aria notices and drafts a personalised SMS offer. You approve, Aria sends.' },
  { icon: '🎤', name: 'Voice stocktake', desc: 'Walk your shop floor speaking counts into your phone. Aria transcribes and updates inventory hands-free.' },
  { icon: '🌐', name: "Your website's AI assistant", desc: 'Embed Aria on your website. It answers customer questions using your live inventory, menu, and hours — 24/7.' },
  { icon: '📊', name: 'Cross-business benchmarking', desc: 'See how businesses like yours are performing — anonymised, aggregated, privacy-safe — so you always know where you stand.' },
  { icon: '📋', name: 'Rostering assistant', desc: 'Aria forecasts how many staff you need based on expected demand, flags Fair Work compliance risks, and helps you build the roster.' },
];

const INDUSTRIES = [
  'Liquor stores', 'Bottle shops', 'Convenience stores', 'Specialty retail',
  'Cafés', 'Restaurants', 'Bakeries', 'Butchers',
];

const INTEGRATIONS = [
  { name: 'Square', sub: 'Connect in 60 seconds' },
  { name: 'Shopfront', sub: 'Native integration' },
  { name: 'AriaPOS', sub: 'Built-in — no connection needed' },
  { name: 'Xero', sub: 'Accounting sync' },
  { name: 'MYOB', sub: 'Accounting sync' },
  { name: 'Twilio', sub: 'SMS campaigns' },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] text-[#1a1a16] overflow-x-hidden">
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }
        @keyframes floatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(15px)} }
        @keyframes gradshift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .animate-float{animation:float 6s ease-in-out infinite}
        .animate-floatB{animation:floatB 8s ease-in-out infinite}
        .grad-text{background:linear-gradient(90deg,#1D9E75,#0fa86d,#16c987,#1D9E75);background-size:200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:gradshift 4s ease infinite}
        .ticker-track{animation:ticker 40s linear infinite}
      `}</style>

      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="animate-float absolute top-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full" style={{background:'radial-gradient(circle,rgba(29,158,117,0.07) 0%,transparent 70%)'}} />
        <div className="animate-floatB absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full" style={{background:'radial-gradient(circle,rgba(29,158,117,0.05) 0%,transparent 70%)'}} />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-[rgba(245,244,239,0.85)] backdrop-blur-md border-b border-[rgba(0,0,0,0.05)]">
        <div className="text-xl font-medium tracking-tight text-[#1a1a16]">aria</div>
        <div className="hidden md:flex items-center gap-8 text-sm text-[rgba(26,26,22,0.4)]">
          {['Features','Integrations','Pricing'].map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} className="hover:text-[#1a1a16] transition-colors">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm border border-[rgba(0,0,0,0.15)] rounded-full px-4 py-2 hover:border-[#1a1a16] transition-colors">Log in</Link>
          <Link href="/onboarding/industry" className="text-sm bg-[#1a1a16] text-white rounded-full px-4 py-2 hover:bg-[#2d2d25] transition-colors">Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-20">
        <div className="inline-flex items-center gap-2 bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]" />
          <span className="text-xs text-[#1D9E75] font-medium">Founding customers now open — 14-day free trial</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-medium leading-tight tracking-[-0.8px] mb-6 max-w-3xl">
          The AI brain for your
          <span className="block grad-text">shop or café</span>
        </h1>

        <p className="text-[16px] text-[rgba(26,26,22,0.5)] max-w-xl mb-10 leading-relaxed">
          Aria connects to your Square account (or runs its own POS) and turns your sales data into decisions — automatically, every morning.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Link href="/onboarding/industry?source=square" className="bg-[#1D9E75] text-white rounded-full px-7 py-3.5 text-sm font-medium hover:bg-[#179968] transition-colors">
            Connect Square free
          </Link>
          <Link href="/onboarding/industry" className="bg-[#1a1a16] text-white rounded-full px-7 py-3.5 text-sm font-medium hover:bg-[#2d2d25] transition-colors">
            Start with Aria POS
          </Link>
        </div>
        <p className="text-xs text-[rgba(26,26,22,0.35)]">Built by an Australian liquor store owner. No lock-in contracts.</p>
      </section>

      {/* Ticker */}
      <div className="border-y border-[rgba(26,26,22,0.07)] py-4 overflow-hidden">
        <div className="ticker-track flex gap-10 whitespace-nowrap w-max">
          {[...Array(2)].map((_, ri) => (
            <div key={ri} className="flex gap-10">
              {FEATURES.map(f => (
                <span key={f.name} className="flex items-center gap-2 text-sm text-[rgba(26,26,22,0.35)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] flex-shrink-0" />
                  {f.name}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="features" className="relative z-10 px-6 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-medium mb-3">Everything your business needs, automated</h2>
          <p className="text-sm text-[rgba(26,26,22,0.45)]">Ten AI systems working together, every day, while you focus on what matters.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map((f, i) => (
            <div key={f.name} className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-6 hover:border-[rgba(29,158,117,0.3)] hover:shadow-[0_0_20px_rgba(29,158,117,0.06)] transition-all">
              <div className="flex items-start gap-4">
                <div className="text-2xl flex-shrink-0">{f.icon}</div>
                <div>
                  <div className="text-[11px] text-[rgba(26,26,22,0.25)] font-medium tracking-widest uppercase mb-1">{String(i + 1).padStart(2, '0')}</div>
                  <div className="text-sm font-semibold text-[#1a1a16] mb-1.5">{f.name}</div>
                  <div className="text-[13px] text-[rgba(26,26,22,0.5)] leading-relaxed">{f.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="relative z-10 px-6 py-16 bg-white border-y border-[rgba(0,0,0,0.06)]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-medium mb-2">Works with what you already use</h2>
          <p className="text-sm text-[rgba(26,26,22,0.45)] mb-10">Already on Square? Connect in 60 seconds. No migration needed.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {INTEGRATIONS.map(int => (
              <div key={int.name} className="rounded-2xl border border-[rgba(0,0,0,0.08)] p-5 text-left hover:border-[rgba(29,158,117,0.3)] transition-colors">
                <p className="font-semibold text-[#1a1a16] mb-0.5">{int.name}</p>
                <p className="text-xs text-[rgba(26,26,22,0.4)]">{int.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two paths */}
      <section className="relative z-10 px-6 py-20 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-medium">Two ways to use Aria</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-8">
            <div className="w-10 h-10 rounded-xl bg-[rgba(29,158,117,0.1)] flex items-center justify-center text-xl mb-5">⬛</div>
            <h3 className="text-base font-semibold text-[#1a1a16] mb-2">Already on Square or Shopfront?</h3>
            <p className="text-sm text-[rgba(26,26,22,0.5)] leading-relaxed mb-6">Connect your existing POS. Aria reads your data and adds the AI intelligence layer Square doesn&apos;t have. Keep using Square for checkout.</p>
            <Link href="/onboarding/industry?source=square" className="inline-flex items-center gap-2 bg-[#1D9E75] text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#179968] transition-colors">
              Connect my POS →
            </Link>
          </div>
          <div className="bg-[#1a1a16] rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 opacity-30" style={{background:'radial-gradient(ellipse at 100% 0%,rgba(29,158,117,0.4) 0%,transparent 60%)'}} />
            <div className="relative z-10">
              <div className="w-10 h-10 rounded-xl bg-[rgba(29,158,117,0.2)] flex items-center justify-center text-xl mb-5">🏪</div>
              <h3 className="text-base font-semibold text-white mb-2">Starting fresh or want everything in one place?</h3>
              <p className="text-sm text-[rgba(255,255,255,0.5)] leading-relaxed mb-6">Use Aria&apos;s built-in POS — inventory, checkout, customers, suppliers, all AI-powered from day one.</p>
              <Link href="/onboarding/industry" className="inline-flex items-center gap-2 bg-white text-[#1a1a16] rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#f5f4ef] transition-colors">
                Use Aria POS →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="relative z-10 px-6 py-16 bg-white border-y border-[rgba(0,0,0,0.06)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-medium mb-2">Built for Australian retail and hospitality</h2>
          <p className="text-sm text-[rgba(26,26,22,0.45)] mb-8">Purpose-built for the businesses that keep Australian communities running.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {INDUSTRIES.map(ind => (
              <span key={ind} className="border border-[rgba(0,0,0,0.1)] rounded-full px-4 py-2 text-sm text-[rgba(26,26,22,0.6)]">{ind}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 px-6 py-20 max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-medium mb-2">Founding customer pricing</h2>
          <p className="text-sm text-[rgba(26,26,22,0.45)]">We&apos;re onboarding our first customers now. Founding customer pricing is locked in for 12 months.</p>
        </div>
        <div className="bg-white rounded-2xl border-[2px] border-[#1D9E75] shadow-[0_0_40px_rgba(29,158,117,0.1)] p-8 mb-4">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="text-xs bg-[rgba(29,158,117,0.1)] text-[#1D9E75] border border-[rgba(29,158,117,0.2)] rounded-full px-3 py-1 inline-block mb-3">14-day free trial · No lock-in</div>
              <div className="text-4xl font-bold text-[#1a1a16]">A$99<span className="text-base font-normal text-[rgba(26,26,22,0.4)]">/month per business</span></div>
            </div>
          </div>
          <ul className="space-y-2 mb-8">
            {[
              'All 10 AI features listed above',
              'Square / Shopfront connection OR Aria POS',
              'Website chatbot embed',
              'Unlimited Ask Aria queries',
              'SMS winback campaigns (Twilio costs at cost)',
              '14-day free trial',
              'No lock-in contract',
            ].map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-[rgba(26,26,22,0.7)]">
                <span className="text-[#1D9E75] font-bold flex-shrink-0">✓</span>{f}
              </li>
            ))}
          </ul>
          <Link href="/onboarding/industry" className="block text-center bg-[#1a1a16] text-white rounded-full py-3.5 text-sm font-medium hover:bg-[#2d2d25] transition-colors">
            Start 14-day free trial →
          </Link>
        </div>
        <div className="bg-[rgba(29,158,117,0.06)] border border-[rgba(29,158,117,0.15)] rounded-2xl p-5 text-center">
          <p className="text-sm font-semibold text-[#1a1a16]">Additional business on same account: <span className="text-[#1D9E75]">+A$50/month</span></p>
          <p className="text-xs text-[rgba(26,26,22,0.5)] mt-1">Own a café and a bottle shop? Manage both from one login.</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 px-6 pb-20 max-w-3xl mx-auto">
        <div className="bg-[#1a1a16] rounded-2xl p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0" style={{background:'radial-gradient(ellipse at 50% 0%,rgba(29,158,117,0.2) 0%,transparent 60%)'}} />
          <div className="relative z-10">
            <h2 className="text-3xl font-medium text-white mb-3">Your shop deserves better data</h2>
            <p className="text-sm text-[rgba(255,255,255,0.45)] mb-8">14-day free trial. No credit card. No setup fees.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/onboarding/industry?source=square" className="bg-[#1D9E75] text-white rounded-full px-7 py-3.5 text-sm font-medium hover:bg-[#179968] transition-colors">
                Connect Square free →
              </Link>
              <Link href="/onboarding/industry" className="bg-white text-[#1a1a16] rounded-full px-7 py-3.5 text-sm font-medium hover:bg-[#f5f4ef] transition-colors">
                Start with Aria POS
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[rgba(0,0,0,0.07)] px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-xl font-medium tracking-tight text-[#1a1a16]">aria</div>
        <div className="flex items-center gap-6 text-sm text-[rgba(26,26,22,0.4)]">
          <a href="/privacy" className="hover:text-[#1a1a16] transition-colors">Privacy Policy</a>
          <a href="/terms" className="hover:text-[#1a1a16] transition-colors">Terms of Service</a>
          <a href="mailto:hello@aria.com.au" className="hover:text-[#1a1a16] transition-colors">Contact</a>
        </div>
        <p className="text-xs text-[rgba(26,26,22,0.35)]">© 2026 Aria. Built in Australia for Australian small businesses.</p>
      </footer>
    </main>
  );
}
