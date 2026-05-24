# Aria OS — Prompt 20: Aria Context Brain (Gemini Web Agent)
4th council brain — external world awareness. ONE task, ONE commit, ONE push.
Run AFTER Prompt 19 is deployed and the 3-brain council has run at least once.

## WHAT THIS BUILDS
A 4th brain added to the Aria Council: the Context Brain. Unlike the three
Claude brains that only see the business's own internal data, the Context
Brain uses Gemini 2.5 Flash with Google Search grounding to see the EXTERNAL
WORLD in real time:
- Public holidays in the business's state this week and next
- Local weather forecast for the business location
- Local events near the business (festivals, sport, concerts)
- Competitor activity (new openings, closures, promotions)
- Industry/supplier news relevant to the business (e.g. coffee price spikes,
  liquor licensing changes, food safety alerts)
- Any breaking news that would affect footfall or buying patterns

This is what makes Aria's briefing feel like it has eyes on the world —
not just eyes on the till. No other POS system does this.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```
Confirm src/lib/aria/council.ts exists and the 3-brain briefing is working.

## STEP 1 — READ BEFORE WRITING
Read src/lib/aria/council.ts in full — understand the BrainOutput type,
the callWithTimeout helper, and how brains are added to Promise.allSettled.
Read src/lib/aria/providers/gemini.ts — understand how Gemini is called.
Do NOT write code before reading both.

## CONTEXT — DB READY
aria_agent_actions and aria_agent_memory tables already exist with RLS.
council_runs table exists — add a context_brain_output jsonb column to
store the Context Brain's output for training. Apply this migration:
  ALTER TABLE public.council_runs
    ADD COLUMN IF NOT EXISTS context_brain_output jsonb;
Apply this migration FIRST via supabaseAdmin before writing the code.

## STEP 2 — CREATE src/lib/aria/context-brain.ts

### Why Gemini specifically
Gemini 2.5 Flash has Google Search grounding built in — it can search the
live web as part of its reasoning. This gives real, current external context
that Claude without tools cannot provide. The output is treated as LOWER
CONFIDENCE than the internal-data brains because web data can be stale or
irrelevant — the synthesis layer weights it accordingly.

### The Context Brain function
```typescript
export type ContextBrainOutput = {
  external_factors: string[]   // specific, relevant external events/conditions
  risk_flags: string[]         // external things that could hurt the business
  opportunities: string[]      // external things the business could capitalise on
  confidence: 'high' | 'medium' | 'low'
  sources_used: string[]       // what the model searched for (for transparency)
  failed?: boolean
}

export async function runContextBrain(
  business: { trading_name: string; industry: string; city: string; state: string },
  weekStart: Date
): Promise<ContextBrainOutput>
```

### Gemini call with search grounding
Use the Gemini REST API directly (same pattern as providers/gemini.ts).
Model: gemini-2.5-flash. Enable search grounding via the tools parameter.

```typescript
const query = `
You are a business intelligence agent for an Australian small business.
Business: ${business.trading_name} — a ${business.industry} business in
${business.city}, ${business.state}, Australia.
Week starting: ${weekStart.toDateString()}

Search for and report ONLY information directly relevant to this business
for this specific week:
1. Public holidays in ${business.state} this week or next (if any)
2. Major local events near ${business.city} (festivals, sport, concerts,
   markets) that would increase or decrease foot traffic
3. Current weather forecast for ${business.city} this week
4. Any news about ${business.industry} businesses in Australia this week
   (price changes, supply issues, regulatory changes, competitor news)
5. Any competitor businesses opening, closing, or running promotions near
   ${business.city} in the ${business.industry} industry

Return ONLY valid JSON, no preamble:
{
  "external_factors": ["specific, current fact relevant to this business"],
  "risk_flags": ["specific external risk this week"],
  "opportunities": ["specific external opportunity this week"],
  "confidence": "high|medium|low",
  "sources_used": ["what you searched for"]
}

If you find nothing relevant, return external_factors: [], risk_flags: [],
opportunities: [], confidence: "low". Never invent facts.
`

