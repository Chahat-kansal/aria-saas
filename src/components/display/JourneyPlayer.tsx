'use client';

// ARIA-DISPLAY-1 — the idle journey player.
//
// Runs unattended on a cheap tablet on a shop counter, all day. Three things decide whether it
// survives that, and each is handled explicitly below:
//   1. MEMORY — exactly two <video> elements exist, ever. Decoded video frames are the thing that
//      kills a tablet, so the element count is fixed at two and clips are swapped through them.
//   2. BANDWIDTH — Supabase Storage serves these with Cache-Control: max-age=3600, i.e. ONE HOUR.
//      Trusting the HTTP cache would re-pull ~29MB per device per hour, forever. Clips go through
//      the Cache API instead, keyed by the versioned filename, so each downloads ONCE per device.
//   3. SELF-HEALING — no one is going to walk over and tap it. Every error and every stall skips
//      forward rather than freezing on a frame.

import { useCallback, useEffect, useRef, useState } from 'react';
import { CURRENT_LEG, buildPass, isNightIn, type Clip } from '@/lib/display/journey';

const FADE_MS = 800;
/** A clip that has not produced a frame in this long is treated as stalled and skipped. */
const STALL_MS = 12_000;
const CACHE_NAME = 'aria-display-v1';

export interface JourneyPlayerProps {
  /** Rendered as a small mark in the corner. Empty string = no mark (unresolved slug). */
  venueName?: string;
  /** IANA timezone for the venue, used only to decide day/night. */
  timeZone?: string;
}

/**
 * Resolve a clip URL to something a <video> can play, preferring the on-device cache.
 *
 * Returns an object URL when the bytes came from (or were just written to) the Cache API, and the
 * plain URL when caching is unavailable. The object URL MUST be revoked by the caller once the clip
 * is no longer one of the two live ones — that is what keeps memory flat.
 */
async function resolveSrc(url: string): Promise<{ src: string; revoke: boolean }> {
  if (typeof caches === 'undefined') return { src: url, revoke: false };
  try {
    const cache = await caches.open(CACHE_NAME);
    let res = await cache.match(url);
    if (!res) {
      // Not cached yet — fetch once, store, and reuse forever. No query string: the -v1 filename IS
      // the cache key, so a new cut (-v2) is simply a different entry and never a stale hit.
      const net = await fetch(url, { cache: 'force-cache' });
      if (!net.ok) return { src: url, revoke: false };
      await cache.put(url, net.clone());
      res = net;
    }
    const blob = await res.blob();
    return { src: URL.createObjectURL(blob), revoke: true };
  } catch {
    // Storage full, private mode, insecure context — playing uncached beats not playing.
    return { src: url, revoke: false };
  }
}

