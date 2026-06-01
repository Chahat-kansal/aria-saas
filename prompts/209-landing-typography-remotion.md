# Prompt 209 — Landing Page Redesign

Redesign the landing page visual layer based on the approved mockup (aria-landing-mockup-v2.html).

## ABSOLUTE NON-NEGOTIABLES
1. DO NOT touch LandingShell.tsx — scroll/hide engine stays 100% intact
2. DO NOT touch StickyOverlay.tsx scroll logic — only remove the scene counter number
3. DO NOT touch ProgressBar.tsx
4. DO NOT touch scene-data.ts
5. DO NOT change number of scenes or their order
6. The crossfade scroll effect, hero parallax, sticky overlay, progress bar — ALL STAY
7. npm run build must pass before every commit

## Pre-flight
```
git pull origin main
npx tsc --noEmit && npm run build
```
Read CLAUDE.md (RULE 0). Push + verify after every commit.

---

## TASK 1 — Remove scene counter from StickyOverlay

In src/components/marketing/landing/StickyOverlay.tsx:
Remove ONLY the scene-counter div (the one showing counterNum / TOTAL).
Keep: brand-mark button, Log in link, overlay-bottom CTAs, all scroll logic.

New header:
```tsx
<header className="overlay-top">
  <button className="brand-mark" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">
    Aria
  </button>
  <Link href="/login" className="overlay-login">Log in</Link>
</header>
```

Remove counterNum from the Props interface.
In LandingShell.tsx: stop passing counterNum to StickyOverlay (keep setCounterNum if needed for TS).

Commit: "feat(landing): remove scene counter number from overlay"

---

## TASK 2 — Typography swap

In src/app/layout.tsx — replace Fraunces and Inter (and Sora if present) with:

```typescript
import { Cormorant, Outfit, JetBrains_Mono } from 'next/font/google'

const cormorant = Cormorant({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})
```

Keep JetBrains_Mono — used in POS terminal.
Update body className to include all 3 variables.

In src/app/globals.css:
- .font-display -> font-family: var(--font-display)
- .font-ui -> font-family: var(--font-body)
- body font-family -> var(--font-body)

Cormorant renders smaller than Fraunces — bump landing h1 font-size by ~8-10% via existing CSS vars.

Commit: "feat(landing): Cormorant + Outfit typography — remove Fraunces/Inter/Sora"

---

## TASK 3 — HeroAct redesign

Replace the hero-ipad-stage in src/components/marketing/landing/HeroAct.tsx with a dashboard mockup.
KEEP: hero-act div, ref forwarding, --hero-progress variable, hero-aurora, hero-particles, hero-text-layer, hero-pill, hero-h1, hero-subhead. These are ALL required by LandingShell.

