# RUN-M13 · THE FIRST TWO WALLS

6 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — GATE

### ⚠️ THE AUDIT FILE DOES NOT EXIST IN THIS REPO

`docs/aria/ARIA-ARCHITECTURE-AUDIT.md` — **not found**, anywhere. Searched by name, by pattern
(`*ARCHITECTURE*AUDIT*`, `*ARIA-ARCH*`), and through `docs/aria/`, `docs/reports/` and the repo root.
The nearest relative is `docs/reports/ARIA-ARCHAEOLOGY-1-REPORT.md`, which is where the 9–15% versus
73–78% adoption figures the brief quotes actually live.

It may exist outside the repo. **Every number in the brief was therefore re-measured from the code
and the live database rather than read**, which the brief asked for anyway.

### Re-measured — what matched, and what drifted

| claim | audit | measured 6 Sep | verdict |
|---|---|---|---|
| `new Anthropic(` files | 171 | **171** | ✅ exact |
| `.messages.create` files | 162 | **162** | ✅ exact |
| `src/lib/ai/` = one 60-line file | 60 | **`nano.ts`, 60 lines** | ✅ exact |
| empty catches | 13 | **13** (all non-test) | ✅ exact |
| `aria_autopilot_actions` rows with `proposal_id` | 0 of 819 | **0 of 854** | ✅ still zero |
| council sessions marked complete | 93 | **95, all of them** | ✅ (2 more since) |
| council proposals, ever | 2 | **2** | ✅ exact |
| false `nightly-sync` failure rows | 2,275 | **2,275** | ✅ exact, frozen (96 completed) |
| provider abstraction used by | 4 files | **13 files** | ⚠️ **drift** |
| cost logged per-caller | 91 files | **94 files** | ⚠️ minor drift |
| catch-return-default | 69 | **124 non-test** | ⚠️ **definition differs** |

**The two drifts, honestly:**

- **13 importers of `providers/anthropic`, not 4** — counted as real `import … from '…providers/anthropic'`
  statements, not substring hits. The list is in the phase 3 section. M12 did not add any of them.
- **124 catch-return-defaults, not 69** — my pattern includes `true`, `undefined` and `{}` as
  defaults, which the audit's evidently did not. Neither number is wrong; they count different sets.
  **This one turned out not to matter** — see phase 1.

---

## PHASE 1 — W6: THE READ-THE-ERROR RULE ✅

**Commit:** `<phase-1>` · `scripts/canon-rail-guard.ts` (+2 rules, +1 allow-list, +remediation text).

### Built into the existing rail, not beside it

Two new rules in `canon-rail-guard.ts`, which already runs in the **pre-push hook and CI**, already
scans **only new diff lines**, and already grandfathers by that mechanism. Adding a tenth rule to the
wall that exists beat standing up a second one.

| rule | catches |
|---|---|
| `supabase-error-not-read` | `const { data } = await supabase…` — a destructure that takes `data` and drops `error` |
| `supabase-write-result-discarded` | `await supabase.from(…).insert(…)` as a **statement** — the result assigned to nothing |

**Both halves matter, and the brief was right that the second is the real one:** *the bug is the
unread result, not the missing try.* `council-executor.ts:17` and `recordEvent` before M11B are both
the second shape exactly.

### ⚠️ THE BACKLOG IS 4,512, NOT 82

The audit counted **`catch` shapes** — 13 empty + 69 returning a default. The defect the brief
actually describes is the **unread result**, and that is everywhere:

```
total violations : 4512      across files : 1267
  supabase-error-not-read            3307
  supabase-write-result-discarded    1205

BY DIRECTORY (top 8)
  src/app/api          3504        src/lib             67
  src/lib/aria          220        src/lib/pos         55
  src/lib/agents        199        src/lib/community   46
  src/lib/loyalty        90        src/lib/integrations 46
  src/lib/inventory      70        …37 more dirs        78
```

**Composition of the 3,307 destructures — so the number is not read as 4,512 bugs:**

```
  read (select/from)                                       1969
  other / continues on the next line                       1270
  WRITE (insert/update/upsert/delete) — the dangerous half    57
  rpc                                                         7
  auth (getUser/getSession)                                   4
```

**The genuinely dangerous set is the writes: 1,205 discarded write results + 57 single-line write
destructures ≈ 1,262 writes whose error is never read.** That is the migration backlog that matters,
and it is two orders of magnitude larger than the brief's 82.

None of it blocks anything: only new diff lines are scanned, so all 4,512 are grandfathered exactly
as every earlier rule grandfathers its predecessors.

### The allow-list is deliberately tiny

Three entries, and none of them is a caller: generated types, and the two Supabase client factories
which construct the client rather than querying with it. **A file added here is a file allowed to
fail silently.**

### VERIFY — both directions, observed

```
RED   — src/lib/w6-probe.ts:3  [supabase-error-not-read]
        src/lib/w6-probe.ts:7  [supabase-write-result-discarded]

GREEN — the same file with `const { data, error } = …` and `if (error) console.error(…)`
        [canon-rail-guard] no new canonical-path violations introduced. Pass.
```

The probe was removed and the tree reset. The rule was re-proven after a null-safety fix, so the
green above is not a green that came from the rule silently failing to run.
