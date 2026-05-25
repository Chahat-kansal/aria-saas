# Prompt 22 — Ask Aria: Council-Mode Chat Redesign + Rich Block Output

## MANDATORY PRE-EDIT CHECKLIST — do every step before writing a single line of code

```
1. pwd → must print C:\Users\kansa\aria-saas-audit — STOP if wrong
2. git pull origin main
3. Read src/app/dashboard/ask-aria/page.tsx — understand full current structure
4. Read src/app/api/aria/ask/route.ts — understand current request/response shape
5. Read src/lib/aria/council.ts — understand CouncilOutput, BriefingLayout, runCouncil() signature
6. Read src/lib/aria/get-business-context.ts — understand what getBusinessContext() returns
7. Read src/components/dashboard/AriaBriefingCard.tsx — use as reference for card styling patterns
8. npx tsc --noEmit — must be ZERO errors before touching anything
9. npm run build — must succeed before touching anything
```

---

## WHAT THIS PROMPT BUILDS

Redesign Ask Aria from a basic chat into a premium council-driven intelligence chat. Every question the owner asks runs through the 3-brain council and returns a structured multi-block response — deep analysis + visual cards — not flat text.

---

## STEP 1 — New type file

Create `src/lib/aria/ask-types.ts`:

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
      items: Array<{
        role: 'growth' | 'risk' | 'strategy'
        icon: string
        text: string
      }>
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
        icon: string
        title: string
        sub: string
        colorVariant?: 'danger' | 'warning' | 'default'
        prompt: string
      }>
    }
  | { type: 'action_single'; icon: string; title: string; sub: string; prompt: string }

export interface AskResponse {
  blocks: AskBlock[]
  followups: string[]
  council_run_id?: string
  used_council: boolean
}
```

---

## STEP 2 — Update /api/aria/ask/route.ts

**Full rewrite of the route. Preserve the import of `runCouncil` already there. Do not break any other imports.**

```typescript
// src/app/api/aria/ask/route.ts
export const maxDuration = 300

// GET handler — unchanged, keep existing
// POST handler — full replacement:

export async function POST(req: Request) {
  // 1. Auth check — keep existing pattern (supabase auth, get user, get business)
  // 2. Extract { message, businessId } from body
  // 3. Call getBusinessContext(businessId) — already imported
  // 4. Run council via runCouncil(businessContext, { mode: 'ask', question: message })
  //    - runCouncil is already imported from '@/lib/aria/council'
  //    - Pass the user question as part of the context prompt
  // 5. Parse council output into AskBlock[] using the rules below
  // 6. Return AskResponse JSON
}
```

### Synthesis prompt addition

In `src/lib/aria/council.ts`, extend the existing synthesis prompt to include this ADDITIONAL instruction at the end (do NOT replace the existing synthesis prompt — append to it):

```
ADDITIONAL OUTPUT FOR ASK ARIA:
When responding to a direct owner question (mode=ask), you must ALSO return a "ask_blocks" array in your JSON alongside the existing fields. This array defines the structured UI output.

Block rules — choose which blocks to include based on what was asked:
- ALWAYS include a "lead" block (1-2 sentences, the most important finding)
- Include "text" blocks for analytical prose
- Include "chart" block ONLY if there is actual numeric data to show (revenue figures, counts from the business context). Labels must match real data. Never fabricate chart data.
- Include "brain_readouts" block when all 3 brains have distinct views worth showing
- Include "council_split" block ONLY when brains genuinely disagree — include 2-3 tappable choices the owner can select to direct Aria
- Include "action_list" or "action_single" when there is a concrete thing to do
- Include "followups" array: 3 short follow-up questions the owner might want to ask next

Block ordering logic:
- Simple factual question → lead + text + action_single
- Question about data/revenue → lead + chart + brain_readouts + text + action_single  
- Question where brains disagree → lead + text + council_split
- Question about priorities/urgency → lead + action_list + text

