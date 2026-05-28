# Prompt 86 — Fix Ask Aria: render actual responses, not just pre-seeded cards

## The bug (verified)

In src/app/pos/ask/page.tsx:
1. Line 21: `const SUGGESTED = [...]` — a hardcoded array of starter-prompt cards.
   These render at L442 as the suggestion chips. They're fine on the empty state,
   but they look like Aria's response when the user actually expected a reply.
2. Line 328-333: The response type declaration MISSES `blocks` entirely. Only
   `response`, `conversation_id`, `intent`, `action`, `downloads` are typed.
   The API actually returns `blocks: AskBlock[] | undefined` (see /api/aria/ask/route.ts).
3. The frontend ONLY reads `data.response` and ignores `data.blocks` completely.
   So when Aria generates rich blocks (charts, tables, structured cards), they
   are silently thrown away and only the text reply renders.
4. There's also no `<BlockRenderer>` component anywhere — even if `data.blocks`
   were read, there's nothing to draw them.

End result: users see hardcoded suggestion cards on the empty state and a plain
text bubble when they ask something. The "graph cards" appearance is purely the
SUGGESTED array, never Aria's actual reply.

## What to build

### 1. Add `blocks` to the response type and message shape
In src/app/pos/ask/page.tsx:
- L328-332 — update the response type to include
  `blocks?: import('@/lib/aria/ask-types').AskBlock[]`
- The `messages` state already has shape `{ type, text, streaming, downloads? }`.
  Add `blocks?: AskBlock[]` to that shape.
- Wherever a message is pushed (L353, L369, L381), if `data.blocks` exists, set
  it on the message: `{ type: 'aria', text: reply, blocks: data.blocks, ... }`

### 2. Build a real `BlockRenderer` component
New file: `src/components/aria/BlockRenderer.tsx`

Reads `src/lib/aria/ask-types.ts` to understand all the block types it must render.
Common block types (verify in the types file — match exactly, do NOT invent new ones):

- `chart` — bar/line/pie. Use Recharts (already in package.json — verify). Title above, legend, axes labels, accessible.
- `stat_grid` — 2-4 metric cards (label + big number + optional trend %). Use the existing dashboard metric-card design language.
- `table` — sortable rows. Plain HTML table styled to match the dashboard.
- `list` — bulleted list, supports clickable items if `href` present.
- `markdown` — render the existing react-markdown component if installed, else fall back to plain text with newline preservation.
- `callout` — info/warning/success card with an icon.
- `action_card` — a card with a title, body, and 1-3 buttons that each post back to /api/aria/ask with a follow-up message (use `sendPrompt` pattern: append the action label as a new user message).
- `image` — render uploaded image with download link.

For ANY block type not recognised, render a small "Unsupported block: {type}" debug pill — never crash, never silently drop.

### 3. Render blocks in message order, mixed with text
In the message list (around L500 in page.tsx — find the message map):
- For each message: render the text bubble FIRST (existing behaviour)
- If `message.blocks` exists and has length > 0: render `<BlockRenderer blocks={message.blocks} />` BELOW the text bubble, inside the same message group
- Width: full width of the message column (not constrained to the text bubble width)
- Spacing: 12px gap between the text bubble and the first block

### 4. Hide SUGGESTED once a conversation has started
The SUGGESTED cards at L442 should ONLY render when `isEmpty` is true. Check the existing code — if they're already inside an `{isEmpty && (...)}` block, leave them. If they always render, wrap them.

### 5. Suggestion chips after a reply (NEW, small UX win)
After Aria's reply, the API can already return follow-up suggestions via the
`action_card` block type with `buttons[]`. Make sure the BlockRenderer wires
each button's onClick to `setInput(label); send()` so the user can tap a
follow-up suggestion and it sends as a new message.

## Files to touch
- src/app/pos/ask/page.tsx — update types, wire blocks into messages, render BlockRenderer
- src/components/aria/BlockRenderer.tsx — NEW component
- Confirm src/lib/aria/ask-types.ts exists and matches what the API returns; if not, create it

