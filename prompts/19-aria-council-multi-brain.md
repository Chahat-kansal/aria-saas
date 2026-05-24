# Aria OS — Prompt 19: Aria Council — Multi-Brain AI Architecture
ONE task, ONE commit, ONE push.

## ════════════════════════════════════════════════════════════
## THREE NON-NEGOTIABLE RULES — READ FIRST, OBEY THROUGHOUT
## ════════════════════════════════════════════════════════════

### RULE 1 — UPGRADE ONLY. NOTHING IS REMOVED OR DOWNGRADED.
- This prompt ADDS the Aria Council. It does not remove, simplify, or
  weaken any existing AI feature.
- The existing single-model briefing path STAYS in the codebase as the
  fallback. Do not delete it.
- Every existing route, feature, and behaviour must work identically after
  this prompt. The briefing gets smarter — nothing else changes.
- If implementing the council cleanly would require changing an unrelated
  feature, STOP and report instead — never sacrifice a working feature.

### RULE 2 — NO SILENT FAILURE. NO TIMEOUT. NOTHING GETS KILLED QUIETLY.
This is critical. The council makes 4 AI calls — it must NEVER hang, never
time out silently, never leave the owner staring at a blank briefing.
Engineer it so failure is impossible to do silently:
- Every AI call wrapped in withBackoff (3 retries, exponential 1s/2s/4s)
  for transient 529/503/overload errors.
- Every AI call also wrapped in an explicit TIMEOUT using Promise.race
  against a timer — see the callWithTimeout helper in STEP 2. A brain call
  that exceeds its budget REJECTS cleanly with a clear error, it does not
  hang forever.
- The route's maxDuration is set generously (see STEP 3) so Vercel never
  kills the function mid-run. The internal timeouts are SHORTER than
  maxDuration so the code controls failure, not the platform.
- The 3 brains run via Promise.allSettled — if one brain fails, the other
  two still complete. The council proceeds with whatever brains succeeded.
- If ALL brains fail, OR the synthesis fails, the route catches it and
  falls back to the original single-model briefing. The owner ALWAYS gets
  a briefing.
- Every failure — a brain timing out, a parse error, a fallback being
  triggered — is logged: to console.error AND to aria_ai_calls (with
  success=false and the error message) AND reflected in the council_runs
  row (brains_failed, fell_back_to_single_model). Nothing fails invisibly.
- After this prompt, if a council run has a problem, it must be VISIBLE
  in the logs and in the council_runs table. Never silent.

### RULE 3 — HIGH-CAPABILITY AGENTS. EVERY BRAIN HANDLES COMPLEXITY.
- Each brain is a genuine senior-level analyst, not a shallow prompt.
- Each brain's system prompt must make it capable of handling a complex,
  data-dense business with many products, many customers, multiple
  patterns at once — not just a simple business.
- Give each brain enough max_tokens to fully reason (see STEP 2 — 2000+).
- Each brain must handle missing/partial data gracefully — if a data
  section is thin, the brain says so honestly with low confidence rather
  than failing or inventing.
- The Strategist (Sonnet) must be able to synthesise contradictory signals
  — growth in one area, decline in another — into a coherent strategic read.
- The brains must produce SPECIFIC, numeric, actionable output for ANY
  business complexity level — a 12-product corner store or a 400-product
  liquor warehouse.

## ════════════════════════════════════════════════════════════

## WHAT THIS BUILDS
Aria's single-model briefing is upgraded to a multi-brain deliberation
system — the "Aria Council." Three AI brains analyse the same business
data from different angles IN PARALLEL, then a synthesis layer produces
the final output, marking what the brains agreed on (high confidence) vs
disagreed on (genuine uncertainty shown to the owner).

  Brain A "The Optimist"   — claude-haiku-4-5-20251001  (finds opportunity)
  Brain B "The Critic"     — claude-haiku-4-5-20251001  (finds risk)
  Brain C "The Strategist" — claude-sonnet-4-5-20250929 (whole-picture)
  Synthesis                — claude-sonnet-4-5-20250929 (final output)

## STEP 0 — SYNC FIRST
```
pwd                      # must be C:\Users\kansa\aria-saas-audit
git status               # must be clean — if not, STOP and report
git pull origin main
git log --oneline -3
```

