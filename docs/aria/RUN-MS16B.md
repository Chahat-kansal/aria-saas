# RUN-MS16B — AX-1 CORRECTIONS

**Run date:** 2026-08-25 · autonomous (RULE 20) · branch `main`

---

## THE ONE-SCREEN SUMMARY

**Phases done: 1 of 4. Phases parked: 3 of 4 — all on the same missing input.**

### The one thing you need to know

**The corrected contract never arrived.** `docs/design/ask-aria-transition.html` is still
byte-identical to the file MS16 lifted. I verified it three ways: `git diff HEAD` on the path is
empty, the working tree is clean, and the file still contains the drawn CSS face
(`.hair .head .fringe .eye .smile .torso .lapel`) with **no `.arrow`, no `.fallback`, and no
`<img>` anywhere in it**.

```
sha256  566e2fba9e70f1c7f7ec2d820ff8e6fe244a52b7aa85aa35675a564892dc9c57
size    22,127 bytes   ·   mtime 2026-08-25 02:14   ·   identical to the MS16 commit
```

All three corrections the sprint describes are absent from the source file. **Phases 1, 2 and 3 have
nothing to lift from**, so they are parked as a chain: Phase 1 re-lifts the contract, Phase 2 needs
Phase 1's `.figure` image slot and `.fallback`, Phase 3 re-baselines against Phase 1's output.

**I did not write the corrected contract myself.** Producing those three fixes would mean authoring
the design I am supposed to be reproducing, which the decision table forbids outright
(*"Anything tempts you to 'improve' a lifted rule → Forbidden"*). Re-lifting a file I wrote would
also make the zero-modified-lines proof circular and worthless.

**To unpark all three: commit the corrected file to the same path and re-run this sprint.** Nothing
else is needed — the tooling, the verification script and the baseline are all in place and working.

### What I did instead

