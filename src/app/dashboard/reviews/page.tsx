'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Review { id: string; rating: number | null; text: string | null; reviewer_name: string | null; created_at: string; response: string | null; responded_at: string | null; platform: string | null; }
interface Customer { id: string; name: string; phone: string | null; }

function Stars({ rating }: { rating: number | null }) {
  const n = rating ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(s => (
        <svg key={s} className="w-3.5 h-3.5" fill={s <= n ? '#f59e0b' : 'none'} stroke={s <= n ? '#f59e0b' : '#4b5563'} viewBox="0 0 24 24" strokeWidth={1.5}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const { business } = useBusinessContext();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftLoading, setDraftLoading] = useState<Record<string, boolean>>({});
  const [selectedCustomers, setSelectedCustomers] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [revRes, custRes, campRes] = await Promise.all([
      fetch(`/api/reviews?business_id=${business.id}`).then(r => r.json()).catch(() => ({ reviews: [] })),
      fetch(`/api/customers?business_id=${business.id}&recent=7`).then(r => r.json()).catch(() => ({ customers: [] })),
      fetch(`/api/campaigns?business_id=${business.id}&type=review_request`).then(r => r.json()).catch(() => ({ campaigns: [] })),
    ]);
    const revs = revRes.reviews ?? revRes.data ?? [];
    setReviews(revs);
    const custs: Customer[] = custRes.customers ?? custRes.data ?? [];
    setCustomers(custs);
    setCampaigns(campRes.campaigns ?? []);
    const initSel: Record<string, boolean> = {};
    custs.forEach((c: Customer) => { if (c.phone) initSel[c.id] = true; });
    setSelectedCustomers(initSel);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function getDraft(reviewId: string) {
    if (!business?.id) return;
    setDraftLoading(p => ({ ...p, [reviewId]: true }));
    const res = await fetch('/api/aria/draft-review-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_id: reviewId, business_id: business.id }),
    }).then(r => r.json()).catch(() => ({}));
    if (res.draft) setDrafts(p => ({ ...p, [reviewId]: res.draft }));
    setDraftLoading(p => ({ ...p, [reviewId]: false }));
  }

  async function markReplied(reviewId: string) {
    if (!business?.id || !drafts[reviewId]) return;
    await fetch('/api/aria/draft-review-reply', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_id: reviewId, business_id: business.id, response: drafts[reviewId] }),
    });
    load();
  }

  async function sendReviewRequests() {
    if (!business?.id) return;
    setSending(true);
    const targets = customers.filter(c => selectedCustomers[c.id] && c.phone);
    let sent = 0;
    for (const c of targets) {
      await fetch('/api/aria/review-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: c.id, businessId: business.id }),
      }).then(r => r.json()).then(d => { if (d.sms_sent || d.success) sent++; }).catch(() => null);
    }
    setSendResult(`Sent to ${sent} of ${targets.length} customers.`);
    setSending(false);
    load();
  }

  const unanswered = reviews.filter(r => !r.response && !r.responded_at);
  const answered = reviews.filter(r => r.response || r.responded_at);
  const avgRating = reviews.length ? (reviews.filter(r => r.rating).reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.filter(r => r.rating).length) : null;
  const thisMonthCampaigns = campaigns.filter(c => c.created_at && new Date(c.created_at) > new Date(Date.now() - 30 * 86400000)).length;
  const withPhone = customers.filter(c => selectedCustomers[c.id] && c.phone).length;

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-48" />
        <div className="grid grid-cols-4 gap-4"><div className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl col-span-4" /></div>
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Reviews & Reputation</h1>
        <p style={{ color: '#6b7280' }}>Manage your Google reviews and send review request campaigns</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Google rating', value: business?.google_rating ? `${business.google_rating} ★` : avgRating ? `${avgRating.toFixed(1)} ★` : '—', color: '#f59e0b' },
          { label: 'Total reviews', value: business?.google_review_count ?? reviews.length, color: '#fff' },
          { label: 'Unanswered', value: unanswered.length, color: unanswered.length > 0 ? '#ef4444' : '#1D9E75' },
          { label: 'Requests this month', value: thisMonthCampaigns, color: '#fff' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
            <p className="text-xl font-semibold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {sendResult && (
        <div className="mb-4 px-4 py-3 rounded-xl" style={{ background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.2)' }}>
          <p className="text-sm" style={{ color: '#1D9E75' }}>{sendResult}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send review requests */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="font-medium text-white">Send review requests</h2>
            <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Customers from the last 7 days</p>
          </div>
          <div style={{ background: '#0d0d14' }}>
            {customers.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm" style={{ color: '#6b7280' }}>No recent customers found. Sales in the last 7 days will appear here.</p>
              </div>
            ) : (
              <>
                {customers.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center gap-3">
                      {c.phone ? (
                        <input type="checkbox" checked={!!selectedCustomers[c.id]} onChange={e => setSelectedCustomers(p => ({ ...p, [c.id]: e.target.checked }))} className="w-4 h-4 accent-[#1D9E75]" />
                      ) : <div className="w-4 h-4" />}
                      <div>
                        <p className="text-sm text-white">{c.name}</p>
                        {!c.phone && <p className="text-xs" style={{ color: '#4b5563' }}>No phone</p>}
                      </div>
                    </div>
                    <p className="text-xs" style={{ color: '#6b7280' }}>{c.phone ?? '—'}</p>
                  </div>
                ))}
                <div className="px-5 py-4">
                  <button onClick={sendReviewRequests} disabled={sending || withPhone === 0}
                    className="w-full py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                    style={{ background: '#1D9E75' }}>
                    {sending ? 'Sending…' : `Send to ${withPhone} customer${withPhone !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Unanswered reviews */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="font-medium text-white">Unanswered reviews</h2>
            {unanswered.length > 0 && <p className="text-xs mt-0.5" style={{ color: '#ef4444' }}>{unanswered.length} need a reply</p>}
          </div>
          <div style={{ background: '#0d0d14' }}>
            {unanswered.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm" style={{ color: '#1D9E75' }}>All reviews answered! 🎉</p>
                {reviews.length === 0 && <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Reviews will appear here once synced from Google.</p>}
              </div>
            ) : (
              unanswered.map(r => (
                <div key={r.id} className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">{r.reviewer_name ?? 'Anonymous'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Stars rating={r.rating} />
                        <span className="text-xs" style={{ color: '#6b7280' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                      </div>
                    </div>
                  </div>
                  {(r.text) && <p className="text-xs mb-3 leading-relaxed" style={{ color: '#9ca3af' }}>"{r.text}"</p>}

                  {drafts[r.id] ? (
                    <div>
                      <textarea value={drafts[r.id]} onChange={e => setDrafts(p => ({ ...p, [r.id]: e.target.value }))} rows={3}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none resize-none mb-2"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }} />
                      <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard.writeText(drafts[r.id]); }} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Copy</button>
                        <button onClick={() => markReplied(r.id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#1D9E75', color: '#fff' }}>Mark replied</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => getDraft(r.id)} disabled={draftLoading[r.id]}
                      className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1"
                      style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
                      {draftLoading[r.id] ? <><span className="inline-block w-2.5 h-2.5 border border-[#1D9E75] border-t-transparent rounded-full animate-spin" />Drafting…</> : '✦ Draft reply with Aria'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Answered reviews */}
      {answered.length > 0 && (
        <div className="mt-6 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="font-medium text-white">Replied reviews ({answered.length})</h2>
          </div>
          <div style={{ background: '#0d0d14' }}>
            {answered.map(r => (
              <div key={r.id} className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">{r.reviewer_name ?? 'Anonymous'}</p>
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>Replied</span>
                  </div>
                </div>
                {r.text && <p className="text-xs" style={{ color: '#6b7280' }}>"{r.text.slice(0, 100)}{r.text.length > 100 ? '…' : ''}"</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
