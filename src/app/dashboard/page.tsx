import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { WarehouseDashboard } from '@/components/dashboard/WarehouseDashboard';
import { MorningCommandCentre } from '@/components/dashboard/MorningCommandCentre';
import { RetailDashboard } from '@/components/dashboard/RetailDashboard';
import { CustomFeaturesSection } from '@/components/features/FeatureRenderer';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Respect the active business selection
  const { data: activeRecord } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user!.id)
    .maybeSingle();

  const businessQuery = supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  const { data: allBusinesses } = await businessQuery;
  if (!allBusinesses || allBusinesses.length === 0) redirect('/onboarding/industry');

  const business =
    (activeRecord?.business_id && allBusinesses!.find((b: { id: string }) => b.id === activeRecord.business_id)) ||
    allBusinesses![0];

  if (!business) redirect('/onboarding/industry');

  const industry = business.industry ?? 'professional';

  if (industry === 'visa') return <VisaDashboard business={business} />;
  if (industry === 'warehouse') return <WarehouseDashboard business={business} />;
  // Retail, café, restaurant — full command centre
  if (industry === 'retail' || industry === 'cafe' || industry === 'restaurant')
    return <RetailDashboard business={business} />;
  if (industry === 'tradie' || industry === 'professional') return <TradieProfessionalDashboard business={business} />;
  if (industry === 'salon' || industry === 'gym') return <SalonGymDashboard business={business} />;
  if (industry === 'realestate') return <RealEstateDashboard business={business} />;
  // Default: use RetailDashboard for any other industry
  return <RetailDashboard business={business} />;
}

