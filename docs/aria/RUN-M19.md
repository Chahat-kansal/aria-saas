# RUN-M19 · INDEX TRUTH · THE OUTAGE CHAIN · LANE DETERMINISM

Branch `main` · autonomous run (RULE 20) · started 9 Oct 2026 · follows M18B (`a58864cf`)

---

## 1 · WHAT IN THIS BRIEF WAS WRONG

The brief says it rests on M18B's findings and asks me to re-verify them. I did. **M18B's findings
hold.** The corrections below are to the brief's own front matter and to one of its instructions.

### ⚠️ 1a · THE OUTAGE NUMBERS ARE STALE, AND THEY ARE GETTING WORSE, NOT HOLDING

The brief states, under *"Verified live by me, 9 Oct"*:

> 785 conversations, **154 with `last_intent = 'ai_outage'` (19.6%)**

Measured live today, same project:

| | brief | measured today |
|---|---|---|
| conversations | 785 | **820** |
| `ai_outage` | 154 | **169** |
| share | 19.6% | **20.6%** |

**785 / 154 / 19.6% is not a 9 Oct measurement — it is M18B's *brief's* figure**, which M18B's own
run log had already corrected to 156 of 785 on 5 Oct. It has been re-quoted forward twice.

**And the trend is the part that matters.** By day:

| day | conversations | ended in the outage reply |
|---|---|---|
| 4 Oct | 1 | 0 |
| 5 Oct | 54 | 17 |
| **8 Oct** | **11** | **6 — 55%** |

**On 8 October, more than half of all conversations ended in an apology** — after M18B shipped. The
all-time 20.6% understates the current rate by a wide margin. Phase 3 is more urgent than the brief
makes it sound, not less.

### ⚠️ 1b · THERE IS NO PHASE 0, SO ITS DUTIES HAD TO GO SOMEWHERE

The front matter says M18B's findings are *"not re-verified by me — **Phase 0** re-checks each"*. The
brief has no Phase 0; it runs 1–5. The re-check duties land in **Phase 2, the preflight**, which is
where they are done and reported. Noted rather than silently reassigned, because a brief that
references a phase it does not contain is how a verification step gets dropped by both parties.

### ⚠️ 1c · THE DUPLICATE COUNT WAS RIGHT, AND THE INDEX ITSELF ALREADY SAID SO

The brief says *"My copy shows 29 duplicate sprint IDs; M18B's plan said 28. Phase 1 counts them in
the repo and uses that number."* Counted in the repo: **29**, across **59 rows**. The founder's figure
is correct and M18B's 28 was wrong.

Worth adding: **the index was already carrying the answer.** Line 679 of the index reads
*"**index v3** (the 29 duplicate IDs above, statuses marked from the run logs, lane + zone columns,
retire clashing S-IDs)"* — this entire phase, including the count, was already written down as a Lane
D gate. Phase 1 is executing a plan the index had already made.

### ⚠️ 1d · ONE INSTRUCTION COULD NOT BE FOLLOWED LITERALLY, AND FOLLOWING IT WOULD HAVE BEEN WORSE

*"Renumber by appending a suffix, never by shifting other rows."* Followed — with one deliberate
exception, and seven rows where a suffix was the wrong tool entirely. Both are in Phase 1 below.

---

## 2 · PHASES

### PHASE 1 — INDEX V3 · commit `pending`

**SCOPE** · `docs/aria/ARIA-MEGA-SPRINT-INDEX.md` + one migration file. **Nothing in `src/`** —
confirmed by `git status --porcelain src/` returning empty.

**files changed**

| path | +/− | what |
|---|---|---|
| `docs/aria/ARIA-MEGA-SPRINT-INDEX.md` | +52 / −36 | 29 duplicates → 0 · 6 clashing S-IDs retired · 6 statuses · 33 missing rows |
| `supabase/migrations/20261008232912_console5_ledger_drop_inventing_defaults.sql` | **new**, 8 | the applied DDL, body byte-identical |

#### ⚠️ 29 DUPLICATES — AND SEVEN OF THEM WERE NOT COLLISIONS AT ALL

Counted, then inspected rather than renamed on sight. **Two different faults needed two different
fixes**, and treating all 29 the same way would have left the file wrong in a new way.

**Fault 1 — a verbatim duplicated block (7 IDs).** Lines 301–307 are a **line-for-line copy** of
255–261: `M108, M108b, M108c, M104b, M104c, M104d, M104e`, same scope text, same status, inserted into
a different section after M130. Proven identical row by row before touching it, and the script
**locates the block by content, never by hard-coded line numbers**, so it cannot delete the wrong rows
if the file has moved on.

**The copy was deleted, not suffixed.** Suffixing an exact duplicate would have invented seven sprints
that do not exist. Deleting it cannot break a reference: the ID still resolves, to exactly one row.

**Fault 2 — 23 genuine collisions**, two different sprints sharing an ID. First occurrence in file
order keeps the bare ID; the later one takes `-2`:

