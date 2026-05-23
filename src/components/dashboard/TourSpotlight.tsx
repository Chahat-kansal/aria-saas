'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

const TOOLTIPS: Record<string, string> = {
  add_product:    'Click here to add your first product',
  test_sale:      'Add items to cart, then click here to charge',
  set_hours:      'Save your business details to confirm trading hours',
  invite_staff:   'Fill in the form and save to invite a team member',
  connect_google: 'Enter your Google Place ID here to connect your listing',
  add_service:    'Click here to open the services catalogue',
  add_customer:   'Click here to add your first customer',
};

export function TourSpotlight() {
  const searchParams = useSearchParams();
  const guide = searchParams.get('guide');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const origStyles = useRef<{ boxShadow: string; position: string; zIndex: string } | null>(null);

  const activate = useCallback(() => {
    if (!guide) return;
    const el = document.querySelector<HTMLElement>('[data-tour="' + guide + '"]');
    if (!el) return;
    elRef.current = el;
    origStyles.current = { boxShadow: el.style.boxShadow, position: el.style.position, zIndex: el.style.zIndex };
    el.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.65)';
    el.style.position = 'relative';
    el.style.zIndex = '9999';
    setRect(el.getBoundingClientRect());
  }, [guide]);

  const deactivate = useCallback(() => {
    if (elRef.current && origStyles.current) {
      elRef.current.style.boxShadow = origStyles.current.boxShadow;
      elRef.current.style.position = origStyles.current.position;
      elRef.current.style.zIndex = origStyles.current.zIndex;
      elRef.current = null;
      origStyles.current = null;
    }
    setRect(null);
  }, []);

  const dismiss = useCallback(() => {
    deactivate();
    const url = new URL(window.location.href);
    url.searchParams.delete('guide');
    window.history.replaceState({}, '', url.toString());
  }, [deactivate]);

  useEffect(() => {
    if (!guide) return;
    activate();
    const retry = setTimeout(activate, 400);
    return () => { clearTimeout(retry); deactivate(); };
  }, [guide, activate, deactivate]);

  if (!guide || !rect) return null;

  const tooltip = TOOLTIPS[guide] ?? 'Click here';
  const tipLeft = Math.max(12, rect.left + rect.width / 2 - 110);
  const tipTop = rect.bottom + 12;

  return (
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={dismiss} />
      <div
        className="fixed"
        style={{
          top: tipTop,
          left: tipLeft,
          width: 220,
          background: '#1A2620',
          border: '1px solid rgba(127,184,151,0.4)',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 13,
          color: '#E8EDE7',
          zIndex: 10000,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}
      >
        <div style={{
          position: 'absolute',
          top: -6,
          left: 20,
          width: 10,
          height: 10,
          background: '#1A2620',
          border: '1px solid rgba(127,184,151,0.4)',
          borderRight: 'none',
          borderBottom: 'none',
          transform: 'rotate(45deg)',
        }} />
        {tooltip}
      </div>
    </>
  );
}
