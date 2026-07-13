# ARIA — Build Runbook (single source, do this in order)
> 14 Jun 2026 · launch-first plan · every prompt either written below or pointed to · run top to bottom

---

## WHERE YOU ARE RIGHT NOW
- 8 commits stacked locally (I1–I5), **cleanup prompt running** (deletes prod script + guards I2 zero-target).
- Nothing pushed yet. Brain is honest + grounded. POS has a silent data bug. Security holes open.

## THE PLAN (5 waves — launch is Wave 1, not Wave 6)
| Wave | What | Why here |
|---|---|---|
| **0** | Push I1–I5 | clear the machine |
| **1 — LAUNCH** | POS-RPC-FIX → SEC-1 → SEC-2 → SEC-3 → SEC-4 → I2-capture → soft launch | the only things that truly block going live |
| **GREEN** | 19 polish sprints, 2 batch commands | fire anytime, can't hurt data |
| **2 — BRAIN** | I3-REWIRE → I6 → I7 → I8 → I9 → I10 → I11 → I12 | makes Aria smarter; post-launch |
| **3 — REVENUE** | SEO 2/3/4 · Recipe · Customer · Invoice · BI ×3 | sellable features |
| **4 — CX** | CX P1–P5 | community moat |
| **5 — REELS** | R2–R11 | creator suite (R6 waits on Meta/TikTok approval — file that in Wave 1) |

Rule for every solo prompt: **one per chat, it runs the verify-or-halt preflight, builds only if the live DB matches, one commit, STOP before push.** You push after you eyeball the report.

---

## COMMANDS — how you actually run each thing

**Wave 0 — push (after cleanup prompt finishes):**
```
cd C:\Users\kansa\aria-saas-audit && git log origin/main..HEAD --oneline && git push origin main
```

**Solo sprint (Wave 1, 2, 3…):** open a fresh Claude Code chat, paste the one-liner under each prompt below. Example shape:
```
Run <SPRINT-ID> only from prompts/<file>. SOLO, pwd confirms C:\Users\kansa\aria-saas-audit.
Run the verify-or-halt preflight first; HALT if any column/CHECK/RPC doesn't match live DB.
RULE 0. Build green. ONE commit. STOP before push.
```

**GREEN batch (fire now, 2 commands):**
```
# Batch A — UI/animation (no DB, no risk):
Run these SOLO-but-chained, one commit each, STOP before push after each:
SPELLS-1, Phase-AN A, Phase-AN B, Phase-AN C, Phase-AN D, Phase-AN E,
Avatar V, Avatar M, Avatar L, Avatar canvas-polish, RICH-2, RICH-3.
```
```
# Batch B — in-browser AI + read-only (no DB writes):
Run these SOLO-but-chained, one commit each, STOP before push after each:
FA-2.4 bg-removal, FA-2.5 moderation, FA-2.6 Gemini-Nano, MONITOR-1, CRON-1 census, AR surfaces, FIN surface.
```

---

# WAVE 1 — LAUNCH BLOCKERS (run these in order)

### 1.1 — POS-RPC-FIX
**Already written** → `prompts/intelligence-rewire-grounded.html` (POS-RPC-FIX-1 block). Run that. It restores the 4 missing RPCs (`decrement_stock_quantity`, `increment_numeric`, `increment_customer_stats`, `increment_session_total`) so sales stop silently failing to update stock/stats.

---

### 1.2 — SEC-1 cron auth
```markdown
# SEC-1 — CRON_SECRET on every cron route. CODE ONLY. SOLO. RULE 0.

PREFLIGHT: pwd = C:\Users\kansa\aria-saas-audit · git log origin/main..HEAD --oneline.
grep -rn "api/cron" src/app/api — list EVERY cron route. grep -rn "CRON_SECRET" src — see which already check it.

WHY: cron routes are auth-bypassable via User-Agent spoofing. Anyone can trigger them.

BUILD (additive):
- One shared guard: assertCronSecret(req) → 401 unless header `Authorization: Bearer ${process.env.CRON_SECRET}`.
- Call it as the FIRST line of every /api/cron/* route handler. Do not change cron logic.
- Confirm CRON_SECRET exists in Vercel env (if not, note it for Chahat to add — guard still ships).

GATE: tsc 0 · build pass · ≤22 fns · ONE commit feat(sec-1): cron secret guard. STOP before push.
VERIFY: curl a cron route without the header → 401. With header → runs.
DO NOT: change schedules, weaken to daily<, or touch non-cron routes.
```

---

### 1.3 — SEC-2 POS auth
```markdown
# SEC-2 — verifyBusinessAccess on every /api/pos/* route. CODE ONLY. SOLO. RULE 0.

PREFLIGHT: grep -rn "api/pos" src/app/api — list every POS route + which check the user's business access.
Confirm the helper exists: grep -rn "verifyBusinessAccess\|getBusinessForUser" src.

WHY: unauthenticated POS stub routes exist — a user could read/write another business's data.

BUILD (additive):
- Reuse the existing access helper if present; if not, build verifyBusinessAccess(userId, businessId)
  that checks the user→business link table (confirm its real name via preflight, e.g. business_members/profiles).
- Gate EVERY /api/pos/* handler: resolve businessId from the request, 403 if the user isn't linked.
- business_id scope on every query inside those routes (rule: never trust a businessId from the client alone).

GATE: tsc 0 · build pass · ONE commit feat(sec-2): pos access guard. STOP before push.
VERIFY: call a POS route as user A with user B's businessId → 403.
DO NOT: invent a link table — confirm the real one in preflight. Don't break legitimate same-business calls.
```

