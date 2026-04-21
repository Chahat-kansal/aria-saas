import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function WinbackPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', session.user.id)
    .single();

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('business_id', business?.id)
    .order('created_at', { ascending: false })
    .limit(30);

  const { data: churnCustomers } = await supabase
    .from('customers')
    .select('id, name, phone, last_visit, total_spend')
    .eq('business_id', business?.id)
    .lt('last_visit', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
    .order('last_visit', { ascending: true })
    .limit(20);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Winback Campaigns</h1>
        <p style={{ color: '#6b7280' }}>Re-engage customers who haven't visited in 60+ days</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Campaigns', value: campaigns?.length ?? 0 },
          { label: 'Lapsed Customers', value: churnCustomers?.length ?? 0 },
          { label: 'Completed', value: campaigns?.filter(c => c.status === 'completed').length ?? 0 },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-sm mb-1" style={{ color: '#6b7280' }}>{stat.label}</p>
            <p className="text-2xl font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="font-medium text-white">Lapsed Customers</h2>
          </div>
          <div style={{ background: '#0d0d14' }}>
            {churnCustomers && churnCustomers.length > 0 ? churnCustomers.map(c => (
              <div key={c.id} className="px-5 py-3 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                    Last visit: {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
                <p className="text-xs" style={{ color: '#9ca3af' }}>${c.total_spend?.toFixed(0) ?? 0} LTV</p>
              </div>
            )) : (
              <p className="px-5 py-8 text-center text-sm" style={{ color: '#6b7280' }}>No lapsed customers found.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="font-medium text-white">Campaign History</h2>
          </div>
          <div style={{ background: '#0d0d14' }}>
            {campaigns && campaigns.length > 0 ? campaigns.map(c => (
              <div key={c.id} className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium text-white">{c.name ?? 'Winback Campaign'}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>
                    {c.status ?? 'sent'}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
                  {c.recipients_count ?? 0} recipients · {new Date(c.created_at).toLocaleDateString()}
                </p>
              </div>
            )) : (
              <p className="px-5 py-8 text-center text-sm" style={{ color: '#6b7280' }}>
                No campaigns yet. Ask Aria to run a winback campaign.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}