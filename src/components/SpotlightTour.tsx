'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TOUR_STEPS, buildTourNarration, type TourData } from '@/lib/tour-steps';

interface TourResponse {
  step: string;
  completed_steps: string[];
  dismissed: boolean;
  business_name: string;
  industry: string;
  product_count: number;
  slug: string | null;
  error?: string;
}

const SESSION_SNOOZE_KEY = 'aria_tour_snoozed';
const POLL_MS = 4000;

// SPOTLIGHT-TOUR-1 — mounted once at the root layout (like AriaFloatingButton)
// so it works across BOTH /dashboard and /pos routes. The old TourSpotlight
// was only rendered inside /dashboard/layout.tsx even though 2 of its 5
// data-tour anchors (add_product, test_sale) live on /pos pages — meaning
// those tooltips could never actually fire. Mounting here fixes that as a
// side effect of building this properly.
export function SpotlightTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<TourResponse | null>(null);
  const [snoozed, setSnoozed] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const origStyle = useRef<{ boxShadow: string; position: string; zIndex: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding-tour', { cache: 'no-store' });
      if (!res.ok) { setData(null); return; }
      const json = await res.json() as TourResponse;
      if (json.error) { setData(null); return; }
      setData(json);
    } catch { /* silent — tour just doesn't show */ }
  }, []);

  useEffect(() => {
    try { setSnoozed(sessionStorage.getItem(SESSION_SNOOZE_KEY) === '1'); } catch { /* ignore */ }
    fetchProgress();
  }, [fetchProgress]);

  const currentStepDef = data ? TOUR_STEPS.find(s => s.key === data.step) ?? null : null;
  const isLastStepDone = !!data && data.step === TOUR_STEPS[TOUR_STEPS.length - 1].key
    && data.completed_steps.includes(TOUR_STEPS[TOUR_STEPS.length - 1].key);

  const clearHighlight = useCallback(() => {
    if (elRef.current && origStyle.current) {
      elRef.current.style.boxShadow = origStyle.current.boxShadow;
      elRef.current.style.position = origStyle.current.position;
      elRef.current.style.zIndex = origStyle.current.zIndex;
    }
    elRef.current = null;
    origStyle.current = null;
    setRect(null);
  }, []);

  // Find + highlight the target element on the current page, if this step has one.
  useEffect(() => {
    clearHighlight();
    if (!currentStepDef?.dataTourId) return;
    const tryFind = () => {
      const el = document.querySelector<HTMLElement>('[data-tour="' + currentStepDef.dataTourId + '"]');
      if (!el) return false;
      elRef.current = el;
      origStyle.current = { boxShadow: el.style.boxShadow, position: el.style.position, zIndex: el.style.zIndex };
      el.style.boxShadow = '0 0 0 9999px rgba(10,14,17,0.75)';
      el.style.position = 'relative';
      el.style.zIndex = '9999';
      setRect(el.getBoundingClientRect());
      return true;
    };
    if (!tryFind()) {
      const retry = setTimeout(tryFind, 400);
      return () => clearTimeout(retry);
    }
    return () => clearHighlight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepDef?.key, pathname]);

  // Poll for real-data completion only while a target element is actually
  // found on the current page (i.e. the owner is actively on the right page).
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!rect || !currentStepDef?.dataTourId) return;
    pollRef.current = setInterval(fetchProgress, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [rect, currentStepDef, fetchProgress]);

  async function skip() {
    clearHighlight();
    setData(null);
    await fetch('/api/onboarding-tour', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dismissed: true }),
    });
  }

  function remindLater() {
    clearHighlight();
    try { sessionStorage.setItem(SESSION_SNOOZE_KEY, '1'); } catch { /* ignore */ }
    setSnoozed(true);
  }

  async function advanceManualStep(key: string) {
    const res = await fetch('/api/onboarding-tour', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ complete_step: key }),
    });
    if (res.ok) fetchProgress();
  }

  if (!data || data.dismissed || snoozed || isLastStepDone || !currentStepDef) return null;

  const tourData: TourData = {
    businessName: data.business_name, industry: data.industry, productCount: data.product_count, slug: data.slug,
  };
  const narration = buildTourNarration(currentStepDef, tourData);
  const stepNum = TOUR_STEPS.findIndex(s => s.key === currentStepDef.key) + 1;

  const onTargetPage = !!rect;
  const isInformational = !currentStepDef.dataTourId;

  // Position: anchored below the highlighted element when found, else a
  // fixed floating card (bottom-right) so the tour is always visible
  // regardless of which page the owner is currently on.
  const cardStyle: React.CSSProperties = onTargetPage
    ? {
        position: 'fixed',
        top: Math.min(window.innerHeight - 220, (rect as DOMRect).bottom + 14),
        left: Math.max(12, Math.min(window.innerWidth - 332, (rect as DOMRect).left)),
        width: 320,
      }
    : { position: 'fixed', bottom: 24, right: 24, width: 320 };

  return (
    <>
      {!isInformational && (
        <div className="fixed inset-0" style={{ zIndex: 9997, background: onTargetPage ? 'transparent' : 'rgba(10,14,17,0.55)' }} />
      )}
      {isInformational && <div className="fixed inset-0" style={{ zIndex: 9997, background: 'rgba(10,14,17,0.6)' }} />}

      <div
        style={{
          ...cardStyle,
          zIndex: 10000,
          background: '#141914',
          border: '1px solid rgba(127,184,151,0.35)',
          borderRadius: 16,
          padding: '18px 20px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 13, fontWeight: 600, color: '#7FB897',
          }}>
            aria
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>· step {stepNum} of {TOUR_STEPS.length}</span>
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#E8EDE7', margin: '0 0 6px' }}>{currentStepDef.title}</h3>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(232,237,231,0.8)', margin: '0 0 14px' }}>{narration}</p>

        {currentStepDef.key === 'cx_app' && data.slug && (
          <a
            href={'/' + data.slug} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', marginBottom: 12, fontSize: 12, color: '#7FB897', wordBreak: 'break-all' }}
          >
            ariaos.site/{data.slug} ↗
          </a>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {(isInformational || !onTargetPage) && (
            <button
              onClick={() => {
                if (currentStepDef.key === 'products' || currentStepDef.key === 'cx_app') {
                  advanceManualStep(currentStepDef.key);
                } else if (currentStepDef.href) {
                  router.push(currentStepDef.href);
                }
              }}
              style={{
                flex: 1, padding: '8px 14px', borderRadius: 10, border: 'none',
                background: '#7FB897', color: '#0E1411', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {currentStepDef.ctaLabel}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
          <button onClick={remindLater} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
            Remind me later
          </button>
          <button onClick={skip} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
            Skip tour
          </button>
        </div>
      </div>
    </>
  );
}
