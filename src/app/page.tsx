import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/chat');

  return (
    <main className="min-h-screen bg-[#0e0e12] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-white font-bold text-sm">A</div>
          <span className="font-semibold text-lg">Aria</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[#888899] hover:text-white transition-colors px-4 py-2">Sign in</Link>
          <Link href="/signup" className="text-sm bg-[#6C63FF] hover:bg-[#4b44cc] text-white px-4 py-2 rounded-lg transition-colors font-medium">Get started free</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-4xl mb-8 shadow-[0_0_60px_rgba(108,99,255,0.4)] animate-float">✦</div>
        <h1 className="text-5xl md:text-6xl font-semibold mb-6 leading-tight">
          Your AI assistant<br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6C63FF] to-[#a78bfa]">built for real work</span>
        </h1>
        <p className="text-[#888899] text-lg max-w-xl mb-10 leading-relaxed">
          Aria combines the power of Claude AI with web search, file analysis, persistent memory, and a beautiful interface — ready for your startup from day one.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/signup" className="bg-[#6C63FF] hover:bg-[#4b44cc] text-white px-8 py-3.5 rounded-xl font-medium text-base transition-all hover:scale-105">
            Start for free →
          </Link>
          <Link href="/login" className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-3.5 rounded-xl font-medium text-base transition-colors">
            Sign in
          </Link>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 max-w-3xl w-full">
          {[
            { icon: '🔍', label: 'Web search' },
            { icon: '📎', label: 'File analysis' },
            { icon: '🧠', label: 'Memory' },
            { icon: '⚡', label: 'Streaming' },
          ].map(f => (
            <div key={f.label} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center gap-2">
              <span className="text-2xl">{f.icon}</span>
              <span className="text-sm text-[#888899]">{f.label}</span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-20 max-w-2xl w-full">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left">
            <div className="text-lg font-semibold mb-1">Free</div>
            <div className="text-3xl font-bold mb-4">$0<span className="text-sm text-[#888899] font-normal">/mo</span></div>
            <ul className="space-y-2 text-sm text-[#888899]">
              <li>✓ 50 messages/month</li>
              <li>✓ Haiku model</li>
              <li>✓ File uploads up to 5MB</li>
              <li>✓ Conversation history</li>
            </ul>
          </div>
          <div className="bg-gradient-to-br from-[#6C63FF]/20 to-[#a78bfa]/20 border-2 border-[#6C63FF] rounded-2xl p-6 text-left relative">
            <div className="absolute -top-3 left-4 bg-[#6C63FF] text-white text-xs px-3 py-1 rounded-full font-medium">Most popular</div>
            <div className="text-lg font-semibold mb-1">Pro</div>
            <div className="text-3xl font-bold mb-4">$20<span className="text-sm text-[#888899] font-normal">/mo</span></div>
            <ul className="space-y-2 text-sm text-[#888899]">
              <li>✓ Unlimited messages</li>
              <li>✓ All models including Opus</li>
              <li>✓ Web search</li>
              <li>✓ File uploads up to 20MB</li>
              <li>✓ Priority support</li>
            </ul>
          </div>
        </div>
      </div>

      <footer className="text-center py-6 text-sm text-[#555566] border-t border-white/5">
        © {new Date().getFullYear()} Aria AI. All rights reserved.
      </footer>
    </main>
  );
}
