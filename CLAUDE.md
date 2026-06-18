# CLAUDE.md — Aria OS Build Rules (READ FIRST, EVERY SESSION)

This file is automatically loaded into every Claude Code session. These rules are
BINDING and override any task instruction that conflicts with them.

---

## 🚨 MANDATORY COMMIT PROTOCOL — follow for EVERY commit, NO EXCEPTIONS

This is the #1 cause of broken deploys. A build has broken and sat broken across multiple
commits THREE times — every single time because code was committed/pushed WITHOUT building first.

**Before EVERY git commit, in this exact order:**
```
1. npx tsc --noEmit        # MUST show zero errors. If errors → fix them, do NOT commit.
2. npm run build           # MUST complete successfully. If it fails → fix it, do NOT commit.
3. git add -A && git commit -m "..."
4. git push origin main
5. git log origin/main..HEAD   # MUST be empty. If not empty → push again.
```

**COMMIT RULE — ONE COMMIT PER PROMPT (not per task):**
- ✅ Complete ALL tasks in a prompt, then build ONCE, then make ONE commit
- ✅ This means one Vercel deploy per prompt, not per task
- ❌ Never make multiple commits for a single prompt — wastes Vercel build quota
- ❌ Never commit without running `npm run build` first
- ❌ Never push a commit that hasn't passed `npm run build`
- ❌ Never build on top of a commit you haven't verified builds

**At the END of every task/session:**
- Run `npm run build` one final time to confirm the whole thing is green
- Confirm `git log origin/main..HEAD` is empty (everything pushed)
- State explicitly: "Build verified green, all commits pushed."

If `npm run build` fails and you cannot fix it: STOP, do not commit, report the exact error.
A broken build that reaches `main` blocks ALL deploys including unrelated work.

---

## 🔒 RULE 0 — UPGRADE ONLY, NEVER DOWNGRADE (overrides everything)

Every change must ONLY upgrade, improve, or add. NEVER downgrade, remove, simplify away,
stub, disable, or weaken any existing feature — not even accidentally, not even temporarily,
not even to fix a build error.

- ❌ NEVER remove/comment-out/stub working code to fix an error → fix the actual error
- ❌ NEVER delete a feature, tab, button, field, tool, or capability
- ❌ NEVER reduce limits, outputs, max_tokens, or returned fields
- ❌ NEVER replace a rich implementation with a simpler one
- ✅ If refactoring, the result must do EVERYTHING the original did, plus the improvement
- ✅ Every feature present today must still work tomorrow

**If a task seems to require a downgrade: STOP. Do not proceed. Output:**
`⚠️ BLOCKED: [task] appears to require downgrading [feature]. Not proceeding per RULE 0. Need guidance.`

Full detail: see UPGRADE_ONLY_RULE.md

---

## 🔒 RULE 1 — PUSH AND VERIFY AFTER EVERY COMMIT

After EVERY commit:
```
git push origin main
git log origin/main..HEAD   # MUST be empty — confirms push landed
```
Never end a session with unpushed commits. (Lesson: 31 commits once sat unpushed locally.)

---

## 🔒 RULE 2 — READ BEFORE EDIT

Before changing any code:
1. Read the full file you're editing
2. Read the DB schema for any table involved (see AUDIT_STATE.md)
3. Trace the A→B→C dependency chain (what calls this, what this calls)
Never edit blind.

---

## 🔒 RULE 3 — VALIDATE BEFORE COMMIT

Before EVERY commit:
```
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```
If the build breaks, FIX THE ERROR — never remove the feature causing it (see RULE 0).

---

## 🔒 RULE 4 — VERCEL CONSTRAINTS

- vercel.json: keep at 22 function configs max
- Crons: DAILY MAXIMUM (e.g. "0 9 * * *"). Sub-daily schedules silently break Vercel Pro deploys.
  (Known issue to fix: parcel-insights is currently "0 */6 * * *" — must go daily)
- Cron count: verify against plan limit before adding new crons

---

