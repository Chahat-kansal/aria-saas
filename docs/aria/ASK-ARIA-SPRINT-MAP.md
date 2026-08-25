# ASK ARIA — CONSOLIDATED SPRINT MAP
**~24 sprints → 20.** (16 core + 4 MCP.) Batched by shared surface: features that touch the same files, need the same preflight, and can be proven by the same tests go in one sprint.

---

## THE BATCHING RULE
Combine when features share **files + preflight + test harness**. Never combine when they need different preflights — that's two sprints wearing one hat, and the second half parks.

**NEVER COMBINE (each gets its own sprint, non-negotiable):**
- Anything moving money or sending messages — needs its own mutation tests and its own blast radius
- Anything changing the shape of the streaming core — one wrong abort and every answer breaks
- Anything with a DDL migration that other phases then build on — the migration must land and be verified before dependent code
- Auth / step-up — a security gate proven in isolation

---

## THE 16

### S1 · THE CHAT SURFACE  *(was 2 sprints)*
C2 stop · C3 regenerate · C4 edit-and-rerun · C5 copy · C6 feedback · C8 auto-titles · C11 error+retry · C12 follow-ups
**Why together:** every one lives in the message component and the chat route. One preflight of the streaming path serves all eight.
⚠️ Stop-generating is the risk item — if it destabilises, the rest still ship.

### S2 · CONVERSATION PERSISTENCE  *(was 2)*
C7 threads/rename/delete/pin · C9 search · C13 draft persistence · C10 markdown/code/tables
**Why together:** one schema (conversations + messages + FTS index), one migration, one set of RLS tests. Rendering rides along because it's the same component.

### S3 · THE STEP-THROUGH  *(was 3)*
B2 navigation · B3 live execution · B6 return to conversation · B8 idempotency · G1 scheduling engine
**Why together:** the action state machine and the Realtime channel are the same infrastructure the scheduler needs.
⚠️ B4 step-up and B5 undo are deliberately NOT here — see S4.

### S4 · STEP-UP + UNDO  *(alone, on purpose)*
B4 AAL2 enforcement · B5 rollback · B7 audit trail
**Why alone:** this is the gate that stands between an agent and your customers' money. It gets its own mutation tests and nothing else competes for the session.

### S5 · THE DELIVERABLE PIPELINE  *(was 3)*
E19 pipeline · E1 PDF · E3 Excel/CSV · E8 QR · E16 zip · I4 download · I5 email
**Why together:** one Storage bucket, one signed-URL path, one provenance attachment, one job runner. Each format is then a small adapter.

### S6 · INPUT + VISION  *(was 2)*
D1 attach · D2 paste · D3 drag-drop · D7 photo→data extraction
**Why together:** one upload path (signed URL → Storage → validate → model). Vision extraction is the same pipeline with a different consumer.

### S7 · ARIA WORKS I — PLAN AND EXECUTE
A1 delegate by outcome · A2 visible plan · A7 the report · A10 task history · A12 usage transparency
**Why alone-ish:** this is the new capability tier. The plan-approve-execute loop is the whole sprint.

### S8 · ARIA WORKS II — CLOUD AND PROGRESS
A3 cloud execution · A4 live progress · A6 self-verification · A9 scheduled recurring
**Why together:** all four are the execution runtime — QStash + Realtime + the verifier hook.

### S9 · PROACTIVE  *(was 3)*
G2 watchers · G4 morning briefing · G6 phone approvals · K2 outcome tracking
**Why together:** watchers produce the events; the briefing and approvals consume them; outcome tracking closes the same loop. One event schema.
⚠️ Phone approvals send real SMS — mutation-test the consent gate.

### S10 · MEMORY AND RULES  *(was 2)*
H5 memory · H6 view/edit memory · H7 house rules · H8 RAG over own docs · H11 injection defence
**Why together:** one `business_memory` table, one injection point in the prompt builder, one privacy surface.

### S11 · AGENT BUILDER I — THE MODEL
F1 create in plain English · F2 templates · F3 triggers · F4 tools · F6 knowledge
**Why alone:** the agent schema plus the NL→structured-agent compiler is a full session.

### S12 · AGENT BUILDER II — SAFETY AND OPERATION
F5 permissions + spend caps · F7 dry-run · F8 run history · F9 autonomy · F10 kill switch · F11 versioning
**Why alone:** this is what makes owner-built agents safe to turn on. Same reasoning as S4.

