# ASK ARIA — MASTER FEATURE REGISTER
**The consolidated list. Everything, from all five research passes plus Aria Works.**
Founder's standing requirement: *"Ask Aria is the face and hero of the product. I need ALL features any AI has to date. Non-negotiable."* Only exclusion: developer code execution.

Status: **HAS** (shipped) · **PART** (exists, incomplete) · **NEW** (to build)

---

## GROUP A — ARIA WORKS (delegated task execution, the Cowork tier)
*The capability tier none of the earlier passes covered. Owner describes an outcome, walks away, comes back to finished work.*

| # | Feature | What "real" means | Status | Effort | Phase |
|---|---|---|---|---|---|
| A1 | Delegate a task by outcome | "Sort out next week's roster" → Aria plans and executes, not one Q&A turn | NEW | L | 2 |
| A2 | Visible plan before work starts | Owner sees the steps, can edit or cancel before anything runs | NEW | M | 2 |
| A3 | Runs in the cloud | Continues with the browser closed; owner starts on phone, checks later | NEW | M | 2 |
| A4 | Live progress | Step-by-step "doing X now" via Supabase Realtime, not a spinner | NEW | M | 2 |
| A5 | Parallel sub-agents | Complex jobs split across specialists working simultaneously | NEW | L | 3 |
| A6 | Self-verification before reporting | Aria checks its own work against the verifier before saying done | PART | M | 2 |
| A7 | The report | Finished deliverables + what was done + what it couldn't do + what needs the owner | NEW | M | 2 |
| A8 | Interrupt / steer / pause / resume | Owner redirects mid-run without losing the work done so far | NEW | M | 3 |
| A9 | Scheduled recurring work | `/schedule` equivalent — weekly BAS prep, Monday roster draft, month-end pack | NEW | M | 2 |
| A10 | Task history | Every delegated job, its plan, steps, cost, outcome — reviewable | NEW | S | 2 |
| A11 | Plugins/packs | Bundle skills + connectors + sub-agents per role (café, liquor, franchise) | NEW | L | 4 |
| A12 | Usage transparency | Delegated work costs more; show the spend before and after | PART | S | 2 |

---

## GROUP B — ACT ON (the step-through)
| # | Feature | What "real" means | Status | Effort | Phase |
|---|---|---|---|---|---|
| B1 | Action registry | Proposals with status, amount, expiry, outcome | **HAS** (714+437 rows) | — | — |
| B2 | Step-through navigation | Approve → lands on the real screen → executes in front of you | NEW | M | 1 |
| B3 | Live execution on destination | Progress on the page itself, not a toast | NEW | M | 1 |
| B4 | Step-up auth | `requires_stepup` enforced server-side at AAL2 before money moves | PART (column exists) | M | 1 |
| B5 | Undo | Uses stored rollback_data; compensating action where irreversible | PART (columns exist) | M | 1 |
| B6 | Return to conversation | Outcome posted back into the thread with provenance | NEW | S | 1 |
| B7 | Audit trail | Who proposed, who approved, at what auth level, what happened | PART | M | 2 |
| B8 | Idempotent execution | Refresh or double-tap can never double-execute | NEW | S | 1 |

---

## GROUP C — CHAT PRODUCT PARITY
| # | Feature | Status | Effort | Phase |
|---|---|---|---|---|
| C1 | Token streaming | **HAS** | — | — |
| C2 | Stop generating mid-stream | NEW | M | 1 |
| C3 | Regenerate | NEW | S | 1 |
| C4 | Edit message and re-run | NEW | M | 1 |
| C5 | Copy message | NEW | S | 1 |
| C6 | Thumbs up/down with reason | NEW | S | 1 |
| C7 | Thread list, rename, delete, pin | NEW | M | 1 |
| C8 | Auto-generated thread titles | NEW | S | 1 |
| C9 | Search across all conversations | NEW | M | 1 |
| C10 | Markdown, code blocks, tables render | PART | M | 1 |
| C11 | Error state with retry | NEW | M | 1 |
| C12 | Suggested follow-ups | NEW | S | 1 |
| C13 | Draft preserved on navigate | NEW | S | 2 |
| C14 | Keyboard shortcuts | NEW | S | 2 |
| C15 | Accessibility (streaming live regions) | NEW | M | 3 |
| C16 | Mobile layout | NEW | M | 2 |
| C17 | Share / export conversation | NEW | S | 3 |

---

## GROUP D — INPUT
| # | Feature | Status | Effort | Phase |
|---|---|---|---|---|
| D1 | File attach (image, PDF, CSV) | old page only | L | 2 |
| D2 | Paste image from clipboard | NEW | S | 2 |
| D3 | Drag and drop | NEW | S | 2 |
| D4 | Voice input | old page only | M | 3 |
| D5 | Slash commands | NEW | M | 3 |
| D6 | @-mention products, suppliers, staff | NEW | M | 3 |
| D7 | Photo of shelf / docket / invoice → data | NEW | M | 2 |
| D8 | Real-time voice conversation | NEW | L | 5 |

---

