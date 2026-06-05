# CLAUDE CODE PROMPT — 250: Ask Aria Premium UI Redesign (refined/luxury, grounded in 2026 AI-chat best practice)

Autonomous mode. Build gate (`npx tsc --noEmit` + `npm run build`) before commit. RULE 0 — this is upgrade-only: keep every existing feature (history sidebar, deliverable modal, avatar, blocks, followups, file upload, escalation). RENDERED OUTPUT VERIFICATION required (see end). `pwd` = `C:\Users\kansa\aria-saas-audit`.

## WHY
The owner's verdict: the current Ask Aria UI "looks like a 3rd grade chatbot" and outputs "look basic and small." This is a CRAFT problem, not a feature problem. The page (`src/app/dashboard/ask-aria/page.tsx`, ~1317 lines) has good bones but: 10-11px text everywhere, hand-rolled flat hex inline styles, chat bubbles, no spacing rhythm, no hierarchy, no depth. We are restyling it to a refined/luxury standard that matches a $997/mo product.

## RESEARCH BASIS (2026 AI-chat best practice — apply these specifically)
1. **Kill the bubbles.** Serious AI chat (Claude, ChatGPT, Perplexity) uses FLAT, FULL-WIDTH messages with subtle background differentiation — NOT rounded SMS-style bubbles. Convert assistant messages to full-width flat blocks; user messages get a subtle right-aligned tint, not a candy bubble.
2. **Reading width + density.** Cap the message column at ~720px (65-72 chars/line). Body text 15-16px, line-height 1.6. NO MORE 10-13px walls of grey.
3. **Typographic hierarchy.** Use the brand display serif (Cormorant — already loaded as --font-display) for big numbers, metric values, and the Aria mark. Clean sans (Outfit/--font-body) for body. Big confident numbers (24-28px) for KPIs, not 11px.
4. **Full message states.** Implement: queued (pulsing placeholder), streaming (blinking caret — a small filled square like Claude), complete (reveal per-message actions), error (specific cause + 1 recovery action — NEVER generic "something went wrong"), stopped (preserve partial + Continue/Regenerate). Right now only streaming/done exist.
5. **Per-message actions** on assistant messages: Copy, Regenerate, (Share if deliverable). Hover-reveal on desktop, always-visible on mobile. Copy shows a transient checkmark.
6. **Structured replies are where the design lives.** Assistant markdown must render richly: proper headings, lists, tables, code blocks WITH a copy button. The deliverable/blocks rendering should feel composed, not dumped.
7. **Aria's edge = whole-business context.** Unlike ChatGPT-in-a-sidebar, Aria knows the entire business. Surface that: a slim context strip under the header showing the active business + a few live vitals (today's revenue, sales count) so every answer feels grounded in real data.
8. **Honest, docked composer.** Composer docked at bottom (never floating), grows with content to a cap then scrolls. Cmd/Ctrl+Enter sends, Shift+Enter newline. Stop button visible only while streaming.

## DESIGN DIRECTION: REFINED / LUXURY
- Palette: deep near-black greens (#0a0f0d base, #0c1411 surfaces), sage #7FB897 as the single accent, forest #2D5240 for depth. Semantic: red #E24B4A (attention), amber #BA7517 (caution) — used ONLY for meaning, never decoration.
- Typography: Cormorant italic for the Aria wordmark + big numbers; Outfit for body/UI. Generous spacing (16-24px rhythm). Hairline sage borders (rgba(127,184,151,0.12-0.2)).
- Depth via subtle radial glows (one per surface, not everywhere) + layered surfaces, NOT drop shadows everywhere. Restraint = luxury.
- Avatar mark: a small circular sage→forest gradient with a Cormorant italic "A".
- Micro-motion: one tasteful staggered reveal on message complete; respect prefers-reduced-motion.

## SCOPE — restyle, don't rebuild
Edit `src/app/dashboard/ask-aria/page.tsx`. Keep ALL logic (state, fetch, history load, deliverable handling incl. the [DELIVERABLE] strip already fixed, avatar video, blocks, followups, upload, escalation). Replace the VISUAL layer:
- Extract a cohesive set of design tokens (a const styles object or a small CSS module) instead of scattered inline hex — single source of truth for colors/spacing/radii/type.
- Sidebar: refined — Cormorant "Aria" wordmark, sage "+ New conversation", grouped recents, recent deliverables as elegant cards.
- Header: avatar mark + "Good morning, [name]" + business/date subline + slim context strip with 2-3 live vitals (pull from existing data the page already has, or the briefing endpoint).
- Message stream: full-width flat messages, 720px cap, serif numbers in metric contexts, rich markdown, per-message actions, proper states.
- Composer: docked, refined, sage send button, keyboard shortcuts, stop-while-streaming.
- Keep the floating avatar video + sound bars (they're a nice touch) but refine placement/mask.

## ALSO: deliverable HTML generators (the "small outputs" complaint)
Secondary pass in `src/lib/aria/deliverables.ts`: the generated dashboard/chart/scorecard HTML must match this refined standard — bigger serif numbers (24-28px), generous padding, card-based layout, sage accent, proper spacing — NOT cramped 10px tables. Keep all existing interactivity (sortable tables, filters, CSV download, tooltips). Just elevate the visual style to match the chat redesign. Use the SAME palette and type system so chat + deliverables feel like one product.

## VERIFICATION — RENDERED OUTPUT (mandatory, per CLAUDE.md standard)
1. `npx tsc --noEmit` + `npm run build` pass (paste exit codes).
2. Run dev server, open /dashboard/ask-aria, and DESCRIBE/screenshot the rendered result: confirm full-width flat messages (no bubbles), readable 15-16px body, serif numbers, visible per-message actions, docked composer, proper streaming caret.
3. Generate one deliverable and confirm it renders with the refined style (big numbers, cards, spacing) against the seeded Sip data — paste the actual HTML output as evidence.
4. Test mobile width (≤600px): single column, docked composer, no horizontal scroll.
5. Confirm NO feature was lost: history, deliverable modal, avatar, blocks, followups, upload, escalation all still work.

## HARD RULES
- Upgrade-only: do not remove any feature. If something must change shape, preserve its function.
- No bubbles. Full-width flat messages.
- No text below 13px anywhere; body 15-16px; line-height 1.6; column cap ~720px.
- Single accent (sage); semantic colors only for meaning.
- Composer docked, never floating.
- Build gate + rendered-output evidence before commit.
- Keep the [DELIVERABLE:id] strip fix already in place.
