# ASK-REDESIGN-1 — Ask Aria split-screen redesign + collapsible sidebar

MODE: SOLO. pwd must confirm C:\Users\kansa\aria-saas-audit before any operation.

## What this sprint does
1. Redesign /dashboard/ask-aria into a split-screen layout: LEFT = Aria's space (clay-glass-bento, light cream), RIGHT = conversation panel (dark, frosted).
2. Make the dashboard sidebar collapsible globally (every page benefits).
3. Remove ALL user-visible AI model names and AI cost displays across the app.

## PRE-FLIGHT (mandatory, do all reads before any write)
1. `pwd` → must be C:\Users\kansa\aria-saas-audit
2. Read in full:
   - src/app/dashboard/ask-aria/page.tsx (entire file — note Message interface, blocks render path, parseAriaResponse legacy path, BlockRenderer import, input handling, voice hooks)
   - The dashboard layout file (find it: src/app/dashboard/layout.tsx or equivalent) — note the sidebar component import and how main content width is set
   - The sidebar component itself (follow the import)
   - src/components/aria/BlockRenderer.tsx (just the export signature + block types list — do not modify)
3. Grep for every user-visible model name: `grep -rn "Haiku\|Sonnet\|Opus\|claude-" src/app src/components --include="*.tsx" -l` — list every file that renders a model name in UI (ignore API/lib files where model IDs are config, those stay).
4. Do NOT touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts, the TalkingHead avatar component internals (we REUSE it, not modify it).

## PART 1 — Collapsible sidebar (global)
In the sidebar component:
- Add `collapsed` state, persisted to localStorage key `aria_sidebar_collapsed`.
- Collapsed = icon-only rail (~64px wide), expanded = current width. Smooth width transition (200ms ease).
- Toggle button: chevron at the bottom or top of the sidebar (ti/lucide chevron-left / chevron-right or equivalent already used in the codebase — match existing icon library).
- When collapsed, nav items show icon only with a title tooltip; labels hidden.
- Main content area must flex to fill the freed space (check how layout.tsx constrains width — fix any hardcoded margin-left/width so it responds to sidebar state). If sidebar and layout don't share state, lift the collapsed state to the layout (context or a small zustand store if one already exists — do NOT add a new dependency).
- Keyboard shortcut: `[` toggles collapse (matches Linear/Slack convention). Ignore when focus is in an input/textarea.

## PART 2 — Ask Aria split-screen
Rebuild the page layout (keep ALL existing logic: message state, API call to /api/aria/ask, blocks rendering, voice, history). This is a LAYOUT + STYLE change, not a logic change.

### Structure
```
<div grid: [1fr | 400px], full height>
  <LeftPanel />   ← Aria's space
  <RightPanel />  ← conversation
</div>
```
On screens < 1024px: stack vertically, left panel becomes a compact header strip (avatar small + latest speech line), chat takes the rest.

### LEFT PANEL — clay-glass-bento on light cream
Background: `#f3eee5` with two soft radial blooms:
- sage: `radial-gradient(ellipse at 15% 20%, rgba(127,184,151,0.14), transparent 50%)`
- lavender: `radial-gradient(ellipse at 85% 80%, rgba(180,160,220,0.12), transparent 50%)`

Clay-glass card recipe (use a shared className or styled util, e.g. `.clay-card`):
```css
background: rgba(255,255,255,0.65);
border: 1px solid rgba(255,255,255,0.9);
backdrop-filter: blur(16px);
border-radius: 24px;
box-shadow:
  0 10px 30px rgba(45,82,64,0.10),
  0 3px 8px rgba(45,82,64,0.06),
  inset 0 2px 4px rgba(255,255,255,0.9),
  inset 0 -2px 6px rgba(45,82,64,0.04);
```