```
M40  -> M40-2   (ASK-WORKS-3)        M83  -> M83-2   (BRAND-KIT-1)
M53  -> M53-2   (TZ-RAIL-1)          M84  -> M84-2   (BRAND-KIT-2)
M54  -> M54-2   (TZ-RAIL-2)          M85  -> M85-2   (POS-BRAND-1)
M55  -> M55-2   (LOC-1)              M86  -> M86-2   (POS-BRAND-2)
M56  -> M56-2   (POS-IDEM-1)         M87  -> M87-2   (LOY-NAME-FIX)
M76  -> M76-2   (SS-2)               M88  -> M88-2   (BEZEL-KIT)
M77  -> M77-2   (SS-3)               M89  -> M89-2   (QQ-MIGRATION)
M78  -> M78-2   (SS-4)               M90  -> M90-2   (RR-HELP)
M79  -> M79-2   (SS-5 / TT)          M91  -> M91-2   (UU-SUPPORT)
M80  -> M80-2   (BRAND-TIER)         M108 -> M108-2  (PROMO-1)
M81  -> M81-2   (PP-ONBOARD-1)       M180 -> M180-2  (EOD-1)
M82  -> M82-2   (PP-LOGO)
```

**Why `-2` and not a letter:** the index already uses letters for **related child sprints**
(`M104` → `M104b`). A duplicate is not a child, it is a collision — so a letter would both assert a
relationship that does not exist and risk colliding with a child ID someone plans later. `-2` says
what happened. The script asserts the new ID is free and **refuses to write** rather than create a
second-order collision.

**⚠️ ONE JUDGEMENT EXCEPTION TO "FIRST OCCURRENCE WINS", because the mechanical rule produced a worse
file.** `M180` collides between `EOD-1` (older) and the `REELS-R6a` row added days ago. The index also
carries `M180b/c/d/e` for REELS-R6b/R7a/R7b/R8 — so renaming the REELS row would have left
`M180-2, M180b, M180c, M180d, M180e`: **a family split down the middle.** `EOD-1` takes the suffix
instead, and REELS stays whole.

**That choice is safe because I checked rather than assumed.** Of the ten most-collided IDs, the number
referenced in any doc **outside** the index:

```
M40 0 · M53 0 · M54 0 · M55 1 · M56 1 · M76 0 · M77 0 · M78 0 · M108 0 · M180 0
```

**The reference-breaking risk the brief warns about is almost absent.** And the two that do appear are
already broken independently of anything I did — see the finding below.

#### ⚠️ 27 RUN LOGS HAD NO INDEX ROW — THE PARK CLAUSE, 27 TIMES

The brief: *"if a run log describes work that no index row covers at all, add the row and flag it —
that is a sprint nobody tracked."*

**39 run logs exist in `docs/aria/`. 12 had an ID matching an index row. 27 did not.**

```
M11B  M13  M13B  M13C  M13D  M17B  M18B
MS7-PRE  MS7  MS8  MS9  MS10  MS11  MS12  MS13  MS14  MS15  MS16  MS16B  MS16C  MS17
POS-INTEGRITY-1  POS-OFFLINE-1a  S2B  S8  S9  S10
```

**All 27 were built, gated, committed and pushed**, and the index did not know they existed. Every plan
drawn from this index has been drawn from a map missing a quarter of the territory — including, almost
certainly, parts of the briefs I have been given.

**And 12 was itself an overcount, which I caught by looking rather than trusting the match.** Six of
those twelve were **ID collisions, not matches** — the index's `S1`–`S5`, `S7` are entirely different
sprints from the run logs of the same name:

| ID | index row (planned) | run log (shipped) |
|---|---|---|
| S1 | HOUSE-RULES-LEARN | THE CHAT SURFACE |
| S2 | SKILLS-FROM-WHAT-THEY-HAVE | CONVERSATION PERSISTENCE |
| S3 | DATA-FIRST-INTERVIEW | what the screenshot showed |
| S4 | CONNECTOR-HONESTY | why doesn't send send |
| S5 | PAYLOAD-EXACT-APPROVAL | the swap |
| S7 | CAPABILITY-SENTENCE | FINISH THE CLASS |
| **S6** | **CHECK-LIVE** | **CHECK:LIVE** ← the one genuine match |

So the honest split is **6 real matches, 6 false ones, 27 absent**. The brief's item 4 (*"retire the
S1–S8 IDs that clash"*) is exactly right, and `S6` is correctly excluded from it.

**Retired:** the index's planned `S1`–`S5`, `S7` → `-2`. **The shipped run log keeps the bare ID**,
because it shipped. `S8a/b/c` were left alone: there is no bare `S8` index row, so nothing clashes.

Retiring those six means their run logs then needed rows too, so **33 rows were added in total** (27
originally untracked + 6 freed by the retirement).

#### LANE AND ZONE

