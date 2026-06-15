'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// AUTH-FIX BUG 2 — "Check your email" screen. Password signups land here (not onboarding)
// until they confirm. Google OAuth users are pre-verified and never reach this page.
export default function VerifyEmailPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get('email') ?? '');
    // If the user is already confirmed (e.g. landed here by mistake), move them along.
    if (supabase) {
      void (async () => {
        const { data } = await supabase!.auth.getUser();
        if (data?.user?.email_confirmed_at) window.location.href = '/onboarding';
      })();
    }
  }, []);

  async function resend() {
    if (!email || !supabase) return;
    setSending(true); setErr(''); setMsg('');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? location.origin}/auth/callback` },
      });
      if (error) { setErr(error.message); return; }
      setMsg('Verification email sent — check your inbox.');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not resend — try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f4ef] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-2xl font-medium tracking-tight mb-6">
          aria<span className="text-[#1D9E75]">OS</span>
        </div>
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-8 shadow-sm">
          <div className="text-4xl mb-3" aria-hidden>✉️</div>
          <h1 className="text-xl font-medium text-[#1a1a16] mb-1">Check your email</h1>
          <p className="text-sm text-[rgba(26,26,22,0.55)] leading-relaxed">
            We&apos;ve sent a verification link{email ? <> to <strong className="text-[#1a1a16]">{email}</strong></> : ''}.
            Click it to confirm your account and start your free trial.
          </p>

          <button
            onClick={resend}
            disabled={sending || !email}
            className="w-full mt-6 bg-[#1a1a16] hover:bg-[#2d2d25] disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 rounded-full font-medium text-sm transition-colors"
          >
            {sending ? 'Sending…' : 'Resend verification email'}
          </button>

          {msg && <p className="text-xs text-[#1D9E75] mt-3">{msg}</p>}
          {err && <p className="text-xs text-red-500 mt-3">{err}</p>}

          <p className="text-xs text-[rgba(26,26,22,0.4)] mt-5">
            Already verified? <Link href="/login" className="text-[#1D9E75] hover:underline font-medium">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
