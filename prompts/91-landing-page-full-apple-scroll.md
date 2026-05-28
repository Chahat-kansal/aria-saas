# Prompt 91 - Make the WHOLE landing page Apple-style scene scroll

## What's broken
The hero (iPad mockup + "Your AI co-operator" headline) scrolls correctly through
the scene framework. The middle sections of the landing page DO NOT - they sit
as plain HTML below the scene container in src/components/marketing/landing/LandingShell.tsx
and they scroll like a normal page.

Specifically, these sections need to be converted to scenes:
1. "Running a small business is hard" - the 3-card problem section
2. "Meet Aria - One AI that knows your entire business" - the 6-feature grid
3. "Up and running in 10 minutes" - the 3-step onboarding row
4. "The only POS that gets smarter every day" - the POS feature card with checkmarks + sample receipt
5. "Built for Australian retail and hospitality" - whatever industries strip exists at the bottom

## Architecture - DO NOT rebuild from scratch
The scene infrastructure already exists and works. Don't touch:
- src/components/marketing/landing/StickyOverlay.tsx (scene counter + CTA pills)
- src/components/marketing/landing/ProgressBar.tsx
- src/components/marketing/landing/HeroAct.tsx
- The existing 10 scenes in src/components/marketing/landing/scenes/
- The scroll mechanics in LandingShell.tsx (intersection observer, sticky positioning, scene transitions)

