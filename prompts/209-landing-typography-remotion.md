# Prompt 209 — Landing Page: Typography Swap + Remotion Animated Scenes

Two precise changes to the existing landing page:
1. Swap typography to a more distinctive, non-generic pairing
2. Replace static scene UI mockups with animated Remotion <Player> compositions

DO NOT touch: LandingShell.tsx, StickyOverlay.tsx, ProgressBar.tsx, scene-data.ts (scene list/order),
or any scroll/reveal logic. The layout, colours, dark forest theme, scroll animations — ALL STAY.

## Pre-flight
```
git pull origin main
```
Read CLAUDE.md (RULE 0). Push + verify after every commit.
Run npm run build before every commit — no exceptions.

---

## PART 1 — TYPOGRAPHY SWAP

### Current fonts (remove these from layout.tsx)
- Fraunces → display headings (--font-display)
- Inter → body (--font-body)
- Sora → UI (--font-sora)
- JetBrains Mono → keep (--font-mono) — used in POS terminal, do not change

### New font pairing (replace with these)
From Google Fonts (next/font/google):

**Display / headings:** `Cormorant` (or `Cormorant Garamond`)
- Weight: 300 400 500 600 700, italic variants
- Why: High-contrast elegant serif with dramatic thick/thin strokes. More editorial than Fraunces.
  Looks premium, distinctly Australian-luxury. Completely different from Manus or any AI-product cliché.
- Variable: --font-display

**Body / UI:** `Cabinet Grotesk` is not on Google Fonts — use `Outfit` instead
- Weight: 300 400 500 600
- Why: Geometric but warm, not corporate. Clean, readable, modern without being generic.
  Nothing like Inter or Roboto.
- Variable: --font-body

**Implementation in src/app/layout.tsx:**
```typescript
import { Cormorant, Outfit, JetBrains_Mono } from 'next/font/google'

const cormorant = Cormorant({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
})

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})
```

Update body className to use new font variables. Remove Sora and Fraunces imports entirely.

**Size adjustments needed after font swap:**
Cormorant renders optically smaller than Fraunces at the same px size. After swapping:
- Hero h1: increase by ~8-10% (e.g. if was clamp(3rem, 8vw, 7rem) → clamp(3.2rem, 9vw, 8rem))
- Scene h2: check each scene — may need slight size bump
- Do this via the existing CSS variables/classes in globals.css, not by editing every scene

Also update globals.css:
- .font-display → font-family: var(--font-display) (Cormorant)
- .font-ui → font-family: var(--font-body) (Outfit)
- Body font-family: var(--font-body)

Commit: "feat(landing): swap typography — Cormorant display + Outfit body (remove Fraunces/Inter/Sora)"

---

## PART 2 — REMOTION ANIMATED SCENES

### What Remotion gives us
@remotion/player is already installed. The <Player> component renders a React composition
as a smooth animation, driven by a `frame` counter (0 to durationInFrames). No video files —
it's pure React rendered frame-by-frame in the browser.

### Install pattern for each composition
```tsx
import { Player } from '@remotion/player'
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'
```

Core Remotion hooks:
- useCurrentFrame() → current frame number (0 to durationInFrames)
- interpolate(frame, [inputRange], [outputRange], { extrapolateRight: 'clamp' }) → animated value
- spring({ frame, fps, config: { damping, stiffness } }) → physics-based spring value
- AbsoluteFill → full-size absolutely positioned container

### Create src/components/marketing/landing/remotion/ folder

---

### COMPOSITION 1 — DailyBriefingComp.tsx
Used in: MeetAriaScene or a dedicated scene

