# Sprint ASK-REDESIGN-1 — Ask Aria Split-Screen + Collapsible Sidebar + Hide Model Names
**Date:** 2026-06-11
**Status:** COMPLETE — build verified green

---

## Files changed

| File | Change | Part |
|---|---|---|
| `src/components/dashboard/Sidebar.tsx` | Collapsible rail: collapsed state, localStorage persist, keyboard `[`, icon-only mode, toggle button | Part 1 |
| `src/app/dashboard/ask-aria/page.tsx` | Split-screen layout: clay-glass LEFT panel + dark Conversation RIGHT panel; model label removal | Parts 2 + 3 |
| `src/components/chat/ChatWindow.tsx` | Model selector labels: Haiku→Quick, Sonnet→Deep analysis, Opus→Expert | Part 3 |
| `src/app/dashboard/agents/page.tsx` | Revenue Council synthesis model display: human-readable tier names | Part 3 |
| `src/app/dashboard/settings/ai-usage/page.tsx` | Removed "(Sonnet)" from description copy | Part 3 |

---

## Part 1 — Collapsible Sidebar

- `collapsed` state persisted to `localStorage` key `aria_sidebar_collapsed`
- `[` keyboard shortcut toggles (ignored when focus is in input/textarea)
- Width: `64px` collapsed (icon-only rail) → `220px` expanded, `200ms ease` transition via inline style
- Nav items: `title` tooltip when collapsed; label/badge hidden; `justify-center px-0` when icon-only
- Ask Aria button: `✦` icon-only when collapsed, full text when expanded
- Chevron toggle button at bottom of sidebar
- User footer: stacked icons when collapsed, full row when expanded
- Business switcher, plan badge, health indicator hidden when collapsed
- DashboardShell `flex` layout means main content fills freed space automatically — no hardcoded widths to change

---

## Part 2 — Ask Aria Split-Screen

### Layout
- Outer: `display: 'grid', gridTemplateColumns: '1fr 400px', height: '100dvh'`
- Responsive: `@media (max-width: 1023px)` stacks vertically; left panel becomes compact header strip

### LEFT PANEL — clay-glass-bento on `#f3eee5`
- Background: `#f3eee5` + two radial blooms (sage + lavender)
- **Top bar**: live-dot business pill (clay style) + Briefing ghost button + "+ New action" forest button
- **Speech card** (clay, `border-radius: 6px 26px 26px 26px`): last assistant message snippet, `\$[\d,.]+` wrapped in sage `<span>`
- **Avatar zone**: AriaTalkingHead inside 200px frosted glass ring; dashed halo ring rotating 24s; 5-bar listening wave; status label ("Aria is listening" / "thinking" / "speaking")
- **KPI bento row**: 3 clay cards — Revenue today / Orders today / Avg basket — sourced from existing `vitals` fetch (no new SQL)
- Avatar path taken: **3D-in-ring** (`AriaTalkingHead` mounted inside glass ring)

### RIGHT PANEL — dark Conversation
- Background: `#16181a`, left border `rgba(255,255,255,0.06)`
- **Header**: "CONVERSATION" (10px uppercase, `rgba(255,255,255,0.28)`) + today's revenue inline + History toggle + Intel link + New button
- **User bubbles**: `#262a2d` bg, `rgba(255,255,255,0.06)` border, `16px 16px 4px 16px` radius
- **Aria bubbles**: `rgba(255,255,255,0.04)` bg, `rgba(255,255,255,0.05)` border, `4px 16px 16px 16px` radius
- **BlockRenderer**: each block wrapped in `background: rgba(255,255,255,0.04)` container — BlockRenderer internals untouched
- **Composer**: `rgba(22,24,26,0.98)` surface, input `rgba(255,255,255,0.07)` bg with brighter border

### Preserved — confirmed present
- **`parseAriaResponse`**: present at the assistant message render path (strips supabase URLs, segment loop, AriaMarkdown + AriaArtifact per segment)
- **Voice hooks**: `VoiceInput onTranscript={t => { setInput(p => p ? p + ' ' + t : t) }}` — wired in composer input row
- **`AriaTalkingHead`**: mounted in left panel glass ring AND floating in right panel composer zone
- **`BlockRenderer` import**: unchanged — same import, used as `<BlockRenderer block={block} onChoice=...>` inside new wrapper
- All action handlers: `send`, `newConversation`, `savePlanAction`, `confirmAction`, `cancelAction`, `regenerate`, `setShowHistory`, `abortRef.current?.abort()`
- `ActionCard`, `DeliverableToolbar`, `MessageActions`, `AuditLogCard`, `ActionPreviewCard`, `ChatSuggestions`, `AriaGreeting` — all present

