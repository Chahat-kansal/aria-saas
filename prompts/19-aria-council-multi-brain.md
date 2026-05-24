# Aria OS — Prompt 19: Aria Council — Multi-Brain AI Architecture
ONE task, ONE commit, ONE push.

## WHAT THIS BUILDS
Aria's single-model briefing is replaced by a multi-brain deliberation system:
three AI brains argue from different perspectives, then a synthesis layer
produces the final output. This is called the "Aria Council."

The three brains run in PARALLEL (Promise.all — no added latency beyond the
slowest brain). Each uses a different model tier and role:
  Brain A "The Optimist"  — claude-haiku-4-5-20251001 (fast, looks for opportunity)
  Brain B "The Critic"    — claude-haiku-4-5-20251001 (fast, looks for risk/problems)
  Brain C "The Strategist"— claude-sonnet-4-5-20250929 (quality, looks at the whole)
  Synthesis               — claude-sonnet-4-5-20250929 (reads all three, final output)

Cost is managed: Haiku for A+B (cheap, high-volume), Sonnet for C+Synthesis
(quality where it matters). Total: ~4x current briefing cost but dramatically
better output.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
git log --oneline -3
```

## STEP 1 — READ BEFORE WRITING
Read these files IN FULL before touching anything:
- src/lib/aria/get-business-context.ts (the data layer — read it all)
- src/lib/aria/business-brain.ts (the current brain structure)
- src/app/api/aria/briefing/route.ts (the current briefing route)
- src/lib/aria/model-router.ts (how providers are called)
- src/lib/aria/ai-telemetry.ts (how aria_ai_calls is logged)
- src/lib/aria/get-system-prompt.ts (current system prompt structure)
Do NOT write code before reading all six files.

## CONTEXT — DB ALREADY BUILT, do not create/alter tables
aria_ai_calls already exists and must log every AI call.
aria_autopilot_actions already exists and must receive rows from the council.
businesses table has: industry, trading_name, city, pos_enabled,
business_model, year_established, biggest_challenge, entity_type and all
the fields added in the onboarding + AI audit passes.

## STEP 2 — CREATE src/lib/aria/council.ts
This is the core of the Aria Council. Export:

```typescript
export type BrainRole = 'optimist' | 'critic' | 'strategist'

export type BrainOutput = {
  role: BrainRole
  observations: string[]      // 3-5 specific observations from this brain's lens
  recommendations: string[]   // 2-3 specific recommendations
  confidence: 'high' | 'medium' | 'low'
  reasoning: string           // brief internal reasoning, not shown to owner
}

export type CouncilOutput = {
  consensus: string[]         // things all 3 brains agreed on
  contested: Array<{          // things where brains disagreed
    topic: string
    optimist_view: string
    critic_view: string
    strategist_view: string
  }>
  final_briefing: string      // the synthesised output shown to the owner
  confidence_map: Record<string, 'high' | 'medium' | 'low'>
  raw_brain_outputs: BrainOutput[]  // stored for training/tuning, not shown
}

export async function runAriaCouncil(
  businessContext: string,
  businessId: string,
  mode: 'briefing' | 'weekly_report' | 'ask_aria'
): Promise<CouncilOutput>
```

### The three brain system prompts (bake these in exactly as written)

**Brain A — The Optimist** (Haiku):
```
You are Aria's Growth Brain — an AI analyst for an Australian small business.
Your role is to find OPPORTUNITY in the business data. Look for:
- What is working better than expected
- Which customers, products, or time slots are performing well
- Where there is untapped potential or momentum to double down on
- Positive trends that the owner should amplify

You are BIASED toward opportunity and growth. Your job is to surface the
upside. Be specific — cite actual numbers from the data. Never give generic
advice. If the data shows nothing positive, say so honestly with low confidence.

Return ONLY valid JSON: {
  "observations": ["specific observation with data", ...],
  "recommendations": ["specific action with expected outcome", ...],
  "confidence": "high|medium|low",
  "reasoning": "why you reached these conclusions"
}
No preamble, no markdown, no explanation outside the JSON.
```

**Brain B — The Critic** (Haiku):
```
You are Aria's Risk Brain — an AI analyst for an Australian small business.
Your role is to find PROBLEMS and RISKS in the business data. Look for:
- What is underperforming or declining
- Which customers are at risk of leaving
- Where money is leaking or being wasted
- Patterns that suggest something is wrong
- What the owner is probably ignoring or missing
- Suspicious patterns (unusual voids, discount abuse, cash variance)

You are BIASED toward identifying risk. Your job is to be the voice of concern.
Be specific — cite actual numbers. Never soften a real problem. If the data
shows no problems, say so honestly with high confidence.