```tsx
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'

const LINES = [
  { icon: '📈', title: 'Revenue up 18%', sub: '$2,847 today · Acai Bowl #1 product', color: '#7FB897' },
  { icon: '⚠️', title: '3 customers at risk', sub: 'Win-back messages drafted & ready', color: '#F59E0B' },
  { icon: '📋', title: 'BAS due in 14 days', sub: '$3,240 estimated · checklist ready', color: '#60a5fa' },
  { icon: '📦', title: 'Oat milk: 2 units left', sub: 'Auto-reorder sent · ETA Thursday', color: '#f87171' },
]

export const DailyBriefingComp: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  
  return (
    <AbsoluteFill style={{ background: '#0E1411', padding: '28px 24px', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{
        opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${interpolate(frame, [0, 15], [8, 0], { extrapolateRight: 'clamp' })}px)`,
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 10, color: '#7FB897', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          MONDAY 2 JUNE · SIP CAFÉ
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Good morning, Chahat ☀️</div>
      </div>

      {/* Briefing lines — staggered entrance */}
      {LINES.map((line, i) => {
        const delay = 20 + i * 18
        const opacity = interpolate(frame, [delay, delay + 16], [0, 1], { extrapolateRight: 'clamp' })
        const x = interpolate(frame, [delay, delay + 16], [-16, 0], { extrapolateRight: 'clamp' })
        return (
          <div key={i} style={{
            opacity, transform: `translateX(${x}px)`,
            display: 'flex', alignItems: 'flex-start', gap: 12,
            background: 'rgba(255,255,255,0.04)', borderRadius: 10,
            padding: '12px 14px', marginBottom: 8,
            borderLeft: `3px solid ${line.color}`,
          }}>
            <span style={{ fontSize: 18 }}>{line.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{line.title}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{line.sub}</div>
            </div>
          </div>
        )
      })}

      {/* Aria typing indicator */}
      {frame > 90 && (
        <div style={{
          opacity: interpolate(frame, [90, 105], [0, 1], { extrapolateRight: 'clamp' }),
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 12,
          background: 'rgba(127,184,151,0.1)', borderRadius: 10, padding: '10px 14px',
        }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7FB897', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0E1411', flexShrink: 0 }}>A</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
            Aria is ready for your questions ·
            <span style={{ color: '#7FB897', marginLeft: 4 }}>Ask anything →</span>
          </div>
        </div>
      )}
    </AbsoluteFill>
  )
}
```

Wrap in Player in the scene (or directly in MeetAriaScene):
```tsx
<Player
  component={DailyBriefingComp}
  durationInFrames={150}
  fps={30}
  compositionWidth={520}
  compositionHeight={320}
  style={{ width: '100%', borderRadius: 16, overflow: 'hidden' }}
  loop
  autoPlay
/>
```

---

### COMPOSITION 2 — POSCheckoutComp.tsx
Used in: SmartPOSScene

Items slide in one by one, total counter ticks up, pay button pulses:

```tsx
const ITEMS = [
  { name: 'Flat White', mod: 'Large · Oat milk', price: 6.50 },
  { name: 'Acai Bowl', mod: '+ Granola · + Honey', price: 18.00 },
  { name: 'Banana Bread', mod: 'Toasted · Butter', price: 7.50 },
]

