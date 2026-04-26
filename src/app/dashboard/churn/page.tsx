import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function ChurnPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user!.id)
    .single();

  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('business_id', business?.id)
    .lt('last_visit', cutoff30)
    .order('last_visit', { ascending: true })
    .limit(100);

  const at_risk = customers?.filter(c => c.last_visit >= cutoff60) ?? [];
  const lapsed = customers?.filter(c => c.last_visit >= cutoff90 && c.last_visit < cutoff60) ?? [];
  const lost = customers?.filter(c => c.last_visit < cutoff90) ?? [];

  function riskBadge(c: { last_visit: string }) {
    if (c.last_visit >= cutoff60) return { label: 'At Risk', style: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' } };
    if (c.last_visit >= cutoff90) return { label: 'Lapsed', style: { background: 'rgba(249,115,22,0.15)', color: '#f97316' } };
    return { label: 'Lost', style: { background: 'rgba(239,68,68,0.15)', color: '#ef4444' } };
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Churn Risk</h1>
        <p style={{ color: '#6b7280' }}>Customers who haven't returned and need attention</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'At Risk (30-60d)', value: at_risk.length, color: '#fbbf24' },
          { label: 'Lapsed (60-90d)', value: lapsed.length, color: '#f97316' },
          { label: 'Lost (90d+)', value: lost.length, color: '#ef4444' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-sm mb-1" style={{ color: '#6b7280' }}>{stat.label}</p>
            <p className="text-2xl font-semibold" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="font-medium text-white">Customer List</h2>
        </div>
        {customers && customers.length > 0 ? (
          <table className="w-full text-sm" style={{ background: '#0d0d14' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Name', 'Last Visit', 'Total Spend', 'Visits', 'Risk'].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-medium" style={{ color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map(c => {
                const badge = riskBadge(c);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-5 py-3 text-white">{c.name}</td>
                    <td className="px-5 py-3" style={{ color: '#9ca3af' }}>
                      {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3" style={{ color: '#9ca3af' }}>${(c.total_spend ?? 0).toFixed(0)}</td>
                    <td className="px-5 py-3" style={{ color: '#9ca3af' }}>{c.visit_count ?? 0}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs" style={badge.style}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-12 text-center" style={{ color: '#6b7280' }}>
            No at-risk customers found. Great retention!
          </div>
        )}
      </div>
    </div>
  );
}