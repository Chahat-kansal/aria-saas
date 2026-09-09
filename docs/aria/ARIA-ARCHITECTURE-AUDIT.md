# ARIA — ARCHITECTURE AUDIT
**From the repo itself. 5 Sep 2026. Every number below was measured by grep, wc or the run logs in this zip — none is from a summary.**

---

## THE VERDICT IN ONE PARAGRAPH

You're right that it keeps breaking, and you're right that means something structural. But the *design* is not what's broken. The council, provenance tiers, the verifier, propose-then-approve, the constitution — those are genuinely better ideas than anything Square or Lightspeed ship. **What's broken is that every one of them is optional.** There is no wall anywhere in this codebase, only doors that a new file can walk past. And with 2,632 files, 1,209 routes and 415,000 lines, something walks past every single day.

**The root cause is one sentence:** every good pattern in Aria is a helper that code *may* call, not a boundary that code *must* pass through. Your own archaeology proved this in July — required wrappers reach 78% adoption, importable helpers stall at 9–15% — and then the plan kept building helpers.

---

## THE SCALE, FOR CONTEXT

| | count |
|---|---|
| TypeScript files | 2,632 |
| Lines | 415,082 |
| API routes | **1,209** |
| Pages | 418 |
| Top-level product surfaces under `src/app` | 56 |
| Tables in the schema | 502 |
| Migration files | 241 |
| Test files / test lines | 132 / 17,236 |
| **Test-to-source ratio** | **4.1%** |
| CLAUDE.md | 749 lines |

This is roughly the codebase of a 30-person company, produced by one founder and an AI in about six months. That is the most important fact about it: **it has grown at a speed no verification loop kept up with.**

---

## THE EIGHT STRUCTURAL DEFECTS

### 1 · There is no model gateway. 171 files each make their own.
| | |
|---|---|
| Files creating `new Anthropic(...)` | **171** |
| Files calling `.messages.create` directly | **162** |
| Files using the provider abstraction `callAnthropicWithTools` | **4** |
| `src/lib/ai/` contents | one file: `nano.ts`, 60 lines |

The gateway that BE-1 was meant to build — routing, failover, cost logging, caching, one place to swap a model — **does not exist.** What exists is a 405-line `providers/anthropic.ts` that four files use. The other 171 talk to the SDK directly, which means: no failover for them, no cost logging unless each one does it by hand, no way to change a model in one place, and **no way to enforce that a prompt carries Aria's identity.**

**Consequence you've already paid for:** cost logging is done per-caller in **91 separate files** instead of once at the boundary. That's why AI-COST-AUDIT-1 found the ledger undercounting real spend by roughly half — it isn't a bug, it's that 80 files don't log at all.

### 2 · Aria's identity is defined 69 times.
| | |
|---|---|
| Files containing the string "You are Aria" | **69** |
| Files that build a system prompt | **123** |
| Constitution variants M12 found inside Ask Aria alone | **4** — none, 1,382 chars, 16,596, 18,171 |

The bathroom answer wasn't an accident. M12 captured the prompt: *"Do NOT force a business angle or mention the owner's business."* **Someone built a general-assistant mode inside the business co-owner**, and because there was no single assembly point, nothing stopped it. M12 fixed it with `assembleAriaPrompt()` that prepends `ARIA_CONSTITUTION` unconditionally — **the first wall this codebase has had around identity.** But it covers seven lanes in one route. The other 62 files defining "You are Aria" are still doing their own thing.

### 3 · Business logic lives in routes, not in the library.
| | |
|---|---|
| Lines in `src/app/api` route files | **112,451** |
| Lines in `src/lib` (excluding tests) | 74,383 |
| Routes over 300 lines | 26 |
| `ask/route.ts` | 2,791 lines, 7 execution lanes |

The ratio is backwards. Logic that lives in a route can only be reached by an HTTP call, can't be unit-tested without mocking the request, and can't be reused by a second surface — **which is exactly how `/classic` and `/ax` came to hold different capabilities.** When the plan runner needed to execute an action, it had to call `executeAction`, and `executeAction` applied no filter and took the first ten products. That function lives where nothing tests it.

