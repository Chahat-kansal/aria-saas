import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function ProfitLeaksPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user!.id)
    .single();

  const { data: leaks } = await supabase
    .from('profit_leaks')
    .select('*')
    .eq('business_id', business?.id)
    .order('estimated_loss', { ascending: false });

  const totalLoss = leaks?.reduce((sum, l) => sum + (l.estimated_loss ?? 0), 0) ?? 0;
  const fixed = leaks?.filter(l => l.status === 'fixed') ?? [];
  const active = leaks?.filter(l => l.status !== 'fixed') ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Profit Leaks</h1>
        <p style={{ color: '#6b7280' }}>Revenue you're losing and how to stop it</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Exposure', value: `$${totalLoss.toLocaleString()}`, warn: true },
          { label: 'Active Leaks', value: active.length },
          { label: 'Fixed', value: fixed.length },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-sm mb-1" style={{ color: '#6b7280' }}>{stat.label}</p>
            <p className="text-2xl font-semibold" style={{ color: (stat as any).warn && totalLoss > 0 ? '#ef4444' : '#fff' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {leaks && leaks.length > 0 ? leaks.map(leak => (
          <div key={leak.id} className="rounded-xl p-5 flex gap-4 items-start" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex-shrink-0 w-2 h-2 rounded-full mt-2"
              style={{ background: leak.status === 'fixed' ? '#1D9E75' : '#ef4444' }} />
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <p className="font-medium text-white">{leak.title}</p>
                <p className="text-sm font-semibold" style={{ color: leak.status === 'fixed' ? '#1D9E75' : '#ef4444' }}>
                  {leak.status === 'fixed' ? 'Fixed' : `-$${(leak.estimated_loss ?? 0).toLocaleString()}/mo`}
                </p>
              </div>
              {leak.description && (
                <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>{leak.description}</p>
              )}
              {leak.recommendation && (
                <p className="text-sm mt-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(29,158,117,0.08)', color: '#1D9E75' }}>
                  💡 {leak.recommendation}
                </p>
              )}
            </div>
          </div>
        )) : (
          <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-white font-medium mb-2">No leaks detected yet</p>
            <p className="text-sm" style={{ color: '#6b7280' }}>Ask Aria to run a profit analysis to find where you're losing money.</p>
          </div>
        )}
      </div>
    </div>
  );
}