### S13 · ARIA WORKS III — SUB-AGENTS
A5 parallel sub-agents · A8 interrupt/steer/pause/resume · G5 overnight agent · G7 multi-step checkpoints
**Why together:** all four are orchestration over the S8 runtime.

### S14 · OUTPUT SURFACES  *(was 3)*
I1 artifacts/canvas · I2 versioning · I3 charts from verified data · E6 chart images · E7 posters · E2 HTML→PDF
**Why together:** one artifact model, one render pipeline; the chart and image formats are adapters on it.

### S15 · AUSTRALIAN RAILS  *(was 3)*
E12 ABA · E13 Peppol PINT A-NZ · E14 Xero/MYOB · E10 .ics · E4 docx · E9 labels
**Why together:** all file adapters on the S5 pipeline, all AU-compliance-shaped, one research pass on formats.
⚠️ ABA produces a real bank file — step-up gated, own mutation test.

### S16 · POLISH AND REACH  *(was 4)*
C14 shortcuts · C15 accessibility · C16 mobile · C17 share/export · D4 voice · D5 slash · D6 @-mentions · H9 web search
**Why together:** all surface-level, none blocking, low interdependence — the natural "clean-up and ship" sprint.

### S17 · MCP CLIENT — FOUNDATIONS AND THE FIRST CONNECTOR
L1 directory · L2 per-tenant token vault · L3 hosted-connector wiring · L5 external-unverified tier · L4 the combined-data turn
**Why together:** one credential model, one connector table, one gateway change. The payoff is the demo — "make a video ad for my worst-selling item" needs Aria's POS *and* an external tool in the same request, and nothing else on the market can do both halves.
⚠️ **Prerequisite: S12.** Per-tool permissions and spend caps must exist before any external tool is reachable. Do not run S17 before S12.
⚠️ Phase 1 is the token vault and the cross-tenant test. If one business can read another's tokens, nothing else in this sprint matters.

### S18 · MCP CLIENT — HARDENING  *(alone, on purpose)*
L6 schema pinning · L7 result sanitisation · L8 per-tool caps · L9 tool routing · L10 graceful degradation
**Why alone:** this is the sprint that stops a connector from becoming an attack surface. Schema pinning catches a server that changes its tools after you approved them; sanitisation stops instructions hidden in a tool result from driving an action. Same reasoning as S4 — a security gate gets proven on its own.
⚠️ Mutation test that must go red: a simulated schema change on an approved tool blocks the connector.

### S19 · MCP SERVER — READ ONLY
L12 the server · L13 OAuth resource server · L14 token→business→RLS · L15 read-only tool set
**Why together:** one route, one auth model, one isolation proof. The accountant connects from their own AI and pulls the café's numbers.
⚠️ The whole sprint stands or falls on one test: a token for business A must never return business B's data. Write that test first.
⚠️ Customer PII and staff personal data are not in the tool set and never will be.

### S20 · MCP SERVER — WRITES AND METERING
L16 writes as proposals only · L17 metering and rate limits · L11 developer mode
**Why alone:** an external system asking Aria to *do* something is the highest-risk surface in the product. A write tool creates a proposal in the existing registry and executes nothing.


---

## WHAT MOVED TO LATER, NOT CUT
K1 simulator · K3 benchmarking · K4 supplier agent · K5 staff agent · K6 customer agent · K7 local signals · J5 API · F12 marketplace · E5 slides · E15 ESC/POS · E17 TTS · E18 video · D8 realtime voice · J6 multilingual · J7 white-label
**These are S17+.** Nothing is cut — the standing rule holds. They're after the point where Ask Aria is a product people pay for.

---

## THE HONEST MATH
**16 sprints to a complete Ask Aria core, 20 with MCP.** At your rate, ~4–5 weeks.
**After S1–S6 (six sprints), Ask Aria is better than any AI a café owner has used.**
**After S9, it works while they sleep.**
**After S12, they can build their own staff.**
**After S17, Aria uses the whole internet's tools on their actual business data — the thing no general AI and no vertical SaaS can do.**

## WHAT WOULD ACTUALLY MAKE THIS FASTER
Not bigger prompts. These:
1. **Top up Anthropic.** Every sprint is currently building on a fallback model with no data tools.
2. **Land the file before pasting the sprint.** Two sprints died at phase 0 on a file that hadn't landed. That's 12% of the whole plan, lost to a copy step.
3. **Let preflight kill phases.** Five features so far turned out to be already built. A sprint that opens by checking is faster than one that builds twice.
4. **Don't add scope mid-sprint.** MS16C had its contract replaced mid-run and discarded half a session's work.