What you ARE doing:
- Creating NEW scene components for each currently-flat section
- Registering them in src/components/marketing/landing/scene-data.ts
- REMOVING the corresponding flat HTML blocks from LandingShell.tsx (so they don't render twice)

## Pre-edit read
1. View src/components/marketing/landing/LandingShell.tsx - find the section blocks below the </ScrollPinHero> closing tag (or wherever the scene container ends). These are the flat sections.
2. View src/components/marketing/landing/scene-data.ts - this is the scene registry. Note the SceneDef interface and how existing scenes are registered with id + className + Component.
3. View one existing scene (e.g. src/components/marketing/landing/scenes/BrainScene.tsx) - that's the template every new scene must follow. Note: it uses CSS classes from a global stylesheet, NOT inline styles. The classes are .scene-brain, .scene-problem etc - find the stylesheet (probably src/app/(marketing)/landing.css or src/components/marketing/landing/landing.css) and read the existing scene styles so the new ones match.

## Build - 5 new scene components

For EACH section, create a new file in src/components/marketing/landing/scenes/:

### ProblemSceneNew.tsx ("Running a small business is hard")
- Eyebrow: "THE PAIN"
- Headline (h2): "Running a small business is hard."
- Subhead: "Your current tools make it harder."
- Three cards in a row (single column on mobile), each with:
  - A subtle illustration or emoji-free icon (use Lucide icons via the existing icon component pattern)
  - Card title + 1-line body
- Cards: "You check 6 different apps for sales, stock, reviews, and staff" / "You find out about problems after they've already cost you money" / "Your accountant tells you what happened last month. Nobody tells you what to do today."
- Use the locked landing palette (#7FB897 accent, #0a0a0f bg, white text)
- Reveal animation: cards fade up with 100ms stagger using the existing useReveal hook from LandingShell or equivalent

### MeetAriaScene.tsx ("One AI that knows your entire business")
- Eyebrow: "MEET ARIA"
- Headline: "One AI that knows your entire business"
- 6 feature cards in a 2x3 grid (1 column on mobile)
- Each card: subtle icon, title (Daily Briefing / Ask Aria / POS System / Competitor Intelligence / Smart Alerts / Weekly Report), 1-sentence description
- Cards arrive with a staggered fade-in as the scene enters viewport

### TenMinutesScene.tsx ("Up and running in 10 minutes")
- Eyebrow: "GETTING STARTED"
- Headline: "Up and running in 10 minutes"
- Three numbered steps in a row (1, 2, 3 - use lime-green badge circles matching the existing brand accent)
- Each step has a title + 1-line description: "Connect your business" / "Aria learns your business" / "Get your first briefing"
- On mobile, the three steps become vertical
- Use connector lines between steps on desktop only (subtle dashed line in the brand green)

### SmartPOSScene.tsx ("The only POS that gets smarter every day")
- Eyebrow: "POS"
- Split layout: left half checklist with 6 ticked items (Barcode scanning + product search / Cash, card, split payments / Loyalty points built in / Age verification for liquor / Receipt email + print / Real-time stock updates / Offline mode)
- Right half: sample receipt mockup with 3 line items and a green "Card" button at the bottom - similar style to existing receipt mockup that's currently in LandingShell
- On mobile, stacks vertically (list on top, receipt below)

### AustraliaWideScene.tsx ("Built for Australian retail and hospitality")
- Eyebrow: "INDUSTRIES"
- Headline: "Built for Australian retail and hospitality"
- A row of industry pills (cafe / bakery / liquor / retail / restaurant / hospitality) - each as a soft outlined pill with subtle hover lift
- Below: 2-3 testimonial-style quote cards if business names exist, or a clean "X businesses already running on Aria" stat card (use real numbers if a count query exists, otherwise placeholder "Trusted by Australian small business")

## Wire each into scene-data.ts

Add to the SCENES array in scene-data.ts, in this exact order between the existing
hero and the existing ReorderScene:

```typescript
{ id: '02', className: 'scene-problem-new',  Component: ProblemSceneNew },
{ id: '03', className: 'scene-meet-aria',    Component: MeetAriaScene },
```

Then continuing the existing scenes (BrainScene, ReorderScene etc) keep their
position but renumber the ids so they stay sequential. Finally before
TestimonialScene/OutroScene add:

```typescript
{ id: 'XX', className: 'scene-ten-minutes', Component: TenMinutesScene },
{ id: 'XX', className: 'scene-smart-pos',   Component: SmartPOSScene },
{ id: 'XX', className: 'scene-australia-wide', Component: AustraliaWideScene },
```

Total scene count becomes 13-15 (was 12). Update the "12" hardcoded in
StickyOverlay.tsx (line where it shows "X / 12") to use SCENES.length so it's
self-maintaining.

## Remove the flat HTML from LandingShell.tsx
After the scene container closes, the existing flat sections must be REMOVED -
otherwise content renders twice. Be careful: footer + final CTA stay; only
the converted sections are removed.

## CSS for new scenes
Add new class blocks to whatever stylesheet hosts the existing .scene-brain,
.scene-split, .scene-ask classes. Each new scene gets ~30-50 lines of CSS:
layout, typography, animation entry. Match the existing scenes - same animation
duration, same easing, same padding scale.

## Mobile - non-negotiable
Every scene must look right on a 375px iPhone SE width. Apple-style scroll on
mobile often janks. Test mentally: does the scene's content fit one viewport on
mobile without scroll-trapping the user? If not, the scene fails and needs
shorter content.

## Rules
- npx tsc --noEmit + npm run build pass before each commit
- The existing 10 scenes are LOCKED - do not modify them
- Re-use the existing useReveal hook from LandingShell - do not write a new one
- Re-use the existing CSS variables / palette (#7FB897, #0a0a0f, etc.)
- Do not introduce new dependencies - the existing scroll mechanics work
- All new scenes use Lucide icons (already a dep) or the existing icon component

## Commits
- "feat(landing): ProblemSceneNew + MeetAriaScene - replace flat 'problem' and 'meet aria' sections with proper scenes"
- "feat(landing): TenMinutesScene + SmartPOSScene + AustraliaWideScene - convert remaining flat sections"
- "fix(landing): remove flat duplicate sections from LandingShell, update scene counter to use SCENES.length"
- Then: git push origin main

## If limit runs low
Priority order:
1. Problem + Meet Aria scenes (the first two flat sections users hit after the hero - biggest visual impact)
2. The flat-removal commit (critical - without this, content renders twice)
3. TenMinutes + SmartPOS + Australia (later in the page, less hit by users)
Finish current commit, push, STOP, report.

## Honest expectation
This is genuine work but bounded. 5 new component files, scene-data update, CSS
additions, flat-HTML removal. Realistic outcome: 4 of 5 scenes will land clean,
1 will need a polish follow-up where the animation timing or mobile layout
feels off. That polish is a separate small prompt later. Ship what works first.