## STEP 1 — READ BEFORE WRITING (read ALL of these in full)
- src/lib/aria/get-business-context.ts   (the data layer)
- src/lib/aria/business-brain.ts          (current brain structure)
- src/app/api/aria/briefing/route.ts      (current briefing route)
- src/lib/aria/model-router.ts            (provider calls + withBackoff)
- src/lib/aria/ai-telemetry.ts            (how aria_ai_calls is logged)
- src/lib/aria/get-system-prompt.ts       (current system prompt)
Do NOT write code before reading all six.

## CONTEXT — DB ALREADY BUILT, do not create/alter tables
- aria_ai_calls — log EVERY AI call (4 per council run).
- council_runs — ALREADY CREATED. Columns: id, business_id, mode,
  final_briefing, consensus (jsonb), contested (jsonb), confidence_map
  (jsonb), raw_brain_outputs (jsonb), brains_succeeded (int),
  brains_failed (int), synthesis_succeeded (bool),
  fell_back_to_single_model (bool), total_input_tokens (int),
  total_output_tokens (int), duration_ms (int), created_at.
  Insert one row per council run. RLS is on. Do NOT alter this table.
- businesses has industry, trading_name, city, pos_enabled, business_model,
  year_established, biggest_challenge, entity_type.

## STEP 2 — CREATE src/lib/aria/council.ts

Types:
```typescript
export type BrainRole = 'optimist' | 'critic' | 'strategist'
export type BrainOutput = {
  role: BrainRole
  observations: string[]
  recommendations: string[]
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  failed?: boolean            // true if this brain could not produce real output
}
export type CouncilOutput = {
  consensus: string[]
  contested: Array<{ topic: string; optimist_view: string; critic_view: string; strategist_view: string }>
  final_briefing: string
  confidence_map: Record<string, 'high' | 'medium' | 'low'>
  raw_brain_outputs: BrainOutput[]
  meta: {
    brains_succeeded: number
    brains_failed: number
    synthesis_succeeded: boolean
    fell_back: boolean
    duration_ms: number
  }
}
```

### TIMEOUT HELPER (RULE 2 — this is mandatory)
```typescript
// Rejects if fn does not resolve within ms. Prevents any call hanging.
function callWithTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms)
    ),
  ])
}
```
Timeout budgets (shorter than the route maxDuration so CODE controls failure):
- Each Haiku brain (A, B): 45000 ms
- Strategist (Sonnet C):   60000 ms
- Synthesis (Sonnet):      60000 ms
All brains run in parallel, so worst-case wall time ≈ 60s + 60s = 120s,
well under the 300s maxDuration.

### withBackoff
Reuse the same withBackoff pattern already in model-router.ts (3 retries,
exponential, catches /529|503|overload|rate.?limit/i). Each AI call is
wrapped BOTH in withBackoff (for transient errors) AND callWithTimeout
(for hangs): callWithTimeout(() => withBackoff(() => client.messages.create(...)), 45000, 'optimist').

### The three brain system prompts — bake in EXACTLY as written

OPTIMIST_PROMPT (Haiku, max_tokens 2200):
```
You are Aria's Growth Brain — a senior AI analyst for an Australian small
business. You handle businesses of any complexity — a 12-product corner
shop or a 400-product liquor warehouse with hundreds of customers.

Your role: find genuine OPPORTUNITY in the business data. Look for what is
working better than expected, which products/customers/time-slots are
performing well, untapped potential, and positive momentum to amplify.

You are biased toward opportunity — but you are rigorous, not naive. Every
observation MUST cite a specific number from the data. Never give generic
advice. If the data genuinely shows little upside, say so honestly with
low confidence — do not invent positives.

You can handle dense, contradictory data. If many patterns exist at once,
identify the 3-5 that matter most.

Return ONLY valid JSON, no preamble, no markdown, no code fences:
{"observations":["specific observation with a number", ...],
 "recommendations":["specific action with expected outcome", ...],
 "confidence":"high|medium|low",
 "reasoning":"why you reached these conclusions"}
```