### 4 · There is no data layer. Routes query 420 tables directly.
| | |
|---|---|
| Distinct tables queried directly from API routes | **420** of 502 |
| Files in `src/lib` named `*repo*` | 10 |
| `await supabase.from(...)` calls in routes | **3,057** |
| Files using `supabaseAdmin` (bypasses RLS) | **865** |

Every route decides for itself which table to read, whether to scope by `business_id`, and whether to check the error. That's why S2B found service-role reads keyed on an id with no business filter — safe only because an upstream call happened to scope them. **RLS exists and is proven correct and is bypassed by 865 files.** The isolation you tested is a wall around a building everyone enters through the side.

### 5 · Errors are optional.
| | |
|---|---|
| Empty `catch {}` blocks | 13 |
| `catch` returning null / [] / {} | 69 |
| Council-executor audit insert that never landed | 819 of 819 rows |
| `recordEvent` — the spine's one writer — `await insert()` in a `try` that only catches throws | fixed in M11B |
| Council sessions marked complete having done nothing | 93 of 93 |

Supabase resolves with `{ error }` rather than throwing. A `try/catch` around it catches nothing. This pattern is in the spine's own event writer, the council executor, and the cron that wrote 2,275 false failures. **Five sprints in a row found "something failed and reported success."** That's not five bugs; it's one missing rule — that a database write's error is read — with no mechanism to enforce it.

### 6 · The rail exists and is half-adopted.
| | |
|---|---|
| Routes | 1,209 |
| Using `withErrorCapture` (required) | **886 — 73%** |
| Using `withBusinessContext` (the canon rail) | **165 — 14%** |
| Still with an inline business-id resolver | **248** |

`withErrorCapture` is the one thing in this codebase that reached real adoption, because a guard blocks new files that skip it. `withBusinessContext` was built the same way and sits at 14% because the migration batches stopped after CANON-MIGRATE-2. **The pattern that works is proven. It was applied once and not finished.**

### 7 · The POS terminal is a 4,780-line component.
| | |
|---|---|
| `pos/(fullscreen)/terminal/page.tsx` | 4,780 lines |
| `useState` calls in that one file | **148** |
| `useEffect` | 27 |
| `fetch(` | 59 |

This is the money tool — the surface your whole "POS as the main money tool" thesis rests on — and it is one React component with 148 pieces of state and 59 network calls. It cannot be tested, cannot be reasoned about, and every POS-INTEGRITY finding traces back to this file. Offline sales silently destroyed, payment insert non-fatal, the twice-observed stale-read class — all in here.

### 8 · Sprawl: parallel implementations of the same thing.
| thing | separate definitions |
|---|---|
| `sendEmail` | 5 |
| `safeParseJSON` | 4 (was 5 before M9) |
| `council.ts` | **2 files** — `lib/agents/council.ts` (487 lines, 10 importers) and `lib/aria/council.ts` (1,391 lines, 12 importers) |
| Business-id resolvers | 6 canonical + 248 inline |
| Cron task routes | 96 directories, 74 of them not in the dispatcher's schedule |

Two councils. Two files with the same name, both imported, doing different things. That's the codebase telling you what it is.

---

## WHAT IS GENUINELY GOOD — don't lose this in the rewrite instinct

- **The design ideas are right.** Council with sub-brains, truth tiers on every number, refusal over invention, propose-then-approve, the constitution, the canon rail, the inertness ledger, mutation tests with anti-vacuity assertions. Nobody at Square has a provenance system. Nobody has an inertness ledger.
- **The enforcement machinery exists.** `withErrorCapture` at 73%, the canon-rail guard blocking new violations, CI rails that fail loudly. **The pattern that fixes this codebase is already in this codebase.**
- **The run-log discipline is exceptional.** Measured claims, corrected premises, self-caught errors. Most engineering teams don't produce this.
- **The hourly cron dispatcher** (h01–h23 fanning out to 74 tasks) is a sound design that the "cron budget full" note misread.

---

## THE ONE STRUCTURAL FIX — walls, not helpers

Not a rewrite. 415,000 lines cannot be rewritten by one founder; the attempt would kill the product. The fix is the thing your own archaeology found and the canon rail proved: **turn each optional pattern into a boundary, add a guard that blocks new violations, then migrate the old code in batches.** Six walls:

