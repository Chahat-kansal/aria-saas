import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] text-[#1a1a16] overflow-x-hidden">
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }
        @keyframes floatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(15px)} }
        @keyframes gradshift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes orbit { from{transform:rotate(0deg) translateX(42px)} to{transform:rotate(360deg) translateX(42px)} }
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .animate-float{animation:float 6s ease-in-out infinite}
        .animate-floatB{animation:floatB 8s ease-in-out infinite}
        .grad-text{background:linear-gradient(90deg,#1D9E75,#0fa86d,#16c987,#1D9E75);background-size:200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:gradshift 4s ease infinite}
        .ticker-track{animation:ticker 30s linear infinite}
        .feature-card:hover .arrow-btn{opacity:1;transform:translateX(0)}
        .arrow-btn{opacity:0;transform:translateX(-4px);transition:all .2s}
      `}</style>

      {/* Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="animate-float absolute top-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full" style={{background:'radial-gradient(circle,rgba(29,158,117,0.07) 0%,transparent 70%)'}} />
        <div className="animate-floatB absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full" style={{background:'radial-gradient(circle,rgba(29,158,117,0.05) 0%,transparent 70%)'}} />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-[rgba(245,244,239,0.85)] backdrop-blur-md border-b border-[rgba(0,0,0,0.05)]">
        <div className="text-xl font-medium tracking-tight">aria<span className="text-[#1D9E75]">OS</span></div>
        <div className="hidden md:flex items-center gap-8 text-sm text-[rgba(26,26,22,0.38)]">
          {['Features','Industries','Pricing','About'].map(l => (
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
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px w-8 bg-[#1D9E75]" />
          <span className="text-xs tracking-[.15em] uppercase text-[#1D9E75] font-medium">AI OPERATING SYSTEM FOR LOCAL BUSINESS</span>
          <div className="h-px w-8 bg-[#1D9E75]" />
        </div>

        <h1 className="text-5xl md:text-6xl font-medium leading-tight tracking-[-0.8px] mb-6 max-w-3xl">
          <span className="block">Your business,</span>
          <span className="block grad-text">running itself</span>
          <span className="block text-[rgba(26,26,22,0.2)]">while you live your life</span>
        </h1>

        <p className="text-[15px] text-[rgba(26,26,22,0.45)] max-w-lg mb-10 leading-relaxed">
          Aria finds your hidden revenue, brings back lost customers, and grows your reputation — automatically, every single day.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <Link href="/onboarding/industry" className="bg-[#1a1a16] text-white rounded-full px-7 py-3.5 text-sm font-medium hover:bg-[#2d2d25] transition-colors">
            Start free — 14 days
          </Link>
          <button className="border border-[rgba(0,0,0,0.15)] text-[#1a1a16] rounded-full px-7 py-3.5 text-sm font-medium hover:border-[#1a1a16] transition-colors">
            Watch it work
          </button>
        </div>

        <p className="text-xs text-[rgba(26,26,22,0.35)]">Trusted by 200+ local businesses across Australia · No card required</p>

        {/* Orb */}
        <div className="relative mt-16 mb-4 w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-[#1D9E75] shadow-[0_0_40px_rgba(29,158,117,0.35)]" />
          <div className="absolute inset-[-8px] rounded-full border border-[rgba(29,158,117,0.25)]" />
          <div className="absolute inset-[-18px] rounded-full border border-[rgba(29,158,117,0.12)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-xl font-bold">A</span>
          </div>
          {[['#1D9E75','0s'],['#7c3aed','1.5s'],['#f59e0b','3s']].map(([color, delay], i) => (
            <div key={i} className="absolute inset-0 flex items-center justify-center" style={{animation:`orbit 4s linear infinite`,animationDelay:delay as string}}>
              <div className="w-2.5 h-2.5 rounded-full" style={{background:color,boxShadow:`0 0 8px ${color}`}} />
            </div>
          ))}
        </div>
      </section>

      {/* Ticker */}
      <div className="border-y border-[rgba(26,26,22,0.07)] py-4 overflow-hidden">
        <div className="ticker-track flex gap-10 whitespace-nowrap w-max">
          {[...Array(2)].map((_, ri) => (
            <div key={ri} className="flex gap-10">
              {['AI booking agent','Customer winback','Review autopilot','Profit leak detection','Competitor watch','Slow day filler','Churn prevention','Quote builder','Revenue recovery','Compliance AI'].map(item => (
                <span key={item} className="flex items-center gap-2 text-sm text-[rgba(26,26,22,0.32)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] flex-shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <section className="relative z-10 px-6 py-16 max-w-4xl mx-auto">
        <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-2xl p-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { val: '$2.4M', label: 'Revenue recovered for clients' },
            { val: '200+', label: 'Businesses on autopilot' },
            { val: '4.8★', label: 'Average Google rating lift' },
            { val: '8', label: 'AI systems in one platform' },
          ].map(s => (
            <div key={s.val} className="text-center">
              <div className="text-3xl font-semibold text-[#1a1a16] mb-1">{s.val}</div>
              <div className="text-xs text-[rgba(26,26,22,0.45)] leading-snug">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 px-6 pb-16 max-w-4xl mx-auto">
        <div className="rounded-2xl overflow-hidden" style={{background:'rgba(26,26,22,0.07)',gap:'1px',display:'grid',gridTemplateColumns:'repeat(3,1fr)'}}>
          {[
            { n:'01', name:'AI booking + sales agent', desc:'Answers enquiries, books appointments, and follows up leads automatically — 24/7.' },
            { n:'02', name:'Customer winback engine', desc:'Identifies lapsed customers and sends personalised SMS offers to bring them back.' },
            { n:'03', name:'Review growth autopilot', desc:'Sends review requests at the perfect moment, growing your Google rating on cruise control.' },
            { n:'04', name:'Profit leak detector', desc:'Analyses your revenue patterns and surfaces hidden money being left on the table.' },
            { n:'05', name:'Slow day revenue filler', desc:'Detects upcoming quiet periods and launches targeted campaigns to fill them.' },
            { n:'06', name:'Competitor intelligence', desc:'Monitors what competitors are doing so you can stay one step ahead, always.' },
          ].map(f => (
            <div key={f.n} className="feature-card bg-white p-6 relative group cursor-pointer hover:bg-[#fafffe] transition-colors">
              <div className="text-[11px] text-[rgba(26,26,22,0.2)] tracking-[.1em] uppercase mb-3">{f.n}</div>
              <div className="w-8 h-px bg-[rgba(29,158,117,0.5)] mb-3" />
              <div className="text-sm font-medium text-[#1a1a16] mb-2">{f.name}</div>
              <div className="text-[12px] text-[rgba(26,26,22,0.4)] leading-[1.7]">{f.desc}</div>
              <button className="arrow-btn absolute bottom-5 right-5 w-6 h-6 rounded-full bg-[rgba(29,158,117,0.1)] flex items-center justify-center text-[#1D9E75] text-xs">→</button>
            </div>
          ))}
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="relative z-10 px-6 py-16 max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-medium mb-3">Built for your industry</h2>
        <p className="text-sm text-[rgba(26,26,22,0.45)] mb-10">Pick your business type at signup — Aria customises everything for you</p>
        <div className="flex flex-wrap justify-center gap-2">
          {['Retail shops','Cafes + restaurants','Tradies','Real estate agents','Salons + beauty','Visa + migration','Gyms + fitness','Professional services'].map(ind => (
            <span key={ind} className="border border-[rgba(0,0,0,0.1)] bg-white rounded-full px-4 py-2 text-sm text-[rgba(26,26,22,0.6)] hover:border-[#1D9E75] hover:text-[#1D9E75] hover:bg-[rgba(29,158,117,0.04)] transition-all cursor-pointer">
              {ind}
            </span>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative z-10 px-6 pb-16 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { quote: "Aria brought back 14 lapsed customers in the first week. I didn't do a thing — it just happened.", name: 'Sarah M.', biz: 'Hair salon · Melbourne', initials: 'SM', color: '#1D9E75' },
            { quote: "My Google rating went from 4.1 to 4.7 in two months. Aria sends the review requests automatically.", name: 'James T.', biz: 'Café · Sydney', initials: 'JT', color: '#7c3aed' },
            { quote: "Found $3,200 a month in profit leaks I didn't know existed. The profit leak detector is insane.", name: 'Priya K.', biz: 'Migration agent · Brisbane', initials: 'PK', color: '#f59e0b' },
          ].map(t => (
            <div key={t.name} className="bg-white border border-[rgba(0,0,0,0.08)] rounded-2xl p-6">
              <div className="flex gap-0.5 mb-4">{[...Array(5)].map((_, i) => <span key={i} className="text-amber-400 text-sm">★</span>)}</div>
              <p className="text-sm text-[rgba(26,26,22,0.7)] leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium" style={{background:t.color}}>{t.initials}</div>
                <div>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-[11px] text-[rgba(26,26,22,0.4)]">{t.biz}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 px-6 pb-16 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-medium mb-2">Simple, transparent pricing</h2>
          <p className="text-sm text-[rgba(26,26,22,0.45)]">14-day free trial on all plans. Cancel anytime.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name:'Starter', price:'$297', features:['AI booking agent','Review autopilot','Basic dashboard','1 location','Email support'] },
            { name:'Growth', price:'$597', popular:true, features:['Everything in Starter','Customer winback','Slow day filler','Profit leak detector','Competitor watch','Priority support'] },
            { name:'Pro', price:'$997', features:['Everything in Growth','Churn prevention','Multi-location','Quote builder','Compliance AI','Dedicated support','Monthly strategy call'] },
          ].map(p => (
            <div key={p.name} className={`bg-white rounded-2xl p-6 relative ${p.popular ? 'border-[1.5px] border-[#1D9E75] shadow-[0_0_30px_rgba(29,158,117,0.1)]' : 'border border-[rgba(0,0,0,0.08)]'}`}>
              {p.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1D9E75] text-white text-[11px] font-medium px-3 py-1 rounded-full">Most popular</div>}
              <div className="text-[11px] bg-[rgba(29,158,117,0.08)] text-[#1D9E75] border border-[rgba(29,158,117,0.15)] rounded-full px-2.5 py-1 inline-block mb-4">14-day free trial</div>
              <div className="text-sm font-medium mb-1">{p.name}</div>
              <div className="text-3xl font-semibold mb-4">{p.price}<span className="text-sm font-normal text-[rgba(26,26,22,0.4)]">/mo</span></div>
              <Link href="/onboarding/industry" className={`block text-center rounded-full py-2.5 text-sm font-medium mb-5 transition-colors ${p.popular ? 'bg-[#1a1a16] text-white hover:bg-[#2d2d25]' : 'border border-[rgba(0,0,0,0.15)] hover:border-[#1a1a16]'}`}>
                Start free trial
              </Link>
              <ul className="space-y-2">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[rgba(26,26,22,0.6)]">
                    <span className="text-[#1D9E75] flex-shrink-0 mt-px">✓</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 pb-20 max-w-3xl mx-auto">
        <div className="bg-[#1a1a16] rounded-2xl p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0" style={{background:'radial-gradient(ellipse at 50% 0%,rgba(29,158,117,0.2) 0%,transparent 60%)'}} />
          <div className="relative z-10">
            <h2 className="text-3xl font-medium text-white mb-3">Your business deserves to run smarter</h2>
            <p className="text-sm text-[rgba(255,255,255,0.45)] mb-8">14-day free trial. No credit card. No setup fees.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/onboarding/industry" className="bg-white text-[#1a1a16] rounded-full px-7 py-3.5 text-sm font-medium hover:bg-[#f5f4ef] transition-colors">
                Start free trial →
              </Link>
              <button className="border border-[rgba(255,255,255,0.2)] text-white rounded-full px-7 py-3.5 text-sm font-medium hover:border-white transition-colors">
                Book a demo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[rgba(0,0,0,0.07)] px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-xl font-medium tracking-tight">aria<span className="text-[#1D9E75]">OS</span></div>
        <div className="flex items-center gap-6 text-sm text-[rgba(26,26,22,0.38)]">
          {['Features','Industries','Pricing','About'].map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} className="hover:text-[#1a1a16] transition-colors">{l}</a>
          ))}
        </div>
        <p className="text-xs text-[rgba(26,26,22,0.35)]">© 2026 Aria OS. All rights reserved.</p>
      </footer>
    </main>
  );
}