const body = {
  contents: [{ parts: [{ text: query }] }],
  tools: [{ googleSearch: {} }],    // enables Google Search grounding
  generationConfig: { maxOutputTokens: 1500, temperature: 0.1 }
}

const response = await callWithTimeout(
  () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }),
  45000,   // 45s timeout — same as Haiku brains
  'context-brain'
)
```

Parse the response carefully — Gemini with grounding sometimes wraps
output in markdown. Strip code fences. Parse safely (try/catch returns
a failed ContextBrainOutput on any error, never throws).

Log every call to aria_ai_calls:
  agent_key='council_context', model_id='gemini-2.5-flash',
  provider='gemini', input_tokens (estimate from char count / 4),
  output_tokens, success, error_message if failed, business_id.

## STEP 3 — INTEGRATE INTO COUNCIL
In src/lib/aria/council.ts, update runAriaCouncil:

Add the Context Brain as a 4th parallel call:
```typescript
const [a, b, c, ctx] = await Promise.allSettled([
  callBrain(client, 'claude-haiku-4-5-20251001', OPTIMIST_PROMPT, userPrompt, 'optimist', businessId, 45000),
  callBrain(client, 'claude-haiku-4-5-20251001', CRITIC_PROMPT, userPrompt, 'critic', businessId, 45000),
  callBrain(client, 'claude-sonnet-4-5-20250929', STRATEGIST_PROMPT, userPrompt, 'strategist', businessId, 60000),
  runContextBrain(business, weekStart),   // the new 4th brain
])
```

The Context Brain's output is passed to the synthesis call SEPARATELY from
the three internal brains — it is clearly labelled as EXTERNAL CONTEXT with
LOWER CONFIDENCE so the synthesis weights it appropriately:

Add to the synthesis user prompt:
```
EXTERNAL CONTEXT (from web search — treat as lower confidence than internal data):
Factors: ${ctx.external_factors.join(', ') || 'none found'}
Risks: ${ctx.risk_flags.join(', ') || 'none'}
Opportunities: ${ctx.opportunities.join(', ') || 'none'}
Note: this is real-time web data — verify if acting on it.
```

Update the synthesis system prompt to include:
"You also have external context from a web search. Use it to enrich the
briefing when relevant (e.g. 'there is a public holiday next Monday — plan
staffing') but always label it as external context and never treat it as
more reliable than the internal business data."

## STEP 4 — GRACEFUL DEGRADATION (RULE 2 from Prompt 19)
The Context Brain is optional — the council must work perfectly without it:
- If runContextBrain fails or times out → the 3-brain council runs as before
- If GEMINI_API_KEY is not set → skip the Context Brain entirely, log a warning
- The ctx result is wrapped in Promise.allSettled so it cannot block the others
- If ctx.status === 'rejected' or ctx.value.failed → do not include in synthesis
- Log the failure to aria_ai_calls (success=false) — never silent

## STEP 5 — STORE FOR TRAINING
In insertCouncilRun (in the briefing route), add:
  context_brain_output: ctxOutput ?? null
to the council_runs insert. This lets you see over time whether the Context
Brain's external signals are accurate and useful.

## CONSTRAINTS
- No backtick template literals in className={...}/style={{}}
- The 3-brain council must still work perfectly if Gemini fails
- GEMINI_API_KEY already set in Vercel env vars — do not add it again
- Do not alter any other DB tables
- maxDuration stays 300 on the briefing route — the Context Brain runs
  in parallel, adding at most 45s to the wall time (within the budget)

## STEP 6 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(ai): Context Brain (Prompt 20) — 4th council brain using Gemini 2.5 Flash with Google Search grounding for real-time external context (holidays, weather, local events, competitor activity, industry news); graceful degradation if Gemini fails; context_brain_output stored in council_runs for training