Replace ONLY the hero-ipad-stage div with:
```tsx
<div className="hero-dashboard-stage">
  <div className="hero-dashboard">
    <div className="hero-dash-sidebar">
      <div className="hero-dash-logo">Aria</div>
      {['Morning Briefing','Ask Aria','Customers','Point of Sale','Marketing','Compliance','Bookings'].map((item, i) => (
        <div key={item} className={`hero-dash-nav ${i === 0 ? 'active' : ''}`}>{item}</div>
      ))}
    </div>
    <div className="hero-dash-main">
      <div className="hero-dash-topbar">
        <span className="hero-dash-greeting">Good morning, Chahat</span>
        <span className="hero-dash-date">Monday, 2 June · 8:04 AM</span>
      </div>
      <div className="hero-dash-kpis">
        {[
          { label: 'Revenue today', val: '$2,847', delta: '↑ 18% vs last Mon' },
          { label: 'At-risk customers', val: '3', delta: 'Win-backs drafted' },
          { label: 'Compliance alerts', val: '1', delta: 'BAS due in 14 days' },
        ].map(k => (
          <div key={k.label} className="hero-kpi-card">
            <div className="hero-kpi-label">{k.label}</div>
            <div className="hero-kpi-val">{k.val}</div>
            <div className="hero-kpi-delta">{k.delta}</div>
          </div>
        ))}
      </div>
      <div className="hero-aria-briefing">
        <div className="hero-aria-av">A</div>
        <div>
          <div className="hero-aria-name">Aria says</div>
          <div className="hero-aria-text">
            Your Tuesday revenue is running 18% above last week. Acai Bowl is your top product.
            3 customers have not returned in 60+ days — win-back messages ready for approval.
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

Add CSS for .hero-dashboard-stage and children in the landing CSS file (same file as .hero-ipad).
Match dark forest aesthetic: background #141d16, sidebar #0E1411, sage #7FB897 accents.
The dashboard should sit below the text layer, partially visible, giving depth on scroll.

Commit: "feat(landing/hero): dashboard mockup replaces ipad-stage"

---

## TASK 4 — Remotion compositions

Create src/components/marketing/landing/remotion/ with these 6 files.
Use: AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig from 'remotion'
Font stacks: Outfit for body, Cormorant for display numbers, JetBrains Mono for labels.

### DailyBriefingComp.tsx
4 briefing lines slide in from left with staggered delays (delay = 18 + i*16 frames).
Each has a coloured left-border accent: sage/amber/blue/red.
At frame 90: Aria card fades in.
Background: #0E1411. Loop: 160 frames at 30fps.

### POSCheckoutComp.tsx
3 items slide up one by one (delay = 8 + i*16 frames).
Total counter interpolates 0->32.00 between frames 55-85.
Pay button: spring({ frame: frame-95, fps, config: { damping:12, stiffness:180 } }).
Background: #0E1411. Loop: 150 frames.

### WinbackComp.tsx
3 steps slide in from left (delay = 10 + i*30 frames).
Each step: number circle + card with title, sub, coloured tag.
Tags: red (at risk), blue (AI drafted), sage (returned).
Background: #0E1411. Loop: 140 frames.

### BrainOrbComp.tsx
8 orbit orbs rotating in an ellipse (rx=140, ry=80).
angle = (i/8)*PI*2 + frame*0.012
Active index: Math.floor(frame/20) % 8 — highlighted with sage + glow.
Central Aria core: radial gradient glow #7FB897.
Background: #0E1411. Loop: 200 frames.

### AskAriaComp.tsx
3 Q&A pairs cycling. Each ~180 frames.
Phase 1 (frames 0-40): question types in character by character.
Phase 2 (frames 45-160): answer types in character by character.
Q1: "How's my revenue?" -> "Up 18% — $2,847 so far. Acai Bowl is leading."
Q2: "Any risks?" -> "3 items: low oat milk, BAS due, competitor undercut."
Q3: "How to increase profit?" -> "Bundle Flat White + food. Raise Acai Bowl $1."
Background: #0E1411. durationInFrames: 540, loop.

### RevenueChartComp.tsx
7 bars with spring physics (delay: i*5 frames per bar).
spring({ frame: frame-(i*5), fps, config: { damping:18, stiffness:120 } }) -> height 0 to val/max*160px.
Green gradient bars. Day labels below. Dashed reference line for last week.
Background: #0E1411. Loop: 120 frames.

---

## TASK 5 — Wire compositions into scenes

```tsx
import { Player } from '@remotion/player'
import { XComp } from '../remotion/XComp'

<Player
  component={XComp}
  durationInFrames={N}
  fps={30}
  compositionWidth={560}
  compositionHeight={300}
  style={{ width: '100%', maxWidth: 560, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)' }}
  loop
  autoPlay
/>
```

Wiring map:
- MeetAriaScene.tsx -> add DailyBriefingComp (durationInFrames: 160, height: 310)
- SmartPOSScene.tsx -> replace receipt div with POSCheckoutComp (150)
- ReorderScene.tsx -> replace static content with WinbackComp (140)
- BrainScene.tsx -> replace .brain-system with BrainOrbComp (200, height: 280)
- AskScene.tsx -> add AskAriaComp (540)
- ProblemSceneNew.tsx -> add RevenueChartComp (120, height: 240)

Keep ALL existing headings, labels, copy unchanged in each scene.

Commit: "feat(landing/remotion): 6 animated compositions + wired into scenes"

---

## TASK 6 — Scene CSS polish

In the landing CSS file — update font references only:
- scene h2: font-family var(--font-display)
- scene em: font-style italic (Cormorant italic is beautiful)
- scene-label: font-family var(--font-mono)
- scene body text: font-family var(--font-body), font-weight 300

No layout changes.

Commit: "feat(landing/css): Cormorant/Outfit/Mono scene typography"

---

## COMMIT ORDER
1. remove scene counter
2. typography swap
3. hero dashboard mockup
4. Remotion compositions + wired into scenes (can be one commit)
5. scene CSS polish

Push + verify git log origin/main..HEAD empty after each.

## HARD RULES
- LandingShell.tsx: ZERO changes
- StickyOverlay.tsx: ONLY remove scene-counter div + counterNum prop
- ProgressBar.tsx: ZERO changes
- scene-data.ts: ZERO changes
- --hero-progress and heroRef MUST stay on .hero-act div
- Remotion = browser Player only, no render/export
- JetBrains Mono stays
- npm run build before every single commit
