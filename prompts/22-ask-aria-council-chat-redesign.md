# Prompt 22 — Ask Aria: Council-Mode Rich Block Output + Chat UI Upgrade

## MANDATORY PRE-EDIT CHECKLIST — do every step, stop if anything fails

```
1. pwd → must print C:\Users\kansa\aria-saas-audit — STOP if wrong
2. git pull origin main
3. Read EVERY file listed below before writing a single line of code:
   - src/app/dashboard/ask-aria/page.tsx         (762 lines — client component, full chat UI)
   - src/app/api/aria/ask/route.ts               (741 lines — DO NOT REWRITE, additive only)
   - src/lib/aria/council.ts                     (392 lines — understand CouncilOutput type)
   - src/lib/aria/get-business-context.ts        (166 lines — returns Promise<string>)
   - src/lib/aria/ask/business-context.ts        (buildAskAriaContext)
   - src/components/dashboard/AriaBriefingCard.tsx (304 lines — reference for card patterns)
4. npx tsc --noEmit — must be ZERO errors before touching anything
5. npm run build — must succeed before touching anything
```

---

## CRITICAL RULE — DO NOT REWRITE ask/route.ts

`src/app/api/aria/ask/route.ts` is 741 lines of complex, working logic including:
- Agentic tool execution (query_business_data, generate_report, web_search)
- Intent classification, action planning, cost guard
- Strategic council path already at L285-L311
- Conversation persistence, voice input support

**This file must NOT be rewritten.** Only make the MINIMUM changes described below.

---

## WHAT THIS PROMPT BUILDS

1. New `AskBlock` type system for structured UI responses
2. Extend the existing council path in ask/route.ts to ALSO return structured blocks (additive, 8 lines of change)
3. Extend CouncilOutput to carry ask_blocks and ask_followups
4. Extend the synthesis prompt in council.ts to generate structured block output
5. New `BlockRenderer` component to render blocks visually
6. New `AskAriaChat` wrapper that uses BlockRenderer for council responses — the existing ask-aria/page.tsx uses both old and new rendering

---

## STEP 1 — Create src/lib/aria/ask-types.ts

```typescript
export type AskBlock =
  | { type: 'lead'; content: string }
  | { type: 'text'; content: string }
  | {
      type: 'chart'
      chartType: 'bar'
      labels: string[]
      values: number[]
      metrics: Array<{ label: string; value: string; color?: string }>
    }
  | {
      type: 'brain_readouts'
      items: Array<{ role: 'growth' | 'risk' | 'strategy'; icon: string; text: string }>
    }
  | {
      type: 'council_split'
      question: string
      growth: string
      risk: string
      strategy: string
      choices: Array<{ icon: string; title: string; sub: string; prompt: string }>
    }
  | {
      type: 'action_list'
      items: Array<{
        icon: string; title: string; sub: string
        colorVariant?: 'danger' | 'warning' | 'default'
        prompt: string
      }>
    }
  | { type: 'action_single'; icon: string; title: string; sub: string; prompt: string }

export interface AskResponse {
  blocks: AskBlock[]
  followups: string[]
  used_council: boolean
  // Existing fields from route (kept for backwards compat with page.tsx)
  response?: string
  conversation_id?: string | null
  intent?: string
  action?: unknown
  cost_usd_cents?: number
  downloads?: unknown
  tool_calls?: unknown[]
}
```

---

## STEP 2 — Extend council.ts CouncilOutput type

In `src/lib/aria/council.ts`, add to the existing `CouncilOutput` type (L25 onwards). Only ADD these fields — do not remove or rename any existing field:

```typescript
// Add these two fields to the existing CouncilOutput type:
ask_blocks?: import('./ask-types').AskBlock[]
ask_followups?: string[]
```

Add the import at the top of council.ts if not already there:
```typescript
// No additional import needed — use dynamic import in the type annotation above
// OR add: import type { AskBlock } from './ask-types'
// and change the type annotation to: ask_blocks?: AskBlock[]
```

---

## STEP 3 — Extend synthesis prompt in council.ts

The synthesis prompt is a template string inside `runAriaCouncil`. Find where the synthesis Anthropic call is made (around L240-L270). The current JSON schema returns:
`{consensus, contested, final_briefing, confidence_map, layout}`