## Rules
- Match the EXISTING dashboard design language (Financial Trust palette, the same CSS vars used elsewhere in /pos/ask) — do NOT introduce a new look
- Recharts for charts (already a dep — confirm in package.json)
- All blocks must be keyboard-accessible — button blocks have proper aria-labels
- Empty blocks array → render nothing extra (text-only response stays as today)
- Never crash on unknown block types — show debug pill, continue rendering
- npx tsc --noEmit + npm run build pass



## TASK 3 — Cost routing: simple queries → Haiku, complex → Sonnet (saves ~80%)

### Why this matters
Current Ask Aria cost averages $0.091/message ($0.28 max), almost entirely from
sending everything to Sonnet with 28k input tokens. Real measurements from
aria_ai_calls show half of messages cost 1-2 cents (short answers, no tool use)
and half cost 6-28 cents (long answers with tools). The cheap half is doing
simple factual lookups that Haiku handles fine at 1/20th the cost.

Haiku pricing: $0.25/M input vs Sonnet $3/M — a 12× input savings and roughly
20× including output.

### What to build
The infrastructure ALREADY EXISTS:
- src/lib/aria/ask/intent.ts already returns `complexity: 'simple' | 'complex'`
- src/lib/aria/providers/anthropic.ts already takes `model: 'haiku' | 'sonnet' | 'opus'`

The route is just ignoring the complexity field and always sending to Sonnet.

### Implementation in src/app/api/aria/ask/route.ts

After the line `const intent = await classifyIntent(message, ...)`:

```ts
// Cost router: simple factual questions go to Haiku (20× cheaper),
// complex reasoning/optimisation goes to Sonnet. Tool-heavy calls
// always go to Sonnet because Haiku's tool-use reliability is lower.
const needsTools = /* check existing tool-trigger heuristic — likely already a variable */
const routedModel: 'haiku' | 'sonnet' =
  intent.type === 'smalltalk' ? 'haiku' :
  intent.type === 'question' && intent.complexity === 'simple' && !needsTools ? 'haiku' :
  'sonnet'
```

Then pass `model: routedModel` into whatever Anthropic call follows (it
currently hardcodes `sonnet` or omits the param — find and update each call site).

### Safety rails — don't lose answer quality

1. **Escape hatch for confidence='low'** — if classifier returned `confidence: 'low'`, route to Sonnet anyway. Better to overspend than underdeliver on a misclassified message.
2. **Tool-heavy queries always go to Sonnet** — Haiku is less reliable at multi-step tool use. Keep tool calls on Sonnet.
3. **Council calls stay on Sonnet/Opus** — `runAriaCouncil` is intentionally heavy. Do not touch it.
4. **Smalltalk goes to Haiku** — "hi", "thanks", "good morning" should never trigger Sonnet.

### Log the routing decision

In the existing aria_ai_calls insert, the `model_id` field already records what was used. Add ONE line to console.log the routing:

```ts
console.log('[ask-aria] routed', { intent: intent.type, complexity: intent.complexity, model: routedModel })
```

This lets us audit after launch whether the routing is sensible.

### Expected impact
Current average: $0.091/message
Expected average after routing:
- ~50% messages route to Haiku at ~$0.005 each
- ~50% messages stay on Sonnet at ~$0.18 each (the expensive half)
- New average: ~$0.09 → ~$0.045

That's a 50% cost cut for free, with zero quality loss on the cheap half.

### Commit
"feat(ask-aria): cost router — simple questions go to Haiku, complex stays on Sonnet"


## Commits
- "feat(ask-aria): add BlockRenderer component for chart/stat/table/callout blocks"
- "fix(ask-aria): wire data.blocks from API into rendered messages — was silently dropped"
- "feat(ask-aria): cost router — simple questions go to Haiku, complex stays on Sonnet"
- Then: git push origin main

## Test after deploy
1. Open /pos/ask
2. Ask: "Show me this week's top sellers"
3. Expect: a chart or table block under Aria's text reply, not just text
4. Ask a follow-up like "and last week"
5. Expect: another block, history preserved, no SUGGESTED chips reappearing
