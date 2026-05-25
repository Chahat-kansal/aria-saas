'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Redirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/onboarding'); }, [router]);
  return (
    <div style={{ minHeight: '100vh', background: '#f0f5f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #2D5240', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}
