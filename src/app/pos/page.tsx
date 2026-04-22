import { createServerSupabaseClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function PosDashboard() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: business } = await supabase
    .from('businesses').select('id').eq('user_id', session.user.id).single();
  if (!business) return null;

  const bid = business.id;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [
    { data: todaySales },
    { data: monthSales },
    { count: productCount },
    { count: customerCount },
    { data: topProducts },
    { data: recentSales },
    { data: openSession },
  ] = await Promise.all([
    supabase.from('pos_sales').select('total_amount').eq('business_id', bid).eq('status', 'completed').gte('created_at', todayStart.toISOString()),
    supabase.from('pos_sales').select('total_amount').eq('business_id', bid).eq('status', 'completed').gte('created_at', monthStart.toISOString()),
    supabase.from('pos_products').select('*', { count: 'exact', head: true }).eq('business_id', bid).eq('is_active', true),
    supabase.from('pos_customers').select('*', { count: 'exact', head: true }).eq('business_id', bid),
    supabase.from('pos_sale_items').select('product_id, quantity, pos_products(name)').eq('pos_sales.business_id', bid).limit(5),
    supabase.from('pos_sales').select('*').eq('business_id', bid).order('created_at', { ascending: false }).limit(8),
    supabase.from('pos_cash_sessions').select('*').eq('business_id', bid).is('closed_at', null).single(),
  ]);

  const todayRevenue = (todaySales || []).reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const monthRevenue = (monthSales || []).reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const todayTx = (todaySales || []).length;
  const avgTicket = todayTx > 0 ? todayRevenue / todayTx : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">{greeting}</h1>
          <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">
            {openSession
              ? `Cash session open since ${new Date(openSession.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
              : 'No cash session open — open one to start selling'}
          </p>
        </div>
        <Link href="/pos/terminal"
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
          Open register →
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Today's revenue",    value: `$${todayRevenue.toFixed(2)}`,     g: 'rgba(249,115,22,.18)',   b: 'rgba(249,115,22,.3)' },
          { label: 'Transactions today', value: String(todayTx),                   g: 'rgba(29,158,117,.18)',   b: 'rgba(29,158,117,.3)' },
          { label: 'Avg ticket',         value: `$${avgTicket.toFixed(2)}`,         g: 'rgba(245,158,11,.18)',   b: 'rgba(245,158,11,.3)' },
          { label: 'Month revenue',      value: `$${monthRevenue.toFixed(2)}`,     g: 'rgba(127,119,221,.12)', b: 'rgba(127,119,221,.25)' },
        ].map((s: any) => (
          <div key={s.label} className="rounded-xl p-4 border"
            style={{ background: `linear-gradient(135deg,${s.g},transparent)`, borderColor: s.b }}>
            <p className="text-[10px] uppercase tracking-[.1em] text-[rgba(255,255,255,.4)] mb-2">{s.label}</p>
            <p className="text-2xl font-semibold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-2xl p-5" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">Recent sales</h2>
            <Link href="/pos/sales" className="text-[10px] text-[#F97316] hover:underline">View all</Link>
          </div>
          {!recentSales?.length ? (
            <div className="py-6 text-center">
              <p className="text-xs text-[rgba(255,255,255,.25)] mb-3">No sales yet</p>
              <Link href="/pos/terminal" className="text-xs text-[#F97316] hover:underline">Open the register</Link>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {(recentSales as any[]).map(s => (
                <li key={s.id} className="flex items-center gap-3 border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[rgba(255,255,255,.75)] truncate">
                      Sale #{s.id.slice(-6).toUpperCase()}
                    </p>
                    <p className="text-[10px] text-[rgba(255,255,255,.3)]">
                      {new Date(s.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                      {s.payment_method ? ` · ${s.payment_method}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-white">${Number(s.total_amount || 0).toFixed(2)}</p>
                    <StatusPill status={s.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl p-5" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">Quick links</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/pos/terminal',    label: 'New sale',        desc: 'Open the register',         icon: '🖥' },
              { href: '/pos/products/new',label: 'Add product',     desc: 'Add to catalogue',          icon: '📦' },
              { href: '/pos/sessions',    label: 'Cash sessions',   desc: 'Open / close drawer',       icon: '💵' },
              { href: '/pos/customers',   label: 'Customers',       desc: `${customerCount || 0} total`, icon: '👤' },
            ].map(q => (
              <Link key={q.href} href={q.href}
                className="rounded-xl p-3 border border-white/5 hover:border-[rgba(249,115,22,.3)] hover:bg-[rgba(249,115,22,.05)] transition-all">
                <span className="text-xl block mb-2">{q.icon}</span>
                <p className="text-xs font-medium text-[rgba(255,255,255,.8)]">{q.label}</p>
                <p className="text-[10px] text-[rgba(255,255,255,.3)] mt-0.5">{q.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-white">Catalogue snapshot</h2>
          <Link href="/pos/products" className="text-[10px] text-[#F97316] hover:underline">Manage products</Link>
        </div>
        <p className="text-xs text-[rgba(255,255,255,.4)]">
          {productCount || 0} active product{productCount !== 1 ? 's' : ''} in your catalogue
        </p>
        {!productCount && (
          <Link href="/pos/products/new"
            className="inline-flex items-center gap-2 mt-3 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.25)', color: '#fdba74' }}>
            + Add your first product
          </Link>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    completed: ['#34d399', 'rgba(52,211,153,.12)'],
    pending:   ['#fbbf24', 'rgba(251,191,36,.12)'],
    voided:    ['#f87171', 'rgba(248,113,113,.12)'],
    refunded:  ['#60a5fa', 'rgba(96,165,250,.12)'],
  };
  const [color, bg] = map[status] ?? ['rgba(255,255,255,.35)', 'rgba(255,255,255,.05)'];
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ color, background: bg }}>{label}</span>
  );
}