---

## Part 3 — Remove user-visible model names

| Location | Old | New |
|---|---|---|
| `ChatWindow.tsx` MODELS array labels | Haiku / Sonnet / Opus | Quick / Deep analysis / Expert |
| `agents/page.tsx` Revenue Council synthesis display | raw model slug | Quick / Deep analysis / Expert |
| `ai-usage/page.tsx` description | "premium AI (Sonnet)" | "premium AI" |
| `ask-aria/page.tsx` per-message model badge | `⚡ fast / 🧠 deep / 🔬 expert` label | removed entirely (only "Aria" label remains) |

Admin routes (`admin/*`) exempt — not modified.

---

## Founder verify checklist

- [ ] Sidebar: press `[` — collapses to 64px icon rail, main content fills width. Press `[` again → expands. Persists on reload.
- [ ] Ask Aria (`/dashboard/ask-aria`): left cream panel visible with business pill, speech card, avatar ring, 3 KPI cards. Right dark panel shows "CONVERSATION" header.
- [ ] Send a message — user bubble appears `#262a2d` (near-black), Aria reply appears in darker translucent bubble
- [ ] If a rich block response is returned — BlockRenderer card has slight frosted tint, still renders normally
- [ ] Voice: mic button in composer still active; speaking into mic fills the textarea
- [ ] On screen < 1024px: split collapses to vertical stack; left panel becomes compact header strip
- [ ] Chat Window model selector: shows "Quick / Deep analysis / Expert" (no Haiku/Sonnet/Opus)

---

---

## ASK-REDESIGN-1-FIX — Visual bug fixes (follow-up)

### Investigation findings

**Bug 1 — Sidebar file audit:**
- `src/app/dashboard/layout.tsx` imports and renders `<DashboardShell>`, not `Sidebar` directly.
- `DashboardShell.tsx` imports `{ Sidebar }` from `@/components/dashboard/Sidebar` (line 4) and renders it on lines 53 and 78.
- Conclusion: the collapse implementation applied to `Sidebar.tsx` in Part 1 is in the **correct file**. No wrong-file issue. Bug 1 does not exist as a mismatch — implementation is wired correctly end-to-end.

**Bug 2 — Ask-aria not full-bleed:**
- `DashboardShell` always rendered a desktop top bar (Schedule PDF + Briefing buttons, ~40px) and a mobile top bar (52px) above `<main>`.
- `ask-aria/page.tsx` used `height: '100dvh'` which is the full viewport — this extended beyond the `<main>` container and caused scrolling.
- Fix applied:
  - Both top bars wrapped in `{pathname !== '/dashboard/ask-aria' && (...)}` — hidden on ask-aria only.
  - `AriaAwarenessBar` similarly suppressed on ask-aria.
  - `<main>` className: `overflow-y-auto` → `overflow-hidden` on ask-aria (via ternary).
  - `ask-aria/page.tsx`: `height: '100dvh'` → `height: '100%'` (both loading spinner wrapper and main grid wrapper).

**Bug 3 — Floating overlays on ask-aria:**
- `AriaBrainPanel` (🧠 floating brain bubble, `position: fixed, bottom: 180, right: 24`) is globally mounted in `src/app/dashboard/layout.tsx`.
- `AriaFloatingButton` (green floating Aria button, `position: fixed, bottom: 24, right: 24`) is globally mounted in the **root** `src/app/layout.tsx`.
- `AriaFloatingPanel` (the TalkingHead overlay) is rendered inside `AriaFloatingButton` — suppressing the button suppresses the panel.
- Fixes applied:
  - `AriaBrainPanel.tsx`: added `usePathname` import + `if (pathname?.startsWith('/dashboard/ask-aria')) return null` after all hooks.
  - `AriaFloatingButton.tsx`: added `'/dashboard/ask-aria'` to the EXCLUDED list — returns null before rendering the button or panel.

### Files changed (FIX)

