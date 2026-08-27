# RUN-S4 — why doesn't send send

**Run date:** 2026-08-27 · autonomous (RULE 20) · branch `main`
**Five commits.** Phases 1 and 2 landed together — same edit, same handler; recorded rather than
padded into two.

---

## THE ONE-SCREEN SUMMARY

| phase | commit | outcome |
|---|---|---|
| 0 — gate | — | 4/4 columns, 2/2 indexes · **DB corroborates finding #1 independently** |
| 1 — why send doesn't send | `e655e721` | **found: `page.tsx:720`, an await with no watchdog** |
| 2 — never fake a stream | `e655e721` | classified errors, `streaming:false` in every terminal path |
| 3 — the Anthropic key | `9242df81` | one variable · **cached at cold start** · what to check |
| 4 — suggestions | `427298d5` | cause fixed (300→700 tokens) · 6s ceiling · fallback no longer cached |
| 5 — silent-failure sweep | `b685dbea` | 5 ranked findings, 4 dismissals shown |

### The three things you most need to know

**1. The exact line: `src/app/dashboard/ask-aria/page.tsx:720` — `await readAriaSse(...)` with no
watchdog.** Everything follows from it. A silent stream never settles that promise, so `finally`
never runs, so `sending` stays `true` **forever** — and every subsequent send returns at the
`sending` guard on line 654 **without fetching**. That is why there is no POST in the logs: after
the first hung send, there genuinely were none. One stuck boolean silenced the entire product.

**2. Everything S1–S3 built is on a page nobody opens.** Vercel runtime logs: `/dashboard/ask-aria`
**1 hit**, `/dashboard/ask-aria/ax` **0**. Stop, provenance, rename, pin, search, the watchdog — all
shipped to `/ax`. The owner loads the 1,674-line original. **This is the single most important thing
in this document** and it is not one of the sprint's three findings.

**3. Provenance still does not write, and now I know it never could have.** It is wired end to end
(S3) and gated on the council path — but the council path needs a request that never arrived, and
Anthropic is rejecting the key anyway. Two independent blockers, both upstream of the chain.

---

## PHASE 0 — GATE

```
columns pinned_at · deleted_at · title_edited_at · search_tsv     4/4
indexes biz_recent_idx · search_idx                               2/2
289 conversations · 0 carrying provenance · 0 raw-JSON titles (S3 backfill held)
newest last_message_at:  2026-08-26 07:30:51 UTC  =  26 Aug 17:30 Melbourne
```

**That last line is an independent corroboration of finding #1** that the sprint did not have.
Nothing has been persisted since 26 Aug 17:30. The founder sent messages on 27 Aug. The database
agrees with the logs.

---

## PHASE 1 — WHERE SEND DIED

**I checked the sprint's finding before building on it, as instructed, and it needed one
correction.** `/api/aria/ask` is **not** universally dead:

| window | `/api/aria/ask` | `ask/suggestions` | `ask/audit` |
|---|---|---|---|
| 7 days | **9** (32× 200, 1× 405) | 11 | 5 |
| 24 hours | **0** | 1 | 1 |

So the endpoint works. It stopped being **called**. The 3-hour finding was right; the endpoint being
broken was not the reason.

### The chain

1. The owner loads **`/dashboard/ask-aria`** — the original surface (logs: 1 hit; `/ax`: 0).
2. That surface awaited `readAriaSse()` at `:720` with **no timer**.
3. Anthropic has rejected this deployment's key for 24h, so a stream opens and goes silent — exactly
   the shape that await cannot survive.
4. Promise never settles → `finally` never runs → **`sending` stays true**.
5. Bubble stays `streaming: true`: cursor blinking, Stop live. **This is what the founder saw.**
6. Every later send hits `if ((!msg && attachedFiles.length === 0) || sending) return` at `:654` and
   returns **with no fetch**.

