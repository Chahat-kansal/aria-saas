import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function ReviewsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('id, google_rating, google_review_count')
    .eq('user_id', user!.id)
    .single();

  const { data: reviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('business_id', business?.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const pending = reviews?.filter(r => !r.request_sent_at) ?? [];
  const sent = reviews?.filter(r => r.request_sent_at) ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Reviews</h1>
        <p style={{ color: '#6b7280' }}>Track Google reviews and send review request campaigns</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Google Rating', value: business?.google_rating ? `${business.google_rating} ★` : '—' },
          { label: 'Total Reviews', value: business?.google_review_count ?? 0 },
          { label: 'Requests Sent', value: sent.length },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-sm mb-1" style={{ color: '#6b7280' }}>{stat.label}</p>
            <p className="text-2xl font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="font-medium text-white">Review Requests</h2>
        </div>
        {reviews && reviews.length > 0 ? (
          <table className="w-full text-sm" style={{ background: '#0d0d14' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Customer', 'Phone', 'Status', 'Sent At'].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-medium" style={{ color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviews.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-5 py-3 text-white">{r.customer_name ?? '—'}</td>
                  <td className="px-5 py-3" style={{ color: '#9ca3af' }}>{r.phone ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs"
                      style={r.request_sent_at
                        ? { background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }
                        : { background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                      {r.request_sent_at ? 'Sent' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-5 py-3" style={{ color: '#9ca3af' }}>
                    {r.request_sent_at ? new Date(r.request_sent_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-12 text-center" style={{ color: '#6b7280' }}>
            No review requests yet. Ask Aria to send review requests to recent customers.
          </div>
        )}
      </div>
    </div>
  );
}