| File | Change |
|---|---|
| `src/components/dashboard/DashboardShell.tsx` | Hide mobile + desktop top bar + AriaAwarenessBar on ask-aria; main uses overflow-hidden on ask-aria |
| `src/app/dashboard/ask-aria/page.tsx` | `height: '100dvh'` → `height: '100%'` (loading + main wrapper) |
| `src/components/aria/AriaBrainPanel.tsx` | usePathname + return null on /dashboard/ask-aria |
| `src/components/AriaFloatingButton.tsx` | Added /dashboard/ask-aria to EXCLUDED list |

### Founder verify checklist (FIX)

- [ ] `/dashboard/ask-aria`: no Schedule PDF / Briefing bar above the split screen — grid fills edge-to-edge
- [ ] Split screen height fills the full available area (sidebar height) — no partial render, no scrollbar
- [ ] No floating 🧠 brain bubble (bottom-right) on ask-aria; it returns on other dashboard pages
- [ ] No floating green Aria button (bottom-right) on ask-aria; it returns on other dashboard pages
- [ ] Sidebar `[` collapse still works on all other pages — unaffected by this fix

---

## ASK-REDESIGN-1-FIX-2 — Format honor + actions 404

### Investigation findings

**Deliverable pipeline files:**
- `src/app/api/aria/ask/route.ts` — main brain; contains the intent router at lines 551–578 (`classifyDeliverableKind` gate + `ariaIntent.intent_type === 'artifact_request'` condition)
- `src/lib/aria/deliverables.ts` — `classifyDeliverableKind` function (regex classifier for dashboard/ranked_list/comparison/scorecard/trend/single_answer); `generateDeliverable` function
- `src/app/api/aria/process-user-task/route.ts` — background task processor that calls `generateDeliverable` for queued tasks
- `src/app/api/aria/deliverables/route.ts` — GET endpoint for fetching completed deliverable outputs from `aria_task_outputs`

**Intent router decision point:**
Lines 551–578 of `ask/route.ts`. Gate: `classifyDeliverableKind(message)` returns non-null AND `!isMultiDomain` AND `ariaIntent.intent_type === 'artifact_request'`. If all three: calls `generateDeliverable` and returns `[DELIVERABLE:outputId]` sentinel. Otherwise falls through to main brain.

**Spreadsheet/export gap:**
`classifyDeliverableKind` has no entry for spreadsheet/csv/excel/export — these requests correctly returned null and fell through to main brain, BUT if the message also matched a ranked_list keyword (e.g. "top products as a spreadsheet"), it would enter the deliverable path and return an HTML block instead of a spreadsheet AskBlock.

**FIX 1 approach taken — intent router bypass (smaller, safer):**
Added `const SPREADSHEET_RE = /spreadsheet|\bcsv\b|excel|export/i` and appended `&& !SPREADSHEET_RE.test(message)` to the deliverable gate condition. When a message matches this regex, the deliverable path is bypassed entirely and the main brain handles it with its existing RICH-1 spreadsheet-first rules. No changes to `deliverables.ts` or `generateDeliverable` — avoids introducing a new AskBlock emission path into the HTML-focused deliverable pipeline.

**ARTIFACT_INSTRUCTIONS:**
- Exported from `src/lib/aria-system-prompt.ts` (line 12) — large `<aria_artifact>` XML format block.
- Was imported in `ask/route.ts` (line 17) and injected at line 1230: `${ARTIFACT_INSTRUCTIONS}`.
- `extractBlocks` at line 52 only parses `<json_blocks>` XML — it does NOT have a legacy `<aria_artifact>` fallback. Any old saved `<aria_artifact>` messages are handled client-side in `parseAriaResponse` (ask-aria/page.tsx), NOT in `extractBlocks`. So the backend injection is fully removable with no risk to old message rendering.

**Actions 404:**
- `+ New action` button linked to `/dashboard/actions` — no such folder exists.
- The real Aria actions/recommendations surface is `/dashboard/autopilot`, which renders `AutopilotAction[]` (aria_autopilot_actions) with approve/reject/execute UI. This is the canonical page for reviewing and acting on Aria-generated action recommendations.

### FIX 1 — Format honor

**File:** `src/app/api/aria/ask/route.ts`
- Added `SPREADSHEET_RE` constant before deliverable gate
- Deliverable gate now: `deliverableKind && !isMultiDomain && ariaIntent.intent_type === 'artifact_request' && !SPREADSHEET_RE.test(message)`
- Result: "top products as a spreadsheet", "export to CSV", "give me an Excel report" now bypass the HTML deliverable and go to main brain → RICH-1 spreadsheet block returned