Extend it by APPENDING this to the synthesis prompt template string (do not replace the existing prompt):

```
When mode is 'ask_aria', ALSO include in your JSON response:
"ask_blocks": [array of block objects that define the visual UI],
"ask_followups": ["follow-up question 1", "follow-up question 2", "follow-up question 3"]

Block rules (choose based on what was asked):
- ALWAYS include: {"type":"lead","content":"1-2 sentence key finding"}
- Include {"type":"text","content":"analysis prose"} for analytical content
- Include {"type":"chart","chartType":"bar","labels":[...],"values":[...],"metrics":[...]} ONLY if real numeric data exists in the context — never fabricate chart data
- Include {"type":"brain_readouts","items":[{"role":"growth","icon":"🌱","text":"..."},{"role":"risk","icon":"⚠️","text":"..."},{"role":"strategy","icon":"🎯","text":"..."}]} when all 3 brains have distinct views
- Include {"type":"council_split","question":"...","growth":"...","risk":"...","strategy":"...","choices":[{"icon":"ti-trending-up","title":"...","sub":"...","prompt":"..."}]} ONLY when brains genuinely disagree — include 2-3 tappable choices
- Include {"type":"action_list","items":[...]} or {"type":"action_single",...} for concrete actions
- "ask_followups": exactly 3 short follow-up questions

Block ordering: simple question → lead+text+action_single | data question → lead+chart+brain_readouts+text | disagreement → lead+text+council_split | urgency → lead+action_list
```

Then in the synthesis parsing section (where `synthesis.consensus` etc are extracted), also extract:
```typescript
ask_blocks: synthesis.ask_blocks ?? undefined,
ask_followups: synthesis.ask_followups ?? undefined,
```

---

## STEP 4 — Minimal change to ask/route.ts

Find the existing strategic council return at **L298-L306**:
```typescript
return NextResponse.json({
  response: council.final_briefing,
  conversation_id: savedConvId ?? conversationId,
  intent: intent.type,
  action: null,
  cost_usd_cents: 0,
  downloads: null,
  tool_calls: [],
})
```

Replace ONLY this return statement (not anything else in the file) with:
```typescript
return NextResponse.json({
  response: council.final_briefing,
  blocks: council.ask_blocks ?? null,
  followups: council.ask_followups ?? [],
  used_council: true,
  conversation_id: savedConvId ?? conversationId,
  intent: intent.type,
  action: null,
  cost_usd_cents: 0,
  downloads: null,
  tool_calls: [],
})
```

That is the ONLY change to ask/route.ts. Eight characters added. Nothing else.

Also widen the `isStrategic` regex to catch more questions (replace L286):
```typescript
const isStrategic = /should|recommend|best|strategy|improve|why|how can|what would|advice|suggest|revenue|crisis|urgent|help|fix|problem|doing|perform|week|today/i.test(message)
```

---

## STEP 5 — Create src/components/dashboard/BlockRenderer.tsx

Pure visual renderer. No data fetching, no API calls.