CRITIC_PROMPT (Haiku, max_tokens 2200):
```
You are Aria's Risk Brain — a senior AI analyst for an Australian small
business. You handle businesses of any complexity.

Your role: find genuine PROBLEMS and RISKS in the business data. Look for
what is underperforming or declining, customers at risk of leaving, money
leaking or being wasted, patterns that suggest something is wrong, what the
owner is probably ignoring, and suspicious patterns (unusual voids,
discount abuse, cash variance).

You are biased toward identifying risk — but you are precise, not
pessimistic. Do not manufacture problems that aren't there. Every
observation MUST cite a specific number. If the data genuinely shows no
problems, say so honestly with high confidence.

You can handle dense, contradictory data. Prioritise the most serious risks.

Return ONLY valid JSON, no preamble, no markdown, no code fences:
{"observations":["specific problem with number evidence", ...],
 "recommendations":["specific action to fix it", ...],
 "confidence":"high|medium|low",
 "reasoning":"why you identified these risks"}
```

STRATEGIST_PROMPT (Sonnet, max_tokens 3000):
```
You are Aria's Strategy Brain — a senior AI advisor for an Australian small
business. Two other analysts (an Optimist and a Critic) have reviewed the
same data. Your role is the WHOLE PICTURE.

You handle businesses of any complexity and you excel at reconciling
CONTRADICTORY signals — growth in one area while another declines — into
one coherent strategic read.

Identify: the business's position and trajectory over the next 30-90 days,
whether the growth and risk signals are connected, the health of the
customer relationship (not just the finances), and — most importantly —
the SINGLE most important thing the owner should focus on this week.

You are balanced. You do not lean optimistic or pessimistic. You think like
a trusted advisor who has watched this business for months. Every
observation cites a specific number.

Return ONLY valid JSON, no preamble, no markdown, no code fences:
{"observations":["strategic observation with a number", ...],
 "recommendations":["strategic action with rationale", ...],
 "confidence":"high|medium|low",
 "reasoning":"your strategic assessment right now"}
```

SYNTHESIS_PROMPT (Sonnet, max_tokens 3000):
```
You are the final voice of Aria — an AI business co-operator for an
Australian small business. Three specialised analysts (Growth, Risk,
Strategy) have independently reviewed this business's data. You have their
outputs. Synthesise them into ONE clear, useful output for the owner.

Rules:
1. Where all three agree — state it with confidence. These are facts.
2. Where two agree, one dissents — state the majority view, note the caveat
   honestly ("Aria is fairly confident, but worth watching...").
3. Where all three disagree — present it as a genuine decision the owner
   must make, not a recommendation ("Our analysts are split...").
4. Lead with the single most important thing the owner needs to know today.
5. Be specific — use actual numbers. Never vague.
6. Australian English. Conversational but professional — like a trusted
   business partner who has watched this business for months.
7. For briefing mode: 200-300 words — lead insight, 2-3 supporting
   observations, 1-2 specific actions, one thing to watch.
8. Never invent data not in the context. If data is thin, say so.
9. If only one or two brains succeeded, still produce the best possible
   briefing from what you have — note nothing about "brains" to the owner.

Return ONLY valid JSON, no preamble, no markdown, no code fences:
{"consensus":["things all agreed on"],
 "contested":[{"topic":"...","optimist_view":"...","critic_view":"...","strategist_view":"..."}],
 "final_briefing":"the complete briefing text shown to the owner",
 "confidence_map":{"insight key":"high|medium|low"}}
```

