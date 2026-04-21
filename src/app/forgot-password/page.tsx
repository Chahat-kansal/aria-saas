'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!supabase) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <p>Configuration error — please contact support.</p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback`,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-[#f5f4ef] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-2xl font-medium tracking-tight mb-6">
            aria<span className="text-[#1D9E75]">OS</span>
          </div>
          <h1 className="text-xl font-medium text-[#1a1a16]">Reset your password</h1>
          <p className="text-sm text-[rgba(26,26,22,0.45)] mt-1">
            Enter your email and we&apos;ll send a reset link
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-8 shadow-sm">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[#f0faf6] border border-[rgba(29,158,117,0.2)] flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-[#1D9E75]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#1a1a16]">Check your email</p>
              <p className="text-xs text-[rgba(26,26,22,0.45)] mt-1">
                We sent a reset link to <strong>{email}</strong>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-[#faf9f6] border border-[#eceae3] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1D9E75] focus:shadow-[0_0_0_3px_rgba(29,158,117,0.08)] transition-all placeholder:text-[rgba(26,26,22,0.3)]"
              />
              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1a1a16] hover:bg-[#2d2d25] disabled:opacity-60 text-white py-3 rounded-full font-medium text-sm transition-colors"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-[rgba(26,26,22,0.45)] mt-6">
          <Link href="/login" className="text-[#1D9E75] hover:underline font-medium">
            ← Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
