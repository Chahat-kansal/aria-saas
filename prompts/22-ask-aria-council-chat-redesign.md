# Prompt 22 — Ask Aria Council Mode Chat Redesign

## Pre-edit checklist
- [ ] pwd confirm: C:\Users\kansa\aria-saas-audit
- [ ] Read full repo tree
- [ ] Read src/app/dashboard/ask-aria/page.tsx
- [ ] Read src/app/api/aria/ask/route.ts
- [ ] Read src/lib/aria/council.ts (understand CouncilOutput + BriefingLayout types)
- [ ] Read src/components/dashboard/AriaBriefingCard.tsx (reference for card patterns)
- [ ] npx tsc --noEmit (must be clean before touching anything)

## What to build

Redesign Ask Aria into a premium council-driven chat. Every question runs the 3-brain council and returns a structured multi-block response — not flat text.

### 1. New types — src/lib/aria/ask-types.ts

```typescript
export type AskBlock =
  | { type: 'text'; content: string }
  | { type: 'lead'; content: string }
  | { type: 'chart'; chartType: 'bar'; labels: string[]; values: number[]; metrics: { label: string; value: string; color?: string }[] }
  | { type: 'brain_readouts'; items: { role: 'growth'|'risk'|'strategy'; icon: string; text: string }[] }
  | { type: 'council_split'; question: string; growth: string; risk: string; strategy: string; choices: { icon: string; title: string; sub: string; prompt: string }[] }
  | { type: 'action_list'; items: { icon: string; title: string; sub: string; color?: string; prompt: string }[] }
  | { type: 'action_single'; icon: string; title: string; sub: string; prompt: string }

export type AskResponse {
  blocks: AskBlock[]
  followups: string[]
  council_run_id?: string
}
```

### 2. Update /api/aria/ask/route.ts

- Import `runCouncil` from council.ts
- Run council on EVERY question (not just strategic ones)
- Synthesis prompt extended: must return structured blocks JSON alongside final_briefing
- New synthesis output format — add to the existing JSON schema:
```json
{
  "blocks": [
    { "type": "lead", "content": "..." },
    { "type": "chart", "chartType": "bar", "labels": [...], "values": [...], "metrics": [...] },
    { "type": "brain_readouts", "items": [...] },
    { "type": "council_split", "question": "...", "growth": "...", "risk": "...", "strategy": "...", "choices": [...] },
    { "type": "action_list", "items": [...] },
    { "type": "text", "content": "..." }
  ],
  "followups": ["follow-up question 1", "follow-up question 2", "follow-up question 3"]
}
```
- Council decides which blocks to include and in what order based on the question
- If question is simple/factual: lead + text + action_single
- If question has data: lead + chart + brain_readouts + text + action_single  
- If brains disagree: lead + text + council_split
- If urgent/priority: lead + action_list
- Route returns: `{ blocks, followups, council_run_id }`
- Log to aria_ai_calls as before
- maxDuration = 300

### 3. New component — src/components/dashboard/AskAriaChat.tsx

Premium chat UI. Rules:
- Uses Aria OS design system: deep forest green bg, #7FB897 accent, Inter body, Fraunces for Aria name
- Message turns: Aria (left, small A avatar) and user (right, C avatar)
- Aria's messages render blocks in order using a BlockRenderer
- User messages are plain styled bubbles
- Thinking state: animated 4-step council process (Growth reading... Risk checking... Strategy contextualising... Synthesising...) with tick animations
- Follow-up chips after every Aria response
- Composer: full-width input with send button, hint text "Council runs on every question · connected records only"
- NO hardcoded responses — all content comes from the API

### 4. BlockRenderer component — src/components/dashboard/BlockRenderer.tsx

Renders each block type:
- `lead` — large semi-bold sentence, rgba(255,255,255,0.94)
- `text` — standard prose, rgba(255,255,255,0.82), line-height 1.7
- `chart` — bar chart (CSS bars, no external lib), metric tiles below
- `brain_readouts` — three rows: small icon, coloured label (Growth=#7FB897, Risk=#F87171, Strategy=#A78BFA), body text
- `council_split` — amber header "Council split · your call", question bold, two-column Growth+Risk pills, full-width Strategy pill, then tappable choice buttons (each fires sendMessage with the choice's prompt)
- `action_list` — each item: coloured icon, title+sub, tappable "Fix/Do/Draft ↗" button
- `action_single` — single action row

### 5. Wire into the page

- src/app/dashboard/ask-aria/page.tsx — replace existing chat component with AskAriaChat
- Pass businessId from server component

## DB — no new tables needed
Uses existing aria_ai_calls, council_runs

## Quality bar
- Category leader: Claude itself. This must feel that good.
- No scaffolds — all 4 question types must produce genuinely different block structures
- The chart block must use real data from the business context (pos_sales, pos_products)
- council_split only appears when the synthesis brain determines genuine disagreement
- TypeScript strict — no `any`, no errors on npx tsc --noEmit

## Build gate
npx tsc --noEmit + npm run build must pass. Single commit.