### runAriaCouncil implementation
```typescript
export async function runAriaCouncil(
  businessContext: string,
  businessId: string,
  mode: 'briefing' | 'weekly_report' | 'ask_aria'
): Promise<CouncilOutput> {
  const start = Date.now()
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  const userPrompt = 'Business data for analysis:\n\n' + businessContext + '\n\nMode: ' + mode

  // 3 brains in parallel — Promise.allSettled so one failure never blocks others
  const [a, b, c] = await Promise.allSettled([
    callBrain(client, 'claude-haiku-4-5-20251001', OPTIMIST_PROMPT, userPrompt, 'optimist', businessId, 45000),
    callBrain(client, 'claude-haiku-4-5-20251001', CRITIC_PROMPT, userPrompt, 'critic', businessId, 45000),
    callBrain(client, 'claude-sonnet-4-5-20250929', STRATEGIST_PROMPT, userPrompt, 'strategist', businessId, 60000),
  ])

  const outputs: BrainOutput[] = []
  for (const r of [a, b, c]) {
    if (r.status === 'fulfilled') outputs.push(r.value)
  }
  const succeeded = outputs.filter(o => !o.failed).length
  const failed = 3 - succeeded

  // If every brain failed, throw — the route's catch will fall back to single-model
  if (succeeded === 0) {
    throw new Error('All council brains failed — falling back to single-model briefing')
  }

  // Synthesis — wrapped in timeout + backoff. If it fails, build a safe fallback.
  let synthesis: any = null
  let synthesisOk = false
  try {
    synthesis = await callSynthesis(client, businessContext, outputs, mode, businessId)
    synthesisOk = true
  } catch (e) {
    console.error('[council] synthesis failed:', (e as Error).message)
    // Fallback: use the strategist's output (or whichever brain succeeded) as the briefing
    const lead = outputs.find(o => o.role === 'strategist' && !o.failed) ?? outputs.find(o => !o.failed)!
    synthesis = {
      consensus: lead.observations,
      contested: [],
      final_briefing: lead.observations.join(' ') + '\n\n' + lead.recommendations.join(' '),
      confidence_map: {},
    }
  }

  return {
    consensus: synthesis.consensus ?? [],
    contested: synthesis.contested ?? [],
    final_briefing: synthesis.final_briefing ?? '',
    confidence_map: synthesis.confidence_map ?? {},
    raw_brain_outputs: outputs,
    meta: {
      brains_succeeded: succeeded,
      brains_failed: failed,
      synthesis_succeeded: synthesisOk,
      fell_back: false,
      duration_ms: Date.now() - start,
    },
  }
}
```

### callBrain helper (RULE 2 — must NEVER throw, must NEVER hang)
```typescript
async function callBrain(client, model, systemPrompt, userPrompt, role, businessId, timeoutMs): Promise<BrainOutput> {
  try {
    const res = await callWithTimeout(
      () => withBackoff(() => client.messages.create({
        model,
        max_tokens: role === 'strategist' ? 3000 : 2200,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })),
      timeoutMs,
      'council brain ' + role
    )
    const text = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const parsed = safeParseJSON(text)   // strips code fences, tolerant
    // log success to aria_ai_calls
    await logAICall({ agent_key: 'council_' + role, model_id: model, provider: 'anthropic',
      input_tokens: res.usage?.input_tokens ?? 0, output_tokens: res.usage?.output_tokens ?? 0,
      success: true, business_id: businessId })
    if (!parsed) {
      // parse failed — return a failed BrainOutput, do NOT throw
      return { role, observations: [], recommendations: [], confidence: 'low',
               reasoning: 'output could not be parsed', failed: true }
    }
    return {
      role,
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      confidence: parsed.confidence ?? 'low',
      reasoning: parsed.reasoning ?? '',
      failed: false,
    }
  } catch (e) {
    // timeout, network, overload-after-retries — log it, return failed output, never throw
    console.error('[council] brain ' + role + ' failed:', (e as Error).message)
    await logAICall({ agent_key: 'council_' + role, model_id: model, provider: 'anthropic',
      input_tokens: 0, output_tokens: 0, success: false,
      error_message: (e as Error).message, business_id: businessId })
    return { role, observations: [], recommendations: [], confidence: 'low',
             reasoning: 'brain failed: ' + (e as Error).message, failed: true }
  }
}
```
- callSynthesis: same pattern — callWithTimeout + withBackoff, parse safely,
  log to aria_ai_calls with agent_key='council_synthesis'. It MAY throw
  (runAriaCouncil catches it and builds the fallback above).
- safeParseJSON: strips ```json fences and whitespace, JSON.parse in a
  try/catch, returns null on failure. Never throws.
- logAICall: use the existing trackAICall / ai-telemetry helper — match
  its exact signature from ai-telemetry.ts. Fire-and-forget is fine but
  it must not throw into the caller.

## STEP 3 — WIRE COUNCIL INTO THE BRIEFING ROUTE
In src/app/api/aria/briefing/route.ts:
- At the top: `export const maxDuration = 300` — RULE 2: generous so Vercel
  never kills the function before the code's own timeouts fire.
  Also keep `export const dynamic = 'force-dynamic'` and runtime 'nodejs'.
- Import runAriaCouncil from '@/lib/aria/council'.
- After businessContext is built, replace the single model call with:
```typescript
let council = null
let usedFallback = false
try {
  council = await runAriaCouncil(businessContext, businessId, 'briefing')
} catch (e) {
  console.error('[briefing] council failed, using single-model fallback:', (e as Error).message)
  usedFallback = true
}

