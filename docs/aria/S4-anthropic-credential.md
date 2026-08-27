# S4 PHASE 3 — the Anthropic credential: what is knowable from here

**No key, and no fragment of one, appears in this document or was read at any point.**
That constraint shaped the method: see *What I deliberately did not do*.

---

## WHAT THE CODEBASE DETERMINES WITH CERTAINTY

### One variable name. There is no second candidate.
```
ANTHROPIC_API_KEY     198 reads across 162 files
```
Every Anthropic-related `process.env.*` read in `src/` resolves to that one name. The only other
AI-ish credential name in the tree is `STABILITY_AI_KEY`, which is image generation and unrelated.

**This closes one hypothesis outright:** the code is *not* reading some other variable by mistake.
If the calls are authenticating as the wrong account, it is because that variable holds the wrong
value in whichever environment served the request — not because the code looked in the wrong place.

### The key is captured at cold start and cached for the instance's life — **this is the important one**
`src/lib/aria/providers/anthropic.ts:9`
```ts
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 35_000,
  maxRetries: 0,
})
```
This is **module scope**. The SDK client is constructed once per lambda instance, when that instance
cold-starts, and every later call reuses it.

**Consequence: updating the variable in Vercel does not take effect on already-warm instances.**
A change is picked up by a new deployment, or when the existing instances are recycled — not when
you press save. If the key has already been corrected, some traffic can still be authenticating with
the old one, and it will look exactly like "the fix didn't work".

**And the two call paths can disagree**, which is worth knowing before interpreting any test:
| path | client | picks up a changed key |
|---|---|---|
| `providers/anthropic.ts:9` | module scope, cached | only after redeploy / instance recycle |
| `model-router.ts:180` | built per call | on the next request |

So the router path can start succeeding while the provider path keeps failing, from the same
deployment, at the same moment. **A redeploy is the only way to get both onto the same credential.**

### What happens when it fails
`providers/anthropic.ts` records the failure to a circuit breaker (`recordAnthropicFailure`) and
falls back to Gemini (`callGemini`, `:69`). That fallback is why the product stays *apparently*
alive while every Anthropic call is rejected — and it is the third instance of this sprint's theme:
a failure that reports success. The circuit breaker is real and does trip; the owner-visible surface
does not say which brain answered.

---

## WHAT I DELIBERATELY DID NOT DO

**I did not list the Vercel environment variables.** The Vercel MCP surface available here has no
name-only environment listing; the general project endpoint can return environment entries, and the
sprint's rule is absolute — *never print a key, a fragment of one, or anything that could reconstruct
it*. Fishing through a response that may contain credential material to satisfy a reporting line is
not worth the risk, and the founder can read the same screen in ten seconds with no risk at all.

**So this is NOT determined here, and must be checked by a human:**
- whether `ANTHROPIC_API_KEY` is set in Development, Preview and Production;
- whether those three values differ from each other;
- which of them the failing deployment actually used.

**I did not add, rotate, or change any environment variable.** That is on the NEVER-UNATTENDED list.

---

## WHAT THE FOUNDER MUST CHECK — in this order

The failure message is *"Your credit balance is too low to access the Anthropic API."* That message
is emitted **per-workspace and per-organisation**, so a topped-up balance and a rejected call are not
a contradiction. Three things produce it:

1. **Wrong organisation.** The key belongs to a different Anthropic org than the one that was topped
   up. → Anthropic Console → **Settings → Organization**. Confirm the org that shows the credit is
   the org the key was created under.

2. **Workspace spend limit.** Keys live in a *workspace*; a workspace can have its own monthly limit
   independent of the org balance. A workspace at its cap returns this exact message while the org
   shows funds. → **Settings → Workspaces** → the workspace this key belongs to → **Spend limit**.
   This is the most commonly missed one.

3. **The balance genuinely is low**, or auto-reload has not fired. → **Settings → Billing** → check
   the current credit balance and whether the top-up landed on *this* org.

### What distinguishes "wrong key" from "low balance"

| observation | means |
|---|---|
| Console shows credit on the org, calls still rejected | the key is not in that org, **or** a workspace spend limit is capping it — (1) or (2) |
| Console shows the org at/near zero | (3) — the top-up went elsewhere or has not applied |
| Calls succeed after a **redeploy** with no key change | the old key was cached at module scope — the key was already fixed, the instances were stale |
| A brand-new key from the funded workspace works immediately | the previous key belonged to a different org/workspace — (1) |

**Test it cheaply:** create a fresh key inside the workspace that shows the credit, set it in
Production, and **redeploy** (do not just save — see the caching note above). If calls succeed, it
was (1) or (2). If they still fail, it is (3).

---

## THE TWO FLAGS THE SPRINT ASKED ME TO RE-CHECK

**Twilio — the code is clean; I could not check the Vercel variables.**
Eight files match `twilio`, and every one is a **column name**, not a call:
`aria/winback/route.ts:77,123` write `twilio_sid`, and the actual sender in those same files is
`sendSMS()` from `lib/clicksend.ts` (2–3 call sites each). There is **no Twilio SDK, no Twilio
endpoint, and no Twilio credential read anywhere in `src/`** — `process.env.TWILIO*` appears zero
times. The ClickSend-only rule is being honoured by the code; what survives is a legacy column name
storing ClickSend's `message_id`.

Whether Twilio **credentials remain set in Vercel** is exactly the environment-listing question I
declined above. If they are, they are unused by this codebase — dead credentials, worth revoking on
principle, not a live send path.

**"Two env vars named as their own secrets"** — not reproducible from the codebase. Every
`process.env.*` name in `src/` is an ordinary uppercase identifier; nothing reads a variable whose
*name* is a credential. If this refers to entries in the Vercel dashboard, it is the same
environment-listing question and needs the founder's eyes.

---

## THE ONE-LINE SUMMARY

The code can only be reading `ANTHROPIC_API_KEY`, and it caches whatever that held **at cold start**.
So the two things to establish are which Anthropic *org/workspace* that value belongs to, and whether
the running instances have been recycled since it last changed — and **a redeploy is what settles
the second one**.
