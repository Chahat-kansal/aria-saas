'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function HoldingPage() {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data } = await supabase
        .from('businesses')
        .select('access_status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data?.access_status === 'active' || data?.access_status === 'approved') {
        router.push('/dashboard');
      }
    }
    check();
    intervalRef.current = setInterval(check, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#f0f5f2] flex flex-col items-center justify-center px-4 py-12" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="text-2xl font-semibold mb-10 text-[#2D5240]" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>aria</div>

      <div className="w-full max-w-md bg-white rounded-2xl border border-[rgba(45,82,64,0.12)] shadow-sm p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-[#f0f5f2] border-2 border-[#7FB897] flex items-center justify-center mx-auto mb-5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="#2D5240" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[#2D5240] mb-2" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
          Your account is under review
        </h1>
        <p className="text-sm text-[rgba(0,0,0,0.5)] mb-6">
          We'll email you within one business day once our team has reviewed your details. There's nothing more you need to do right now.
        </p>
        <div className="bg-[#f8faf9] rounded-xl border border-[rgba(45,82,64,0.1)] p-4 text-sm text-[rgba(0,0,0,0.5)]">
          <p className="font-medium text-[#2D5240] mb-1">What happens next?</p>
          <ul className="space-y-1 text-left list-disc list-inside">
            <li>Our team will verify your business details</li>
            <li>You'll receive an email with the outcome</li>
            <li>Once approved, your full dashboard will be unlocked</li>
          </ul>
        </div>
        <p className="text-xs text-[rgba(0,0,0,0.35)] mt-5">This page will automatically update when your account is approved.</p>
      </div>
    </div>
  );
}