```typescript
'use client'
import type { AskBlock } from '@/lib/aria/ask-types'

interface Props {
  block: AskBlock
  onChoice?: (prompt: string) => void
}

export function BlockRenderer({ block, onChoice }: Props) {
  // Design tokens (match Aria OS — dark backgrounds, green accent)
  const accent = '#7FB897'
  const accentDim = 'rgba(127,184,151,0.1)'
  const accentBorder = 'rgba(127,184,151,0.2)'

  if (block.type === 'lead') return (
    <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.94)', lineHeight: 1.6, marginBottom: 10 }}>
      {block.content}
    </div>
  )

  if (block.type === 'text') return (
    <div style={{ fontSize: 13, lineHeight: 1.72, color: 'rgba(255,255,255,0.82)', marginBottom: 10 }}>
      {block.content.split('\n').map((line, i) => <p key={i} style={{ margin: '0 0 6px' }}>{line}</p>)}
    </div>
  )

  if (block.type === 'chart') {
    const max = Math.max(...block.values, 1)
    return (
      <div style={{ borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ padding: '6px 10px', background: 'rgba(55,138,221,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 500, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Revenue chart
        </div>
        <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 56, marginBottom: 5 }}>
            {block.values.map((v, i) => (
              <div key={i} style={{ flex: 1, borderRadius: '2px 2px 0 0', height: `${(v / max) * 100}%`, background: v === max ? accent : 'rgba(127,184,151,0.25)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {block.labels.map((l, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{l}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {block.metrics.map((m, i) => (
              <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '6px 8px' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: m.color ?? accent }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (block.type === 'brain_readouts') return (
    <div style={{ borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: 'rgba(167,139,250,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 500, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        What the 3 brains see
      </div>
      <div style={{ padding: 10 }}>
        {block.items.map((item, i) => {
          const color = item.role === 'growth' ? '#7FB897' : item.role === 'risk' ? '#F87171' : '#A78BFA'
          return (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '7px 0', borderBottom: i < block.items.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{item.icon}</div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 500, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{item.role}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{item.text}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (block.type === 'council_split') return (
    <div style={{ borderRadius: 10, border: '0.5px solid rgba(245,158,11,0.25)', marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: 'rgba(245,158,11,0.07)', borderBottom: '0.5px solid rgba(245,158,11,0.15)', fontSize: 9, fontWeight: 500, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        ⚡ Council split — your call
      </div>
      <div style={{ padding: 11 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.9)', marginBottom: 9 }}>{block.question}</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
          {[
            { label: 'Growth', text: block.growth, color: '#7FB897' },
            { label: 'Risk', text: block.risk, color: '#F87171' },
          ].map((b, i) => (
            <div key={i} style={{ flex: 1, padding: '7px 9px', borderRadius: 7, background: `${b.color}08`, border: `0.5px solid ${b.color}28` }}>
              <div style={{ fontSize: 8, fontWeight: 500, color: b.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{b.label}</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{b.text}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '7px 9px', borderRadius: 7, background: 'rgba(167,139,250,0.06)', border: '0.5px solid rgba(167,139,250,0.18)', marginBottom: 9 }}>
          <div style={{ fontSize: 8, fontWeight: 500, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Strategy</div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{block.strategy}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {block.choices.map((c, i) => (
            <button key={i} onClick={() => onChoice?.(c.prompt)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', flex: 1 }}>{c.title}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{c.sub}</div>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>↗</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (block.type === 'action_list') return (
    <div style={{ borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: accentDim, borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 500, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Priority list
      </div>
      <div style={{ padding: 10 }}>
        {block.items.map((item, i) => {
          const iconBg = item.colorVariant === 'danger' ? 'rgba(248,113,113,0.12)' : item.colorVariant === 'warning' ? 'rgba(245,158,11,0.12)' : accentDim
          const iconColor = item.colorVariant === 'danger' ? '#F87171' : item.colorVariant === 'warning' ? '#F59E0B' : accent
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: i < block.items.length - 1 ? 8 : 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, fontSize: 13, flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>{item.title}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>{item.sub}</div>
              </div>
              <button onClick={() => onChoice?.(item.prompt)}
                style={{ padding: '5px 11px', borderRadius: 7, background: accent, color: '#0b100d', border: 'none', fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                Do it ↗
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (block.type === 'action_single') return (
    <div style={{ borderRadius: 10, border: `0.5px solid ${accentBorder}`, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ padding: '6px 10px', background: accentDim, borderBottom: `0.5px solid ${accentBorder}`, fontSize: 9, fontWeight: 500, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Aria suggests
      </div>
      <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, fontSize: 13, flexShrink: 0 }}>{block.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>{block.title}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>{block.sub}</div>
        </div>
        <button onClick={() => onChoice?.(block.prompt)}
          style={{ padding: '5px 11px', borderRadius: 7, background: accent, color: '#0b100d', border: 'none', fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          Do it ↗
        </button>
      </div>
    </div>
  )

  return null
}
```

---

## STEP 6 — Modify ask-aria/page.tsx (ADDITIVE ONLY)

The current page.tsx is a 762-line client component. **Do not rewrite it.** Make only these additive changes:

### A. Add import at top of page.tsx
```typescript
import { BlockRenderer } from '@/components/dashboard/BlockRenderer'
import type { AskBlock } from '@/lib/aria/ask-types'
```