## GROUP E — FILE CREATION (every format)
| # | Format | Library | Status | Phase |
|---|---|---|---|---|
| E1 | PDF from scratch / fill / merge | pdf-lib | NEW | 1 |
| E2 | PDF pixel-perfect from HTML | chromium-min + puppeteer-core, queued | NEW | 2 |
| E3 | Excel / CSV | ExcelJS (NOT free SheetJS — CVEs) | NEW | 1 |
| E4 | Word .docx | docx / docxtemplater | NEW | 3 |
| E5 | Slides .pptx | pptxgenjs | NEW | 5 |
| E6 | Charts as image | QuickChart or @napi-rs/canvas | NEW | 2 |
| E7 | Posters / social assets | satori + resvg | NEW | 2 |
| E8 | QR codes | qrcode | NEW | 1 |
| E9 | Barcodes / labels (ZPL) | bwip-js | NEW | 3 |
| E10 | Calendar .ics (rosters, bookings) | ical-generator | NEW | 3 |
| E11 | vCard | vcards-js | NEW | 4 |
| E12 | **ABA bank payment file (AU)** | aba-generator | NEW | 2 |
| E13 | **Peppol e-invoice PINT A-NZ** | UBL 2.1 XML + Access Point | NEW | 4 |
| E14 | Xero / MYOB import formats | CSV shapes | NEW | 3 |
| E15 | Receipt / kitchen docket (ESC/POS) | WebUSB or local bridge | NEW | 4 |
| E16 | Zip bundles | archiver | NEW | 2 |
| E17 | Audio briefing (TTS) | OpenAI TTS / ElevenLabs | NEW | 4 |
| E18 | Video | offload — never on Vercel | NEW | 5 |
| E19 | Deliverable pipeline | Storage + signed URLs + provenance + email | NEW | 1 |

---

## GROUP F — AGENT BUILDER
| # | Feature | Status | Effort | Phase |
|---|---|---|---|---|
| F1 | Create an agent in plain English | NEW | L | 3 |
| F2 | Template gallery (10+ vertical) | NEW | M | 3 |
| F3 | Triggers: schedule / event / threshold / on-demand | NEW | M | 3 |
| F4 | Tools allow-listed per agent | NEW | M | 3 |
| F5 | Per-tool permission + spend cap + rate limit | NEW | M | 3 |
| F6 | Knowledge attachment (own docs) | NEW | M | 3 |
| F7 | Dry-run / simulate before live | NEW | M | 3 |
| F8 | Run history in plain language | NEW | S | 3 |
| F9 | Autonomy per agent (suggest/copilot/auto) | PART | S | 3 |
| F10 | Kill switch | NEW | S | 3 |
| F11 | Agent versioning | NEW | S | 4 |
| F12 | Template marketplace | NEW | L | 5 |

---

## GROUP G — PROACTIVE / AMBIENT
| # | Feature | Status | Effort | Phase |
|---|---|---|---|---|
| G1 | Scheduling engine (pg_cron + QStash) | NEW | M | 1 |
| G2 | Watchers on metrics with thresholds | NEW | M | 1 |
| G3 | Anomaly detection | NEW | M | 3 |
| G4 | Morning briefing | NEW | M | 2 |
| G5 | Overnight agent ("worked while you slept") | NEW | L | 3 |
| G6 | Approvals to phone (SMS/email/push) | NEW | M | 2 |
| G7 | Multi-step plan with checkpoints | NEW | L | 3 |

---

## GROUP H — GROUNDING, MEMORY, TRUST
| # | Feature | Status | Effort | Phase |
|---|---|---|---|---|
| H1 | Provenance / truth tiers on every number | **HAS** | — | — |
| H2 | Click to see source | **HAS** | — | — |
| H3 | Refuses rather than inventing | **HAS** | — | — |
| H4 | Eval set (51 cases, scored) | **HAS** | — | — |
| H5 | Memory across conversations | PART | M | 2 |
| H6 | See and edit what Aria remembers | NEW | M | 2 |
| H7 | House rules / custom instructions | PART (0 rows) | S | 2 |
| H8 | RAG over the business's own documents | NEW | M | 3 |
| H9 | Web search fallback | NEW | M | 4 |
| H10 | PII redaction before model calls | NEW | M | 3 |
| H11 | Prompt injection defence | PART | M | 2 |

---

## GROUP I — OUTPUT SURFACES
| # | Feature | Status | Effort | Phase |
|---|---|---|---|---|
| I1 | Artifacts / canvas (split pane) | old page only | L | 3 |
| I2 | Artifact versioning | NEW | M | 3 |
| I3 | Charts rendered from verified data | NEW | M | 2 |
| I4 | Download any deliverable | old page only | M | 1 |
| I5 | Email a deliverable (Resend) | NEW | S | 2 |

---

## GROUP J — PLATFORM
| # | Feature | Status | Effort | Phase |
|---|---|---|---|---|
| J1 | Model gateway with failover | **HAS** | — | — |
| J2 | Prompt caching / cost control | PART | M | 3 |
| J3 | Usage metering per business | PART (4 rows) | M | 2 |
| J4 | MCP server exposing Aria's tools | NEW | L | 5 |
| J5 | Customer API + webhooks out | NEW | L | 5 |
| J6 | Multilingual (staff-facing) | NEW | M | 4 |
| J7 | White-label | NEW | L | 5 |

