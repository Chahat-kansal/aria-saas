import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/chat');

  return (
    <main className="min-h-screen bg-[#0e0e12] flex flex-col text-[#f0f0f5]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#0e0e12]/90 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-white font-bold text-sm shadow-[0_0_20px_rgba(108,99,255,0.4)]">A</div>
          <span className="font-semibold text-lg">Aria</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[#888899] hover:text-white transition-colors px-4 py-2">Sign in</Link>
          <Link href="/signup" className="text-sm bg-[#6C63FF] hover:bg-[#4b44cc] text-white px-4 py-2 rounded-lg transition-colors font-medium">Get started free</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex flex-col items-center text-center px-6 pt-20 pb-16">
        <div className="inline-flex items-center gap-2 bg-[#6C63FF]/10 border border-[#6C63FF]/30 rounded-full px-4 py-1.5 text-xs text-[#a78bfa] mb-8">
          ✦ Powered by Claude AI
        </div>
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-4xl mb-8 shadow-[0_0_60px_rgba(108,99,255,0.4)] animate-float">✦</div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold mb-6 leading-tight max-w-3xl">
          Your AI assistant<br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6C63FF] to-[#a78bfa]">built for real work</span>
        </h1>
        <p className="text-[#888899] text-base sm:text-lg max-w-xl mb-10 leading-relaxed">
          Chat, search the web, run code, build websites, generate images, edit documents — all in one beautiful interface.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mb-16">
          <Link href="/signup" className="bg-[#6C63FF] hover:bg-[#4b44cc] text-white px-8 py-3.5 rounded-xl font-medium text-base transition-all hover:scale-105 shadow-[0_0_30px_rgba(108,99,255,0.3)]">
            Start for free →
          </Link>
          <Link href="/login" className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-3.5 rounded-xl font-medium text-base transition-colors">
            Sign in
          </Link>
        </div>

        {/* Feature grid */}
        <div className="w-full max-w-4xl">
          <p className="text-xs text-[#555566] uppercase tracking-widest mb-6">Everything included</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-left">
            {[
              { icon: '💬', label: 'Claude AI chat', desc: 'Haiku, Sonnet & Opus models' },
              { icon: '🔍', label: 'Web search', desc: 'Real-time internet results', pro: true },
              { icon: '🔬', label: 'Deep research', desc: 'Multi-step web research', pro: true },
              { icon: '📎', label: 'File analysis', desc: 'PDFs, images, CSVs & more' },
              { icon: '🎨', label: 'Image generation', desc: 'DALL-E 3 AI images', pro: true },
              { icon: '▶️', label: 'Code executor', desc: 'Run 14+ languages live' },
              { icon: '🔨', label: 'Builder mode', desc: 'Build sites with live preview' },
              { icon: '🏗️', label: 'Project builder', desc: 'Multi-file IDE & file tree' },
              { icon: '📝', label: 'Canvas editor', desc: 'Collaborative AI documents' },
              { icon: '🎤', label: 'Voice mode', desc: 'Speak & hear Aria respond' },
              { icon: '🔌', label: 'Plugins', desc: 'Weather, stocks, calendar…' },
              { icon: '🧠', label: 'Chat history', desc: 'Persistent in your database' },
            ].map(f => (
              <div key={f.label} className="bg-white/3 border border-white/8 rounded-xl p-4 flex flex-col gap-2 hover:border-[#6C63FF]/40 hover:bg-[#6C63FF]/5 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xl">{f.icon}</span>
                  {f.pro && <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">Pro</span>}
                </div>
                <div className="text-xs font-semibold text-white">{f.label}</div>
                <div className="text-[11px] text-[#555566] leading-snug">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="px-6 py-16 max-w-3xl mx-auto w-full">
        <p className="text-center text-xs text-[#555566] uppercase tracking-widest mb-10">Simple pricing</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
            <div className="text-lg font-semibold mb-1">Free</div>
            <div className="text-4xl font-bold mb-1">$0<span className="text-sm text-[#888899] font-normal">/mo</span></div>
            <p className="text-xs text-[#555566] mb-5">No credit card needed</p>
            <Link href="/signup" className="block w-full text-center bg-white/10 hover:bg-white/15 text-white py-2.5 rounded-xl text-sm font-medium transition-colors mb-5">Get started free</Link>
            <ul className="space-y-2 text-sm text-[#888899]">
              {['50 messages / month','Claude Haiku model','File uploads up to 5MB','Builder mode + live preview','Code execution (14+ languages)','Project builder IDE','Canvas editor','Voice mode','Plugins','Chat history'].map(i => (
                <li key={i} className="flex items-start gap-2"><span className="text-[#6C63FF] flex-shrink-0">✓</span>{i}</li>
              ))}
            </ul>
          </div>
          <div className="bg-gradient-to-br from-[#6C63FF]/20 to-[#a78bfa]/10 border-2 border-[#6C63FF] rounded-2xl p-6 relative shadow-[0_0_40px_rgba(108,99,255,0.15)]">
            <div className="absolute -top-3.5 left-4 bg-[#6C63FF] text-white text-xs px-3 py-1 rounded-full font-medium">Most popular</div>
            <div className="text-lg font-semibold mb-1">Pro</div>
            <div className="text-4xl font-bold mb-1">$20<span className="text-sm text-[#888899] font-normal">/mo</span></div>
            <p className="text-xs text-[#555566] mb-5">Cancel anytime</p>
            <Link href="/signup" className="block w-full text-center bg-[#6C63FF] hover:bg-[#4b44cc] text-white py-2.5 rounded-xl text-sm font-medium transition-colors mb-5">Start Pro →</Link>
            <ul className="space-y-2 text-sm text-[#888899]">
              {['Unlimited messages','Claude Sonnet 4 + Opus 4','Web search + deep research','Image generation (DALL-E 3)','File uploads up to 20MB','Everything in Free plan'].map(i => (
                <li key={i} className="flex items-start gap-2"><span className="text-[#a78bfa] flex-shrink-0">✓</span>{i}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-20 max-w-xl mx-auto w-full text-center">
        <div className="bg-gradient-to-br from-[#6C63FF]/20 to-[#a78bfa]/10 border border-[#6C63FF]/30 rounded-2xl p-10">
          <div className="text-3xl mb-3">✦</div>
          <h2 className="text-2xl font-semibold mb-2">Ready to try Aria?</h2>
          <p className="text-[#888899] text-sm mb-6">Free forever. No credit card needed.</p>
          <Link href="/signup" className="inline-block bg-[#6C63FF] hover:bg-[#4b44cc] text-white px-8 py-3.5 rounded-xl font-medium transition-all hover:scale-105">
            Create free account →
          </Link>
        </div>
      </div>

      <footer className="text-center py-6 text-sm text-[#555566] border-t border-white/5">
        © {new Date().getFullYear()} Aria AI. Powered by Claude.
      </footer>
    </main>
  );
}