## 🔒 RULE 5 — NEVER TOUCH THESE FILES

AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
(Locked design/UX assets — leave exactly as they are)

---

## 🔒 RULE 6 — DATA CORRECTNESS (from the audit)

Confirmed column/table traps — use the CORRECT name:
- staff_members: first_name + last_name (NO `name`)
- pos_sales: total_amount (NO `total`); status filter `!= 'voided'`
- pos_sale_items: line_total (NO `total_price`)
- pos_timesheets (NOT pos_timesheet_sessions); hours_worked (NO `total_minutes`)
- pos_inventory_transfers (NOT pos_stock_transfers)
- pos_outlet_inventory: items_on_hand (NOT qty_on_hand / stock_quantity)
- pos_product_modifier_groups + pos_modifier_groups (NOT pos_product_modifiers / pos_modifiers)
- pos_customers: NO customer_segment / churn_risk (those are on `customers`)
- pos_products: price (NO retail_price / selling_price); NO kds_skip_routing
- pos_products VALID new cols: shelf_capacity, qty_backroom, expiry_date
- pos_outlets (NOT `outlets`); pos_staff.is_active (NOT `active`)
- google_reviews.has_reply (NOT reviews.response)
- business_expenses: label (NO `name`); amount in dollars
- community_live_streams: cf_stream_uid, cf_playback_hls, cf_whip_url
- THREE briefing tables (different columns): daily_briefings, aria_daily_briefings, pos_daily_briefings
- All amounts DOLLARS (numeric) except columns named *_cents
  (exception: staff_members.pay_rate_cents IS cents)

---

## 🔒 RULE 7 — SILENT FAILURE PREVENTION

- RLS-protected tables: use supabaseAdmin for server/cron/admin reads (anon key returns silent empty [])
- Always check the `error` from Supabase destructuring — never ignore it
- await every insert/update/delete/upsert
- .single() crashes on 0 rows → use .maybeSingle() unless the row is guaranteed
- Never swallow errors as empty results (no `catch { return [] }`)
- Every business-data route must verify the user owns the business_id (cross-business leak = critical)

---

## 🔒 RULE 8 — AI / MODEL IDs

Use exactly:
- claude-haiku-4-5-20251001
- claude-sonnet-4-6  ← current Sonnet (model-router smart tasks, MODEL-ROUTER-UPGRADE)
- claude-sonnet-4-5-20250929  ← still pinned by the core tool-loop provider (providers/anthropic.ts); migrate later
- claude-opus-4-5-20251101

Aria Intelligence Rule: every feature should feed data into briefing/business-brain,
log to aria_ai_calls, and verify aria_autopilot_actions where relevant.

---

## 🔒 RULE 9 — FULL-SAAS-DEPTH

Every feature must match ~80% of the category leader + AI differentiation. No scaffolds,
no placeholders, no "coming soon" stubs shipped as if complete.

---

## Design system (Aria POS)
- Palette: deep forest green #2D5240 + sage #7FB897
- Fraunces italic for branding/totals, Inter for body
- Borderless glass/aurora surfaces
- Terminal page edits: additive str_replace only

---

## The prime directive
**Aria only ever gets better. Build up, never tear down.**

## VERIFICATION STANDARD — RENDERED OUTPUT, NOT JUST COMPILATION (mandatory)
A task is NOT done when it compiles. For anything user-facing, you must verify the ACTUAL rendered output:
- Hit the real endpoint (dev server or a service-role script) and paste the JSON/HTML response as evidence.
- Confirm the output is free of raw sentinels/tokens (e.g. `[DELIVERABLE:...]`, `[BRACKETS]`), `undefined`, `null` text, empty arrays where content is expected, or placeholder fallbacks.
- For UI components: confirm the component renders the intended content, not a degraded fallback path.
- The user should NEVER be the one to discover that the output is broken. If you cannot render/inspect the output in this environment, say so explicitly and list exactly what the user must check — do not silently mark done.
- "It builds" and "the DB row exists" are necessary but NOT sufficient. The rendered result is the deliverable.
