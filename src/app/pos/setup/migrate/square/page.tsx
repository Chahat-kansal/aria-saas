'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SquareMigratePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/pos/import');
  }, [router]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Manrope',sans-serif" }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Redirecting to Square connection…</p>
    </div>
  );
}