Return ONLY valid JSON: {
  "observations": ["specific problem with data evidence", ...],
  "recommendations": ["specific action to fix the problem", ...],
  "confidence": "high|medium|low",
  "reasoning": "why you identified these risks"
}
No preamble, no markdown, no explanation outside the JSON.
```

**Brain C — The Strategist** (Sonnet):
```
You are Aria's Strategy Brain — a senior AI advisor for an Australian small
business. You have read the same data as two other analysts (an Optimist and
a Critic). Your role is to see the WHOLE PICTURE:
- The business's position relative to what similar businesses typically look like
- The most important thing the owner should focus on this week (only one)
- Whether the growth signals and risk signals are connected
- What the trajectory of this business looks like over the next 30-90 days
- The customer relationship health, not just the financial health

You are balanced and strategic. You do not lean toward optimism or pessimism.
You think like a trusted advisor who has been watching this business for months.
Be specific — cite actual numbers. Your single most important output is the
ONE THING that matters most right now.

Return ONLY valid JSON: {
  "observations": ["strategic observation with data", ...],
  "recommendations": ["strategic action with rationale", ...],
  "confidence": "high|medium|low",
  "reasoning": "your strategic assessment of this business right now"
}
No preamble, no markdown, no explanation outside the JSON.
```

### The Synthesis call (Sonnet)

After all three brains return their outputs, a synthesis call receives:
- The full business context
- All three brain outputs (labelled by role)
- The mode (briefing / weekly_report / ask_aria)

Synthesis system prompt:
```
You are the final voice of Aria — an AI business co-operator for an
Australian small business. Three specialised analysts (Growth, Risk, Strategy)
have just reviewed this business's data independently. You have their outputs.

Your job is to synthesise their views into ONE clear, useful output for the
business owner. Rules:
1. Where all three agree — state it with confidence. These are facts.
2. Where two agree and one dissents — state the majority view and note the
   caveat honestly ("Aria is fairly confident, but worth watching...")
3. Where all three disagree — present it as a genuine decision the owner
   must make, not a recommendation. ("Our analysts are split on this...")
4. Lead with the single most important thing the owner needs to know today.
5. Be specific — use actual numbers from the data. Never be vague.
6. Australian English. Conversational but professional. Like a trusted
   business partner who has been watching this business for months.
7. For briefing mode: 200-300 words, structured as: lead insight → 2-3
   supporting observations → 1-2 specific actions → one thing to watch.
8. Never invent data not in the context. If data is thin, say so.
9. The confidence map shows which insights are high/medium/low confidence
   based on how many brains agreed.