### B. Extend the Message interface (add fields)
In the existing `Message` interface, add:
```typescript
blocks?: AskBlock[]
followups?: string[]
used_council?: boolean
```

### C. Extend the fetch response parsing
Find where the response from `/api/aria/ask` is parsed (look for `data.response`). When `data.blocks` exists, also store it on the message:
```typescript
// When setting the assistant message, also set:
blocks: data.blocks ?? undefined,
followups: data.followups ?? [],
used_council: data.used_council ?? false,
```

### D. Extend the message rendering
Find where assistant messages are rendered (look for `message.content` or `msg.content` in the JSX). When `message.blocks` exists, render the blocks INSTEAD of the plain text:

```typescript
{/* If council returned structured blocks, render them visually */}
{message.used_council && message.blocks && message.blocks.length > 0 ? (
  <div>
    {message.blocks.map((block, i) => (
      <BlockRenderer
        key={i}
        block={block}
        onChoice={(prompt) => {
          // sendMessage equivalent — find the existing send function name in page.tsx
          handleSend(prompt)  // use whatever the existing send function is called
        }}
      />
    ))}
    {/* Follow-up chips */}
    {(message.followups ?? []).length > 0 && (
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
        {(message.followups ?? []).map((fup, i) => (
          <button key={i}
            onClick={() => handleSend(fup)}
            style={{ padding: '4px 10px', borderRadius: 14, border: '0.5px solid rgba(127,184,151,0.2)', background: 'rgba(127,184,151,0.05)', color: '#7FB897', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            {fup}
          </button>
        ))}
      </div>
    )}
  </div>
) : (
  /* Original plain text rendering — keep 100% unchanged */
  <existing_message_rendering_jsx />
)}
```

**IMPORTANT:** Find the exact name of the send function in page.tsx (it will be something like `handleSend`, `sendMessage`, `onSend` etc — read the file to find it) and use that name.

---

## STEP 7 — Add thinking animation for council

When `used_council` is true and a response is loading, show a 4-step thinking indicator INSTEAD of a generic spinner. Find the loading/streaming state in page.tsx and add:

```typescript
{/* Council thinking state — shown while isStrategic question is loading */}
{isLoading && councilThinking && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '4px 0' }}>
    {['Growth brain reading...','Risk brain checking...','Strategy brain weighing...','Synthesising...'].map((step, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #7FB897', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
        {step}
      </div>
    ))}
  </div>
)}
```

---

## CRITICAL RULES

### What NOT to touch
- `src/lib/aria/council.ts` `runAriaCouncil()` function signature — 3 params: (context: string, businessId: string, mode: 'briefing' | 'weekly_report' | 'ask_aria')
- Any existing logic in ask/route.ts other than L298-L306 and L286
- AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- vercel.json

### Supabase client patterns (EXACT — copy these)
```typescript
// In API routes (server-side, uses auth session):
import { createServerSupabaseClient } from '@/lib/supabase-server'
const supabase = createServerSupabaseClient()

// For background writes bypassing RLS:
import { supabaseAdmin } from '@/lib/supabase-admin'
// supabaseAdmin is a pre-created client, NOT a function call
```

### TypeScript
- `npx tsc --noEmit` must be ZERO errors after all changes
- No `any` in new files
- All types imported from `@/lib/aria/ask-types`

### Build gate — MANDATORY
```
npx tsc --noEmit   ← zero errors
npm run build      ← must succeed
```

Single commit. All files in one push.
Commit message: "feat(ask-aria): council block responses — extend ask/route.ts to return structured AskBlock[] alongside plain text, add BlockRenderer with chart/brain/split/action cards, extend page.tsx to render blocks for council responses with follow-up chips"

---

## FILES CREATED/MODIFIED

Created:
- src/lib/aria/ask-types.ts
- src/components/dashboard/BlockRenderer.tsx

Modified (additive only):
- src/lib/aria/council.ts (add 2 fields to CouncilOutput type + append to synthesis prompt + extract in parsing)
- src/app/api/aria/ask/route.ts (change 1 return statement at L298-L306, widen isStrategic regex at L286)
- src/app/dashboard/ask-aria/page.tsx (add imports, extend Message type, extend response parsing, extend message rendering)