Return the ask_blocks and followups as part of your existing JSON output:
{
  ...existing fields (consensus, contested, final_briefing, confidence_map, layout)...,
  "ask_blocks": [...],
  "ask_followups": ["question 1", "question 2", "question 3"]
}
```

### In council.ts — update CouncilOutput type

Add to the existing `CouncilOutput` type (do not remove existing fields):
```typescript
ask_blocks?: AskBlock[]
ask_followups?: string[]
```

Add import at top of council.ts:
```typescript
import type { AskBlock } from './ask-types'
```

### In the synthesis parsing (where council.ts parses the synthesis JSON response)

After parsing `synthesis`, add:
```typescript
ask_blocks: synthesis.ask_blocks ?? undefined,
ask_followups: synthesis.ask_followups ?? undefined,
```

### POST route implementation

```typescript
export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, businessId } = await req.json()
  if (!message || !businessId) return NextResponse.json({ error: 'message and businessId required' }, { status: 400 })

  // Verify business ownership
  const { data: business } = await supabase
    .from('businesses')
    .select('id, trading_name, industry')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .single()
  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const businessContext = await getBusinessContext(businessId)
    
    // Prepend the owner's question to the business context so the council answers it
    const contextWithQuestion = `OWNER QUESTION: ${message}\n\n${businessContext}`
    
    const council = await runCouncil(contextWithQuestion, { mode: 'ask' })

    // Build blocks from council output
    const blocks: AskBlock[] = council.ask_blocks ?? buildFallbackBlocks(council, message)
    const followups: string[] = council.ask_followups ?? []

    // Log to aria_ai_calls
    try {
      await supabase.from('aria_ai_calls').insert({
        business_id: businessId,
        agent_key: 'ask_aria_council',
        provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001',
        role: 'ask',
        input_tokens: 0,
        output_tokens: 0,
        success: true,
        request_summary: message.slice(0, 100),
      })
    } catch { /* non-fatal */ }

    return NextResponse.json({
      blocks,
      followups,
      council_run_id: undefined,
      used_council: true,
    } satisfies AskResponse)

  } catch (err) {
    console.error('[ask] council failed:', err)
    // Graceful fallback — single text block
    return NextResponse.json({
      blocks: [{ type: 'text', content: 'Aria is thinking — please try again in a moment.' }],
      followups: [],
      used_council: false,
    } satisfies AskResponse)
  }
}

function buildFallbackBlocks(council: CouncilOutput, question: string): AskBlock[] {
  const blocks: AskBlock[] = []
  if (council.final_briefing) {
    blocks.push({ type: 'lead', content: council.final_briefing.split('\n')[0] ?? '' })
    const rest = council.final_briefing.split('\n').slice(1).join('\n').trim()
    if (rest) blocks.push({ type: 'text', content: rest })
  }
  if (council.contested?.length) {
    const c = council.contested[0]
    blocks.push({
      type: 'council_split',
      question: c.topic,
      growth: c.optimist_view,
      risk: c.critic_view,
      strategy: c.strategist_view,
      choices: [
        { icon: 'ti-trending-up', title: 'Follow the growth approach', sub: '', prompt: `Follow the growth brain view on: ${c.topic}` },
        { icon: 'ti-shield', title: 'Take the cautious approach', sub: '', prompt: `Follow the risk brain view on: ${c.topic}` },
      ],
    })
  }
  return blocks
}
```

---

## STEP 3 — New component: BlockRenderer

Create `src/components/dashboard/BlockRenderer.tsx`:

```typescript
'use client'
// Renders a single AskBlock as a visual card
// Import AskBlock from '@/lib/aria/ask-types'
// Uses ONLY inline styles — no Tailwind classes (for puppeteer PDF compat later)
// Design: matches Aria OS design system — forest green #2D5240/#7FB897, Inter body

// Renders:
// lead → large semi-bold sentence, color rgba(255,255,255,0.94) on dark, #111827 on light
// text → standard prose, line-height 1.7
// chart → CSS bar chart (NO external lib, NO canvas, pure divs)
//   - bars: flex, align-items:flex-end, each bar is a div with height as % of max value
//   - highlight the tallest bar in #7FB897, others in rgba(127,184,151,0.3)
//   - x-axis labels below
//   - metric tiles grid below chart
// brain_readouts → 3 rows, each: small icon circle + coloured label + body text
//   growth → color #7FB897
//   risk → color #F87171  
//   strategy → color #A78BFA
// council_split → amber header "Council split · your call", question bold, 
//   two-col Growth+Risk pills side by side, full-width Strategy pill below,
//   then choice buttons (each sends its .prompt as a message via onChoice callback)
// action_list → each item: coloured icon box + title + subtitle + button
// action_single → single action row with button
```

The component signature:
```typescript
interface BlockRendererProps {
  block: AskBlock
  onChoice?: (prompt: string) => void  // called when user taps a council_split choice or action button
}
export function BlockRenderer({ block, onChoice }: BlockRendererProps) { ... }
```

---

## STEP 4 — New component: AskAriaChat

Create `src/components/dashboard/AskAriaChat.tsx`:

This is a full client-side chat component. It replaces the existing ask-aria UI.

**UI structure:**

```
┌─────────────────────────────────────────────────────┐
│ Header: "Aria" · "Council active · 3 brains"        │
├─────────────────────────────────────────────────────┤
│ Feed: scrollable message list                        │
│   • Aria messages: left, small "A" avatar           │
│   • User messages: right, "C" avatar                │
│   • Aria message body = <BlockRenderer> for each block │
│   • Follow-up chips below each Aria message         │
│   • Thinking state: 4 animated steps with tick icons│
│     ("Growth brain reading...", "Risk brain...",    │
│      "Strategy brain...", "Synthesising...")        │
├─────────────────────────────────────────────────────┤
│ Composer: full-width input + send button             │
│ Hint: "Council runs on every question · connected   │
│       records only, no invented data"               │
└─────────────────────────────────────────────────────┘
```

**State:**
```typescript
const [messages, setMessages] = useState<ChatMessage[]>([])
const [input, setInput] = useState('')
const [loading, setLoading] = useState(false)