### FIX 2 — Remove ARTIFACT_INSTRUCTIONS injection

**File:** `src/app/api/aria/ask/route.ts`
- Removed `import { ARTIFACT_INSTRUCTIONS } from '@/lib/aria-system-prompt'` (replaced with comment)
- Removed `${ARTIFACT_INSTRUCTIONS}` from system prompt string — the `<aria_artifact>` XML format conflicted with `json_blocks`
- `extractBlocks` function and its `<json_blocks>` parser: untouched
- `aria-system-prompt.ts` export: untouched (preserved for any other consumers)

### FIX 3 — Actions 404

**File:** `src/app/dashboard/ask-aria/page.tsx`
- Changed `+ New action` Link: `/dashboard/actions` → `/dashboard/autopilot`
- Autopilot page shows all pending/history Aria actions with approve/reject/execute capability

### Files changed (FIX-2)

| File | Change |
|---|---|
| `src/app/api/aria/ask/route.ts` | SPREADSHEET_RE bypass on deliverable gate; remove ARTIFACT_INSTRUCTIONS import + injection |
| `src/app/dashboard/ask-aria/page.tsx` | + New action link: /dashboard/actions → /dashboard/autopilot |

### Founder verify checklist (FIX-2)

- [ ] Ask "show me top products as a spreadsheet" → should get a spreadsheet/table block, NOT an HTML deliverable widget
- [ ] Ask "give me a dashboard" → should still get the HTML deliverable (deliverable path not broken)
- [ ] Ask "export my sales to CSV" → should get a download block from the main brain
- [ ] Click "+ New action" on ask-aria left panel → goes to /dashboard/autopilot (not 404)
- [ ] Ask a business question → response is clean json_blocks format, no `<aria_artifact>` XML leaking

---

## ASK-REDESIGN-1-FIX-3 — Panel ratio + visible sidebar toggle + verify hidden overlays

### Investigation findings (verbatim)

**Finding 1 — pwd:** `C:\Users\kansa\aria-saas-audit` confirmed.

**Finding 2 — Top bar hiding check in DashboardShell.tsx:**
The FIX-1 edit IS in git history (commit `e2fd186d fix(ask-aria): full-bleed layout + suppress floating overlays on ask-aria route`). The exact checks were:
- Line 85: `{pathname !== '/dashboard/ask-aria' && (` — mobile top bar
- Line 131: `{pathname !== '/dashboard/ask-aria' && (` — desktop top bar
- Line 147: `{pathname !== '/dashboard/ask-aria' && <AriaAwarenessBar />}`
- Line 148: `pathname === '/dashboard/ask-aria' ? 'overflow-hidden' : 'overflow-y-auto'`
All four used **strict equality** — fragile against trailing slash or sub-routes. Replaced with a single `isAskAria = pathname?.startsWith('/dashboard/ask-aria') ?? false` flag.

**Finding 3 — Floating avatar audit (the FastGridLayout lesson):**
Files mounting floating avatar components:
- `src/components/AriaFloatingButton.tsx` — root layout; ALREADY excludes ask-aria via EXCLUDED list (`pathname === p || pathname.startsWith(p + '/')` — robust, no change needed)
- `src/components/AriaFloatingPanel.tsx` — only rendered inside AriaFloatingButton (suppressed transitively)
- `src/components/aria/AriaBrainPanel.tsx` — dashboard layout; ALREADY returns null via `pathname?.startsWith('/dashboard/ask-aria')` (FIX-1)
- `src/components/TalkToAria.tsx` — landing page only (mounted via `scene-data.tsx` → `TalkToAriaScene`), never on dashboard — no change needed
- **`src/app/dashboard/ask-aria/page.tsx` line 1494 — THE ACTUAL CULPRIT.** The page itself renders a SECOND floating `AriaTalkingHead` in a `position: fixed, bottom: 0, right: 0, width: 120` div (class `aria-avatar-float`). This is the small character avatar visible in the bottom-right of the screenshot. The earlier ASK-REDESIGN-1 report even documented it: "AriaTalkingHead: mounted in left panel glass ring AND floating in right panel composer zone." The FIX-1 guards on AriaFloatingButton/AriaBrainPanel were correct but could never touch this one.

