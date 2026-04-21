import { createServerSupabaseClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', session.user.id)
    .single();

  if (!business) return null;

  const [
    { data: activity },
    { data: leaks },
    { data: competitors },
    { data: churnCustomers },
    { data: bookings },
  ] = await Promise.all([
    supabase.from('activity_log').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('profit_leaks').select('*').eq('business_id', business.id).eq('status', 'detected').limit(5),
    supabase.from('competitor_alerts').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('customers').select('*').eq('business_id', business.id).in('churn_risk', ['medium', 'high']).limit(5),
    supabase.from('bookings').select('value').eq('business_id', business.id).gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  const revenueThisMonth = (bookings || []).reduce((sum, b) => sum + (b.value || 0), 0);
  const totalLeakSavings = (leaks || []).reduce((sum, l) => sum + (l.monthly_loss || 0), 0);
  const automationsRunning = 3;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const ownerName = business.owner_name || 'there';

  const dateStr = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="relative min-h-full p-6">
      {/* Ambient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-30" style={{background:'radial-gradient(circle,rgba(29,158,117,0.15) 0%,transparent 70%)'}} />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full opacity-20" style={{background:'radial-gradient(circle,rgba(124,58,237,0.12) 0%,transparent 70%)'}} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        {/* Top bar */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-medium text-white">{greeting}, {ownerName}</h1>
            <p className="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">
              {dateStr} · Aria is running {automationsRunning} automations
            </p>
          </div>
          <Link
            href="/dashboard/ask-aria"
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{background:'linear-gradient(135deg,#1D9E75,#0fa86d)'}}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
            </svg>
            Ask Aria
          </Link>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Revenue this month"
            value={`$${revenueThisMonth.toLocaleString()}`}
            change="+12% vs last month"
            gradient="linear-gradient(135deg,rgba(29,158,117,0.2),rgba(29,158,117,0.05))"
            border="rgba(29,158,117,0.3)"
          />
          <StatCard
            label="Customers returned"
            value="8"
            change="+3 this week"
            gradient="linear-gradient(135deg,rgba(124,58,237,0.2),rgba(124,58,237,0.05))"
            border="rgba(124,58,237,0.3)"
          />
          <StatCard
            label="Google rating"
            value={business.google_rating ? `${business.google_rating}★` : '—'}
            change={`${business.google_review_count} reviews`}
            gradient="linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.05))"
            border="rgba(245,158,11,0.3)"
          />
          <StatCard
            label="Money saved"
            value={`$${totalLeakSavings.toLocaleString()}`}
            change="from leak fixes"
            gradient="linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.03))"
            border="rgba(239,68,68,0.2)"
          />
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Activity feed */}
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-white">Live activity</h2>
              <span className="flex items-center gap-1.5 text-[10px] text-[#1D9E75]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
                Live
              </span>
            </div>
            {!activity?.length ? (
              <p className="text-xs text-[rgba(255,255,255,0.25)] py-4 text-center">No activity yet — Aria will start logging actions here</p>
            ) : (
              <ul className="space-y-3">
                {activity.map(item => (
                  <li key={item.id} className="flex items-start gap-3">
                    <ActivityDot type={item.action_type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgba(255,255,255,0.7)] leading-snug">{item.description}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.25)] mt-0.5">
                        {new Date(item.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Profit leaks */}
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-white">Profit leaks detected</h2>
              {totalLeakSavings > 0 && (
                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                  ${totalLeakSavings.toLocaleString()}/mo recoverable
                </span>
              )}
            </div>
            {!leaks?.length ? (
              <div className="py-4 text-center">
                <p className="text-xs text-[rgba(255,255,255,0.25)] mb-3">No leaks detected yet</p>
                <Link href="/dashboard/profit-leaks" className="text-xs text-[#1D9E75] hover:underline">Run analysis →</Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {leaks.map(leak => (
                  <li key={leak.id} className="border-b border-[rgba(255,255,255,0.04)] pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-[rgba(255,255,255,0.7)]">{leak.description}</p>
                      <span className="text-[10px] text-red-400 flex-shrink-0">-${leak.monthly_loss}/mo</span>
                    </div>
                    {leak.fix_suggestion && (
                      <p className="text-[10px] text-[#1D9E75] mt-1">{leak.fix_suggestion}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Google rating */}
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white mb-3">Google rating</h2>
            <div className="text-4xl font-medium text-white mb-1">
              {business.google_rating || '—'}
            </div>
            <p className="text-[11px] text-[rgba(255,255,255,0.35)] mb-4">
              {business.google_review_count} reviews
              {business.city ? ` · ${business.city}` : ''}
            </p>
            {[5,4,3,2,1].map(stars => (
              <div key={stars} className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] text-[rgba(255,255,255,0.3)] w-3">{stars}</span>
                <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: stars === Math.round(business.google_rating || 0) ? '60%' : `${Math.random() * 30}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Competitors */}
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white mb-3">Competitor watch</h2>
            {!competitors?.length ? (
              <p className="text-xs text-[rgba(255,255,255,0.25)] py-4 text-center">No alerts yet</p>
            ) : (
              <ul className="space-y-3">
                {competitors.map(alert => (
                  <li key={alert.id} className="flex items-start gap-2">
                    <SeverityBadge severity={alert.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[rgba(255,255,255,0.7)]">{alert.competitor_name}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.35)] mt-0.5 leading-snug">{alert.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Churn risk */}
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5">
            <h2 className="text-sm font-medium text-white mb-3">Churn risk</h2>
            {!churnCustomers?.length ? (
              <p className="text-xs text-[rgba(255,255,255,0.25)] py-4 text-center">No at-risk customers</p>
            ) : (
              <ul className="space-y-2.5">
                {churnCustomers.map(c => (
                  <li key={c.id} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[10px] text-[rgba(255,255,255,0.5)] flex-shrink-0">
                      {c.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgba(255,255,255,0.7)] truncate">{c.name}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)]">
                        {c.last_visit ? `Last visit ${new Date(c.last_visit).toLocaleDateString('en-AU')}` : 'No visits recorded'}
                      </p>
                    </div>
                    <ChurnBadge risk={c.churn_risk} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Aria chat bar */}
        <Link
          href="/dashboard/ask-aria"
          className="block bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-2xl p-5 hover:bg-[rgba(29,158,117,0.12)] transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-[.15em] text-[#1D9E75] font-medium">Aria</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
          </div>
          <p className="text-sm text-[rgba(255,255,255,0.6)]">
            Good {hour < 12 ? 'morning' : 'afternoon'}, {ownerName}. I&apos;ve been watching your business overnight.
            Ask me anything or let me run your daily briefing.
          </p>
          <p className="text-xs text-[#1D9E75] mt-2">Ask Aria something… →</p>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, change, gradient, border }: {
  label: string; value: string; change: string; gradient: string; border: string;
}) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: gradient, borderColor: border }}>
      <p className="text-[10px] uppercase tracking-[.1em] text-[rgba(255,255,255,0.4)] mb-2">{label}</p>
      <p className="text-2xl font-medium text-white mb-1">{value}</p>
      <p className="text-[11px] text-[#1D9E75]">{change}</p>
    </div>
  );
}

function ActivityDot({ type }: { type: string }) {
  const colors: Record<string, string> = {
    winback: '#1D9E75', review: '#f59e0b', booking: '#7c3aed', leak: '#ef4444', default: '#6b7280',
  };
  const color = colors[type] || colors.default;
  return <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: color }} />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = { high: 'text-red-400 bg-red-500/10', medium: 'text-amber-400 bg-amber-500/10', low: 'text-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.05)]' };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0 mt-0.5 ${map[severity] || map.low}`}>{severity}</span>;
}

function ChurnBadge({ risk }: { risk: string }) {
  const map: Record<string, string> = { high: 'text-red-400 bg-red-500/10', medium: 'text-amber-400 bg-amber-500/10', low: 'text-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.05)]' };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full capitalize flex-shrink-0 ${map[risk] || map.low}`}>{risk}</span>;
}