---

### 1.4 — SEC-3 Square ownership
```markdown
# SEC-3 — bind Square connection to the owning business. CODE ONLY (+ maybe migration). SOLO. RULE 0.

PREFLIGHT: confirm table `square_connections` exists + its columns (business_id?, user_id?, token cols).
  select column_name,data_type from information_schema.columns where table_name='square_connections';
grep -rn "square" src/app/api — find the OAuth callback + status routes.

WHY: the Square OAuth flow doesn't verify the connection belongs to the current business — a user could
attach/read a Square link they don't own.

BUILD (additive):
- On OAuth callback + any square status/sync route: assert the square_connections.business_id matches a
  business the current user is linked to (reuse SEC-2's verifyBusinessAccess). 403 otherwise.
- Never write square_connections.business_id from a client-supplied value without the ownership check.

GATE: tsc 0 · build pass · ONE commit feat(sec-3): square ownership guard. STOP before push.
VERIFY: attempt to read another business's Square status → 403.
DO NOT: change token storage/encryption here (that's SEC-4). Don't break the working connect flow.
```

---

### 1.5 — SEC-4 PII encryption
```markdown
# SEC-4 — encrypt PII at rest + data export/deletion. CODE+MIGRATION. SOLO. RULE 0.

PREFLIGHT (run each as ONE statement): confirm the real PII columns live:
  select column_name,data_type from information_schema.columns
   where table_name='pos_customers' and column_name in ('phone','email','name');
  same for staff_members (phone). Confirm pgcrypto availability: select * from pg_extension where extname='pgcrypto';
NOTE: pos_customers is canonical (not 'customers').

WHY: pos_customers.phone/email + staff phone stored plaintext. Privacy + launch risk.

BUILD (additive, reversible, no data loss):
- Enable pgcrypto if absent. Add encrypted columns alongside (don't drop plaintext in the same migration —
  migrate-then-verify-then-drop in a LATER sprint). Backfill encrypt existing rows.
- Read/write paths use pgp_sym_encrypt/decrypt with a key from env (note key name for Chahat to set).
- Add: admin audit log of PII access; /api/account/export (user's own data) + /api/account/delete (soft+hard).
- If the encrypt-everything path is large, SHIP the export/delete + audit log first and note encryption as SEC-4b.

GATE: tsc 0 · build pass · migration applied · ≤22 fns · ONE commit feat(sec-4): pii encryption + export/delete. STOP.
VERIFY: new customer row → phone unreadable in raw SQL, readable via app. Export returns the user's data.
DO NOT: drop plaintext columns this sprint. Don't lose data. Don't hardcode the key.
```

---

### 1.6 — I2-capture (fixes the hollow target)
```markdown
# I2-CAPTURE — let owners set weekly_revenue_target so I2 stops being empty. CODE ONLY. SOLO. RULE 0.

PREFLIGHT: confirm businesses.weekly_revenue_target exists (it does, currently 0 for Sip).
grep -rn "weekly_revenue_target" src — find where goal-context reads it + the I2 zero-guard from cleanup.

WHY: I2 is wired but every business has target=0, so goal_context emits nothing. Give owners a way to set it.

BUILD (additive):
- Settings field (Aria theme) + a first-run prompt: "What's your weekly revenue goal?" → writes
  businesses.weekly_revenue_target (dollars, numeric).
- Optional: Aria suggests a target from trailing 4-week avg, owner confirms/edits.
- Once set, the existing I2 goal-context (zero-guard from cleanup) lights up automatically.

GATE: tsc 0 · build pass · ONE commit feat(i2-capture): weekly target capture. STOP before push.
VERIFY: set Sip's target via UI → fresh council chat → goal_context now appears with the target.
DO NOT: fake a default target. Don't write if owner leaves it blank (keep the zero-guard honest).
```

**→ Then run the 2-week soft launch.** No new features during it. Use `morning audit` / `night audit` daily.

---

# WAVE 2 — BRAIN (post-launch)
**All already written** → `prompts/intelligence-rewire-grounded.html`: I3-REWIRE, then I6 → I7 → I8 → I9 → I10 → I11 → I12. Each carries its verify-or-halt preflight and the grounded schema corrections. Run one per chat in that order (I12 needs I3-REWIRE live first).

---

# WAVES 3–5 — written on demand (so they're grounded, not guessed)
These touch tables I haven't audited yet (SEO, recipe, invoicing, BI, community, reels). Writing them blind = the cleanup trap. So each wave gets written **after I pull its schema**, right before you need it:
- **Wave 3 (Revenue):** SEO 2/3/4 · Recipe · Customer · Invoice · BI ×3
- **Wave 4 (CX):** P1–P5 (prompts exist in `prompts/` — get verify-or-halt retrofit)
- **Wave 5 (Reels):** R2–R11 (prompts exist — retrofit + R6 approval gate)

When you finish Wave 1 and launch, say **"write Wave 3"** and I'll audit those tables live and hand you the grounded prompts the same way.

---

## YOUR NEXT 3 ACTIONS
1. Let the cleanup prompt finish → **push** (Wave 0 command).
2. Fire the **GREEN batch A + B** (free wins, no risk).
3. Run **Wave 1** in order (1.1 → 1.6) → **soft launch**.

Everything else waits behind a live café. That's the whole plan.