---

## GROUP K — THE MOAT (nobody else can build these)
| # | Feature | Status | Effort | Phase |
|---|---|---|---|---|
| K1 | What-if simulator (price/roster/menu) | NEW | L | 3 |
| K2 | Outcome tracking of Aria's own advice | PART (columns exist) | M | 2 |
| K3 | Anonymised peer benchmarking | NEW | L | 4 |
| K4 | Supplier negotiation agent | NEW | L | 4 |
| K5 | Staff-facing floor agent | NEW | M | 4 |
| K6 | Customer-facing agent (owner-configured) | NEW | L | 5 |
| K7 | Local signal grounding (weather, events) | NEW | M | 4 |

---

## GROUP L — MCP, BOTH DIRECTIONS
*Aria consuming external tools, and Aria exposing her own. The one capability that makes owning the business data AND the tools possible in a single request.*

### L-CLIENT — Aria uses other people's tools
| # | Feature | What "real" means | Status | Effort | Phase |
|---|---|---|---|---|---|
| L1 | Connector directory (curated) | Owner picks from vetted cards and OAuths in; no arbitrary URLs | NEW | M | 4 |
| L2 | Per-tenant token vault | Each business's OAuth tokens encrypted, isolated, refreshed, revocable | NEW | M | 4 |
| L3 | Hosted-connector wiring | Gateway passes allow-listed servers to Claude/Gemini — no self-hosted client | NEW | M | 4 |
| L4 | External + own data in one turn | "Video ad for my worst seller" queries POS *and* calls the generation tool | NEW | M | 4 |
| L5 | `external-unverified` truth tier | External numbers can never be labelled verified-from-source | NEW | S | 4 |
| L6 | Tool-schema pinning | Hash pinned at approval; any change blocks the connector until re-approved | NEW | M | 4 |
| L7 | Result sanitisation | Instructions arriving inside tool results can never trigger an action | NEW | M | 4 |
| L8 | Per-tool caps | Rate + spend ceiling per tool, default zero for money | NEW | S | 4 |
| L9 | Tool routing | Only relevant tools enter context — schema bloat eats the window otherwise | NEW | M | 4 |
| L10 | Graceful degradation | Connector down → Aria answers from own data and says so | NEW | S | 4 |
| L11 | Developer mode | Arbitrary URL paste, off by default, barred from customer data | NEW | S | 5 |

### L-SERVER — other tools use Aria
| # | Feature | What "real" means | Status | Effort | Phase |
|---|---|---|---|---|---|
| L12 | Remote MCP server | One route, streamable HTTP, inside the function budget | NEW | M | 5 |
| L13 | OAuth resource server | Audience-bound tokens, scopes, protected-resource metadata | NEW | L | 5 |
| L14 | Token → business → RLS | A token can only ever see one tenant; proven by a cross-tenant test | NEW | M | 5 |
| L15 | Read-only tool set | Sales, inventory, roster cost, invoices, BAS export | NEW | M | 5 |
| L16 | Writes as proposals only | An external tool can create a proposal, never execute | NEW | M | 5 |
| L17 | Metering + rate limits | Per-business quota and usage billing for external consumption | NEW | M | 5 |

⚠️ **Hard rules for this group, no exceptions:** customer PII and staff personal data are never exposed through the server and never sent to an external connector by default — that's an Australian Privacy Act disclosure, not a preference. No external MCP result is ever `verified`. No inbound token is ever forwarded downstream. No write executes from MCP.

---

## THE COUNT
**~127 features. HAS: 9. PART: 14. NEW: ~104.**
(Group L added 17 after the MCP research pass.)

## BUILD ORDER — each phase ≈ one autonomous session
**P1 · It works and it's honest** — B2–B8 step-through · C2–C12 chat basics · E1/E3/E8/E19 deliverables · G1 scheduling engine · G2 watchers
**P2 · It works while you're not looking** — A1–A4, A6, A7, A9, A10, A12 Aria Works · G4 briefing · G6 phone approvals · D1–D3, D7 input · H5–H7 memory · E12 ABA · K2 outcomes
**P3 · It builds its own workers** — F1–F10 agent builder · A5 sub-agents · A8 steer · G5 overnight · I1–I2 artifacts · K1 simulator
**P4 · It reaches outside** — E13 Peppol · E15 printing · K3 benchmarking · K4 supplier agent · K5 staff agent
**P4 · It reaches outside** — also L1–L10 MCP client (the connector directory and the video-ad use case)
**P5 · It becomes a platform** — L11–L17 MCP server · J5 API · F12 marketplace · K6 customer agent

*(J4 in Group J is superseded by L12–L17 — same feature, properly specified.)*

## DO NOT BUILD
Code execution (excluded) · FFmpeg on Vercel · free SheetJS xlsx (CVE-2023-30533, CVE-2024-22363) · node-graph agent canvas · browser automation over untrusted pages for money actions · your own foundation model · unbounded autonomous spending.