Return ONLY valid JSON: {
  "consensus": ["things all 3 agreed on"],
  "contested": [{"topic": "...", "optimist_view": "...", "critic_view": "...", "strategist_view": "..."}],
  "final_briefing": "the complete briefing text shown to the owner",
  "confidence_map": {"insight key": "high|medium|low"}
}
```

### Implementation of runAriaCouncil

```typescript
async function runAriaCouncil(
  businessContext: string,
  businessId: string,
  mode: 'briefing' | 'weekly_report' | 'ask_aria'
): Promise<CouncilOutput> {

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  const sonnet = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

  // Run all 3 brains in PARALLEL — no sequential latency
  const userPrompt = `Business data for analysis:\n\n${businessContext}\n\nMode: ${mode}`

  const [brainA, brainB, brainC] = await Promise.allSettled([
    callBrain(haiku, 'claude-haiku-4-5-20251001', OPTIMIST_PROMPT, userPrompt, 'optimist', businessId),
    callBrain(haiku, 'claude-haiku-4-5-20251001', CRITIC_PROMPT, userPrompt, 'critic', businessId),
    callBrain(sonnet, 'claude-sonnet-4-5-20250929', STRATEGIST_PROMPT, userPrompt, 'strategist', businessId),
  ])

  // Extract successful outputs (gracefully degrade if a brain fails)
  const outputs: BrainOutput[] = [brainA, brainB, brainC]
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<BrainOutput>).value)

  if (outputs.length === 0) {
    throw new Error('All council brains failed')
  }

  // Synthesis call reads all outputs
  const synthesisPrompt = `
Business context:
${businessContext}

Brain outputs:
${outputs.map(o => `[${o.role.toUpperCase()}]\nObservations: ${o.observations.join(' | ')}\nRecommendations: ${o.recommendations.join(' | ')}\nConfidence: ${o.confidence}`).join('\n\n')}

Mode: ${mode}
Synthesise these into the final output.
`

  const synthesis = await callSynthesis(sonnet, synthesisPrompt, businessId)

  return {
    consensus: synthesis.consensus,
    contested: synthesis.contested,
    final_briefing: synthesis.final_briefing,
    confidence_map: synthesis.confidence_map,
    raw_brain_outputs: outputs,
  }
}
```

Helper functions in the same file:
- `callBrain(client, model, systemPrompt, userPrompt, role, businessId)`:
  calls the model, parses the JSON response, logs to aria_ai_calls with
  agent_key=`council_${role}`, returns BrainOutput. On parse failure,
  returns a fallback BrainOutput with low confidence. NEVER throws.
- `callSynthesis(client, prompt, businessId)`: calls Sonnet with the
  SYNTHESIS_PROMPT, parses the JSON, logs to aria_ai_calls with
  agent_key='council_synthesis'. Returns synthesis JSON.
- Every aria_ai_calls log must include: agent_key, model_id, provider
  ('anthropic'), input_tokens, output_tokens, success (bool),
  error_message if failed, business_id.

## STEP 3 — WIRE COUNCIL INTO THE BRIEFING ROUTE
In src/app/api/aria/briefing/route.ts:
- Import runAriaCouncil from '@/lib/aria/council'
- After getBusinessContext() is called and businessContext is built:
  Replace the single anthropic.messages.create() call with:
  ```typescript
  const council = await runAriaCouncil(businessContext, businessId, 'briefing')
  ```
- The response to the client now includes:
  ```typescript
  {
    briefing: council.final_briefing,
    consensus: council.consensus,
    contested: council.contested,
    confidence_map: council.confidence_map,
    council_mode: true,   // so the UI knows to render council output
  }
  ```
- PRESERVE the existing fallback: if runAriaCouncil throws, fall back to
  the ORIGINAL single-model briefing call. Never break the briefing for
  the owner. Wrap in try/catch with the original path as the catch branch.

## STEP 4 — UPDATE THE BRIEFING UI (additive only)
In the dashboard briefing component (wherever the briefing text is rendered):
- If the response includes council_mode: true:
  - Show the final_briefing text as before (same UI, same position)
  - Below the briefing, add a small expandable "How Aria reached this"
    section (collapsed by default — owner can tap to expand):
    - Show consensus items with a ✓ (high confidence)
    - Show contested items with a ⚡ label and all three views
    - Show confidence_map as small badges on each insight
  - This teaches owners to understand and trust Aria's reasoning over time
- If council_mode is false (fallback): render exactly as before
- Do NOT change the main briefing layout — additive only

## STEP 5 — STORE COUNCIL OUTPUTS FOR TRAINING
After each council run, insert a row into aria_daily_briefings (or
create a new council_runs table if aria_daily_briefings doesn't have
the right shape — check first). Store:
- business_id, created_at
- final_briefing text
- raw_brain_outputs (jsonb) — all three brain outputs for later analysis
- consensus (jsonb), contested (jsonb), confidence_map (jsonb)
- Whether any brain failed (for quality monitoring)
This is the training data. Over time, you can see which brains were right,
which were consistently wrong, and tune their system prompts accordingly.
Do not create new DB tables if aria_daily_briefings has a jsonb column
that can hold the council data — prefer reusing existing tables.

## STEP 6 — ASK ARIA INTEGRATION (optional, if time allows)
In src/app/api/aria/ask/route.ts: for questions that are strategic in
nature (detected by checking if the question contains words like "should",
"recommend", "best", "strategy", "improve", "why"), optionally run the
council instead of a single model call. For factual questions ("what was
my revenue last week"), use the single model (faster, cheaper).
Add a query classifier at the top of the route:
```typescript
const isStrategic = /should|recommend|best|strategy|improve|why|how can|
  what would|advice|suggest/i.test(question)
if (isStrategic) {
  const council = await runAriaCouncil(context, businessId, 'ask_aria')
  // Use council.final_briefing as the answer
} else {
  // existing single-model path
}
```

## QUALITY RULES FOR THE SYSTEM PROMPTS
These rules are non-negotiable for the brain system prompts:
- Every observation MUST cite a specific number from the data
  (GOOD: "Revenue down 18% vs last week ($4,200 vs $5,100)")
  (BAD: "Revenue has been declining")
- Every recommendation MUST have a specific action and an expected outcome
  (GOOD: "Text the 6 lapsed customers who spent >$80 — similar campaigns recovered 2-3 customers")
  (BAD: "Consider running a win-back campaign")
- If the data doesn't support a strong view, confidence = 'low' and say so
- Australian English throughout — no US spellings
- The Critic MUST NOT be dismissive of real positives — it looks for risk,
  not pessimism for its own sake
- The Optimist MUST NOT ignore real problems — it looks for opportunity,
  not toxic positivity
- The Strategist MUST pick ONE most important thing — not a list

## CONSTRAINTS (locked rules)
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- All amounts: (Number(x)||0).toFixed(2), dollars not cents
- Every AI call logs to aria_ai_calls — 4 calls per council run
  (optimist, critic, strategist, synthesis)
- Do NOT remove the existing single-model briefing path — keep it as the
  fallback. The council must degrade gracefully.
- Do NOT touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts,
  aria-voice-guide.ts

## STEP 7 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. Fix only TS/build
errors. ONE commit, ONE push.

Commit: feat(ai): Aria Council — multi-brain deliberation architecture with
Growth/Risk/Strategy brains running in parallel (Haiku×2 + Sonnet×2),
synthesis layer produces consensus/contested output, graceful fallback to
single-model, briefing UI shows "How Aria reached this" expandable panel,
all 4 calls logged to aria_ai_calls for training and tuning
