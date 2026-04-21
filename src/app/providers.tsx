'use client';
import { Toaster } from 'react-hot-toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: '#1f1f2a', color: '#f0f0f5', border: '1px solid rgba(255,255,255,0.1)' },
        }}
      />
    </>
  );
}