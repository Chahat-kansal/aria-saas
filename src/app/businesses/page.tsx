'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Business {
  id: string;
  name: string;
  industry: string | null;
  address: string | null;
  city: string | null;
  plan: string;
  owner_name: string | null;
  created_at: string;
  onboarding_complete: boolean;
}

const INDUSTRY_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  retail:       { label: 'Retail Shop',           color: '#2563eb', icon: <ShopIcon /> },
  cafe:         { label: 'Cafe / Restaurant',      color: '#d97706', icon: <CoffeeIcon /> },
  tradie:       { label: 'Tradie',                 color: '#ea580c', icon: <WrenchIcon /> },
  realestate:   { label: 'Real Estate',            color: '#7c3aed', icon: <HomeIcon /> },
  salon:        { label: 'Salon / Beauty',         color: '#db2777', icon: <ScissorsIcon /> },
  visa:         { label: 'Visa / Migration Agent', color: '#0891b2', icon: <PassportIcon /> },
  gym:          { label: 'Gym / Fitness',          color: '#16a34a', icon: <DumbbellIcon /> },
  professional: { label: 'Professional Services',  color: '#475569', icon: <BriefcaseIcon /> },
};

const PLAN_META: Record<string, { label: string; bg: string; text: string }> = {
  starter: { label: 'Starter', bg: 'rgba(0,0,0,.06)',           text: 'rgba(26,26,22,.5)'  },
  growth:  { label: 'Growth',  bg: 'rgba(37,99,235,.1)',        text: '#2563eb'            },
  pro:     { label: 'Pro',     bg: 'rgba(124,58,237,.1)',       text: '#7c3aed'            },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BusinessesPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'there');

      const { data: bizList } = await supabase
        .from('businesses')
        .select('id, name, industry, address, city, plan, owner_name, created_at, onboarding_complete')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setBusinesses(bizList ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function selectBusiness(id: string) {
    setSelecting(id);
    try {
      localStorage.setItem('aria_active_business_id', id);
      // Upsert active business record
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: existing } = await supabase
          .from('user_active_business')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (existing) {
          await supabase.from('user_active_business').update({ business_id: id, updated_at: new Date().toISOString() }).eq('user_id', user.id);
        } else {
          await supabase.from('user_active_business').insert({ user_id: user.id, business_id: id });
        }
      }
      router.push('/dashboard');
    } catch {
      setSelecting(null);
    }
  }

  async function signOut() {
    setSigningOut(true);
    localStorage.removeItem('aria_active_business_id');
    await supabase.auth.signOut();
    router.push('/login');
  }

  const firstName = userName.split(' ')[0];

  return (
    <div className="min-h-screen" style={{ background: '#f5f4ef' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-[rgba(0,0,0,.07)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg,#1a1a16,#333)' }}>
            A
          </div>
          <span className="text-[15px] font-semibold text-[#1a1a16]">
            aria<span style={{ color: '#1D9E75' }}>OS</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[rgba(26,26,22,.45)] hidden sm:block">{userName}</span>
          <button onClick={signOut} disabled={signingOut}
            className="text-xs text-[rgba(26,26,22,.5)] hover:text-[#1a1a16] transition-colors disabled:opacity-40 flex items-center gap-1.5">
            <SignOutIcon />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero text */}
        <div className="mb-8">
          <h1 className="text-[28px] font-medium text-[#1a1a16] leading-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-[rgba(26,26,22,.5)] mt-1.5">
            Select a business to continue
          </p>
        </div>

        {/* Business grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="h-52 rounded-2xl bg-white border border-[rgba(0,0,0,.08)] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {businesses.map(biz => {
              const meta = INDUSTRY_META[biz.industry ?? 'professional'] ?? INDUSTRY_META.professional;
              const plan = PLAN_META[biz.plan] ?? PLAN_META.starter;
              const isSelecting = selecting === biz.id;
              return (
                <div
                  key={biz.id}
                  onClick={() => !selecting && selectBusiness(biz.id)}
                  className={`bg-white rounded-2xl border p-6 cursor-pointer transition-all duration-200 select-none
                    ${selecting && !isSelecting ? 'opacity-50 cursor-not-allowed' : ''}
                    ${!selecting ? 'hover:-translate-y-0.5 hover:border-[rgba(0,0,0,.18)] hover:shadow-lg' : ''}
                    ${isSelecting ? 'border-[rgba(0,0,0,.18)] shadow-lg' : 'border-[rgba(0,0,0,.08)]'}
                  `}
                  style={{ boxShadow: isSelecting ? '0 4px 24px rgba(0,0,0,.09)' : undefined }}
                >
                  {/* Icon + badges row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${meta.color}18`, color: meta.color }}>
                      {meta.icon}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] px-2.5 py-1 rounded-full font-medium"
                        style={{ background: plan.bg, color: plan.text }}>
                        {plan.label}
                      </span>
                    </div>
                  </div>

                  {/* Business name */}
                  <h2 className="text-[17px] font-semibold text-[#1a1a16] leading-tight mb-1 truncate">
                    {biz.name}
                  </h2>

                  {/* Industry badge */}
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium mb-3"
                    style={{ background: `${meta.color}14`, color: meta.color }}>
                    {meta.label}
                  </span>

                  {/* Location */}
                  {(biz.address || biz.city) && (
                    <p className="text-xs text-[rgba(26,26,22,.4)] mb-3 truncate">
                      {[biz.address, biz.city].filter(Boolean).join(', ')}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-[rgba(0,0,0,.06)]">
                    <span className="text-[10px] text-[rgba(26,26,22,.35)]">
                      Created {timeAgo(biz.created_at)}
                    </span>
                    <button
                      disabled={!!selecting}
                      className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-all disabled:opacity-50"
                      style={{
                        background: isSelecting ? meta.color : '#1a1a16',
                        color: '#fff',
                      }}
                    >
                      {isSelecting ? (
                        <span className="flex items-center gap-1.5">
                          <Spinner /> Opening…
                        </span>
                      ) : 'Open Dashboard'}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add new business card */}
            <button
              onClick={() => router.push('/onboarding/industry')}
              disabled={!!selecting}
              className="bg-white rounded-2xl border-2 border-dashed border-[rgba(0,0,0,.12)] p-6 flex flex-col items-center justify-center gap-3 transition-all hover:border-[rgba(0,0,0,.25)] hover:bg-[rgba(0,0,0,.01)] disabled:opacity-40 min-h-[200px]"
            >
              <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,.05)] flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-[rgba(26,26,22,.4)]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[13px] font-semibold text-[rgba(26,26,22,.6)]">Add New Business</p>
                <p className="text-xs text-[rgba(26,26,22,.35)] mt-0.5">Register another business</p>
              </div>
            </button>
          </div>
        )}

        {!loading && businesses.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-[rgba(26,26,22,.45)] mb-4">No businesses yet — let&apos;s set one up.</p>
            <button onClick={() => router.push('/onboarding/industry')}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#1a1a16' }}>
              Get started →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── Icons ─────────────────────────────────────────────────────── */
function ShopIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 2.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z"/></svg>; }
function CoffeeIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/></svg>; }
function WrenchIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"/></svg>; }
function HomeIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>; }
function ScissorsIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path strokeLinecap="round" d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></svg>; }
function PassportIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"/></svg>; }
function DumbbellIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"/></svg>; }
function BriefcaseIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"/></svg>; }
function SignOutIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>; }
function Spinner()       { return <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>; }