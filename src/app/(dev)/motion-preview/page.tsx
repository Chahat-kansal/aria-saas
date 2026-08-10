'use client';

import { useState } from 'react';
import VerifyCore, { type VerifyStatus } from '@/components/aria-motion/VerifyCore';

export default function MotionPreviewPage() {
  const [status, setStatus] = useState<VerifyStatus>('idle');

  // Fake latency so we can watch the orbit loop. Real pages call their API here.
  async function submit(code: string) {
    setStatus('verifying');
    await new Promise((r) => setTimeout(r, 2600));
    setStatus(code === '4719' ? 'success' : 'error');
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#070C0A',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
      }}
    >
      <div style={{ width: 'min(680px, 100%)' }}>
        <VerifyCore
          status={status}
          onComplete={submit}
          onSuccessAnimationEnd={() => console.log('success animation done')}
          surface="#070C0A"
          height={460}
        />
      </div>
      <button
        onClick={() => setStatus('idle')}
        style={{
          fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: '#7d918a', background: 'transparent',
          border: '1px solid rgba(127,184,151,0.2)', padding: '9px 16px',
          borderRadius: 999, cursor: 'pointer',
        }}
      >
        Reset
      </button>
      <p style={{ fontSize: 11, color: '#4a5854', letterSpacing: '0.05em' }}>
        4719 succeeds · any other code fails
      </p>
    </main>
  );
}