Bento composition top→bottom:
1. **Top bar**: business pill (live dot + business name + date, clay pill style) left; "Briefing" ghost button + "+ New action" solid forest button right. Wire Briefing to the existing briefing route/modal; + New action to the existing action-create flow if one exists, else link to /dashboard/actions.
2. **Speech card** (clay, border-radius 6px 26px 26px 26px): shows the FIRST 1–2 sentences of Aria's latest response (derive from the latest assistant message's lead/text block — strip markdown). Sage-green emphasis on dollar figures via regex wrap of `\$[\d,.]+` in a `<span className="text-[#2D5240] font-medium">`.
3. **Avatar zone** (center): REUSE the existing TalkingHead avatar component that already exists in this page or its imports — mount it inside a frosted glass ring:
   - glass ring: 200px circle, `rgba(255,255,255,0.4)` bg, blur, clay shadows
   - if the 3D avatar can't be resized into the ring cleanly in this sprint, fallback: glossy clay sphere (gradient #3a6850→#22402f, inset highlights) with "ARIA" label, and keep the 3D head where it currently floats — note which path you took in the report.
   - Above the ring: animated 5-bar listening wave (CSS keyframes, sage #5a8a6e) + label that switches: "Aria is listening" (idle) / "Aria is thinking" (request in flight) / "Aria is speaking" (TTS active — hook into existing onSpeakStart/onSpeakEnd bridge if accessible from this page).
   - Slow-rotating dashed halo ring (24s linear infinite) behind the glass ring.
4. **KPI bento row** (3 clay cards): Today's revenue (+ % vs same weekday last week), Orders today (+ delta vs yesterday), Avg basket (+ delta vs target). Source: the SAME data source the dashboard header currently uses (find the existing today-stats fetch/hook — do NOT write new SQL; reuse the hook or its API route). Format: value 26px/500, label 9px uppercase letterspaced, delta 11px (green #2D5240 up / red #b8453a down).

### RIGHT PANEL — dark conversation (keep current behaviour)
Background `#16181a`, left border `rgba(255,255,255,0.06)`.
- Header: "Conversation" (10px uppercase letterspaced, low-contrast) + "New" button wired to existing new-chat handler.
- Messages: user bubbles right-aligned (`#262a2d`, radius 16/16/4/16); Aria messages with small 22px avatar dot, then text, then BlockRenderer output exactly as today (blocks render in this dark panel — verify the RICH-1 block styles read correctly on #16181a; adjust block container bg to rgba(255,255,255,0.04) where needed, do not modify BlockRenderer itself — wrap instead).
- Action buttons + follow-up chips: keep existing handlers, restyle to match mockup (primary sage-tinted, ghost neutral).
- Input: existing input logic, restyled: dark rounded box, mic button, send button (forest bg, sage icon).

## PART 3 — Remove user-visible model names + AI cost
From the grep in pre-flight, in every UI file that shows a model name to end users:
- Replace "Haiku"/"Sonnet"/"Opus" labels with neutral terms: fast tier → "Quick", deep tier → "Deep analysis". If a label adds nothing (e.g. badge "Haiku · 1.8s"), keep ONLY the response time: "1.8s".
- Remove per-session $ cost displays from end-user UI. Keep cost logging in aria_ai_calls untouched (internal). The admin portal may keep model names + costs — admin routes are exempt.
- The model escalation logic itself is untouched — this is display only.

## BUILD GATE
- npx tsc --noEmit → 0 errors
- npm run build → PASS
- ONE commit, all files batched. Message: `feat(ask-redesign-1): clay-glass-bento split-screen Ask Aria, collapsible sidebar, hide model names`
- STOP before push. Write reports/sprint-ASK-REDESIGN-1-report.md including: files changed, which avatar path was taken (3D-in-ring or fallback sphere), the list of files where model names were hidden, and screenshots-worthy notes for founder verification.
- Do not start another sprint.

## DO NOT
- Do not modify BlockRenderer.tsx internals, route.ts, ask-types.ts.
- Do not touch vercel.json (stays at 22 functions).
- Do not add new npm dependencies.
- Do not remove voice/TTS functionality — restyle around it.
- Additive str_replace edits where possible; full-file rewrite allowed ONLY for the page.tsx layout JSX section if str_replace is impractical — keep all handlers/state intact.
