'use client'
import { memo, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

/**
 * MS16C PHASE 3 — THE REAL ARIA, MOUNTED INTO #ax-avatar.
 *
 * THE DRAWN CSS FACE IN THE CONTRACT IS NOT ARIA. It is a placeholder so the static mockup isn't an
 * empty circle, marked as such in the file. It is never rendered by this app — not on load, not
 * while the model downloads, not on failure. The real Aria is the VRM at `public/models/Aria.glb`
 * rendered by `AriaTalkingHead`, the same component the live Ask Aria surface already uses.
 *
 * `public/videos/aria-intro-poster.jpg` is a DIFFERENT, MALE character from the marketing intro and
 * is never used here, in any state.
 *
 * ── THE THREE PERFORMANCE REQUIREMENTS, AND HOW EACH IS MET ─────────────────────────────────────
 *
 * 1. IT MUST NOT BLOCK FIRST PAINT.
 *    The component is a `next/dynamic` import with `ssr: false`, so the 18 MB GLB and the three.js
 *    runtime are not in the surface's initial bundle. It is then mounted from a `useEffect`, which
 *    runs after the browser has painted, and deferred again to `requestIdleCallback` where the
 *    browser offers one. The surface is interactive before Aria starts loading.
 *
 * 2. IT MUST NOT RE-RENDER PER STREAMED TOKEN.
 *    This is the real hazard: the surface re-renders on every token, and re-rendering a WebGL
 *    canvas per token would be brutal. Two defences, because one is not enough:
 *      - `memo()` — the parent re-rendering does not re-render this subtree unless props change.
 *      - The props are chosen so they CANNOT change per token. `replyText` is the SETTLED text of a
 *        finished turn, never the in-flight stream. During streaming, both props hold still and the
 *        memo comparison short-circuits.
 *
 * 3. IT MUST RESIZE WITH ITS CONTAINER, NOT LETTERBOX OR RESET.
 *    `AriaTalkingHead` renders an r3f `<Canvas>` with `style={{width:'100%',height:'100%'}}`, which
 *    observes its container and resizes the drawing buffer. The contract meets it halfway with
 *    `.figure canvas{width:100%!important;height:100%!important;display:block}`. The mount node is
 *    the same DOM element across both states, so the 250px → 148px transition resizes the renderer
 *    rather than tearing it down and rebuilding it.
 */

const AriaTalkingHead = dynamic(() => import('@/components/aria/AriaTalkingHead'), {
  ssr: false,
  // Never the drawn face and never the marketing poster — a label, and only while she loads.
  loading: () => <div className="fallback">Waking Aria…</div>,
})

export interface AriaAvatarMountProps {
  /**
   * The SETTLED reply of the last finished turn. Never the streaming buffer — passing that would
   * change this prop on every token and defeat the memo.
   */
  replyText: string
  /** Aria is mid-turn. Boolean, so it flips twice per turn rather than once per token. */
  speaking: boolean
}

function AriaAvatarMountInner({ replyText, speaking }: AriaAvatarMountProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Effects run after first paint, so the surface is already on screen. Defer once more to idle
    // where the browser offers it, so the model download does not compete with the transition.
    let cancelled = false
    const start = () => { if (!cancelled) setReady(true) }

    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (h: number) => void
    })
    if (typeof ric.requestIdleCallback === 'function') {
      const h = ric.requestIdleCallback(start, { timeout: 2000 })
      return () => { cancelled = true; ric.cancelIdleCallback?.(h) }
    }
    // No requestIdleCallback (Safari): this effect is already post-paint, so mount now.
    start()
    return () => { cancelled = true }
  }, [])

  if (!ready) return <div className="fallback">Waking Aria…</div>
  return <AriaTalkingHead mode={speaking ? 'talking' : 'idle'} replyText={replyText} />
}

/**
 * Memoised on exactly the two props above. While tokens stream, neither changes, so React skips
 * this subtree entirely and the WebGL canvas is left alone.
 */
const AriaAvatarMount = memo(AriaAvatarMountInner)
export default AriaAvatarMount