/* ═══════════════════════════════════════════════════════════
   RETAIL / CAFE
═══════════════════════════════════════════════════════════ */
async function RetailCafeDashboard({ business }: { business: any }) {
  const supabase = createServerSupabaseClient();
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const [
    { data: activity },
    { data: leaks },
    { data: competitors },
    { data: churnCustomers },
    { data: bookings },
    { data: posToday },
    { data: posYesterday },
    { data: lowStock },
  ] = await Promise.all([
    supabase.from('activity_log').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('profit_leaks').select('*').eq('business_id', business.id).eq('status', 'detected').limit(5),
    supabase.from('competitor_alerts').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('customers').select('*').eq('business_id', business.id).in('churn_risk', ['medium', 'high']).limit(5),
    supabase.from('bookings').select('value').eq('business_id', business.id).gte('date', startOfMonth),
    supabase.from('pos_sales').select('total_amount').eq('business_id', business.id).gte('created_at', `${today}T00:00:00`).eq('status', 'completed'),
    supabase.from('pos_sales').select('total_amount').eq('business_id', business.id).gte('created_at', `${yesterday}T00:00:00`).lt('created_at', `${today}T00:00:00`).eq('status', 'completed'),
    supabase.from('pos_products').select('id, name, stock_quantity, low_stock_threshold').eq('business_id', business.id).eq('track_stock', true).lte('stock_quantity', 5),
  ]);

  const revenueThisMonth = (bookings ?? []).reduce((s: number, b: any) => s + (b.value || 0), 0);
  const posSalesToday = (posToday ?? []).reduce((s: number, s2: any) => s + (s2.total_amount || 0), 0);
  const posSalesYesterday = (posYesterday ?? []).reduce((s: number, s2: any) => s + (s2.total_amount || 0), 0);
  const posDeltaPct = posSalesYesterday > 0 ? Math.round(((posSalesToday - posSalesYesterday) / posSalesYesterday) * 100) : null;
  const totalLeakSavings = (leaks ?? []).reduce((s: number, l: any) => s + (l.monthly_loss || 0), 0);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="relative min-h-full p-6">
      <Blobs />
      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <DashHeader greeting={greeting} ownerName={business.owner_name || 'there'} subtitle="Aria is monitoring your store" />
        <MorningCommandCentre />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Revenue this month"    value={`$${revenueThisMonth.toLocaleString()}`} change="from connected records"        gradient="linear-gradient(135deg,rgba(29,158,117,0.2),rgba(29,158,117,0.05))"  border="rgba(29,158,117,0.3)" />
          <StatCard label="POS sales today"       value={`$${posSalesToday.toFixed(2)}`}          change={posDeltaPct !== null ? `${posDeltaPct > 0 ? '+' : ''}${posDeltaPct}% vs yesterday` : `${(posToday ?? []).length} transactions`} gradient="linear-gradient(135deg,rgba(37,99,235,0.2),rgba(37,99,235,0.05))"   border="rgba(37,99,235,0.3)" />
          <StatCard label="Google rating"         value={business.google_rating ? `${business.google_rating}★` : '—'} change={`${business.google_review_count || 0} reviews`} gradient="linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.05))" border="rgba(245,158,11,0.3)" />
          <StatCard label="Recoverable leaks"     value={`$${totalLeakSavings.toLocaleString()}/mo`} change="from profit leak fixes"  gradient="linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.03))"  border="rgba(239,68,68,0.2)" />
        </div>

        {business?.id && <RevenueChart businessId={business.id} />}

        {/* Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActivityFeed activity={activity} />
          <ProfitLeaks leaks={leaks} totalLeakSavings={totalLeakSavings} />
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Inventory alerts */}
          <DarkCard title="Inventory alerts" badge={lowStock?.length ? `${lowStock.length} low` : undefined} badgeColor="red">
            {!lowStock?.length ? (
              <EmptyState text="All stock levels look healthy" />
            ) : (
              <ul className="space-y-2.5">
                {lowStock.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[rgba(255,255,255,0.7)] truncate">{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      p.stock_quantity === 0 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>{p.stock_quantity === 0 ? 'Out' : `${p.stock_quantity} left`}</span>
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>

          <CompetitorWatch competitors={competitors} />
          <ChurnRisk customers={churnCustomers} />
        </div>

        <CustomFeaturesSection businessId={business.id} />
        <AriaChat ownerName={business.owner_name || 'there'} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   VISA / MIGRATION AGENT
═══════════════════════════════════════════════════════════ */
async function VisaDashboard({ business }: { business: any }) {
  const supabase = createServerSupabaseClient();
  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: clients },
    { data: applications },
    { data: alerts },
    { data: expiringVisas },
    { data: news },
  ] = await Promise.all([
    supabase.from('visa_clients').select('*').eq('business_id', business.id).eq('status', 'active').limit(6),
    supabase.from('visa_applications').select('*').eq('business_id', business.id).eq('status', 'pending').limit(6),
    supabase.from('immigration_alerts').select('*').eq('is_read', false).order('created_at', { ascending: false }).limit(6),
    supabase.from('visa_applications').select('*, visa_clients(name)').eq('business_id', business.id).lte('expiry_date', in90Days).neq('status', 'expired').limit(5),
    supabase.from('immigration_news').select('*').order('published_at', { ascending: false }).limit(5),
  ]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="relative min-h-full p-6">
      <Blobs color1="rgba(37,99,235,0.15)" color2="rgba(124,58,237,0.12)" />
      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <DashHeader greeting={greeting} ownerName={business.owner_name || 'there'} subtitle="VisaAI is monitoring immigration updates" />
        <MorningCommandCentre />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active clients"         value={String(clients?.length ?? 0)}            change="currently active"            gradient="linear-gradient(135deg,rgba(37,99,235,0.2),rgba(37,99,235,0.05))"   border="rgba(37,99,235,0.3)" />
          <StatCard label="Applications pending"   value={String(applications?.length ?? 0)}       change="awaiting decision"           gradient="linear-gradient(135deg,rgba(124,58,237,0.2),rgba(124,58,237,0.05))" border="rgba(124,58,237,0.3)" />
          <StatCard label="Alerts unread"          value={String(alerts?.length ?? 0)}             change="policy changes"              gradient="linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.03))"  border="rgba(239,68,68,0.2)" />
          <StatCard label="Expiring ≤ 90 days"    value={String(expiringVisas?.length ?? 0)}      change="need urgent action"          gradient="linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.05))" border="rgba(245,158,11,0.3)" />
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Policy alerts */}
          <DarkCard title="Live policy alerts" badge={alerts?.length ? `${alerts.length} new` : undefined} badgeColor="red">
            {!alerts?.length ? (
              <EmptyState text="No unread policy alerts" />
            ) : (
              <ul className="space-y-3">
                {alerts.map((a: any) => (
                  <li key={a.id} className="border-b border-[rgba(255,255,255,0.04)] pb-3 last:border-0 last:pb-0">
                    <p className="text-xs text-[rgba(255,255,255,0.8)] font-medium leading-snug">{a.title}</p>
                    <p className="text-[11px] text-[rgba(255,255,255,0.4)] mt-0.5 leading-snug line-clamp-2">{a.description}</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.25)] mt-1">{new Date(a.created_at).toLocaleDateString('en-AU')}</p>
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>

          {/* Recent clients */}
          <DarkCard title="Recent clients" actionHref="/visa/clients" actionLabel="View all">
            {!clients?.length ? (
              <EmptyState text="No active clients yet" linkHref="/visa/clients/new" linkLabel="Add your first client →" />
            ) : (
              <ul className="space-y-2.5">
                {clients.map((c: any) => (
                  <li key={c.id} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[rgba(37,99,235,0.2)] flex items-center justify-center text-[11px] text-[rgba(255,255,255,0.7)] flex-shrink-0 font-medium">
                      {c.name?.[0] ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgba(255,255,255,0.8)] truncate">{c.name}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)]">{c.visa_type ?? 'Visa application'}</p>
                    </div>
                    <StatusPill status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Immigration news */}
          <DarkCard title="Immigration news" actionHref="/visa/news" actionLabel="View all">
            {!news?.length ? (
              <EmptyState text="No news articles loaded yet" />
            ) : (
              <ul className="space-y-3">
                {news.map((n: any) => (
                  <li key={n.id} className="border-b border-[rgba(255,255,255,0.04)] pb-3 last:border-0 last:pb-0">
                    <p className="text-xs text-[rgba(255,255,255,0.8)] font-medium leading-snug">{n.title}</p>
                    <p className="text-[11px] text-[rgba(255,255,255,0.35)] mt-0.5">
                      {n.published_at ? new Date(n.published_at).toLocaleDateString('en-AU') : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>

          {/* Expiring visas */}
          <DarkCard title="Expiring within 90 days" badge={expiringVisas?.length ? `${expiringVisas.length} urgent` : undefined} badgeColor="amber">
            {!expiringVisas?.length ? (
              <EmptyState text="No visas expiring soon" />
            ) : (
              <ul className="space-y-2.5">
                {expiringVisas.map((v: any) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-[rgba(255,255,255,0.8)]">{(v.visa_clients as any)?.name ?? 'Client'}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.35)]">{v.visa_type ?? 'Visa'}</p>
                    </div>
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                      {v.expiry_date ? new Date(v.expiry_date).toLocaleDateString('en-AU') : 'Unknown'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>
        </div>

        <Link href="/visa/ask"
          className="block bg-[rgba(37,99,235,0.08)] border border-[rgba(37,99,235,0.2)] rounded-2xl p-5 hover:bg-[rgba(37,99,235,0.12)] transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-[.15em] text-[#2563eb] font-medium">VisaAI</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb] animate-pulse" />
          </div>
          <p className="text-sm text-[rgba(255,255,255,0.6)]">Ask VisaAI about any immigration policy, client situation, or document requirements.</p>
          <p className="text-xs text-[#2563eb] mt-2">Ask VisaAI something… →</p>
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TRADIE / PROFESSIONAL
═══════════════════════════════════════════════════════════ */
async function TradieProfessionalDashboard({ business }: { business: any }) {
  const supabase = createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    { data: activity },
    { data: todayBookings },
    { data: monthBookings },
    { data: quotes },
    { data: churnCustomers },
    { data: reviews },
  ] = await Promise.all([
    supabase.from('activity_log').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(8),
    supabase.from('bookings').select('*').eq('business_id', business.id).gte('date', `${today}T00:00:00`).lte('date', `${today}T23:59:59`).limit(10),
    supabase.from('bookings').select('value').eq('business_id', business.id).gte('date', startOfMonth),
    supabase.from('quotes').select('*').eq('business_id', business.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
    supabase.from('customers').select('*').eq('business_id', business.id).in('churn_risk', ['medium', 'high']).limit(5),
    supabase.from('customers').select('id, name, google_review_score').eq('business_id', business.id).not('google_review_score', 'is', null).order('created_at', { ascending: false }).limit(5),
  ]);

  const revenue = (monthBookings ?? []).reduce((s: number, b: any) => s + (b.value || 0), 0);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="relative min-h-full p-6">
      <Blobs color1="rgba(124,58,237,0.15)" color2="rgba(29,158,117,0.12)" />
      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <DashHeader greeting={greeting} ownerName={business.owner_name || 'there'} subtitle="Aria is managing your pipeline" />
        <MorningCommandCentre />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Revenue this month"  value={`$${revenue.toLocaleString()}`}               change="from connected records"         gradient="linear-gradient(135deg,rgba(29,158,117,0.2),rgba(29,158,117,0.05))"  border="rgba(29,158,117,0.3)" />
          <StatCard label="Bookings today"       value={String(todayBookings?.length ?? 0)}           change="scheduled jobs"             gradient="linear-gradient(135deg,rgba(124,58,237,0.2),rgba(124,58,237,0.05))" border="rgba(124,58,237,0.3)" />
          <StatCard label="Quotes pending"       value={String(quotes?.length ?? 0)}                  change="need follow-up"             gradient="linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.05))" border="rgba(245,158,11,0.3)" />
          <StatCard label="Google rating"        value={business.google_rating ? `${business.google_rating}★` : '—'} change={`${business.google_review_count || 0} reviews`} gradient="linear-gradient(135deg,rgba(37,99,235,0.2),rgba(37,99,235,0.05))" border="rgba(37,99,235,0.3)" />
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Today's schedule */}
          <DarkCard title="Today's schedule" badge={todayBookings?.length ? `${todayBookings.length} jobs` : undefined} badgeColor="purple">
            {!todayBookings?.length ? (
              <EmptyState text="No bookings scheduled for today" linkHref="/dashboard/bookings" linkLabel="View all bookings →" />
            ) : (
              <ul className="space-y-2.5">
                {todayBookings.map((b: any) => (
                  <li key={b.id} className="flex items-center gap-3 py-2 border-b border-[rgba(255,255,255,0.04)] last:border-0">
                    <div className="text-center w-10 flex-shrink-0">
                      <div className="text-[11px] text-[#1D9E75] font-medium">{b.time ?? '—'}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgba(255,255,255,0.8)] truncate">{b.customer_name ?? b.title ?? 'Job'}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)]">{b.service ?? b.description ?? ''}</p>
                    </div>
                    {b.value ? <span className="text-xs text-[#1D9E75] flex-shrink-0">${b.value}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>

          {/* Pending quotes */}
          <DarkCard title="Quotes needing follow-up" actionHref="/dashboard/quote-builder" actionLabel="View all">
            {!quotes?.length ? (
              <EmptyState text="No pending quotes" linkHref="/dashboard/quote-builder" linkLabel="Create a quote →" />
            ) : (
              <ul className="space-y-2.5">
                {quotes.map((q: any) => (
                  <li key={q.id} className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgba(255,255,255,0.8)] truncate">{q.customer_name ?? q.title ?? 'Quote'}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)]">Sent {q.created_at ? new Date(q.created_at).toLocaleDateString('en-AU') : ''}</p>
                    </div>
                    <span className="text-xs text-[rgba(255,255,255,0.6)] flex-shrink-0">${q.total ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ActivityFeed activity={activity} />
          <ChurnRisk customers={churnCustomers} />
          <DarkCard title="Google rating">
            <div className="text-4xl font-medium text-white mb-1">{business.google_rating || '—'}</div>
            <p className="text-[11px] text-[rgba(255,255,255,0.35)] mb-4">{business.google_review_count || 0} reviews</p>
            {[5,4,3,2,1].map(s => (
              <div key={s} className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] text-[rgba(255,255,255,0.3)] w-3">{s}</span>
                <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: s === Math.round(business.google_rating || 0) ? '60%' : '20%' }} />
                </div>
              </div>
            ))}
          </DarkCard>
        </div>

        <CustomFeaturesSection businessId={business.id} />
        <AriaChat ownerName={business.owner_name || 'there'} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SALON / GYM
═══════════════════════════════════════════════════════════ */
async function SalonGymDashboard({ business }: { business: any }) {
  const supabase = createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: todayBookings },
    { data: monthBookings },
    { data: churnCustomers },
    { data: winbackCandidates },
    { data: slowDays },
  ] = await Promise.all([
    supabase.from('bookings').select('*').eq('business_id', business.id).gte('date', `${today}T00:00:00`).lte('date', `${today}T23:59:59`).limit(10),
    supabase.from('bookings').select('value').eq('business_id', business.id).gte('date', startOfMonth),
    supabase.from('customers').select('*').eq('business_id', business.id).in('churn_risk', ['medium', 'high']).limit(6),
    supabase.from('customers').select('*').eq('business_id', business.id).lte('last_visit', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).limit(5),
    supabase.from('bookings').select('date, count').eq('business_id', business.id).gte('date', today).lte('date', in7Days).limit(7),
  ]);

  const revenue = (monthBookings ?? []).reduce((s: number, b: any) => s + (b.value || 0), 0);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="relative min-h-full p-6">
      <Blobs color1="rgba(236,72,153,0.12)" color2="rgba(124,58,237,0.1)" />
      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <DashHeader greeting={greeting} ownerName={business.owner_name || 'there'} subtitle="Aria is watching your bookings and clients" />
        <MorningCommandCentre />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Revenue this month"   value={`$${revenue.toLocaleString()}`}           change="from connected records"         gradient="linear-gradient(135deg,rgba(29,158,117,0.2),rgba(29,158,117,0.05))"  border="rgba(29,158,117,0.3)" />
          <StatCard label="Bookings today"        value={String(todayBookings?.length ?? 0)}       change="appointments"               gradient="linear-gradient(135deg,rgba(236,72,153,0.2),rgba(236,72,153,0.05))"  border="rgba(236,72,153,0.3)" />
          <StatCard label="Clients at risk"       value={String(churnCustomers?.length ?? 0)}      change="medium or high churn risk"  gradient="linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.03))"  border="rgba(239,68,68,0.2)" />
          <StatCard label="Google rating"         value={business.google_rating ? `${business.google_rating}★` : '—'} change={`${business.google_review_count || 0} reviews`} gradient="linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.05))" border="rgba(245,158,11,0.3)" />
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Today's bookings */}
          <DarkCard title="Today's bookings" badge={todayBookings?.length ? `${todayBookings.length} today` : undefined} badgeColor="pink">
            {!todayBookings?.length ? (
              <EmptyState text="No bookings for today" linkHref="/dashboard/bookings" linkLabel="Add bookings →" />
            ) : (
              <ul className="space-y-2">
                {todayBookings.map((b: any) => (
                  <li key={b.id} className="flex items-center gap-3 py-2 border-b border-[rgba(255,255,255,0.04)] last:border-0">
                    <div className="w-10 text-center flex-shrink-0">
                      <span className="text-[11px] text-[#1D9E75]">{b.time ?? '—'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgba(255,255,255,0.8)] truncate">{b.customer_name ?? b.title ?? 'Booking'}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)]">{b.service ?? b.description ?? ''}</p>
                    </div>
                    <StatusPill status={b.status ?? 'confirmed'} />
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>

          {/* Slow day alert */}
          <DarkCard title="Slow day forecast — next 7 days">
            {!slowDays?.length ? (
              <EmptyState text="No slow day data available" />
            ) : (
              <div className="space-y-2">
                {slowDays.filter((d: any) => typeof d.count === 'number').map((d: any, i: number) => {
                  const count = d.count;
                  const pct = Math.min(100, (count / 10) * 100);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] text-[rgba(255,255,255,0.4)] w-24 flex-shrink-0">
                        {d.date ? new Date(d.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : `Day ${i + 1}`}
                      </span>
                      <div className="flex-1 h-2 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct < 30 ? 'bg-red-400' : pct < 60 ? 'bg-amber-400' : 'bg-[#1D9E75]'}`} style={{ width: (pct + '%') }} />
                      </div>
                      <span className="text-[10px] text-[rgba(255,255,255,0.3)] w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </DarkCard>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Winback */}
          <DarkCard title="Winback opportunities" actionHref="/dashboard/winback" actionLabel="View all">
            {!winbackCandidates?.length ? (
              <EmptyState text="No clients lapsed recently" />
            ) : (
              <ul className="space-y-2.5">
                {winbackCandidates.map((c: any) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[10px] text-[rgba(255,255,255,0.5)] flex-shrink-0">{c.name?.[0] ?? '?'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgba(255,255,255,0.7)] truncate">{c.name}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)]">
                        {c.last_visit ? `Last visit ${new Date(c.last_visit).toLocaleDateString('en-AU')}` : 'No visits recorded'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>

          <ChurnRisk customers={churnCustomers} />
        </div>

        <CustomFeaturesSection businessId={business.id} />
        <AriaChat ownerName={business.owner_name || 'there'} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   REAL ESTATE
═══════════════════════════════════════════════════════════ */
async function RealEstateDashboard({ business }: { business: any }) {
  const supabase = createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: monthBookings },
    { data: todayInspections },
    { data: recentLeads },
    { data: competitors },
    { data: activity },
  ] = await Promise.all([
    supabase.from('bookings').select('value').eq('business_id', business.id).gte('date', startOfMonth),
    supabase.from('bookings').select('*').eq('business_id', business.id).gte('date', `${today}T00:00:00`).lte('date', `${today}T23:59:59`).limit(8),
    supabase.from('customers').select('*').eq('business_id', business.id).gte('created_at', startOfWeek).order('created_at', { ascending: false }).limit(6),
    supabase.from('competitor_alerts').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('activity_log').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(8),
  ]);

  const revenue = (monthBookings ?? []).reduce((s: number, b: any) => s + (b.value || 0), 0);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="relative min-h-full p-6">
      <Blobs color1="rgba(37,99,235,0.12)" color2="rgba(29,158,117,0.1)" />
      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <DashHeader greeting={greeting} ownerName={business.owner_name || 'there'} subtitle="Aria is monitoring your listings and leads" />
        <MorningCommandCentre />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Revenue this month"   value={`$${revenue.toLocaleString()}`}             change="from connected records"      gradient="linear-gradient(135deg,rgba(29,158,117,0.2),rgba(29,158,117,0.05))"  border="rgba(29,158,117,0.3)" />
          <StatCard label="Inspections today"     value={String(todayInspections?.length ?? 0)}      change="scheduled today"         gradient="linear-gradient(135deg,rgba(37,99,235,0.2),rgba(37,99,235,0.05))"   border="rgba(37,99,235,0.3)" />
          <StatCard label="New leads this week"   value={String(recentLeads?.length ?? 0)}           change="potential buyers"        gradient="linear-gradient(135deg,rgba(124,58,237,0.2),rgba(124,58,237,0.05))" border="rgba(124,58,237,0.3)" />
          <StatCard label="Google rating"         value={business.google_rating ? `${business.google_rating}★` : '—'} change={`${business.google_review_count || 0} reviews`} gradient="linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.05))" border="rgba(245,158,11,0.3)" />
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Today's inspections */}
          <DarkCard title="Today's inspections" badge={todayInspections?.length ? `${todayInspections.length} today` : undefined} badgeColor="blue">
            {!todayInspections?.length ? (
              <EmptyState text="No inspections scheduled today" linkHref="/dashboard/bookings" linkLabel="View bookings →" />
            ) : (
              <ul className="space-y-2.5">
                {todayInspections.map((b: any) => (
                  <li key={b.id} className="flex items-center gap-3 py-2 border-b border-[rgba(255,255,255,0.04)] last:border-0">
                    <span className="text-[11px] text-[#1D9E75] w-10 flex-shrink-0">{b.time ?? '—'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgba(255,255,255,0.8)] truncate">{b.title ?? b.customer_name ?? 'Inspection'}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)]">{b.address ?? b.description ?? ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>

          {/* Recent leads */}
          <DarkCard title="New leads this week">
            {!recentLeads?.length ? (
              <EmptyState text="No new leads this week" />
            ) : (
              <ul className="space-y-2.5">
                {recentLeads.map((c: any) => (
                  <li key={c.id} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[10px] text-[rgba(255,255,255,0.5)] flex-shrink-0">{c.name?.[0] ?? '?'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgba(255,255,255,0.7)] truncate">{c.name}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)]">{c.created_at ? new Date(c.created_at).toLocaleDateString('en-AU') : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DarkCard>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActivityFeed activity={activity} />
          <CompetitorWatch competitors={competitors} />
        </div>

        <CustomFeaturesSection businessId={business.id} />
        <AriaChat ownerName={business.owner_name || 'there'} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHARED UI PRIMITIVES
═══════════════════════════════════════════════════════════ */
function Blobs({ color1 = 'rgba(29,158,117,0.15)', color2 = 'rgba(124,58,237,0.12)' }: { color1?: string; color2?: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-30" style={{ background: ('radial-gradient(circle,' + color1 + ' 0%,transparent 70%)') }} />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full opacity-20" style={{ background: ('radial-gradient(circle,' + color2 + ' 0%,transparent 70%)') }} />
    </div>
  );
}

function DashHeader({ greeting, ownerName, subtitle }: { greeting: string; ownerName: string; subtitle: string }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-xl font-medium text-white">{greeting}, {ownerName}</h1>
        <p className="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">{subtitle}</p>
      </div>
      <Link href="/dashboard/ask-aria"
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ background: 'linear-gradient(135deg,#1D9E75,#0fa86d)' }}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
        </svg>
        Ask Aria
      </Link>
    </div>
  );
}

function StatCard({ label, value, change, gradient, border }: { label: string; value: string; change: string; gradient: string; border: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: gradient, borderColor: border }}>
      <p className="text-[10px] uppercase tracking-[.1em] text-[rgba(255,255,255,0.4)] mb-2">{label}</p>
      <p className="text-2xl font-medium text-white mb-1">{value}</p>
      <p className="text-[11px] text-[#1D9E75]">{change}</p>
    </div>
  );
}

function DarkCard({ title, children, badge, badgeColor, actionHref, actionLabel }: {
  title: string; children: React.ReactNode;
  badge?: string; badgeColor?: string;
  actionHref?: string; actionLabel?: string;
}) {
  const badgeCls = badgeColor === 'red' ? 'text-red-400 bg-red-500/20' :
                   badgeColor === 'amber' ? 'text-amber-400 bg-amber-500/20' :
                   badgeColor === 'purple' ? 'text-purple-400 bg-purple-500/20' :
                   badgeColor === 'blue' ? 'text-blue-400 bg-blue-500/20' :
                   badgeColor === 'pink' ? 'text-pink-400 bg-pink-500/20' :
                   'text-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.05)]';
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-white">{title}</h2>
        {badge && <span className={`text-[10px] px-2 py-0.5 rounded-full border border-transparent ${badgeCls}`}>{badge}</span>}
        {actionHref && <Link href={actionHref} className="text-[10px] text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.6)]">{actionLabel}</Link>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text, linkHref, linkLabel }: { text: string; linkHref?: string; linkLabel?: string }) {
  return (
    <div className="py-4 text-center">
      <p className="text-xs text-[rgba(255,255,255,0.25)] mb-2">{text}</p>
      {linkHref && <Link href={linkHref} className="text-xs text-[#1D9E75] hover:underline">{linkLabel}</Link>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'text-[#1D9E75] bg-[rgba(29,158,117,0.15)]',
    pending: 'text-amber-400 bg-amber-500/10',
    confirmed: 'text-blue-400 bg-blue-500/10',
    completed: 'text-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.05)]',
    expired: 'text-red-400 bg-red-500/10',
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full capitalize flex-shrink-0 ${map[status] ?? map.pending}`}>{status}</span>;
}

function ActivityFeed({ activity }: { activity: any[] | null }) {
  const colors: Record<string, string> = { winback: '#1D9E75', review: '#f59e0b', booking: '#7c3aed', leak: '#ef4444', default: '#6b7280' };
  return (
    <DarkCard title="Live activity" badge="Live" badgeColor={undefined}>
      {!activity?.length ? (
        <EmptyState text="No activity yet — Aria will start logging actions here" />
      ) : (
        <ul className="space-y-3">
          {activity.map((item: any) => (
            <li key={item.id} className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: colors[item.action_type] || colors.default }} />
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
    </DarkCard>
  );
}

function ProfitLeaks({ leaks, totalLeakSavings }: { leaks: any[] | null; totalLeakSavings: number }) {
  return (
    <DarkCard title="Profit leaks detected" badge={totalLeakSavings > 0 ? `$${totalLeakSavings.toLocaleString()}/mo recoverable` : undefined} badgeColor="red">
      {!leaks?.length ? (
        <EmptyState text="No leaks detected yet" linkHref="/dashboard/profit-leaks" linkLabel="Run analysis →" />
      ) : (
        <ul className="space-y-3">
          {leaks.map((leak: any) => (
            <li key={leak.id} className="border-b border-[rgba(255,255,255,0.04)] pb-3 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-[rgba(255,255,255,0.7)]">{leak.description}</p>
                <span className="text-[10px] text-red-400 flex-shrink-0">-${leak.monthly_loss}/mo</span>
              </div>
              {leak.fix_suggestion && <p className="text-[10px] text-[#1D9E75] mt-1">{leak.fix_suggestion}</p>}
            </li>
          ))}
        </ul>
      )}
    </DarkCard>
  );
}

function CompetitorWatch({ competitors }: { competitors: any[] | null }) {
  const sev: Record<string, string> = { high: 'text-red-400 bg-red-500/10', medium: 'text-amber-400 bg-amber-500/10', low: 'text-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.05)]' };
  return (
    <DarkCard title="Competitor watch">
      {!competitors?.length ? (
        <EmptyState text="No alerts yet" />
      ) : (
        <ul className="space-y-3">
          {competitors.map((alert: any) => (
            <li key={alert.id} className="flex items-start gap-2">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0 mt-0.5 ${sev[alert.severity] || sev.low}`}>{alert.severity}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[rgba(255,255,255,0.7)]">{alert.competitor_name}</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.35)] mt-0.5 leading-snug">{alert.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DarkCard>
  );
}

function ChurnRisk({ customers }: { customers: any[] | null }) {
  const map: Record<string, string> = { high: 'text-red-400 bg-red-500/10', medium: 'text-amber-400 bg-amber-500/10', low: 'text-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.05)]' };
  return (
    <DarkCard title="Churn risk">
      {!customers?.length ? (
        <EmptyState text="No at-risk customers" />
      ) : (
        <ul className="space-y-2.5">
          {customers.map((c: any) => (
            <li key={c.id} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[10px] text-[rgba(255,255,255,0.5)] flex-shrink-0">{c.name?.[0] ?? '?'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[rgba(255,255,255,0.7)] truncate">{c.name}</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.3)]">{c.last_visit ? `Last visit ${new Date(c.last_visit).toLocaleDateString('en-AU')}` : 'No visits recorded'}</p>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full capitalize flex-shrink-0 ${map[c.churn_risk] || map.low}`}>{c.churn_risk}</span>
            </li>
          ))}
        </ul>
      )}
    </DarkCard>
  );
}

function AriaChat({ ownerName }: { ownerName: string }) {
  const hour = new Date().getHours();
  return (
    <Link href="/dashboard/ask-aria"
      className="block bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-2xl p-5 hover:bg-[rgba(29,158,117,0.12)] transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-[.15em] text-[#1D9E75] font-medium">Aria</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
      </div>
      <p className="text-sm text-[rgba(255,255,255,0.6)]">Good {hour < 12 ? 'morning' : 'afternoon'}, {ownerName}. I&apos;ve been watching your business overnight. Ask me anything or let me run your daily briefing.</p>
      <p className="text-xs text-[#1D9E75] mt-2">Ask Aria something… →</p>
    </Link>
  );
}
