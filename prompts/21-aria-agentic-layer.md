# Aria OS — Prompt 21: Aria Agentic Layer — Act, Not Just Analyse
ONE task, ONE commit, ONE push.
Run AFTER Prompt 19 (council) AND Prompt 20 (context brain) are green.

## WHAT THIS BUILDS
Right now Aria's council ANALYSES and RECOMMENDS. This prompt makes it ACT.
Three specialised tool-using agents that the council can invoke:

  QueryAgent    — queries the DB autonomously to answer complex questions
  MessageAgent  — drafts and (with approval) sends SMS/email to customers
  AutomationAgent — triggers Aria's existing automations (win-back, reorder)

Plus an Orchestrator that reads the council's output and decides which agents
to invoke, in what order, with what inputs.

This is the difference between:
  BEFORE: "Aria recommends reaching out to your 6 lapsed customers."
  AFTER:  "Aria has drafted win-back messages for your 6 lapsed customers.
           Tap to review and send, or let Aria send automatically."

## THE CORE PRINCIPLE — HUMAN IN THE LOOP
Every agent action is logged to aria_agent_actions BEFORE execution.
Risk levels determine whether approval is required:
  LOW risk  → auto-execute (e.g. querying the DB, drafting a message)
  MEDIUM risk → show to owner, execute if no response in 24h ("silent approve")
  HIGH risk → owner must explicitly approve before execution

The owner NEVER loses control. Aria acts, but only within boundaries the
owner can see, review, and override. Every action is visible in the dashboard.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```
Confirm Prompts 19 and 20 are deployed green.
Confirm aria_agent_actions and aria_agent_memory tables exist.

## STEP 1 — READ BEFORE WRITING
Read src/lib/aria/council.ts fully (you extend it).
Read the existing win-back route (src/app/api/aria/winback or similar) —
the AutomationAgent reuses it, not rebuilds it.
Read the existing SMS sending code (Twilio) — MessageAgent reuses it.
Read the existing email sending code (SendGrid) — MessageAgent reuses it.
Read aria_agent_actions and aria_agent_memory table schemas from the DB
(use supabaseAdmin to check column names before using them).
Do NOT write code before reading all of these.

## STEP 2 — CREATE src/lib/aria/agents/query-agent.ts

The QueryAgent translates natural-language questions from the council into
safe, scoped DB queries, executes them, and returns structured results.

```typescript
export type QueryAgentResult = {
  question: string
  query_executed: string     // the actual SQL or PostgREST query run
  result: any[]
  summary: string            // one-sentence plain-English summary
  confidence: 'high' | 'medium' | 'low'
  failed?: boolean
}

export async function queryAgent(
  question: string,
  businessId: string
): Promise<QueryAgentResult>
```

HOW IT WORKS:
1. Use claude-sonnet-4-5-20250929 to translate the question into a
   SAFE, READ-ONLY PostgREST query for the Supabase client. System prompt:
   "You are a DB query translator for an Australian small business.
   Given a business question, produce a SAFE READ-ONLY Supabase query.
   The business_id is always scoped. NEVER produce DELETE, UPDATE, INSERT,
   DROP, or TRUNCATE. Output ONLY valid JSON:
   { table: string, select: string, filters: object, order: string, limit: number }"

2. Parse the query safely. Validate: table must be one of the allowed
   read-only tables (pos_sales, pos_sale_items, pos_products, customers,
   pos_shift_reports, staff_members, business_hours, pos_categories).
   If the table is not in this list → return failed result, do not execute.
   NEVER execute any destructive operation.

3. Execute the validated query via supabaseAdmin, scoped to businessId.

4. Log to aria_agent_actions:
   agent_name='query_agent', action_type='db_query',
   action_input: { question }, action_output: { query, result_count },
   risk_level='low', executed=true, approved=true (auto-approved).

5. Return the result + a plain-English summary (one more Haiku call).

## STEP 3 — CREATE src/lib/aria/agents/message-agent.ts

The MessageAgent drafts customer messages and — with the right approval
level — sends them through the existing Twilio/SendGrid pipeline.

```typescript
export type MessageDraft = {
  customer_id: string
  customer_name: string
  channel: 'sms' | 'email'
  subject?: string           // email only
  body: string
  tone: 'warm' | 'urgent' | 'promotional'
  risk_level: 'low' | 'medium' | 'high'
  reason: string             // why Aria is contacting this customer
}