export const POSCheckoutComp: React.FC = () => {
  const frame = useCurrentFrame()
  const total = ITEMS.reduce((a, b) => a + b.price, 0)
  const displayedTotal = interpolate(frame, [60, 90], [0, total], { extrapolateRight: 'clamp' })
  
  return (
    <AbsoluteFill style={{ background: '#0E1411', padding: '20px', display: 'flex', gap: 12 }}>
      {/* Items column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
          Order #2841 · Table 4 · Sarah M.
        </div>
        {ITEMS.map((item, i) => {
          const delay = 8 + i * 16
          const opacity = interpolate(frame, [delay, delay + 14], [0, 1], { extrapolateRight: 'clamp' })
          const y = interpolate(frame, [delay, delay + 14], [8, 0], { extrapolateRight: 'clamp' })
          return (
            <div key={i} style={{
              opacity, transform: `translateY(${y}px)`,
              background: 'rgba(255,255,255,0.05)', borderRadius: 8,
              padding: '10px 12px', display: 'flex', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{item.name}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{item.mod}</div>
              </div>
              <div style={{ fontSize: 13, color: '#7FB897', fontWeight: 600 }}>${item.price.toFixed(2)}</div>
            </div>
          )
        })}
      </div>

      {/* Checkout column */}
      <div style={{ width: 130, background: 'rgba(0,0,0,0.35)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>
            ${displayedTotal.toFixed(2)}
          </div>
        </div>
        <div style={{ fontSize: 9, color: '#7FB897', background: 'rgba(127,184,151,0.12)', padding: '4px 8px', borderRadius: 6, textAlign: 'center' }}>
          +{Math.round(displayedTotal)} loyalty pts
        </div>
        {frame > 100 && (
          <div style={{
            opacity: interpolate(frame, [100, 116], [0, 1], { extrapolateRight: 'clamp' }),
            transform: `scale(${interpolate(frame, [100, 116], [0.88, 1], { extrapolateRight: 'clamp' })})`,
            background: '#7FB897', color: '#0E1411', border: 'none',
            borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, textAlign: 'center',
          }}>
            Pay →
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}
```

---

### COMPOSITION 3 — WinbackComp.tsx
Used in: ReorderScene or a dedicated winback scene

3-step flow animating in sequentially:

```tsx
const STEPS = [
  { num: '1', title: 'Emma K. hasn\'t visited in 68 days', sub: 'Last order: Acai Bowl + Oat Latte · $24.50', tag: 'At risk', tagColor: '#f87171', tagBg: 'rgba(248,113,113,0.12)' },
  { num: '2', title: 'Aria drafts a personalised message', sub: '"Hey Emma, we miss you! Your Acai Bowl is waiting — 15% off this week 🌿"', tag: 'AI drafted', tagColor: '#60a5fa', tagBg: 'rgba(96,165,250,0.12)' },
  { num: '3', title: 'You approve → sent via SMS', sub: 'Emma visited 3 days later · $28.50 spent', tag: 'Customer returned ✓', tagColor: '#7FB897', tagBg: 'rgba(127,184,151,0.12)' },
]

export const WinbackComp: React.FC = () => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: '#0E1411', padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {STEPS.map((step, i) => {
        const delay = 10 + i * 35
        const opacity = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateRight: 'clamp' })
        const x = interpolate(frame, [delay, delay + 20], [-12, 0], { extrapolateRight: 'clamp' })
        return (
          <div key={i} style={{ opacity, transform: `translateX(${x}px)`, display: 'flex', gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#7FB897', fontWeight: 600, flexShrink: 0, marginTop: 2 }}>
              {step.num}
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, marginBottom: 4 }}>{step.title}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginBottom: 8 }}>{step.sub}</div>
              <span style={{ fontSize: 9, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: step.tagBg, color: step.tagColor }}>
                {step.tag}
              </span>
            </div>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}
```

---

### COMPOSITION 4 — BrainOrbComp.tsx
Used in: BrainScene — replaces the static CSS orb

Animating orbs orbiting the central Aria core, each lighting up in turn:

```tsx
const MODULES = ['Daily', 'Customers', 'Reviews', 'Finance', 'POS', 'Stock', 'Compliance', 'Marketing']

export const BrainOrbComp: React.FC = () => {
  const frame = useCurrentFrame()
  const activeIdx = Math.floor(frame / 20) % MODULES.length
  
  return (
    <AbsoluteFill style={{ background: '#0E1411', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Central glow */}
      <div style={{
        position: 'absolute', width: 80, height: 80, borderRadius: '50%',
        background: 'radial-gradient(circle, #7FB897 0%, rgba(127,184,151,0.3) 40%, transparent 70%)',
        boxShadow: '0 0 40px rgba(127,184,151,0.4)',
      }} />
      
      {/* Orbiting modules */}
      {MODULES.map((mod, i) => {
        const angle = (i / MODULES.length) * Math.PI * 2 + (frame * 0.01)
        const radius = 120
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius * 0.55 // ellipse
        const isActive = i === activeIdx
        return (
          <div key={mod} style={{
            position: 'absolute', transform: `translate(${x}px, ${y}px)`,
            transition: 'all 0.3s ease',
            width: 72, height: 72, borderRadius: '50%',
            border: `1px solid ${isActive ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.1)'}`,
            background: isActive ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.03)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: isActive ? '#7FB897' : 'rgba(255,255,255,0.35)',
            letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase',
            boxShadow: isActive ? '0 0 20px rgba(127,184,151,0.2)' : 'none',
          }}>{mod}</div>
        )
      })}
    </AbsoluteFill>
  )
}
```

---

### HOW TO INTEGRATE EACH COMPOSITION INTO SCENES

For each scene that gets a Remotion player, replace the existing static mockup
(receipt div, brain CSS orb, win-back copy, etc.) with:

```tsx
import { Player } from '@remotion/player'
import { DailyBriefingComp } from '../remotion/DailyBriefingComp'

// Inside the scene JSX, replace the static mockup:
<Player
  component={DailyBriefingComp}
  durationInFrames={180}
  fps={30}
  compositionWidth={520}
  compositionHeight={300}
  style={{ width: '100%', maxWidth: 540, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)' }}
  loop
  autoPlay
/>
```

Scene → Composition mapping:
- MeetAriaScene → DailyBriefingComp (replace the feature grid OR add alongside)
- SmartPOSScene → POSCheckoutComp (replace the receipt mockup div)
- ReorderScene → WinbackComp (replace the static content)
- BrainScene → BrainOrbComp (replace the .brain-system CSS orb)

Keep everything else in each scene unchanged (heading, label, checklist etc).

---

## RULES
- Read CLAUDE.md (RULE 0) — never remove any existing feature or scene
- npm run build must pass before EVERY commit
- Push + verify git log origin/main..HEAD empty after each commit
- Do NOT change: scene order in scene-data.ts, scroll engine, LandingShell, StickyOverlay
- Do NOT change JetBrains Mono — used in POS terminal
- Remotion compositions: no video files, no export/render — browser-only <Player>
- Keep all existing scene headings and copy unchanged — only replace the visual mockup part

## Commits (one per logical change)
1. "feat(landing): Cormorant + Outfit typography — remove Fraunces/Inter/Sora"
2. "feat(landing/remotion): DailyBriefingComp — animated briefing lines"
3. "feat(landing/remotion): POSCheckoutComp — animated checkout flow"
4. "feat(landing/remotion): WinbackComp — animated win-back 3-step"
5. "feat(landing/remotion): BrainOrbComp — animated orbiting modules"
6. "feat(landing/remotion): integrate all 4 compositions into scenes"

## Start
PART 1 first (typography). Build, verify, commit, push.
Then PART 2 — create the remotion/ folder, build each composition, integrate one at a time.
