'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import React from 'react';
import { useZxing } from 'react-zxing';
import { isIOSDevice } from '@/lib/mobile-detect';

interface Props {
  onScan:   (barcode: string) => void;
  onClose:  () => void;
  isActive: boolean;
}

export default function BarcodeScanner({ onScan, onClose, isActive }: Props) {
  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [scanFlash,  setScanFlash]  = useState(false);
  const [torchOn,    setTorchOn]    = useState(false);
  const lastScanRef = useRef('');
  const lastScanTs  = useRef(0);

  const handleDecodeResult = useCallback((result: { getText: () => string }) => {
    const text = result.getText();
    if (!text) return;
    const now = Date.now();
    // Debounce — ignore same barcode within 1.5 s
    if (text === lastScanRef.current && now - lastScanTs.current < 1500) return;
    lastScanRef.current = text;
    lastScanTs.current  = now;
    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 300);
    if (navigator.vibrate) navigator.vibrate(80);
    onScan(text);
  }, [onScan]);

  // Always use facingMode: 'environment' — do NOT do async deviceId lookup.
  // Enumerating devices before permission is granted returns empty labels,
  // and updating deviceId state mid-session causes the camera stream to restart.
  const { ref, torch } = useZxing({
    constraints: {
      video: {
        facingMode: isIOSDevice() ? { exact: 'environment' } : { ideal: 'environment' },
        width:      { ideal: 1280 },
        height:     { ideal: 720 },
      },
    },
    paused: !isActive,
    onDecodeResult: handleDecodeResult,
    onError: () => setPermission('denied'),
  });

  // Grant detection via video "play" event
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPlay = () => setPermission('granted');
    el.addEventListener('play', onPlay);
    return () => el.removeEventListener('play', onPlay);
  }, [ref]);

  // Denied detection: if no srcObject after 5 s, camera was blocked
  useEffect(() => {
    if (!isActive) return;
    const t = setTimeout(() => {
      if (permission === 'pending' && ref.current && !ref.current.srcObject) {
        setPermission('denied');
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [isActive, permission, ref]);

  if (!isActive) return null;

  /* ── Camera denied ────────────────────────────────────────────────── */
  if (permission === 'denied') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-8 text-center">
        <span className="text-5xl mb-5">📷</span>
        <h2 className="text-white text-xl font-semibold mb-3">Camera access required</h2>
        <p className="text-gray-400 text-sm mb-4">
          Allow camera access in your browser settings to scan barcodes.
        </p>
        {isIOSDevice()
          ? <p className="text-gray-500 text-xs mb-6">iPhone: Settings → Safari → Camera → Allow</p>
          : <p className="text-gray-500 text-xs mb-6">Tap the camera icon in your browser&apos;s address bar and select Allow.</p>}
        <button onClick={onClose}
          className="px-6 py-3 rounded-2xl text-white font-semibold text-sm"
          style={{ background: '#8B5CF6' }}>
          Go back
        </button>
      </div>
    );
  }

  /* ── Viewfinder ───────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ fontFamily: "'Manrope',system-ui,sans-serif" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}>
        <button onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-sm font-medium"
          style={{ background: 'rgba(255,255,255,0.15)' }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        <span className="text-white font-semibold text-sm">Scan barcode</span>
        {/* Torch button */}
        {torch.isAvailable ? (
          <button
            onClick={() => { torchOn ? torch.off() : torch.on(); setTorchOn(v => !v); }}
            className="p-2 rounded-xl"
            style={{ background: torchOn ? '#8B5CF6' : 'rgba(255,255,255,0.15)' }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Camera feed — playsInline is CRITICAL for iOS Safari */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <video
          ref={ref as React.RefObject<HTMLVideoElement>}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Scan flash overlay */}
        {scanFlash && (
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(139,92,246,0.35)', zIndex: 10 }} />
        )}

        {/* Pending overlay */}
        {permission === 'pending' && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', zIndex: 5 }}>
            <div className="text-center text-white">
              <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin mx-auto mb-3" />
              <p className="text-sm">Starting camera…</p>
            </div>
          </div>
        )}

        {/* Viewfinder reticle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 4 }}>
          {/* Dark vignette */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse 70% 30% at 50% 50%, transparent 0%, rgba(0,0,0,0.7) 100%)',
          }} />
          {/* Reticle box */}
          <div className="relative" style={{ width: 280, height: 168 }}>
            <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-[#8B5CF6] rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-[#8B5CF6] rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-[#8B5CF6] rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-[#8B5CF6] rounded-br-lg" />
            {/* Scan line */}
            <div className="animate-scan-line left-3 right-3 h-0.5 rounded-full"
              style={{ background: '#8B5CF6', boxShadow: '0 0 10px #8B5CF6, 0 0 4px #8B5CF6' }} />
          </div>
          {/* Hint text */}
          <div className="absolute left-0 right-0 text-center" style={{ bottom: '24%' }}>
            <p className="text-white text-sm font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
              Point at barcode — hold steady
            </p>
            <p className="text-gray-300 text-xs mt-1" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
              Scanning automatically
            </p>
          </div>
        </div>
      </div>

      {/* Manual entry fallback */}
      <div className="px-4 pb-safe-bottom pb-6 pt-4 flex-shrink-0" style={{ background: 'rgba(0,0,0,0.9)' }}>
        <p className="text-gray-500 text-xs mb-2 text-center">Can&apos;t scan? Enter manually:</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Type barcode or SKU…"
            inputMode="numeric"
            className="flex-1 px-4 py-3 rounded-2xl text-white text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) { onScan(v); (e.target as HTMLInputElement).value = ''; }
              }
            }}
          />
          <button
            onClick={e => {
              const input = (e.currentTarget as HTMLElement).previousElementSibling as HTMLInputElement;
              if (input?.value.trim()) { onScan(input.value.trim()); input.value = ''; }
            }}
            className="px-5 py-3 rounded-2xl text-white font-semibold text-sm"
            style={{ background: '#8B5CF6', flexShrink: 0 }}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
