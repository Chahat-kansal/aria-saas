════════════════════════════════════════════════════════════════════
BATCH 3 — REVENUE FEATURES — ALL PROMPTS (one file, paste-ready)
Grounded against live DB 16 Jun 2026. Run order + waves at bottom.
════════════════════════════════════════════════════════════════════

GLOBAL RULES (apply to EVERY sprint below):
• SOLO · RULE 0 (UPGRADE_ONLY: extend, never remove working code) · single commit per sprint ·
  DO NOT push (founder pushes) · build gate (tsc --noEmit 0 + next build EXIT 0) before commit ·
  vercel.json ≤22 fn configs · crons DAILY MAX (0 9 * * * pattern) · RULE 7 (live DB wins over
  docs/types/memory).
• Models: claude-haiku-4-5-20251001 / claude-sonnet-4-5-20250929 / claude-opus-4-5-20251101.
• DB amounts = DOLLARS (numeric) EXCEPT *_cents columns. Revenue = pos_sales WHERE status='completed'.
• parseLLMJsonOr for all LLM JSON. logAICallSafe on every AI call (confirm agent_key/role/provider
  are valid CHECK values before using).
• Verify live on Sip (ff5055a0-c351-4ada-817a-1804961035f3); clean any test data after.

UNIVERSAL VERIFY-OR-HALT PREFLIGHT (prepend to EVERY sprint — run BEFORE writing code,
one statement per check, paste results verbatim):
  1. pwd → C:\Users\kansa\aria-saas-audit
  2. git log origin/main..HEAD --oneline
  3. For EVERY table the sprint writes: columns + CHECK constraints (one statement each).
  4. For EVERY RPC the sprint calls: confirm it exists (empty = HALT, don't call missing RPC).
  5. HALT if: feature already built (don't fabricate commit), a literal you'll insert isn't in a
     CHECK array, or a canonical-table choice is unresolved (grep code first).

LIVE STATE (verified 16 Jun — in-sprint preflight re-confirms):
  SEO: seo_audits(22), seo_issues(117), seo_pages(20), seo_local(1) EXIST → SEO-2 crawler DONE.
       seo_fixes(0), seo_keywords(0) EMPTY → SEO-3/4 = real work.
  Recipes: recipes(2), recipe_ingredients(5), recipe_imports(0, table exists) → importer unwired.
  Customers: pos_customers(39 CANONICAL) vs customers(1) vs square_customers(0).
  Invoicing: invoices(2)/invoice_line_items(2)/invoice_settings(1) EXIST; recurring_invoices(0)/
       invoice_reminders(0) = gap.
  Reviews: ⚠️ SPLIT-BRAIN — reviews(8) & google_reviews(10) BOTH have data+business_id;
       business_reviews(0); 4 request tables all 0; review_response_templates(5).
  Weekly BI: pos_weekly_reports(0)+weekly_report_records(0) exist, unbuilt.


════════════════════════════════════════════════════════════════════
SPRINT 1 — SEO-3 — AI SEO FIX GENERATION   [Wave 1 · independent]
════════════════════════════════════════════════════════════════════
Generate AI fixes for the 117 detected seo_issues. Owner-review-then-apply, never auto-apply.

PREFLIGHT (+ universal above):
  • Confirm SEO-2 done: select count(*) from seo_issues; (expect ~117)
  • ⚠️ SPLIT-BRAIN — TWO possible fix homes:
    - seo_issues already has cols: suggested_fix, ai_fix_text, fix_format, state, applied_at, fixed
    - seo_fixes table has: issue_id, issue_type, fix_applied, state, applied_at
    grep repo for BOTH `seo_fixes` (table writes) AND `ai_fix_text`/`suggested_fix` (column writes).
    Determine which the LIVE seo route/dashboard reads. Quote evidence. HALT + report canonical
    BEFORE writing. Do NOT write both. (If SEO-2 populates suggested_fix on issues, the AI fix
    likely belongs there — confirm, don't assume.)
  • grep `api/seo` for an existing fix route → if AI-fix gen already exists, HALT (already built).

BUILD (against canonical fix-home only):
  • For seo_issues lacking an AI fix: call model → concrete fix per issue_type (missing meta →
    <title>/<meta>; missing alt → alt text; thin content → heading/copy; missing schema → JSON-LD).
  • Write to canonical home, link real issue_id, state='suggested'. Owner-apply path: owner clicks
    apply → state='applied', applied_at set. NEVER auto-apply to live site.
  • parseLLMJsonOr; logAICallSafe agent_key='seo'. GROUNDED: reference real issue + page_url, no
    invented pages. Cap N per run (cost), not all 117 at once.

VERIFY (Sip) + GATE: one real issue → fix written to canonical home, state='suggested', owner-apply
  → 'applied'; confirm NON-canonical table/column untouched; aria_ai_calls row accepted; clean test.
  tsc 0 + build pass · ONE commit "SEO-3: AI SEO fix generation (canonical-resolved, owner-apply)".


════════════════════════════════════════════════════════════════════
SPRINT 2 — RECIPE-IMPORT — bulk recipe import + AI parse   [Wave 1 · independent]
════════════════════════════════════════════════════════════════════
PREFLIGHT (+ universal):
  • recipe_imports table exists (0 rows) — quote its cols + recipes + recipe_ingredients cols
    (recipes has allergens[]; recipe_ingredients has allergens[]).
  • Confirm the smart-CSV 35-field decoder (from memory) — REUSE if present, don't rebuild.
BUILD:
  • Owner pastes/uploads recipes → AI parses → recipes + recipe_ingredients (name, qty, unit,
    allergens). Track via recipe_imports job (status, row counts). Idempotent (dedupe by
    name+business_id). parseLLMJsonOr; logAICallSafe agent_key='recipe_import'.
  • Ties to TP-6 draft-from-recipe (more recipes → more auto-draftable training courses).
VERIFY (Sip) + GATE: import 2-3 test recipes → recipes+ingredients rows correct, allergens parsed,
  no dup; clean. ONE commit "Recipe Import: bulk recipe import + AI parse".


════════════════════════════════════════════════════════════════════
SPRINT 3 — INVOICING — recurring invoices + reminders   [Wave 1 · independent]
════════════════════════════════════════════════════════════════════
Core invoicing already built; this adds recurring + reminders ONLY.
PREFLIGHT (+ universal):
  • invoices(2)/invoice_line_items(2)/invoice_settings(1) EXIST — quote cols. recurring_invoices(0)/
    invoice_reminders(0) = gap. Confirm existing invoice create/AI-builder path (EXTEND, don't rebuild).
BUILD:
  • Recurring invoices: schedule → auto-generate invoice on cadence (daily-max cron, reuse existing).
  • Payment reminders: overdue → reminder via existing SendGrid; log invoice_reminders.
  • Idempotent (no double-generate/double-remind — reuse TP-7 dedup pattern). Aria AR facts
    (outstanding, overdue) into groundTruth.
VERIFY (Sip) + GATE: create recurring → generates on schedule (simulate); overdue → reminder
  logged, no dup. ONE commit "Invoicing: recurring invoices + payment reminders".


════════════════════════════════════════════════════════════════════
SPRINT 4 — CUSTOMER-MGMT — CSV import + AI segments   [Wave 2 · CANONICAL=pos_customers]
════════════════════════════════════════════════════════════════════
⚠️ PREFLIGHT (+ universal): CANONICAL = pos_customers(39). customers(1)/square_customers(0) NOT
  canonical — leave untouched. customer_import_jobs(0) exists. Quote pos_customers cols (has
  total_spent, visit_count, segment, rfm_score_total, last_visit_at). Confirm WIRE-1 loyalty didn't
  already build import (HALT if so).
BUILD:
  • CSV customer import → pos_customers (dedupe by phone/email+business_id; customer_import_jobs
    tracks). AI segmentation (VIP/at-risk/new from rfm/spend/recency → segment field). Aria customer
    facts. logAICallSafe agent_key='customer'.
VERIFY (Sip) + GATE: import test CSV → pos_customers rows, segments assigned, no dup; pos_customers
  scoped; customers/square_customers untouched; clean. ONE commit "Customer Mgmt: CSV import + AI
  segments (pos_customers canonical)".


════════════════════════════════════════════════════════════════════
SPRINT 5 — REV-1 — Google reviews + AI reply   [Wave 2 · ⚠️ RESOLVE SPLIT-BRAIN FIRST]
════════════════════════════════════════════════════════════════════
⚠️ PREFLIGHT (+ universal — CRITICAL, 3 review + 4 request tables):
  • grep codebase for which review table live routes READ/WRITE: reviews(8) vs google_reviews(10)
    vs business_reviews(0). Pick the code-canonical one; quote evidence; leave others untouched +
    flag for dedupe. Same for 4 request tables (review_requests/pos_review_requests/
    business_review_requests/review_request_log) — pick one. review_response_templates(5) reuse.
    DO NOT write both. Document the REV-1 canonical decision.
BUILD (canonical only):
  • Pull/display Google reviews; AI-draft reply (tone from review_response_templates; parseLLMJsonOr;
    owner edits before post — NEVER auto-post). Review-request flow on chosen request table.
    logAICallSafe agent_key='review'. GROUNDED: reply references real review text, no fabrication.
VERIFY (Sip) + GATE: draft a reply to a real review, owner-edit path, canonical table only written;
  clean. ONE commit "REV-1: Google reviews + AI reply (canonical-resolved)".


════════════════════════════════════════════════════════════════════
SPRINT 6 — SEO-4 — keyword tracking + SEO dashboard   [Wave 3 · AFTER SEO-3]
════════════════════════════════════════════════════════════════════
PREFLIGHT (+ universal): seo_keywords(0)/seo_keyword_rankings(0)/seo_keyword_history(0) empty —
  quote cols. Confirm no existing keyword cron. Confirm SEO-3 landed (reads its fixes).
BUILD:
  • Keyword tracking: owner adds keywords → seo_keywords; periodic rank check → rankings/history
    (daily-max cron, reuse existing). SEO dashboard surfacing audits+issues+fixes+keywords. Aria
    SEO facts (issue count, keyword movement) into groundTruth — exact/grounded.
VERIFY (Sip) + GATE: add keyword, dashboard renders real seo_audits/issues/fixes. ONE commit
  "SEO-4: keyword tracking + SEO dashboard".


════════════════════════════════════════════════════════════════════
SPRINT 7/8/9 — WBI-1 → WBI-2 → WBI-3 — Weekly BI Report   [Wave 3 · internal sequence]
════════════════════════════════════════════════════════════════════
PREFLIGHT (+ universal): pos_weekly_reports(0)+weekly_report_records(0) exist, unbuilt — quote cols.
  Confirm briefing generator (rewritten w/ fixed sections, from memory) — REUSE its grounded-facts
  approach.

WBI-1 — aggregation: weekly revenue/labour%/top products/customer movement from CANONICAL sources
  (pos_sales completed, WIRE-3 labour, pos_customers) → write pos_weekly_reports. GROUNDED (exact).
  Commit "WBI-1: weekly report aggregation".
WBI-2 — rendering: HTML/PDF report (reuse WIRE-4 / downloadCSV / Puppeteer pattern; $0 cost).
  Commit "WBI-2: weekly report rendering".
WBI-3 — schedule + delivery: weekly cron (0 9 * * 1), SendGrid email; weekly_report_records log.
  logAICallSafe agent_key='briefing'. Commit "WBI-3: weekly report schedule + delivery".
VERIFY each (Sip): aggregation exact vs real data; render works; schedule simulated.


════════════════════════════════════════════════════════════════════
SPRINT 10 — PHONE-1 / WHATSAPP — DEFERRED (do NOT run in Batch 3)
════════════════════════════════════════════════════════════════════
⚠️ RESCOPED + MOVED OUT of Batch 3. The customer-facing agent is now its own AGENT block
(AG-W1 public endpoint → AG-W2 embeddable widget → AG-W3 WhatsApp → AG-W4 SMS), POST-LAUNCH,
behind SEC-HARDENING (AG-W1 is a new public attack surface). See ARIA-MASTER-ROADMAP.md AGENT
block. ClickSend = SMS only (not voice); WhatsApp needs Meta verification (approval wait); the
no-approval v1 = embeddable widget reusing the I7 brain. NOT part of Batch 3 — skip here.


════════════════════════════════════════════════════════════════════
RUN ORDER
════════════════════════════════════════════════════════════════════
WAVE 1 (parallel-safe, independent — fire together):  SEO-3 · Recipe Import · Invoicing
WAVE 2 (split-brain — let preflight confirm canonical table BEFORE build):  Customer Mgmt · REV-1
WAVE 3 (internal sequences):  SEO-4 (after SEO-3) · WBI-1 → WBI-2 → WBI-3
DEFERRED (not Batch 3):  PHONE-1/WhatsApp → AGENT block, post-launch behind SEC gate.

Each sprint: preflight-first (several partly-built → expect some HALTs), verify live, ONE commit,
STOP. After all land + verified → launch gate (SEC-HARDENING + LEGAL) → soft launch.
════════════════════════════════════════════════════════════════════