export type MessageAgentResult = {
  drafts: MessageDraft[]
  action_id: string          // the aria_agent_actions row ID (for approval flow)
  needs_approval: boolean
}

export async function messageAgent(
  intent: string,           // e.g. "draft win-back messages for lapsed customers"
  businessId: string,
  customerIds?: string[]    // optional: scope to specific customers
): Promise<MessageAgentResult>
```

HOW IT WORKS:
1. Load the relevant customers from the DB (scoped to businessId).
   If customerIds provided, load those. Otherwise, load the customers
   that match the intent (e.g. lapsed = last_visit > 30 days ago).
   Cap at 20 customers per run — never mass-message without a cap.

2. For each customer, use claude-haiku-4-5-20251001 to draft a
   personalised message. The system prompt includes:
   - The customer's name, last visit, spend, segment
   - The business name, industry, city
   - The reason for the message
   - A rule: "Sound like a human business owner, not an AI. Maximum 2
     sentences for SMS, 4 paragraphs for email. Never mention Aria."
   - A good example and a bad example for the business type

3. Assess risk_level for the batch:
   LOW: fewer than 5 customers, warm/informational messages → auto-execute
   MEDIUM: 5-15 customers, or promotional content → owner notified, silently
           approved after 24h if no response
   HIGH: more than 15 customers, or anything monetary → must be explicitly
         approved in the dashboard before sending

4. Insert ONE row into aria_agent_actions:
   agent_name='message_agent', action_type='draft_message',
   action_input: { intent, customer_count },
   action_output: { drafts } (the array of MessageDraft),
   risk_level, approved: risk_level==='low' ? true : null,
   executed: false (not sent yet)
   Return the action_id.

5. For LOW risk: immediately execute (send via existing Twilio/SendGrid
   pipeline), update executed=true + executed_at.
   For MEDIUM/HIGH: return the action_id — the UI shows a pending action
   for the owner to review and approve.

Log every individual send to aria_ai_calls (agent_key='message_agent').

## STEP 4 — CREATE src/lib/aria/agents/automation-agent.ts

The AutomationAgent triggers Aria's existing automations based on council
recommendations, rather than requiring the owner to manually navigate to
each feature.

```typescript
export type AutomationTrigger = {
  automation: 'winback' | 'reorder_alert' | 'review_request' | 'compliance_reminder'
  parameters: Record<string, any>
  risk_level: 'low' | 'medium' | 'high'
  reason: string
}

export type AutomationAgentResult = {
  triggered: AutomationTrigger[]
  action_id: string
  needs_approval: boolean
}

