import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function BookingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', session.user.id)
    .single();

  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('business_id', business?.id)
    .order('booking_date', { ascending: false })
    .limit(50);

  const upcoming = bookings?.filter(b => b.booking_date && new Date(b.booking_date) >= new Date()) ?? [];
  const past = bookings?.filter(b => b.booking_date && new Date(b.booking_date) < new Date()) ?? [];
  const revenue = bookings?.reduce((sum, b) => sum + (b.amount ?? 0), 0) ?? 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Bookings</h1>
        <p style={{ color: '#6b7280' }}>All appointments and transactions</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Upcoming', value: upcoming.length },
          { label: 'Total Bookings', value: bookings?.length ?? 0 },
          { label: 'Total Revenue', value: `$${revenue.toLocaleString()}` },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-sm mb-1" style={{ color: '#6b7280' }}>{stat.label}</p>
            <p className="text-2xl font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="font-medium text-white">All Bookings</h2>
        </div>
        {bookings && bookings.length > 0 ? (
          <table className="w-full text-sm" style={{ background: '#0d0d14' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Customer', 'Service', 'Date', 'Amount', 'Status'].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-medium" style={{ color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => {
                const isUpcoming = b.booking_date && new Date(b.booking_date) >= new Date();
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-5 py-3 text-white">{b.customer_name ?? '—'}</td>
                    <td className="px-5 py-3" style={{ color: '#9ca3af' }}>{b.service ?? '—'}</td>
                    <td className="px-5 py-3" style={{ color: '#9ca3af' }}>
                      {b.booking_date ? new Date(b.booking_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-white">{b.amount ? `$${b.amount}` : '—'}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs"
                        style={isUpcoming
                          ? { background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }
                          : { background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                        {b.status ?? (isUpcoming ? 'upcoming' : 'completed')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-12 text-center" style={{ color: '#6b7280' }}>
            No bookings yet. Connect your booking system or ask Aria to help import data.
          </div>
        )}
      </div>
    </div>
  );
}