**Phase 4 shipped in full**, because it is independent of the contract and its precondition checked
out. And the avatar hunt (Phase 2's research half) is **done and answered**, so that phase is
unblocked the moment the contract lands.

---

## THE PRECONDITION CHECK — verified, not assumed

The sprint says the CHECK constraint was widened on 24 Aug and tells me to verify before building.
I did, against the live database:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.agent_settings'::regclass and contype='c';
```
```
agent_settings_mode_check   CHECK ((mode = ANY (ARRAY['suggest'::text, 'copilot'::text, 'auto'::text])))
```

**True.** All three modes are accepted. Phase 4 proceeded on that.

---

## PHASE 4 — CO-PILOT IS WIRED  ✅ DONE

### What Co-pilot is now wired to

`agent_settings.mode` — real, per-business, per-agent-type, resolved server-side through the MS13
rail. All three modes persist and read back. The "cannot be saved" messaging is gone from the
surface because it is no longer true.

### PROOF IT PERSISTS — against the live database, rolled back

The sprint asks for "set each mode, reload, it persists". Done as a rolled-back `DO` block against
Sip's nine agent rows, so the evidence is from the real constraint rather than my model of it:

```
PROOF(rolled back): copilot=9  auto=9  suggest=9  junk=REJECTED sqlstate=23514
```

Every one of Sip's nine rows accepted and read back each mode in turn, and the constraint still
**refuses** an unknown value (`23514` = check_violation). Verified afterwards that the data is
untouched: **9 rows, all `suggest`** — exactly as before. Nothing was left behind.

### THE SAFETY QUESTION, WHICH IS THE REAL WORK OF THIS PHASE

> *"Co-pilot changes what Aria may do without asking. It must not widen any money, messaging or
> authorisation path. If a code path would treat copilot as auto for a gated action, PARK it."*

**No path does — and it is structural, not lucky.** Every gate in the agent layer is a POSITIVE test
for `auto`:

| file | gate | what it controls |
|---|---|---|
| `clv-agent.ts:670` | `if (mode === 'auto')` | **sends SMS to customers** |
| `council.ts:453` | `if (mode === 'auto')` | **executes approved proposals** |
| `flash-revenue-agent.ts:241` | `if (mode === 'auto')` | **executes revenue interventions** |
| `flash-revenue-agent.ts:286` | `mode === 'auto' ? 'executed' : 'pending'` | whether an action counts as done |

A positive test means a new value falls to the **safe** branch. Defaults are `config.mode ?? 'suggest'`,
which is safe too. A repo-wide sweep for the dangerous shape — `mode !== 'suggest'` — found
**zero occurrences in the entire `src/` tree**.

**This was one keystroke away from being a serious incident.** Had any of those four been written
`mode !== 'suggest'`, widening the constraint would have silently promoted every Co-pilot business
to full execution — including the path that sends SMS to real customers and the one that spends
money — with no code change and no deploy. The constraint widening alone would have done it.

So the phase's deliverable is not just "Co-pilot saves". It is **a rail that keeps this true**:

- `mayActWithoutAsking(mode)` in `lib/aria/autonomy.ts` is now the single canonical predicate.
  Only `'auto'` returns true. It is deliberately a positive test, so a future fourth mode lands on
  the safe side by default instead of inheriting permission nobody granted it.
- A test asserts **no agent file gates on a negative mode test**, and goes red if one is introduced.
- Tests assert the three gated actions still test for `auto` positively.

**Mutations — all seven RED**, baseline green before and after:

| mutation | result |
|---|---|
| clv-agent SMS gate widened to include copilot (negative form) | **RED** |
| council proposal-execution gate widened to include copilot | **RED** |
| flash-revenue intervention gate widened to include copilot | **RED** |
| the canonical predicate lets copilot act unprompted | **RED** |
| copilot dropped back out of the persistable vocabulary | **RED** |
| mixed state resolves UP instead of down | **RED** |
| "cannot be saved" messaging reinstated | **RED** |

The first three are the sprint's named mutation — *allow a gated action under copilot* — applied to
all three real gated paths rather than a toy example.

### Two things changed beyond the brief, both stated

**1. Three-way resolution now resolves DOWN across three values, not two.** The column is per-agent
and the control is per-business, so a business whose agents disagree has to resolve to something.
The rule is unchanged in spirit and now covers the middle value: the business sits at the
**least-permissive** mode any enabled agent is on (`suggest < copilot < auto`). Mixed `auto`+`copilot`
reads as **copilot**; add one `suggest` and it reads as **suggest**. An unrecognised stored value is
read as `suggest`, never `auto`. Reading a half-automated business as fully automated is the
direction that hurts, so it cannot happen in either the two-value or three-value case.

**2. A silent-success bug in the write path, found and fixed.** The route did
`.update(...).eq('business_id', …)` with no check on rows affected. A business with **no**
`agent_settings` rows would update nothing, return 200, and the owner would believe they had set a
mode they never got. It now returns **409 `no_agents`** with a plain-English message. Sip has nine
rows so this never bit here, but a brand-new business has none — this is on the path every new
signup takes. Not in the brief; fixing it was the difference between the control working and
appearing to work.

### A test that asserted the old behaviour — rewritten, not deleted

`ax-1.test.ts` asserted `isPersistable('copilot') === false` and
`PERSISTABLE_MODES` not containing copilot. Both are now false statements. Per the standing table
the test was rewritten to assert the new behaviour with the reason written into the file, and
**strengthened**: it now also asserts that widening the vocabulary did not make it permissive, by
checking `''`, `'AUTO'`, `'full'`, `'yolo'`, `'admin'` and `'true'` are all still refused.

---

## PHASE 2's RESEARCH HALF — DONE, so the phase is unblocked when the contract lands

The sprint says: point `.figure img` at the app's existing Aria avatar, never generate one, and if
none exists, report exactly where I looked.

### The answer: there is no still image of Aria in this repo

The live Ask Aria surface depicts Aria with exactly two things, and **neither is a still**:

| what | where | detail |
|---|---|---|
| **A 3D VRM model, rendered live in WebGL** | `public/models/Aria.glb` — 18,046,684 B | Loaded by `AriaTalkingHead.tsx:137`. VRM 1.0, `meta.name: "Aria"`. This is the real Aria. |
| **A remote MP4** | `https://tcowd5vdie4rwa2o.public.blob.vercel-storage.com/50071.mp4` | `page.tsx:557`, via `NEXT_PUBLIC_ARIA_VIDEO_URL`. **No `poster` attribute** — no still frame declared anywhere. |

`AriaTalkingHead` references **one** asset and has **no** image, poster, placeholder or fallback; its
load error path is `.catch(() => {})`, so a failure today shows an empty transparent box.

**The nearest thing to a still** is a **2048×2048 PNG embedded inside `Aria.glb`** as the VRM
`meta.thumbnailImage` (~2.2 MB, in the binary chunk). It is square, so it would drop into a circular
crop at both 250px and 148px with no cropping guesswork. **I did not extract it**, because extracting
and downscaling a thumbnail is creating a new asset, the framing is unverified, and there is no
`.figure` slot to put it in yet. That is a decision for when the contract lands.

**Do NOT use `public/videos/aria-intro-poster.jpg`.** It is 1920×1080 and it is **a different, male
character** from the marketing intro — not Aria.

### Where I looked, so the negative result is trustworthy

- **Directories:** all of `public/` recursively (~340 image files, incl. `icons/`, `auth/`, `cx/`,
  `menu/**`, `models/`, `videos/`, `_refs/`); all of `src/`; `prompts/`; `canopy/`.
- **Filenames:** `aria`, `avatar`, `mascot`, `persona`, `portrait`, `face`, `head` × `png, jpg,
  jpeg, webp, svg, gif, avif` (plus `mp4, webm, glb, vrm`).
- **Source content:** `AriaTalkingHead`, `ariaVideoUrl`, `AriaAvatar`, `aria-avatar`, `ARIA_AVATAR`,
  `avatarUrl`, `avatarSrc`, `poster=`, `next/image`, `<Image`, `<img`, `NEXT_PUBLIC_ARIA_*`, and the
  regex `(?i)(aria|avatar)[\w/-]*\.(png|jpg|jpeg|webp|svg|gif|avif)`.
- **Git history:** `git log --diff-filter=D` for deleted `*aria*` / `*avatar*` images — **nothing**.
  No Aria still was ever committed and later removed.
- **Binary:** parsed the `Aria.glb` glTF JSON chunk (30 images, `VRMC_vrm`) and read image headers
  for dimensions.
- **Not covered:** `.env.example` / `.env.local` (tool permission denied), so I cannot confirm
  whether `NEXT_PUBLIC_ARIA_VIDEO_URL` is overridden in this checkout; the hardcoded default applies
  either way.

### The recommendation for when the contract lands

The brief already anticipates this case — *"If it's a video or animated component rather than a
still, render it inside `.figure` and let the CSS crop it."* The existing Aria **is** an animated
component, so the answer is to render `AriaTalkingHead` inside `.figure` rather than an `<img>`,
with the `.fallback` label behind it for the case where the GLB fails to load — which today shows
nothing at all. Two things to weigh first, both real:

- **18 MB.** The Ask Aria surface currently loads that only on the dashboard page; the corona is
  250px, so a downscaled still would be far cheaper if the welcome state doesn't need her to move.
- **`AriaTalkingHead` renders a 120×160 box inside a 200px circle** on the live page, with
  `marginTop: -20` doing the framing. Dropping it into a 250px/148px circle will need the
  `object-position` adjustment the decision table allows — and that is the **only** CSS edit
  permitted, recorded old-and-new when it happens.

---

## PHASES 1 AND 3 — PARKED, with what they need

| phase | blocked on | unblocked by |
|---|---|---|
| **1 — re-lift** | The corrected `<style>` block does not exist. The committed file still draws the CSS face and has no `.arrow` or `.fallback`. | Committing the corrected contract to `docs/design/ask-aria-transition.html`. |
| **2 — real avatar** | Phase 1's `.figure` image slot and `.fallback` label. Research half **done** (above). | Phase 1. |
| **3 — re-baseline** | Phase 1's output. Re-baselining against the *current* file would just reproduce MS16's 0.0px. | Phase 1. |

**The existing baseline still stands and still passes.** For the record, against the contract as it
exists today, MS16's numbers are unchanged: worst delta **0.0px** across `.orbit`, `.headline`,
`.talk`, `.hero` in both states, timing strings identical. Re-running Phase 3 now would measure the
same file against itself and report 0.0px again — a true number that answers nothing, which is why
it is parked rather than performed.

The verification script is ready and unchanged:
```
npx tsx --tsconfig tsconfig.verify.json scripts/ms16-visual-verify.tsx
```

---

## DECISIONS TAKEN UNDER THE STANDING TABLE

- **"The sprint's premise is contradicted by the code"** → the code wins. Logged the contradiction,
  parked the three dependent phases, continued to the independent one.
- **"A phase's dependants are parked"** → skipped them, noted the chain, continued.
- **"No existing Aria avatar can be found → PARK the src, do not generate or draw a substitute"** →
  did exactly that, and reported where I looked.
- **"Money movement, message sending, authorisation"** → the SMS path, the proposal-execution path
  and the intervention path were audited rather than assumed, and are now protected by a rail.

## GATES

- `npx tsc --noEmit` — **0 errors** (with `--max-old-space-size`; the 4 GB default OOMs on this tree)
- `npx vitest run` — **710 passed / 710**, whole suite
- **Seven mutation checks RED**, green baseline before and after, no residue in the tree
- **Live-DB proof** of all three modes, rolled back, data confirmed unchanged
- `npx next build` — `BUILD_EXIT` recorded in the commit trailer, read from the log, never the wrapper

## WHAT IS NOT DONE

- **Phases 1, 2, 3** — parked on the corrected contract, which never arrived.
- **The avatar is still the drawn CSS placeholder**, because the contract that removes it is absent.
- **Nothing was rendered in a browser under real auth.** Co-pilot's persistence is proven at the
  database and the unit level; I did not click the control in a logged-in session.
- **`.env.local` was unreadable**, so I cannot confirm whether the Aria video URL is overridden here.