if (council && council.final_briefing) {
  // store the council run for training
  await insertCouncilRun(businessId, 'briefing', council, false)
  return NextResponse.json({
    briefing: council.final_briefing,
    consensus: council.consensus,
    contested: council.contested,
    confidence_map: council.confidence_map,
    council_mode: true,
  })
} else {
  // FALLBACK: the original single-model briefing path — UNCHANGED, still here
  const fallbackBriefing = await /* the existing single-model briefing call */
  await insertCouncilRun(businessId, 'briefing', null, true)  // record the fallback
  return NextResponse.json({ briefing: fallbackBriefing, council_mode: false })
}
```
- insertCouncilRun: inserts one row into council_runs with all the meta
  fields (brains_succeeded, brains_failed, synthesis_succeeded,
  fell_back_to_single_model, token totals, duration_ms, and the jsonb
  fields). On fallback, fell_back_to_single_model=true. This insert is
  wrapped in its own try/catch — a logging failure must never break the
  briefing response.
- RULE 1: the original single-model briefing code is NOT deleted. It is
  the fallback branch. Keep it fully intact.

## STEP 4 — UPDATE THE BRIEFING UI (additive only)
In the dashboard briefing component:
- If response.council_mode === true:
  - Render final_briefing exactly where the briefing renders now — same
    position, same style. The owner sees no disruption.
  - Below it, add a collapsed-by-default expandable: "How Aria reached this".
    When expanded: consensus items with a ✓, contested items with a ⚡ and
    all three views, confidence badges from confidence_map.
- If council_mode is false (fallback): render exactly as before.
- Do NOT change the main briefing layout. Additive only. (RULE 1)

## STEP 5 — ASK ARIA INTEGRATION (additive)
In src/app/api/aria/ask/route.ts:
- Classify the question:
  `const isStrategic = /should|recommend|best|strategy|improve|why|how can|what would|advice|suggest/i.test(question)`
- If isStrategic: run runAriaCouncil(context, businessId, 'ask_aria'),
  use council.final_briefing as the answer, wrapped in the SAME
  try/catch → single-model fallback as STEP 3.
- If not strategic: use the existing single-model path (faster, cheaper).
- Set maxDuration = 300 on this route too.
- The existing ask path stays intact as the fallback. (RULE 1)

## STEP 6 — VERIFY NOTHING IS SILENT (RULE 2 self-check)
Before committing, confirm in the code:
- [ ] Every one of the 4 AI calls is wrapped in BOTH withBackoff AND callWithTimeout.
- [ ] callBrain NEVER throws — it returns a failed BrainOutput instead.
- [ ] Every failure path calls console.error AND logs to aria_ai_calls with success=false.
- [ ] runAriaCouncil throws ONLY when all 3 brains fail — and the route catches it.
- [ ] The route ALWAYS returns a briefing — council or single-model fallback.
- [ ] council_runs gets a row on every run, success or fallback.
- [ ] maxDuration=300 on both briefing and ask routes.
- [ ] No await without a timeout or backoff around it on any AI call.

## CONSTRAINTS (locked)
- No backtick template literals inside className={...} or style={{}}.
- 'use client' line 1 where needed.
- All amounts: (Number(x)||0).toFixed(2), dollars not cents.
- Do NOT remove the single-model briefing path — it is the fallback. (RULE 1)
- Do NOT touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts.
- vercel.json crons stay daily-or-less; do not add/remove functions there.

## STEP 7 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. Fix only TS/build
errors. ONE commit, ONE push.

Commit: feat(ai): Aria Council multi-brain architecture — Growth/Risk/Strategy
brains run in parallel (Haiku x2 + Sonnet) then a Sonnet synthesis produces
consensus/contested output; every AI call wrapped in withBackoff + hard
timeout so nothing hangs or fails silently; graceful fallback to the
single-model briefing preserved; council_runs records every run for
training; briefing UI gains a "How Aria reached this" panel