type ChatMessage = 
  | { role: 'user'; content: string; id: string }
  | { role: 'aria'; blocks: AskBlock[]; followups: string[]; id: string }
  | { role: 'thinking'; id: string }
```

**sendMessage function:**
```typescript
async function sendMessage(text: string) {
  if (!text.trim() || loading) return
  setInput('')
  setLoading(true)
  const userMsg: ChatMessage = { role: 'user', content: text, id: Date.now().toString() }
  const thinkingMsg: ChatMessage = { role: 'thinking', id: 'thinking' }
  setMessages(prev => [...prev, userMsg, thinkingMsg])
  
  try {
    const res = await fetch('/api/aria/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, businessId }),
    })
    const data: AskResponse = await res.json()
    setMessages(prev => [
      ...prev.filter(m => m.id !== 'thinking'),
      { role: 'aria', blocks: data.blocks, followups: data.followups, id: Date.now().toString() }
    ])
  } catch {
    setMessages(prev => prev.filter(m => m.id !== 'thinking'))
  } finally {
    setLoading(false)
  }
}
```

**Thinking animation:** 4 steps, each step ticks after 500ms, tick icon appears, next step starts spinning. Pure CSS/setTimeout — no library.

**Props:**
```typescript
interface AskAriaChatProps {
  businessId: string
  businessName: string
}
```

---

## STEP 5 — Wire into the page

In `src/app/dashboard/ask-aria/page.tsx`:

- Keep the server component structure
- Replace whatever currently renders the chat with `<AskAriaChat businessId={business.id} businessName={business.trading_name ?? business.name} />`
- Import: `import { AskAriaChat } from '@/components/dashboard/AskAriaChat'`

---

## STEP 6 — Sidebar nav

Check if "Ask Aria" is already in the sidebar (it likely is). If not, add it. Do not change existing nav items.

---

## CRITICAL RULES

### TypeScript
- `npx tsc --noEmit` must be ZERO errors after your changes
- No `any` types anywhere in new files
- The `AskResponse` return must use `satisfies AskResponse` 

### Data integrity
- The chart block must ONLY show data that actually exists in the business context string
- If no revenue data exists, do NOT include a chart block — include a text block instead
- Never fabricate numbers, product names, or customer counts

### Existing code
- Do NOT modify: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- Do NOT modify: vercel.json
- Do NOT modify: council.ts runCouncil() function signature — only extend CouncilOutput type and add to synthesis prompt

### DB amounts
- All amounts are stored as dollars (numeric), NOT cents
- Always render: `(Number(x) || 0).toFixed(2)`

### Model IDs (hardcoded, never change)
- claude-haiku-4-5-20251001
- claude-sonnet-4-5-20250929
- claude-opus-4-5-20251101

### Build gate — MANDATORY before commit
```
npx tsc --noEmit   ← must be zero errors
npm run build      ← must succeed
```
Single commit. All files in one push. Commit message: "feat(ask-aria): council-driven chat redesign — premium UI, structured block responses, brain readouts, split-decision cards, chart blocks, timed thinking animation"

---

## FILES CREATED/MODIFIED

Created:
- src/lib/aria/ask-types.ts
- src/components/dashboard/BlockRenderer.tsx
- src/components/dashboard/AskAriaChat.tsx

Modified:
- src/app/api/aria/ask/route.ts
- src/lib/aria/council.ts (extend CouncilOutput type + synthesis prompt only)
- src/app/dashboard/ask-aria/page.tsx