export default function JourneyPlayer({ venueName = '', timeZone = 'Australia/Melbourne' }: JourneyPlayerProps) {
  // Two elements, fixed. A/B crossfade: one visible, one loading the next underneath.
  const vidA = useRef<HTMLVideoElement | null>(null);
  const vidB = useRef<HTMLVideoElement | null>(null);
  const [showA, setShowA] = useState(true);
  const showARef = useRef(true);

  const queue = useRef<Clip[]>([]);
  const qi = useRef(0);
  const objectUrls = useRef<Record<'a' | 'b', string | null>>({ a: null, b: null });
  const stallTimer = useRef<number | null>(null);
  const advancing = useRef(false);
  const [reduced, setReduced] = useState(false);
  const reducedRef = useRef(false);

  /** Next clip in the pass, rebuilding (and reshuffling) the pass when one is exhausted. */
  const nextClip = useCallback((): Clip => {
    if (qi.current >= queue.current.length) {
      queue.current = buildPass(CURRENT_LEG, { isNight: isNightIn(timeZone), isStorm: false });
      qi.current = 0;
    }
    return queue.current[qi.current++];
  }, [timeZone]);

  /** Load a clip into the hidden element, then crossfade to it. */
  const loadInto = useCallback(async (slot: 'a' | 'b', clip: Clip) => {
    const el = slot === 'a' ? vidA.current : vidB.current;
    if (!el) return;

    const prev = objectUrls.current[slot];
    if (prev) { URL.revokeObjectURL(prev); objectUrls.current[slot] = null; }

    const { src, revoke } = await resolveSrc(clip.url);
    if (revoke) objectUrls.current[slot] = src;
    el.src = src;
    // metadata is enough to paint the first frame, which is also our poster substitute — the
    // -v1.jpg posters return 400 and do not exist.
    el.preload = 'metadata';
    try { el.load(); } catch { /* self-heal path below handles it */ }
    if (!reducedRef.current) {
      try { await el.play(); } catch { /* autoplay blocked or src bad — stall/error handler skips */ }
    }
  }, []);

  const advance = useCallback(async () => {
    if (advancing.current) return;
    advancing.current = true;
    if (stallTimer.current) { window.clearTimeout(stallTimer.current); stallTimer.current = null; }

    const toSlot: 'a' | 'b' = showARef.current ? 'b' : 'a';
    await loadInto(toSlot, nextClip());

    showARef.current = !showARef.current;
    setShowA(showARef.current);

    // Arm the stall watchdog for the clip we just brought forward.
    stallTimer.current = window.setTimeout(() => { void advance(); }, STALL_MS);

    // Let the crossfade finish before another advance can start.
    window.setTimeout(() => { advancing.current = false; }, FADE_MS);
  }, [loadInto, nextClip]);

  // ── boot ──────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = mq.matches;
    setReduced(mq.matches);
    const onMq = (e: MediaQueryListEvent) => { reducedRef.current = e.matches; setReduced(e.matches); };
    mq.addEventListener('change', onMq);

    queue.current = buildPass(CURRENT_LEG, { isNight: isNightIn(timeZone), isStorm: false });
    qi.current = 0;
    void loadInto('a', nextClip());
    showARef.current = true;
    setShowA(true);

    // In reduced-motion we hold each first frame instead of playing, so `ended` never fires —
    // an interval drives the crossfade between stills.
    let still: number | null = null;
    if (reducedRef.current) still = window.setInterval(() => { void advance(); }, 9_000);

    return () => {
      mq.removeEventListener('change', onMq);
      if (still) window.clearInterval(still);
      if (stallTimer.current) window.clearTimeout(stallTimer.current);
      // Release both blobs or the tablet keeps them until the tab dies.
      (['a', 'b'] as const).forEach((s) => {
        const u = objectUrls.current[s];
        if (u) { URL.revokeObjectURL(u); objectUrls.current[s] = null; }
      });
    };
    // advance/loadInto/nextClip are stable refs-over-state; re-running this would restart playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone]);

  // ── keep the screen awake ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    type WakeLock = { release: () => Promise<void> };
    let lock: WakeLock | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };

    const acquire = async () => {
      if (!nav.wakeLock) return;                       // unsupported — silently ignored, as specified
      try {
        const l = await nav.wakeLock.request('screen');
        if (cancelled) { void l.release(); return; }
        lock = l;
      } catch { /* denied or not allowed in this context */ }
    };
    void acquire();
    // The lock is dropped whenever the tab is backgrounded; re-take it on return.
    const onVis = () => { if (document.visibilityState === 'visible') void acquire(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (lock) void lock.release();
    };
  }, []);

  const videoStyle = (visible: boolean): React.CSSProperties => ({
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover', opacity: visible ? 1 : 0,
    transition: 'opacity ' + FADE_MS + 'ms linear',
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#000', overflow: 'hidden',
        cursor: 'none', userSelect: 'none',
      }}
    >
      {(['a', 'b'] as const).map((slot) => (
        <video
          key={slot}
          ref={slot === 'a' ? vidA : vidB}
          style={videoStyle(slot === 'a' ? showA : !showA)}
          muted
          playsInline
          // No loop: `ended` is what advances the pass. No controls, no audio, ever.
          onEnded={() => { if (!reduced) void advance(); }}
          onError={() => { void advance(); }}
          onStalled={() => { void advance(); }}
          aria-hidden="true"
        />
      ))}

      {venueName ? (
        <div
          style={{
            position: 'absolute', left: 28, bottom: 24,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            fontSize: 13, letterSpacing: '0.28em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.42)', textShadow: '0 1px 12px rgba(0,0,0,0.55)',
            pointerEvents: 'none',
          }}
        >
          {venueName}
        </div>
      ) : null}
    </div>
  );
}