Added as columns on the new rows. **Lane** is assigned (A brain · B money/POS/schema · C operations ·
D platform · E Codex). **Zone is DERIVED from each run log's own file references** — the directories it
names in its *files changed* entries — not assigned by me. A log naming no path reads
*"unknown — the log names no path"* rather than being given a guess.

⚠️ **The lane/zone columns were NOT added to the other 400 rows**, and that is a deliberate limit. For
an unbuilt sprint the file zone is **not knowable** — inventing one would be fabricating the answer to
"which files does this own", which is the GROUNDING-TEETH failure one layer up. Where the files are
known (a run log exists) the zone is filled from evidence; where they are not, no column is better than
a guess. **This is the part of the brief's item 3 I did not deliver, and the reason.**

#### STATUSES, FROM THE RUN LOGS

`✅ done` on `M11, M12, M14, M17, M18, S6` (the rows that existed), and on all 33 added rows. The 27
untracked sprints are marked done because a run log exists for each — which is evidence of shipping,
not of correctness.

⚠️ **One near-miss worth recording:** my first pass overwrote the status cell outright, which deleted
`S6`'s note *"before more feature sprints"* — a sequencing note the index was carrying. Fixed to
preserve it (`✅ done — was: …`). A docs pass that silently drops content is worse than one that does
nothing.

#### THE MIGRATION

`supabase/migrations/20261008232912_console5_ledger_drop_inventing_defaults.sql`, timestamp taken from
the applied migration itself (`supabase_migrations.schema_migrations.version`). **Already applied on
9 Oct — not run.**

**Byte-identity proven, not asserted:**

```
applied SQL  md5 e0c07084cfa87462878776d805dafc49   673 chars
file body    md5 e0c07084cfa87462878776d805dafc49   673 chars   ← identical
file on disk 676 bytes / 674 chars, LF endings, one trailing newline
```

The SQL body is **character-for-character identical**. The file carries one trailing newline, which the
stored statement does not — a text-file convention that creates no drift risk, recorded here so the
one-byte difference is visible rather than discovered later. Removing it is a one-character change if
you would rather it be literal.

**VERIFY — pasted**

```
=== duplicate IDs (independent parser, after the fix) ===
ID rows: 435 · distinct: 435 · DUPLICATES: 0  NONE

=== every run log maps to exactly one index row ===
run logs: 39
  mapped to EXACTLY ONE index row: 39
  anything else:                   0
duplicate first-cells anywhere in the file: 0  NONE
```

⚠️ **My first verifier said 11 run logs mapped to zero rows, and the verifier was wrong, not the file.**
Its ID regex rejected `M11B`, `MS16C`, `POS-INTEGRITY-1` and `S2B` — real ID shapes in this index. The
check above uses **no regex at all**: it asks whether each run log's own ID appears as a first cell, and
counts. Any pattern tidy enough to look right was going to miss some of these, which is exactly what
mine did. Third sprint running that a measurement of mine needed correcting before it could be trusted.

**gates** · docs + one migration only; `src/` untouched (verified). `tsc` and the suite are unaffected
and were green at `a58864cf`; both re-run at the end of Phase 1 regardless — see the commit line.

**NOT done, and why**

- **Lane/zone columns on the ~400 pre-existing rows** — the zone is not knowable for unbuilt work.
- **`success` NOT NULL DEFAULT true** left alone, as the brief instructs: it waits for the 175
  bypassers.
- **No backfill** of the ledger's old rows.

**discovered**

- **`ARIA-FOUNDER-ACTIONS.md` cites IDs that resolve to nothing matching.** It references `M55` for a
  *"rate-limiter fail-open decision"* and `M56` for *"brand colour"* / *"branding scope"*. Neither
  matches **either** side of those collisions — `M55` is ASK-ANYWHERE / LOC-1, `M56` is ASK-HABIT-TILES
  / POS-IDEM-1, and the brand work is M82/M83. **Those two references were already stale before this
  sprint**, which also removes the last reason to prefer either side of the collision. Flagged, not
  rewritten: deciding what they *meant* to point at is the founder's call.
- **⚠️ THE INDEX ASKS FOR A SPRINT THIS BRIEF DOES NOT AUTHORISE.** The index's own `G1`
  **KILL-MODE-PICKER** row reads: *"remove the composer 'Ask ▾' mode picker and every
  Business/Research/Computer/Build label. Aria routes; the owner never picks a mode. Routing is M19's
  deterministic decide, so this ships in the same sprint"* — **order: with M19.** It is not in this
  brief's five phases, and it is **owner-facing UI**, while this brief authorises exactly one
  owner-facing change (Phase 3). **Not built. Flagged for a decision**, because the index and the brief
  disagree about what M19 contains.
- The index's `G2` **MEMORY-ALL-LANES** row is ordered *"with M18 (ground stage)"*. M18 shipped without
  it. Another index-vs-reality gap, same class.

---

