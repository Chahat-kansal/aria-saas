'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Business {
  id: string;
  name: string;
  industry: string | null;
  plan: string;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  created_at: string;
  is_active: boolean | null;
  abn: string | null;
  abn_verified: boolean | null;
  abn_status: string | null;
  legal_name: string | null;
  gst_registered: boolean | null;
}

const PLAN_COLORS: Record<string, string> = {
  starter: 'text-[rgba(255,255,255,0.5)] bg-[rgba(255,255,255,0.08)]',
  growth:  'text-blue-400 bg-blue-400/10',
  pro:     'text-purple-400 bg-purple-400/10',
};

const STATUS_COLORS: Record<string, string> = {
  active:   'text-[#1D9E75] bg-[rgba(29,158,117,0.1)]',
  trialing: 'text-amber-400 bg-amber-400/10',
  canceled: 'text-red-400 bg-red-400/10',
  past_due: 'text-red-400 bg-red-400/10',
};

export default function BusinessesSettingsPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setLoading(true);
    const { data } = await supabase
      .from('businesses')
      .select('id, name, industry, plan, subscription_status, stripe_subscription_id, trial_ends_at, created_at, is_active, abn, abn_verified, abn_status, legal_name, gst_registered')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setBusinesses((data ?? []) as Business[]);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function rename(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    await supabase.from('businesses').update({ name: editName.trim() }).eq('id', id);
    setEditingId(null);
    setEditName('');
    setSaving(false);
    load();
  }

  async function softDelete(id: string) {
    setActionLoading(id);
    await supabase.from('businesses').update({ is_active: false }).eq('id', id);
    setConfirmDelete(null);
    setActionLoading(null);
    load();
  }

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, { entity_name?: string; gst_registered?: boolean; active?: boolean }>>({});
  const [verifyErrors, setVerifyErrors] = useState<Record<string, string>>({});

  async function verifyABN(biz: Business) {
    if (!biz.abn) return;
    setVerifyingId(biz.id);
    setVerifyErrors(prev => ({ ...prev, [biz.id]: '' }));
    try {
      const res = await fetch('/api/abn-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abn: biz.abn, businessId: biz.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.found) {
        setVerifyErrors(prev => ({ ...prev, [biz.id]: data.error ?? 'ABN not found in register' }));
      } else {
        setVerifyResults(prev => ({ ...prev, [biz.id]: data }));
        load(); // refresh to show updated verified status
      }
    } catch { setVerifyErrors(prev => ({ ...prev, [biz.id]: 'Could not reach ABN Lookup' })); }
    finally { setVerifyingId(null); }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d0d14] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-white mb-1">Manage Businesses</h1>
          <p className="text-sm text-[rgba(255,255,255,0.4)]">
            All businesses on your account. Billing is managed per business through Stripe.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {businesses.map(biz => {
              const planClass = PLAN_COLORS[biz.plan] ?? PLAN_COLORS.starter;
              const statusClass = STATUS_COLORS[biz.subscription_status ?? 'active'] ?? STATUS_COLORS.active;
              const isEditing = editingId === biz.id;
              const isDeleting = confirmDelete === biz.id;
              const isInactive = !biz.is_active;

              return (
                <div
                  key={biz.id}
                  className={`bg-[rgba(255,255,255,0.03)] border rounded-2xl p-5 ${
                    isInactive ? 'opacity-50 border-[rgba(255,255,255,0.04)]' : 'border-[rgba(255,255,255,0.07)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="text-sm font-semibold text-white bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.15)] rounded-lg px-3 py-1.5 outline-none focus:border-[#1D9E75] flex-1"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && rename(biz.id)}
                          />
                          <button onClick={() => rename(biz.id)} disabled={saving} className="text-[11px] px-3 py-1.5 rounded-lg bg-[#1D9E75] text-white font-semibold disabled:opacity-50">
                            {saving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-[14px] font-semibold text-white truncate">{biz.name}</h3>
                          {isInactive && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
                              Inactive
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${planClass}`}>
                          {biz.plan}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${statusClass}`}>
                          {biz.subscription_status ?? 'active'}
                        </span>
                        {biz.trial_ends_at && (
                          <span className="text-[10px] text-amber-400">
                            Trial ends {new Date(biz.trial_ends_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        <span className="text-[10px] text-[rgba(255,255,255,0.25)] capitalize">{biz.industry}</span>
                        {biz.abn && (
                          <span className="text-[10px] text-[rgba(255,255,255,0.25)]">
                            ABN {biz.abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4')}
                            {biz.abn_verified
                              ? <span className="ml-1 text-green-400">✓ Verified</span>
                              : <span className="ml-1 text-amber-400">• Unverified</span>}
                          </span>
                        )}
                      </div>
                      {/* ABN verification */}
                      {biz.abn && !biz.abn_verified && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => verifyABN(biz)}
                            disabled={verifyingId === biz.id}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-[rgba(45,82,64,0.2)] text-[#7FB897] border border-[rgba(127,184,151,0.2)] hover:bg-[rgba(45,82,64,0.35)] transition-colors disabled:opacity-40"
                          >
                            {verifyingId === biz.id ? 'Verifying…' : 'Verify ABN with ABR'}
                          </button>
                          {verifyErrors[biz.id] && <span className="text-[10px] text-red-400">{verifyErrors[biz.id]}</span>}
                        </div>
                      )}
                      {verifyResults[biz.id] && (
                        <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <p className="text-[11px] text-green-400 font-semibold">✓ Verified with Australian Business Register</p>
                          {verifyResults[biz.id].entity_name && <p className="text-[10px] text-green-300 mt-0.5">Legal name: {verifyResults[biz.id].entity_name}</p>}
                          {verifyResults[biz.id].gst_registered !== undefined && <p className="text-[10px] text-green-300">GST: {verifyResults[biz.id].gst_registered ? 'Registered' : 'Not registered'}</p>}
                        </div>
                      )}
                    </div>

                    {!isInactive && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => { setEditingId(biz.id); setEditName(biz.name); }}
                          className="text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-[rgba(255,255,255,0.05)]"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => setConfirmDelete(biz.id)}
                          className="text-[11px] text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-400/05"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {isDeleting && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <p className="text-[12px] text-red-400 mb-3">
                        This will deactivate <strong>{biz.name}</strong>. Your data is retained for 30 days. This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => softDelete(biz.id)}
                          disabled={actionLoading === biz.id}
                          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === biz.id ? 'Deleting…' : 'Yes, delete it'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors px-3 py-1.5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => router.push('/onboarding/industry?new=true')}
              className="w-full py-4 rounded-2xl border-2 border-dashed border-[rgba(255,255,255,0.1)] text-[12px] font-semibold text-[rgba(255,255,255,0.4)] hover:border-[rgba(255,255,255,0.2)] hover:text-white transition-all"
            >
              + Add another business
            </button>
          </div>
        )}
      </div>
    </div>
  );
}