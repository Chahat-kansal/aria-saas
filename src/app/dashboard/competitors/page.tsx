import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function CompetitorsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('id, industry, city')
    .eq('user_id', session.user.id)
    .single();

  const { data: alerts } = await supabase
    .from('competitor_alerts')
    .select('*')
    .eq('business_id', business?.id)
    .order('detected_at', { ascending: false })
    .limit(40);

  const byCompetitor = alerts?.reduce((acc: Record<string, typeof alerts>, a) => {
    const key = a.competitor_name ?? 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {}) ?? {};

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Competitor Intelligence</h1>
        <p style={{ color: '#6b7280' }}>What your competitors are doing in {business?.city ?? 'your area'}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        {[
          { label: 'Competitors Tracked', value: Object.keys(byCompetitor).length },
          { label: 'Total Alerts', value: alerts?.length ?? 0 },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-sm mb-1" style={{ color: '#6b7280' }}>{stat.label}</p>
            <p className="text-2xl font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {Object.keys(byCompetitor).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(byCompetitor).map(([name, items]) => (
            <div key={name} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-4 flex justify-between items-center" style={{ background: '#13131a' }}>
                <h2 className="font-medium text-white">{name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                  {items.length} alert{items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ background: '#0d0d14' }}>
                {items.map(alert => (
                  <div key={alert.id} className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex justify-between items-start">
                      <p className="text-sm text-white">{alert.alert_text}</p>
                      <span className="text-xs ml-4 flex-shrink-0" style={{ color: '#6b7280' }}>
                        {alert.detected_at ? new Date(alert.detected_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    {alert.source_url && (
                      <a href={alert.source_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs mt-1 hover:underline" style={{ color: '#1D9E75' }}>
                        View source →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-white font-medium mb-2">No competitor data yet</p>
          <p className="text-sm" style={{ color: '#6b7280' }}>Ask Aria to research your competitors and it will populate this page automatically.</p>
        </div>
      )}
    </div>
  );
}