════════════════════════════════════════════════════════════════════
BATCH 3 — REVENUE — CLEAN RUN SHEET (live status 16 Jun)
════════════════════════════════════════════════════════════════════

STATUS TABLE (verified live — run only the ⬜ ones):
┌─────────────────┬──────────────────────────────────────┬─────────────┐
│ SPRINT          │ LIVE STATUS                          │ ACTION      │
├─────────────────┼──────────────────────────────────────┼─────────────┤
│ SEO-3           │ ✅ built (cold: 0/117 fixes run)      │ SKIP        │
│ Recipe Import   │ ✅ done this session (7a9b3d40)       │ SKIP        │
│ Invoicing       │ ✅ built + working                    │ SKIP        │
│ Customer Mgmt   │ ⚠️ segments done(39), import cold     │ RUN (import)│
│ REV-1           │ ⚠️ split-brain unresolved, AI cold    │ RUN (grep!) │
│ SEO-4           │ ⬜ keywords empty (0)                 │ RUN         │
│ WBI-1/2/3       │ ⬜ unbuilt (reports 0, records 0)     │ RUN         │
└─────────────────┴──────────────────────────────────────┴─────────────┘
Net remaining real work: Customer-import, REV-1, SEO-4, WBI-1/2/3.

────────────────────────────────────────────────────────────────────
EVERY SPRINT FOLLOWS THESE 5 CONDITIONS (no exceptions):
  1. PREFLIGHT FIRST: pwd · git log origin/main..HEAD · for each table touched → columns +
     CHECK (one statement each) · for each RPC → confirm exists. Paste results verbatim.
  2. HALT IF: already built & working / a literal isn't in a CHECK / canonical table unresolved.
     Report, no commit. (Never fabricate an empty commit — RULE 0.)
  3. BUILD: extend existing code, never rebuild/remove. Grounded (real rows only, never invent).
     parseLLMJsonOr + logAICallSafe (valid agent_key/role/provider) on AI calls. Amounts DOLLARS
     except *_cents. Revenue = pos_sales status='completed'.
  4. VERIFY LIVE on Sip (ff5055a0-...): show before/after real numbers. Clean test data after.
  5. GATE: tsc --noEmit 0 + next build EXIT 0 · ≤22 fn · daily-max cron · ONE commit · STOP, do
     not push, report. Wait for go before next sprint.
────────────────────────────────────────────────────────────────────


════════════════════════════════════════════════════════════════════
CUSTOMER-MGMT — CSV import + segments   [CANONICAL = pos_customers]
════════════════════════════════════════════════════════════════════
KNOWN LIVE: pos_customers(39, ALL have segment already) · customers(1)/square_customers(0) NOT
canonical, leave untouched · customer_import_jobs(0). So SEGMENTATION is likely DONE; the IMPORT
is the gap.
PREFLIGHT (+5 conditions): quote pos_customers cols (total_spent, visit_count, segment,
rfm_score_total, last_visit_at). grep for an existing CSV import route → if customer CSV import
already works, HALT. Confirm segmentation already runs (39/39 have segment) → do NOT rebuild it.
BUILD (import only, if cold): CSV → pos_customers (dedupe by phone/email+business_id;
customer_import_jobs tracks status + row counts). Do NOT touch customers/square_customers. Reuse
existing segmentation, don't duplicate.
VERIFY: import test CSV → pos_customers rows added, deduped, job logged; segments still intact;
customers/square untouched. Clean.
COMMIT: "Customer Mgmt: CSV import (pos_customers canonical, segmentation reused)"

════════════════════════════════════════════════════════════════════
REV-1 — reviews + AI reply   [⚠️ RESOLVE SPLIT-BRAIN BEFORE BUILDING]
════════════════════════════════════════════════════════════════════
KNOWN LIVE: reviews(8) AND google_reviews(10) BOTH have data + business_id · business_reviews(0) ·
4 request tables all 0 · review_response_templates(5) · 0 review AI calls (AI-reply is COLD).
PREFLIGHT (+5 conditions) — THE CANONICAL DECISION IS THE WHOLE JOB:
  grep codebase: which review table do live routes/dashboard READ + WRITE — reviews vs
  google_reviews vs business_reviews? Quote the exact files/lines. Pick ONE canonical. Same for
  the 4 request tables → pick ONE. Document the decision. Leave non-canonical untouched + flag for
  later dedupe. DO NOT write to two review tables.
BUILD (canonical only): display reviews; AI-draft reply (tone from review_response_templates;
parseLLMJsonOr; owner edits before post — NEVER auto-post); request flow on the chosen table.
logAICallSafe agent_key='review'. GROUNDED: reply quotes the real review text, no fabrication.
VERIFY: draft a reply to one real review → owner-edit path works; only canonical table written.
Clean.
COMMIT: "REV-1: reviews + AI reply (canonical=<table>, resolved)"

════════════════════════════════════════════════════════════════════
SEO-4 — keyword tracking + SEO dashboard   [after SEO-3, which is built]
════════════════════════════════════════════════════════════════════
KNOWN LIVE: seo_keywords(0)/seo_keyword_rankings(0)/seo_keyword_history(0) empty · SEO-2 audits +
SEO-3 generator both exist.
PREFLIGHT (+5 conditions): quote the 3 seo_keyword* table cols. grep for existing keyword route/
cron → HALT if built. Confirm SEO dashboard page exists (extend, don't rebuild).
BUILD: owner adds keyword → seo_keywords; periodic rank check → rankings/history (daily-max cron,
reuse cron/** glob). Dashboard surfaces audits+issues+fixes+keywords. Aria SEO facts (issue count,
keyword movement) → groundTruth, exact.
VERIFY: add a keyword → stored; dashboard renders real seo_audits/issues/fixes. Clean.
COMMIT: "SEO-4: keyword tracking + SEO dashboard"

════════════════════════════════════════════════════════════════════
WBI-1 → WBI-2 → WBI-3 — Weekly BI Report   [internal sequence, all unbuilt]
════════════════════════════════════════════════════════════════════
KNOWN LIVE: pos_weekly_reports(0) + weekly_report_records(0) both exist, EMPTY. 0 briefing calls
on this path. Genuinely unbuilt — real build work.
PREFLIGHT (+5 conditions, each sprint): quote pos_weekly_reports + weekly_report_records cols.
Confirm the briefing generator (rewritten, fixed sections) — REUSE its grounded-facts approach.

WBI-1 — aggregation: weekly revenue (pos_sales completed) / labour% (WIRE-3) / top products /
  customer movement (pos_customers) → write pos_weekly_reports. GROUNDED, exact.
  COMMIT: "WBI-1: weekly report aggregation"
WBI-2 — rendering: HTML/PDF (reuse WIRE-4 / downloadCSV / Puppeteer; $0 cost).
  COMMIT: "WBI-2: weekly report rendering"
WBI-3 — schedule + delivery: weekly cron (0 9 * * 1), email via Resend; log weekly_report_records.
  COMMIT: "WBI-3: weekly report schedule + delivery"
VERIFY each: aggregation exact vs direct SQL; render works; schedule simulated. Clean.

════════════════════════════════════════════════════════════════════
RUN ORDER:  Customer Mgmt → REV-1 → SEO-4 → WBI-1 → WBI-2 → WBI-3
One sprint, preflight → halt-or-build → verify → one commit → STOP → report. Then next.
DEFERRED (not Batch 3): PHONE-1/WhatsApp → AGENT block, post-launch behind SEC gate.
════════════════════════════════════════════════════════════════════
