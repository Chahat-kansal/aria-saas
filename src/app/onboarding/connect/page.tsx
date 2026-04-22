'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ConnectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);

  async function handleLaunch() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('businesses')
        .update({ onboarding_complete: true })
        .eq('user_id', user.id);
    }
    // Full page reload so the server re-reads the latest session cookie
    window.location.href = '/dashboard';
  }

  return (
    <div className="min-h-screen bg-[#f5f4ef] flex flex-col items-center px-4 py-12">
      <div className="text-2xl font-medium tracking-tight mb-10">
        aria<span className="text-[#1D9E75]">OS</span>
      </div>

      <ProgressBar step={4} />

      <div className="w-full max-w-xl bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] shadow-sm p-8 mt-6">
        <button onClick={() => router.back()} className="text-xs text-[rgba(26,26,22,0.4)] hover:text-[#1a1a16] mb-5 flex items-center gap-1 transition-colors">
          ← Back
        </button>

        <h1 className="text-xl font-medium text-[#1a1a16] mb-1">Connect your tools</h1>
        <p className="text-sm text-[rgba(26,26,22,0.45)] mb-6">
          The more Aria knows, the better it works. You can always add these later.
        </p>

        <div className="space-y-3 mb-8">
          {/* Google */}
          <div className="border border-[rgba(0,0,0,0.08)] rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <GoogleIcon />
                  <span className="text-sm font-medium">Google Business Profile</span>
                </div>
                <p className="text-[12px] text-[rgba(26,26,22,0.45)]">Connect to monitor reviews, track your Google rating, and auto-send review requests.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button className="flex items-center gap-2 border border-[rgba(0,0,0,0.15)] rounded-full px-4 py-2 text-xs font-medium hover:border-[#1a1a16] transition-colors">
                <GoogleIcon size={14} /> Connect Google
              </button>
              <button className="text-xs text-[rgba(26,26,22,0.35)] hover:text-[rgba(26,26,22,0.6)] transition-colors">Skip for now</button>
            </div>
          </div>

          {/* Meta */}
          <div className="border border-[rgba(0,0,0,0.08)] rounded-xl p-5">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <MetaIcon />
                <span className="text-sm font-medium">Facebook + Instagram</span>
              </div>
              <p className="text-[12px] text-[rgba(26,26,22,0.45)]">Track leads from social, run campaigns, and pull in booking enquiries automatically.</p>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button className="flex items-center gap-2 border border-[rgba(0,0,0,0.15)] rounded-full px-4 py-2 text-xs font-medium hover:border-[#1a1a16] transition-colors">
                <MetaIcon size={14} /> Connect Meta
              </button>
              <button className="text-xs text-[rgba(26,26,22,0.35)] hover:text-[rgba(26,26,22,0.6)] transition-colors">Skip for now</button>
            </div>
          </div>

          {/* SMS */}
          <div className="border border-[rgba(0,0,0,0.08)] rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium mb-1">SMS (Twilio)</div>
                <p className="text-[12px] text-[rgba(26,26,22,0.45)]">
                  Send winback messages, review requests, and booking reminders via SMS.
                  {process.env.NEXT_PUBLIC_TWILIO_NUMBER && (
                    <span className="ml-1 font-medium text-[#1a1a16]">Your number: {process.env.NEXT_PUBLIC_TWILIO_NUMBER}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSmsEnabled(!smsEnabled)}
                className={`relative w-10 h-5.5 rounded-full flex-shrink-0 transition-colors mt-0.5 ${smsEnabled ? 'bg-[#1D9E75]' : 'bg-[rgba(0,0,0,0.15)]'}`}
                style={{height:'22px',width:'40px'}}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${smsEnabled ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleLaunch}
          disabled={loading}
          className="w-full bg-[#1a1a16] hover:bg-[#2d2d25] disabled:opacity-60 text-white py-3 rounded-full font-medium text-sm transition-colors"
        >
          {loading ? 'Launching…' : 'Launch Aria →'}
        </button>
      </div>
    </div>
  );
}

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function MetaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1,2,3,4].map(s => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors ${
            s < step ? 'bg-[#1D9E75] text-white' :
            s === step ? 'bg-[#1a1a16] text-white' :
            'bg-[rgba(0,0,0,0.08)] text-[rgba(26,26,22,0.35)]'
          }`}>{s < step ? '✓' : s}</div>
          {s < 4 && <div className={`w-8 h-px ${s < step ? 'bg-[#1D9E75]' : 'bg-[rgba(0,0,0,0.1)]'}`} />}
        </div>
      ))}
    </div>
  );
}
