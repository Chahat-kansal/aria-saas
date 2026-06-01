# Prompt 209B — Fix Landing Page Layout (scenes cutting off + Remotion overflow)

The Remotion Player compositions are installed and working but the scene layout is broken:
- Scenes clip content because .scene { overflow: hidden; position: absolute; height: 100% }
- Remotion Players overflow the fixed viewport height
- Text overlapping with Player components
- Scenes with both a Player + grid/list content need scroll within the scene container

## Root cause (already diagnosed)
.landing-v3 .scene has:
  position: absolute; inset: 0; height: 100%; overflow: hidden; padding: 80px 32px;

When a Remotion Player (fixed compositionHeight) + heading + feature grid are stacked,
the total height exceeds the viewport. overflow: hidden clips everything below.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
```
Read CLAUDE.md (RULE 0). Push + verify after every commit.

## TASK 1 — Fix scene overflow in aria-landing.css

In src/styles/aria-landing.css, update the .scene block:

FIND:
```css
.landing-v3 .scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 32px;
  opacity: 0;
  visibility: hidden;
  transition: opacity 700ms cubic-bezier(0.4, 0, 0.2, 1), visibility 0ms linear 700ms;
  overflow: hidden;
  z-index: 2;
}
```

REPLACE WITH:
```css
.landing-v3 .scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 32px;
  opacity: 0;
  visibility: hidden;
  transition: opacity 700ms cubic-bezier(0.4, 0, 0.2, 1), visibility 0ms linear 700ms;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 2;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.landing-v3 .scene::-webkit-scrollbar { display: none; }
.landing-v3 .scene-inner {
  width: 100%;
  max-width: 960px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 20px 0 40px;
}
```

Also update .landing-v3 .scene-inner to allow flex-col layout:
```css
.landing-v3 .scene-inner {
  width: 100%;
  max-width: 960px;
  position: relative;
  z-index: 3;
  transform: translateY(40px);
  opacity: 0;
  transition: transform 900ms cubic-bezier(0.16, 1, 0.3, 1) 150ms,
              opacity 900ms cubic-bezier(0.16, 1, 0.3, 1) 150ms;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding-bottom: 40px;
}
```

Commit: "fix(landing/css): scene overflow-y:auto — fixes Remotion Player clipping"

## TASK 2 — Fix Remotion Player sizes in each scene

The Player compositionWidth/Height must fit within 100vh minus padding.
Safe viewport-relative sizing: compositionHeight should be at most 45vh equivalent
in pixels. At 900px viewport that is ~405px max.

Update each scene file to reduce Player height and make it responsive:

### MeetAriaScene.tsx
Remove the feature grid below the Player (it pushes content too far down).
Keep only the Player + the scene heading:
```tsx
export default function MeetAriaScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Meet Aria</div>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        One AI that knows your <em>entire business</em>
      </h2>
      <Player
        component={DailyBriefingComp}
        durationInFrames={160}
        fps={30}
        compositionWidth={640}
        compositionHeight={360}
        style={{ width: '100%', maxWidth: 640, borderRadius: 14,
          overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)' }}
        loop
        autoPlay
      />
    </>
  )
}
```

### SmartPOSScene.tsx
Side-by-side layout but Player must be smaller:
```tsx
export default function SmartPOSScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>POS</div>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        The only POS that gets <em>smarter every day</em>
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '2rem', width: '100%', maxWidth: 860, alignItems: 'center' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0,
          display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {CHECKS.map(c => (
            <li key={c} style={{ display: 'flex', alignItems: 'center',
              gap: '0.7rem', fontSize: '0.9rem', color: '#cdd6cf' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(127,184,151,0.15)',
                border: '1px solid rgba(127,184,151,0.4)',
                color: '#7FB897', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>✓</span>
              {c}
            </li>
          ))}
        </ul>
        <Player
          component={POSCheckoutComp}
          durationInFrames={150}
          fps={30}
          compositionWidth={400}
          compositionHeight={320}
          style={{ width: '100%', borderRadius: 14,
            overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)' }}
          loop
          autoPlay
        />
      </div>
    </>
  )
}
```

### BrainScene.tsx
Player only — no capability grid below (too much content):
```tsx
export default function BrainScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>One operating system</div>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        Ten dashboards. <em>One brain. Yours.</em>
      </h2>
      <Player
        component={BrainOrbComp}
        durationInFrames={200}
        fps={30}
        compositionWidth={640}
        compositionHeight={360}
        style={{ width: '100%', maxWidth: 640, borderRadius: 14,
          overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)' }}
        loop
        autoPlay
      />
    </>
  )
}
```

### ReorderScene.tsx (win-back)
Player only:
```tsx
import { Player } from '@remotion/player'
import { WinbackComp } from '../remotion/WinbackComp'