**Does it affect every send or only some?** Every send **after the first hang**, on that surface,
until the page is reloaded. A fresh page load resets `sending` to `false`, so the first send after a
reload works — which is exactly the intermittency that makes this kind of bug survive so long.

### The fix
S1 phase 7 built this watchdog for `useAriaStream` and it was **never given to the surface the owner
loads**. Same shared `STREAM_STALL_MS`, same kick-on-every-frame, same "a watchdog abort is not the
owner pressing Stop" distinction — otherwise a stall renders as `— stopped —`, a cancellation they
never asked for.

**The `sending` guard stays.** It was never the bug; nothing being able to clear it was. Removing it
would trade a hang for double-submits. A test pins that it survives.

---

## PHASE 2 — NEVER FAKE A STREAM AGAIN

The error path rendered `Something went wrong: <raw provider error>` — the model vendor's billing
message, on a café owner's screen, with no indication whether retrying was worth it. It now runs
through **S1's existing `classifyChatError`** (reused, not reimplemented): a credit failure reads as
a credit failure and does **not** invite a pointless retry; a rate limit or timeout says to try
again. The raw detail goes to `console.error` for support, never to the owner.

`streaming: false` is now set in every terminal path.

> **What I did NOT build, and why.** The phase asks for "an error with a retry". I added the
> classified error but **no retry button** on this surface. Adding UI to a 1,674-line page I cannot
> render would be an unverifiable change to the exact file this sprint just proved is the one that
> matters. The classifier's messages already tell the owner whether to try again, and the composer
> is right there. Flagged as the remaining half.

---

## PHASE 3 — THE ANTHROPIC CREDENTIAL

Full detail: `docs/aria/S4-anthropic-credential.md`. **No key or fragment of one was read or
written**, and the report says where that stopped me rather than working around it.

- **One variable: `ANTHROPIC_API_KEY`**, 198 reads across 162 files. It is the only Anthropic-related
  env name in `src/`. **This closes one hypothesis outright** — the code is not reading the wrong
  variable.
- **`providers/anthropic.ts:9` builds the SDK client at MODULE SCOPE.** The key is captured at cold
  start and cached for that instance's life. **Updating the variable in Vercel does not take effect
  on warm instances.** If the key is already correct, some traffic may still be using the old one —
  which looks exactly like "the fix didn't work".
- The two paths can disagree from the same deployment: `anthropic.ts:9` is cached, `model-router.ts:180`
  builds per call. **A redeploy is the only thing that gets both onto the same credential.**

**What the founder must check, in order:** the **org** the key was created under → the **workspace
spend limit** (the commonly missed one: a capped workspace returns this exact message while the org
shows funds) → the balance itself. The report has a table distinguishing *wrong key* from *low
balance*, including the tell that calls succeeding after a **redeploy with no key change** means the
old key was cached, not that anything was fixed.

**Not determined here:** whether the var is set in Dev/Preview/Prod and whether those differ. There
is no name-only env listing in the available MCP surface, and I would not fish through a response
that may carry credential material to fill in a reporting line.

**Twilio, re-checked:** the **code is clean**. All 8 matches are the legacy column name `twilio_sid`;
the actual sender is `sendSMS()` from `lib/clicksend.ts`. `process.env.TWILIO*` appears **zero**
times. Whether the credentials are still *set in Vercel* is the same env question I declined — if
they are, they are dead credentials, not a live send path. **"Two env vars named as their own
secrets"** is not reproducible from the codebase.

---

## PHASE 4 — SUGGESTIONS

**The cause was the token budget, and the parser is untouched.** `maxTokens: 300` cannot hold four
data-referencing questions plus a JSON envelope — the model was being asked for something it could
not physically emit. **300 → 700.** Widening the parser to accept truncated JSON was the forbidden
fix and a test asserts no repair/lenient/partial parsing was introduced.

