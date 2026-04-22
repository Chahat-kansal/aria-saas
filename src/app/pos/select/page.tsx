'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Outlet {
  id: string;
  name: string;
  address: string | null;
}

export default function SelectOutletPage() {
  const router = useRouter();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!business) { router.push('/onboarding/industry'); return; }

      const { data } = await supabase
        .from('pos_outlets')
        .select('id, name, address')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .order('name');

      setOutlets(data || []);
      setLoading(false);
    }
    load();
  }, [router]);

  function select(id: string | null) {
    setSelecting(id ?? 'global');
    try { localStorage.setItem('pos_outlet_id', id ?? ''); } catch {}
    router.push('/pos/terminal');
  }

  return (
    <div className="min-h-screen bg-[#f5f4ef] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold"
              style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>P</div>
            <span className="text-xl font-semibold text-[#1a1a16]">AriaPOS</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] shadow-sm overflow-hidden">
          <div className="px-8 pt-8 pb-6 border-b border-[rgba(0,0,0,0.06)]">
            <h1 className="text-[22px] font-semibold text-[#1a1a16] leading-tight">Location Selector</h1>
            <p className="text-sm text-[rgba(26,26,22,0.5)] mt-2 leading-relaxed">
              Please select which location best describes where your device is located.
            </p>
          </div>

          <div className="px-8 py-6">
            <p className="text-xs font-medium text-[rgba(26,26,22,0.45)] uppercase tracking-wider mb-4">
              Which outlet are you currently in?
            </p>

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-[64px] rounded-xl bg-[rgba(0,0,0,0.04)] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {outlets.map(outlet => (
                  <button
                    key={outlet.id}
                    onClick={() => select(outlet.id)}
                    disabled={!!selecting}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-[rgba(0,0,0,0.08)] hover:border-[#2563eb] hover:bg-[rgba(37,99,235,0.04)] transition-all text-left group disabled:opacity-50 disabled:cursor-wait"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[rgba(37,99,235,0.1)] flex items-center justify-center flex-shrink-0 group-hover:bg-[rgba(37,99,235,0.15)] transition-colors">
                      <PinIcon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#1a1a16]">{outlet.name}</p>
                      {outlet.address && (
                        <p className="text-[11px] text-[rgba(26,26,22,0.45)] mt-0.5 truncate">{outlet.address}</p>
                      )}
                    </div>
                    {selecting === outlet.id ? (
                      <Spinner />
                    ) : (
                      <ChevronRight />
                    )}
                  </button>
                ))}

                {/* Global mode */}
                <button
                  onClick={() => select(null)}
                  disabled={!!selecting}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-dashed border-[rgba(0,0,0,0.12)] hover:border-[rgba(0,0,0,0.25)] hover:bg-[rgba(0,0,0,0.02)] transition-all text-left group disabled:opacity-50 disabled:cursor-wait"
                >
                  <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.04)] flex items-center justify-center flex-shrink-0 group-hover:bg-[rgba(0,0,0,0.07)] transition-colors">
                    <GlobeIcon />
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[#1a1a16]">Not at an Outlet</p>
                    <p className="text-[11px] text-[rgba(26,26,22,0.45)] mt-0.5">Global Mode — no outlet assigned</p>
                  </div>
                  {selecting === 'global' ? <Spinner /> : <ChevronRight />}
                </button>

                {outlets.length === 0 && (
                  <p className="text-center text-xs text-[rgba(26,26,22,0.4)] pt-2 pb-1">
                    No outlets set up yet.{' '}
                    <a href="/pos/outlets" className="text-[#2563eb] hover:underline">Add an outlet →</a>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-[rgba(26,26,22,0.3)] mt-6">
          You can change your outlet at any time from the register settings.
        </p>
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#2563eb]">
      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[rgba(26,26,22,0.4)]">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd"/>
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[rgba(26,26,22,0.25)] flex-shrink-0">
      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 text-[#2563eb] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}