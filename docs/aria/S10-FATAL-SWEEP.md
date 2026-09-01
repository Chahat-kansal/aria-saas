# NOBODY IS LISTENING TO FATAL

**S10 phase 4 · 1 Sep 2026. Report only — no alerting was built.** That is a design decision, and
the escalation path runs through Resend, which is parked as a sending path.

---

## THE SHORT ANSWER, AND IT IS NOT THE ONE I EXPECTED

**An alerting system exists, it is wired to three crons, and all three are scheduled and running.**
`src/lib/monitoring/alert.ts` (MONITOR-1) posts to `ALERT_WEBHOOK` and escalates `severity: 'high'`
to email and SMS via `ALERT_EMAIL` / `ALERT_PHONE`. It was built after the Anthropic-credits outage
ran two weeks unnoticed — its header says exactly that.

So the shape is not "there is no alerting". It is narrower and more awkward:

> **The alerting that exists watches COST. The conditions that have actually hurt — a limiter with
> no backing store, a cron writing 2,275 false failures, CI dead for three days — are not wired to
> it, and two of them have no watcher of any kind.**

---

## WHAT IS ACTUALLY WIRED

| caller | scheduled | what it alerts on | severity |
|---|---|---|---|
| `aria-health-monitor` | h05 (05:00 UTC) | AI daily-budget ≥80%, subscription renewal T-7, Resend quota | high at ≥100%, else normal |
| `silent-blank-check` | h02, h06 | HTTP 200 but almost no hydration beacons — "the site may be blank for real visitors" | **high** |
| `ai-failover-alert-check` | h06, h22 | an AI provider incident open for days while silently on a fallback | **high** |

Two of those three are genuinely good: `silent-blank-check` and `ai-failover-alert-check` watch for
*a system that looks healthy and is not*, which is the right instinct.

**`aria-health-monitor` alerts on cost only.** It calls `sendAlert` six times — budget, renewals,
quota — and **not once for its own red checks**. Its red-check loop (`route.ts:380-402`) writes an
`aria_actions` row and stops there. So `Briefing pipeline stalled — only 0 rows written in last 24h`
becomes a notice on a dashboard nobody is required to open, and never an alert.

---

## THE CONDITIONS WITH NO LISTENER

### 1 · `[rate-limit] FATAL` — the only literal FATAL in the runtime, and nothing consumes it
`rate-limit.ts:11-14` prints *"Rate limiting DISABLED on all money/PII routes — add env vars to
Vercel immediately"*. It is a `console.error` and nothing more: no `sendAlert`, no row, no counter.

**What it means for an owner:** on Vercel, where the vars are set, this cannot fire. If it ever did,
it would mean either rate limiting is off on money routes, or — given the fail-closed default —
**every owner is locked out of login**. Both warrant waking someone. It logged **four times in one
CI build** and the only reason anyone noticed is that a test happened to be watching.

**Only 3 occurrences of the literal "FATAL" exist in `src/`**, and the other two are comments
describing that something is *now* fatal (`create-sale.ts:403`, `ask/route.ts:493`). So the FATAL
vocabulary is not over-used — this is the one real instance, and it has no consumer.

### 2 · `cron_runs` failures — 2,275 of them, and there is no watcher at all
`track-cron.ts` **writes** failure rows; `/api/cron-runs` **reads** them for an admin dashboard.
That is the entire lifecycle. **No cron, no sweep, no alert reads `cron_runs` looking for
failures.** That is precisely why nightly-sync accumulated 2,272 false failures between 1 June and
29 August — 96% of its history — with nothing raising a hand.

**This is the highest-value gap in this report**, because it is the one that has already cost three
months of a blind signal, and because a watcher over `cron_runs` is one query.

### 3 · The health monitor's own red checks
Written to `aria_actions`, rendered in the Ask Aria "Awaiting you" room, and that is all. 27 pending
health-monitor rows exist today. An owner who never opens that room never learns their briefing
pipeline has stopped.

### 4 · There is no evidence trail that alerting has *ever* worked
`alert.ts` deliberately writes nothing to the database — "no new table; no DB writes". Combined with
the fact that it no-ops silently when `ALERT_WEBHOOK` is unset (one `console.warn`, once per
process), **there is no way to determine from here whether a single alert has ever been delivered.**

I cannot read Vercel's environment, so I cannot tell you whether `ALERT_WEBHOOK` is set. **That is
worth checking before trusting any of the three watchers above** — a watcher with an unset webhook
is the same "exists, looks correct, does nothing" shape this codebase keeps producing, and it would
be invisible.

---

## WHAT IS *NOT* A FINDING

Being disciplined about this, because the sprint asked me to distinguish real criticality from the
word "critical":

- The 14 `'critical'` literals in `page-insight`, `generate-purchase-orders`, `reorder-forecast`,
  `seo/crawl` and `visa/monitor` are **content severity** — how urgently to show an owner a
  business insight ("stock out", "net negative"). They are correctly surfaced in the UI and are not
  system-health conditions. Nothing is wrong with them.
- `nightly-sync/route.ts:91`'s `severity: 'critical'` is an `intelligence_events` row about the
  *business*, not about Aria.

---

## RECOMMENDATION — one thing, not a system

**Do not build an alerting platform.** One already exists and works; it is under-subscribed, not
missing.

1. **Add a `cron_runs` failure watcher** to an existing dispatcher and call the existing
   `sendAlert` at `severity: 'high'` when a cron has failed N consecutive runs. This is the single
   change that would have caught nightly-sync in June instead of August.
2. **Call `sendAlert` from the health monitor's red-check loop** — it already computes exactly the
   information an alert needs, and already imports `sendAlert` for cost.
3. **Have `rate-limit.ts`'s FATAL branch call `sendAlert`.** It is the one literal FATAL in the
   runtime; it should reach a human by construction.
4. **Confirm `ALERT_WEBHOOK` is set**, and consider having `sendAlert` record that it fired, so
   "did anyone get told?" is answerable from the database rather than from Vercel's log retention.

**None of it is done here.** (1)–(3) are small and mechanical; (4) is a config check that is
Chahat's. All four route through Resend/ClickSend on the high-severity path, which is a sending
path and parked.