| # | Wall | What it enforces | Guard | Migrates |
|---|---|---|---|---|
| W1 | **One model gateway** | Every model call goes through `src/lib/ai/gateway.ts`. Routing, failover, cost logging, caching, prompt caching — once | Lint rule: `new Anthropic(` and `.messages.create` forbidden outside the gateway | 171 files |
| W2 | **One identity assembly** | `assembleAriaPrompt()` (M12 built it) is the only way a prompt is built. Constitution unconditional. "Cannot see" when ungrounded | Guard: any `system:` literal or "You are Aria" outside `prompt/` → red | 69 + 123 files |
| W3 | **One action gateway** | Every write that changes business state resolves target server-side, writes the intent row, then acts. The M11B `executeAction` bug becomes impossible | Guard: writes to state tables only through `lib/actions/` | the executor's callers |
| W4 | **Data access per domain** | `lib/data/<domain>.ts` — every query business-scoped by construction, every error read. Routes never call `.from()` | Guard: `.from(` forbidden in `src/app/api` | 3,057 calls, in batches |
| W5 | **Finish the canon rail** | `withBusinessContext` to 100% of routes | Already exists | 248 resolvers (CANON-MIGRATE-3, Bucket-B) |
| W6 | **Read-the-error rule** | A Supabase call whose `error` is not read is a lint failure | Lint rule | 82 catch sites + every unchecked call |

**Each wall is one mega sprint to build the boundary and the guard, then N batch sprints to migrate.** The guard is the load-bearing part — it's what makes the wall permanent instead of another helper at 14%.

---

## WHAT "BEST IN THE WORLD" ACTUALLY LOOKS LIKE FOR ARIA

Not more features. The 277-sprint index already has more features than any competitor. **Best in the world means: when an owner asks Aria anything, on any surface, she is always Aria, always grounded, always honest about what she can't see, and every action she takes is recorded before it happens and reversible after.** That is a property of the walls, not of the feature count.

Concretely, after the six walls:
- A new route cannot answer as a generic assistant, because it cannot build a prompt without the constitution
- A new agent cannot skip cost logging, because it cannot reach a model without the gateway
- A new feature cannot leak across tenants, because it cannot query without business scope
- A new writer cannot report success on failure, because an unread error fails lint
- A new action cannot act on the wrong target, because it cannot act without an intent row

**That's the difference between Square's AI and Aria's.** Square's is a thin question-answering layer on a decade-old platform. Aria's would be an intelligence that is structurally incapable of lying about a business's numbers. Nobody has that.

---

## WHAT THIS MEANS FOR THE 277-SPRINT INDEX

**The walls are already in the index — spread across phases B, C, H and O as if they were features.** They are not features. They are the foundation every feature after them stands on.

| Wall | Where it sits now | Where it must sit |
|---|---|---|
| W1 gateway | M209 BE-1, phase O | **before any new AI sprint** |
| W2 identity | M12 (done for one route) | extend to all 69, **before M13** |
| W3 action gateway | M58, phase C | **before M11B's executor bug is reachable by any more callers** |
| W4 data layer | not in the index at all | **new — before phase G inventory** |
| W5 canon rail | M47–M50, phase B | as written, but **earlier** |
| W6 read-the-error | not in the index | **new — immediately, it's a lint rule** |

**Recommended reorder:** after M12, run W6 (one sprint, it's lint) → W1 → W2-extend → W3 → W5 batches → W4 batches, **interleaved** with feature sprints rather than all at once — each wall lands, its guard goes live, and from that day no new sprint can violate it. The migration of old code proceeds in the background as batch sprints, the way CANON-MIGRATE-1/2 did.

**What to stop doing:** adding a 70th "You are Aria". Adding a 172nd `new Anthropic(`. Adding a 3,058th unscoped query. **Every feature sprint since June has added to these counts, and every repair sprint has found the result.**

---

## THE HONEST BOTTOM LINE

Aria's architecture is not worse than Square's. **It is less enforced.** Square has 900 engineers and code review; you have guards or you have nothing. Six walls with guards, built in the pattern this codebase already proved works, and the "breaking again and again" stops — not because bugs stop, but because the classes of bug that keep recurring become impossible to write.

That's the real path to "the only AI tool I want is Aria." Not the 277th feature. The six walls.