export default function ReorderScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Customer retention</div>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        Win back customers before <em>they're gone.</em>
      </h2>
      <Player
        component={WinbackComp}
        durationInFrames={140}
        fps={30}
        compositionWidth={640}
        compositionHeight={340}
        style={{ width: '100%', maxWidth: 640, borderRadius: 14,
          overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)' }}
        loop
        autoPlay
      />
    </>
  )
}
```

### AskScene.tsx
Player only:
```tsx
import { Player } from '@remotion/player'
import { AskAriaComp } from '../remotion/AskAriaComp'

export default function AskScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Ask Aria anything</div>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        Any question about your business. <em>Answered instantly.</em>
      </h2>
      <Player
        component={AskAriaComp}
        durationInFrames={540}
        fps={30}
        compositionWidth={640}
        compositionHeight={380}
        style={{ width: '100%', maxWidth: 640, borderRadius: 14,
          overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)' }}
        loop
        autoPlay
      />
    </>
  )
}
```

### ProblemSceneNew.tsx (revenue chart)
Player only:
```tsx
import { Player } from '@remotion/player'
import { RevenueChartComp } from '../remotion/RevenueChartComp'

export default function ProblemSceneNew() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Profit intelligence</div>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        Know exactly where <em>your money goes.</em>
      </h2>
      <Player
        component={RevenueChartComp}
        durationInFrames={120}
        fps={30}
        compositionWidth={640}
        compositionHeight={320}
        style={{ width: '100%', maxWidth: 640, borderRadius: 14,
          overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)' }}
        loop
        autoPlay
      />
    </>
  )
}
```

RULE 0: Do not remove any scene from scene-data.ts. Scenes that don't yet have a Player
(ProblemScene, ScheduleScene, AustraliaScene, etc.) — leave completely unchanged.

Commit: "fix(landing/scenes): resize Remotion Players to fit viewport, remove overflowing grids"

## TASK 3 — Fix h2 font size in scenes

With Cormorant at the current size, h2 in scenes is too large and overlaps the Player.
In aria-landing.css, find the scene h2 rule and reduce it:

Find any rule matching `.landing-v3 .scene h2` or `.landing-v3 h2` and set:
```css
.landing-v3 .scene h2 {
  font-family: var(--font-display);
  font-size: clamp(2rem, 4.5vw, 3.5rem);
  line-height: 1.08;
  letter-spacing: -0.02em;
  font-weight: 600;
  color: var(--text-primary, #E8EDE7);
  margin-bottom: 1.5rem;
}
.landing-v3 .scene h2 em {
  color: var(--sage, #7FB897);
  font-style: italic;
  font-weight: 300;
}
```

Commit: "fix(landing/css): reduce h2 size in scenes — Cormorant was rendering too large"

## TASK 4 — Fix hero dashboard stage sizing

In aria-landing.css the hero-dashboard-stage needs to be constrained:
Find .landing-v3 .hero-dashboard-stage and ensure:
```css
.landing-v3 .hero-dashboard-stage {
  width: 100%;
  max-width: 900px;
  margin: 2rem auto 0;
  border-radius: 16px 16px 0 0;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1);
  border-bottom: none;
}
```

Commit: "fix(landing/hero): constrain dashboard stage width and overflow"

## TASK 5 — Verify all Remotion compositions exist

Check that all 6 composition files exist in src/components/marketing/landing/remotion/:
- DailyBriefingComp.tsx ✓ (already confirmed)
- POSCheckoutComp.tsx
- WinbackComp.tsx
- BrainOrbComp.tsx ✓ (already confirmed)
- AskAriaComp.tsx
- RevenueChartComp.tsx

For any missing file, create a minimal working composition:

AskAriaComp.tsx if missing:
```tsx
'use client'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
const QA = [
  { q: "How's my revenue this week?", a: "Up 18% — $2,847 so far. Acai Bowl is leading. Best week this month." },
  { q: "Any risks I should know about?", a: "3 items: oat milk critically low, BAS due in 14 days, competitor undercut your flat white." },
  { q: "How can I increase profit?", a: "Bundle Flat White + food item. Cafés using bundle pricing see 15-22% higher ticket sizes." },
]
export function AskAriaComp() {
  const frame = useCurrentFrame()
  const cycleLen = 180
  const cycleIdx = Math.floor(frame / cycleLen) % QA.length
  const cycleFrame = frame % cycleLen
  const qa = QA[cycleIdx]
  const qOpacity = interpolate(cycleFrame, [0, 20, 140, 160], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const aOpacity = interpolate(cycleFrame, [30, 55, 140, 160], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui", padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 10, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.8 }}>Ask Aria</div>
      <div style={{ opacity: qOpacity, background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#e8ede9', alignSelf: 'flex-end', maxWidth: '80%' }}>{qa.q}</div>
      <div style={{ opacity: aOpacity, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7FB897', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#0E1411', flexShrink: 0 }}>A</div>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderBottomLeftRadius: 12, padding: '12px 16px', fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, flex: 1 }}>{qa.a}</div>
      </div>
    </AbsoluteFill>
  )
}
```

RevenueChartComp.tsx if missing:
```tsx
'use client'
import { AbsoluteFill, useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion'
const DATA = [
  { day: 'Mon', val: 320, last: 280 }, { day: 'Tue', val: 640, last: 390 },
  { day: 'Wed', val: 510, last: 420 }, { day: 'Thu', val: 480, last: 400 },
  { day: 'Fri', val: 560, last: 510 }, { day: 'Sat', val: 680, last: 590 },
  { day: 'Sun', val: 290, last: 260 },
]
const MAX = 700
export function RevenueChartComp() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui", padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 10, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.8 }}>Revenue this week vs last week</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {DATA.map((d, i) => {
          const sp = spring({ frame: frame - i * 6, fps, config: { damping: 20, stiffness: 100 } })
          const thisH = interpolate(sp, [0, 1], [0, (d.val / MAX) * 100])
          const lastH = interpolate(sp, [0, 1], [0, (d.last / MAX) * 100])
          return (
            <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 140 }}>
                <div style={{ flex: 1, background: 'rgba(127,184,151,0.15)', borderRadius: '3px 3px 0 0', height: lastH + '%' }} />
                <div style={{ flex: 1, background: '#7FB897', borderRadius: '3px 3px 0 0', height: thisH + '%' }} />
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{d.day}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(127,184,151,0.3)' }} /><span style={{ color: 'rgba(255,255,255,0.4)' }}>Last week</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#7FB897' }} /><span style={{ color: 'rgba(255,255,255,0.7)' }}>This week</span></span>
      </div>
    </AbsoluteFill>
  )
}
```

WinbackComp.tsx if missing — build same pattern as DailyBriefingComp but with 3 steps sliding in.

Commit: "fix(landing/remotion): ensure all 6 compositions exist and export correctly"

## TASK 6 — Final verification
1. npx tsc --noEmit — must be zero errors
2. npm run build — must pass
3. Open the landing page locally, scroll through all 15 scenes
4. Confirm: no text overlapping Players, no content cut off, each scene fits in the viewport
5. Confirm: Remotion Players are animating (briefing lines slide in, orbs orbit, bars grow)
6. Confirm: scroll/hide engine still works (scenes crossfade on scroll)
7. git push origin main + verify

Commit: "fix(landing): final scene layout verification — all scenes fit viewport, Players animating"

## HARD RULES
- DO NOT touch LandingShell.tsx
- DO NOT touch StickyOverlay.tsx
- DO NOT touch ProgressBar.tsx
- DO NOT touch scene-data.ts
- Scenes not receiving a Player (ProblemScene, ScheduleScene, AustraliaScene, TestimonialScene,
  PricingTiersScene, OutroScene, TenMinutesScene, AustraliaWideScene, PricingAgentScene)
  — leave completely unchanged
- The scroll/hide engine must still work after this fix
- npm run build before every commit
