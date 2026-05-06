'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { POSUserLogin } from '@/components/pos/POSUserLogin';

const POS_USER_KEY = 'aria_pos_user';

interface DeviceInfo { businessId: string; businessName: string; }

function setEmployeeCookie(role: string) {
  const restricted = ['cashier', 'supervisor'].includes(role);
  if (restricted) {
    document.cookie = `pos_emp=${role}; path=/; SameSite=Lax; max-age=43200`; // 12h
  } else {
    document.cookie = 'pos_emp=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }
}

export default function PosLoginPage() {
  const [device,   setDevice]   = useState<DeviceInfo | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // If already logged into POS, go directly
    try {
      const stored = localStorage.getItem(POS_USER_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const TTL = 12 * 3600 * 1000;
        if (!parsed.loginAt || Date.now() - parsed.loginAt < TTL) {
          window.location.replace('/pos');
          return;
        } else {
          localStorage.removeItem(POS_USER_KEY);
        }
      }
    } catch { /* ignore */ }

    // Check whether owner Supabase session is active on this device
    fetch('/api/pos/products?limit=1')
      .then(r => r.json())
      .then(d => {
        if (d.business_id) {
          // Save device enrollment for later use
          try {
            localStorage.setItem('pos_device_bid',  d.business_id);
            if (d.business_name) localStorage.setItem('pos_device_bname', d.business_name);
          } catch { /* ignore */ }
          const bname = d.business_name
            || (() => { try { return localStorage.getItem('pos_device_bname') || 'AriaPOS'; } catch { return 'AriaPOS'; } })();
          setDevice({ businessId: d.business_id, businessName: bname });
        } else {
          // Try cached device info from a previous owner login
          try {
            const bid   = localStorage.getItem('pos_device_bid');
            const bname = localStorage.getItem('pos_device_bname') || 'AriaPOS';
            if (bid) setDevice({ businessId: bid, businessName: bname });
            else setDevice(null);
          } catch { setDevice(null); }
        }
      })
      .catch(() => {
        try {
          const bid   = localStorage.getItem('pos_device_bid');
          const bname = localStorage.getItem('pos_device_bname') || 'AriaPOS';
          if (bid) setDevice({ businessId: bid, businessName: bname });
          else setDevice(null);
        } catch { setDevice(null); }
      })
      .finally(() => setChecking(false));
  }, []);

  function handleLogin(user: { id: string; name: string; role: string; permissions: Record<string, unknown> }) {
    const withTime = { ...user, loginAt: Date.now() };
    try { localStorage.setItem(POS_USER_KEY, JSON.stringify(withTime)); } catch { /* ignore */ }
    setEmployeeCookie(user.role);
    window.location.replace('/pos');
  }

  function handleSkip() {
    const owner = {
      id: 'owner', name: 'Owner', role: 'owner',
      permissions: { can_apply_discount: true, can_refund: true, max_discount_pct: 100, can_close_register: true, can_override_price: true },
      loginAt: Date.now(),
    };
    try { localStorage.setItem(POS_USER_KEY, JSON.stringify(owner)); } catch { /* ignore */ }
    setEmployeeCookie('owner');
    window.location.replace('/pos');
  }

  // Loading
  if (checking) {
    return (
      <div style={{ minHeight: '100dvh', background: '#0A0910', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.25)', borderTopColor: '#8B5CF6', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Device not enrolled — owner must log in first
  if (!device) {
    return (
      <div style={{ minHeight: '100dvh', background: '#0A0910', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: "'Manrope',system-ui,sans-serif", textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Background orbs */}
        <div style={{ position: 'absolute', width: 400, height: 400, top: '-100px', left: '-100px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.12),transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 300, height: 300, bottom: '-80px', right: '-80px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(99,102,241,0.1),transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', fontSize: 38, color: '#8B5CF6', marginBottom: 4, lineHeight: 1 }}>AriaPOS</p>
          <p style={{ fontSize: 13, color: '#8B85A8', marginBottom: 36 }}>Staff Login</p>

          <div style={{ background: 'rgba(26,23,40,0.85)', backdropFilter: 'blur(24px)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 22, padding: '36px 40px', maxWidth: 440, width: '100%' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>🔐</div>
            <p style={{ fontSize: 19, fontWeight: 700, color: '#EDE8FF', marginBottom: 10 }}>Device not set up</p>
            <p style={{ fontSize: 13, color: '#8B85A8', marginBottom: 28, lineHeight: 1.7 }}>
              The business owner must log in to ARIA OS on this device first.
              Once set up, staff can use their PIN to log in here.
            </p>
            <Link href="/login" style={{ display: 'block', padding: '13px 0', borderRadius: 13, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#fff', background: '#8B5CF6', textDecoration: 'none', marginBottom: 12 }}>
              Log in as Owner →
            </Link>
            <p style={{ fontSize: 11, color: '#4A4565' }}>
              After logging in, return to <strong style={{ color: '#8B85A8' }}>/pos/login</strong> for staff PIN access
            </p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Device enrolled — show staff picker + PIN
  return (
    <POSUserLogin
      businessId={device.businessId}
      businessName={device.businessName}
      onLogin={handleLogin}
      onSkip={handleSkip}
    />
  );
}
