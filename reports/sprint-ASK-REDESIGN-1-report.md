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

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)