**Finding 4 — Sidebar toggle:**
The chevron toggle DOES exist (lines 507–521) and is always rendered (not gated by `collapsed`). BUT: it is at the **bottom** of the sidebar (below all nav, above the user footer), uses a 14px icon (`w-3.5 h-3.5`), and base colour `text-[rgba(255,255,255,0.2)]` — 20% white on black, effectively invisible until hovered. Click target ~30px tall via `py-1.5`. It exists but is undiscoverable — which matches the founder's experience.

### Fixes applied

**Fix 1 — panel ratio flip** (`ask-aria/page.tsx` line 969)
- `gridTemplateColumns: '1fr 400px'` → `'minmax(380px, 420px) 1fr'`
- Left Aria panel: fixed 380–420px band; right dark chat panel: all remaining space
- ALSO corrected `height: '100dvh'` → `'100%'` on the same grid line — this inner grid still had the viewport height that FIX-1 only removed from the two outer wrappers, causing the grid to overflow its `overflow-hidden` parent (composer clipped). Now the grid exactly fills the main content area.
- Mobile breakpoint logic (`.aria-split-grid` stacking <1024px) untouched.

**Fix 2 — bulletproof top-bar hiding** (`DashboardShell.tsx`)
- Added `const isAskAria = pathname?.startsWith('/dashboard/ask-aria') ?? false`
- Applied to all four sites: mobile top bar, desktop top bar, AriaAwarenessBar, main overflow class
- No dev `console.log` was committed — none was needed; the root cause was the strict-equality check, fixed by `startsWith`. Verified: `grep console.log src/components/dashboard/DashboardShell.tsx` → no matches from this change.

**Fix 3 — eliminate floating avatar on ask-aria desktop** — files changed:
| File | Change |
|---|---|
| `src/app/dashboard/ask-aria/page.tsx` | Added `@media (min-width: 1024px) { .aria-avatar-float { display: none !important; } }` — hides the page's own bottom-right floating AriaTalkingHead on desktop |
| `src/components/AriaFloatingButton.tsx` | No change needed — exclude list already robust (verified) |
| `src/components/aria/AriaBrainPanel.tsx` | No change needed — startsWith guard already present (verified) |
| `src/components/TalkToAria.tsx` | No change — landing page only, never mounted on dashboard |

Rationale for media-query (not removal): on screens <1024px the left panel's glass-ring avatar is `display: none` (mobile stacking), so the floating avatar is the ONLY avatar there — removing the element entirely would delete the avatar feature from mobile (RULE 0). On desktop ≥1024px the glass-ring avatar is visible, so the bottom-right corner is now empty as required.

**Fix 4 — visible sidebar toggle** (`Sidebar.tsx` header)
- New 32×32px (`w-8 h-8`) chevron button in the sidebar header, top-right next to the ariaOS logo
- Always rendered in both states: collapse chevron (←) when expanded, expand chevron (→) below the "a" mark when collapsed
- `aria-label="Collapse sidebar"` / `aria-label="Expand sidebar"` per state
- Visible affordance: `border border-[rgba(255,255,255,0.1)]` + `text-[rgba(255,255,255,0.45)]` base + hover white/bg states
- `hidden md:flex` — desktop only (mobile sidebar overlay keeps its ✕ close button)
- The existing bottom toggle and the `[` keyboard shortcut both kept (additive)

### Additive-only confirmation
Every change is additive: a ratio/height value swap, a route-guard flag consolidation, one desktop-only CSS hide rule (mobile avatar retained), and a second toggle button added alongside the existing one. No component, handler, voice/TTS path, palette, breakpoint, or feature was removed. BlockRenderer, route.ts, ask-types.ts, and AI brain logic untouched.

### Founder verify checklist (FIX-3)
- [ ] Desktop `/dashboard/ask-aria`: dark chat panel is now the DOMINANT area; cream Aria panel is a 380–420px left band
- [ ] No top bar (Schedule PDF / Briefing) above the split screen; no scrollbar; composer fully visible at bottom
- [ ] Bottom-right corner of the screen is EMPTY on desktop — only avatar is in the left panel's glass ring
- [ ] On mobile (<1024px): floating avatar still appears (left panel avatar is hidden there)
- [ ] Sidebar: visible bordered chevron button at top-right of header — click collapses to 64px rail; in rail mode, chevron under the "a" expands. `[` still works.

---

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)