**A second bug the logs did not show: the fallback was being cached.** On a parse failure the old
code fell through to `FALLBACK_SUGGESTIONS` and then wrote them to `aria_suggestions` with a 4-hour
expiry, exactly as if they had been generated. **One truncated response poisoned every page load for
four hours** — the failure outlived the request that caused it. That is why this looked like
"suggestions are just generic" rather than "suggestions are broken". Fallbacks are now returned but
never cached, and both failure paths log which one fired.

### Latency — measured, and precise about what was measured

| | |
|---|---|
| **Unit-measured** | a 5s generation returns in **<1s** against a 120ms budget (test asserts it) |
| **New ceiling** | `buildAskAriaContext` + **6s** (`SUGGESTION_BUDGET_MS`), replacing an observed 16.5s |
| **NOT measured** | the live route — I cannot authenticate to this deployment |

⚠️ **`buildAskAriaContext` runs 19 DB queries and is still inside that bound.** Phase 4 bounded the
*model* call, not the context build. Named in the sweep; not fixed, because it is not in a phase.

---

## PHASE 5 — THE SILENT-FAILURE SWEEP

Full detail: `docs/aria/S4-silent-failure-sweep.md`. Ranked, with the dismissals shown.

**The structural point that reframes all of it:** `withErrorCapture` logs and reports to Sentry only
for **thrown** errors. An inner `catch { return null }` never throws, so it **never reaches that
capture** — invisible in Vercel logs, invisible in Sentry, and the route still returns 200.

| # | where | what an owner sees |
|---|---|---|
| 1 | `get-business-context.ts` ×10, unlogged | Aria answers confidently and never mentions the domain that failed |
| 2 | `ask/route.ts:123,132` | a proposed action card or a chart silently does not appear |
| 3 | `autopilot/route.ts:56` (42P01) | a missing table reads as "nothing to do", forever |
| 4 | `ask/audit/route.ts:18,20` | unauthenticated renders identically to empty |
| 5 | `suggestions.ts:45` | the open-loop prompt is just not offered |

Finding 1 is ranked first because `:374` literally instructs the model *"Never invent loyalty
numbers — cite these"* while the `catch` two lines below removes the numbers it is telling it to
cite, silently. **Nothing here was fixed** — all five are outside this sprint's phases.

---

## GATES

- `npx tsc --noEmit` — **0 errors**
- `npx vitest run` — **1043 passed / 1043** across 79 files (was 1017/77; +26)
- `npx next build` — **BUILD_EXIT** read from `build-s4.log`, never the wrapper
- **Mutations, all RED:** removing the watchdog · restoring the raw-error bubble · restoring
  `maxTokens: 300` · caching a fallback again
- **Build honesty:** run once at the end across all commits, not per commit. Everything is pushed
  together, so the pushed tree is the verified one; intermediate commits are `tsc`/`vitest`-verified
  only.

### What was NOT verified by observation — and phase 1 asked for exactly that

**I did not watch a request leave a browser.** I cannot authenticate to this deployment. The
diagnosis rests on the code path plus **two independent measurements**: the log window
(`/api/aria/ask` = 0 in 24h while sibling routes fired) and the database's last write (26 Aug 17:30).
Both agree. That is strong, and it is still not the network-level observation the phase specified.

### What a human must do to close phase 1

1. Open `/dashboard/ask-aria`, DevTools → **Network**, filter `ask`.
2. Send a message. **Confirm a POST to `/api/aria/ask` appears.**
3. If it does not: reload and try again — the first send after a reload is the one that works.
4. Let a send hang. **After 45s it must now surface an error**, not blink forever.
5. Then send again — **it must fetch.** Before this fix it would not have.
6. `select count(*) from aria_conversations c where exists (select 1 from jsonb_array_elements(c.messages) m where m ? 'provenance')` — **still 0.** It needs a *council* turn to land, which needs both a working send **and** a working Anthropic key.

### One correction to the sprint's premise, stated plainly

`/api/aria/ask` is not dead — 9 requests in 7 days, 32× 200. It went quiet in the last 24h. The
distinction matters: nothing needed fixing at the route, and the fix belongs entirely on the client.