export async function automationAgent(
  recommendations: string[],    // from council.consensus or council.raw_brain_outputs
  businessId: string
): Promise<AutomationAgentResult>
```

HOW IT WORKS:
1. Use claude-haiku-4-5-20251001 to classify which of Aria's existing
   automations (if any) map to the council's recommendations. Output JSON:
   [{ automation: 'winback'|'reorder_alert'|etc, parameters: {}, reason: string }]
   If no automation is relevant → return triggered: [].

2. For each matched automation, risk_level is:
   LOW: review_request (just sends an email asking for a review — harmless)
   MEDIUM: reorder_alert (flags a stock issue — no purchase made)
   HIGH: winback (sends SMS to lapsed customers — monetary impact perception)

3. Log to aria_agent_actions. Execute LOW risk immediately by calling the
   existing automation route internally (not via HTTP — import the handler
   function directly to avoid overhead). Queue MEDIUM/HIGH for approval.

4. Learn from outcomes: after execution, write to aria_agent_memory:
   memory_type='action_outcome', memory_key='automation_[type]',
   memory_value: { triggered_at, parameters, outcome: 'executed'|'rejected' }
   On next run, if the owner repeatedly rejects a certain automation type,
   decrease confidence and stop suggesting it.

## STEP 5 — CREATE src/lib/aria/agents/orchestrator.ts

The Orchestrator reads the council's output and decides which agents to
invoke, with what inputs, in what order. This is the glue layer.

```typescript
export async function runOrchestrator(
  council: CouncilOutput,
  businessId: string,
  mode: 'briefing' | 'weekly_report'
): Promise<OrchestratorResult>
```

HOW IT WORKS:
1. Use claude-sonnet-4-5-20250929 to read council.consensus +
   council.raw_brain_outputs and decide which agents are warranted.
   System prompt: "You are Aria's orchestration layer. Read the council's
   output. For each actionable recommendation, decide: (a) which agent
   should act on it, (b) what input to give that agent, (c) whether this
   is urgent (act now) or advisory (suggest to owner). Return JSON only:
   { actions: [{ agent, intent, urgency: 'now'|'suggest' }] }
   Limit to 3 actions per briefing — never overwhelm the owner."

2. For 'now' actions: invoke the relevant agent immediately.
3. For 'suggest' actions: surface them in the briefing UI as
   one-tap actions ("Aria suggests sending win-back messages to 6 customers.
   [Review & send] [Dismiss]").

4. Wrap every agent call in try/catch — orchestrator failure must NEVER
   break the briefing. The briefing is always shown regardless.

5. Return { actions_taken, actions_suggested, agent_action_ids }.

## STEP 6 — WIRE INTO THE BRIEFING ROUTE
In src/app/api/aria/briefing/route.ts, AFTER the council response is sent
to the client (do not delay the response):

```typescript
// Fire-and-forget the orchestrator — does not block the briefing response
if (council && !usedFallback) {
  runOrchestrator(council, businessId, 'briefing').catch(e =>
    console.error('[orchestrator] failed:', e.message)
  )
}
```

The orchestrator runs AFTER the owner receives the briefing. This is
critical — the briefing must never be delayed by agent execution.

## STEP 7 — DASHBOARD: PENDING ACTIONS UI
Add a "Pending actions" section to the dashboard home (below the briefing,
above the setup guide if still visible). Reads from aria_agent_actions
where approved IS NULL and business_id = current business.

For each pending action:
- Show: what Aria wants to do, why, risk level badge, customer count if applicable
- Two buttons: "Approve" (sets approved=true, triggers execution) and
  "Dismiss" (sets approved=false)
- LOW risk actions don't appear here (auto-executed already)
- MEDIUM risk show with a timer ("auto-approves in [X hours] unless dismissed")
- HIGH risk show prominently with no auto-approve timer

After approval: call an API route that reads the action_output, executes
the action via the relevant agent, and updates executed=true + executed_at.

## STEP 8 — AGENT MEMORY LEARNING LOOP
After each action is executed (approved or auto-approved), write to
aria_agent_memory:
- If the owner approved: increment times_confirmed, increase confidence
- If the owner rejected: write with low confidence, add to memory so the
  same action is not proposed again soon
- The Orchestrator reads aria_agent_memory before proposing actions:
  "has this type of action been recently rejected for this business?"
  If yes, skip it. This is how Aria learns the owner's preferences.

## CONSTRAINTS
- Orchestrator runs AFTER briefing response — never delays the owner
- Every agent action logged to aria_agent_actions before execution
- HIGH risk actions never auto-execute — always require explicit approval
- The message cap is hard: 20 customers max per message_agent run
- QueryAgent only executes SELECT on the allowed table whitelist
- Never send a message that mentions "Aria" or "AI"
- No backtick template literals in className/{style
- 'use client' line 1 where needed
- All amounts: (Number(x)||0).toFixed(2)

## STEP 9 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(ai): Aria Agentic Layer (Prompt 21) — QueryAgent (safe read-only DB queries), MessageAgent (personalised customer messages with approval flow), AutomationAgent (triggers existing automations), Orchestrator (reads council output and coordinates agents); human-in-the-loop approval by risk level; agent memory learns owner preferences over time; all actions logged to aria_agent_actions; never delays the briefing response
