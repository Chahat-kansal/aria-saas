# COMMS CONSENT AUDIT — SMS

**MEGA-SPRINT 7 PHASE 4. Diagnose only — no fix written by this document or its commit.**

Written 2026-08-19 against `05561d55`. Every figure re-run through Supabase MCP; every path read
from source. The sprint brief's live-DB facts are treated as a report and were re-verified — **one
of them is misleading and is corrected below.**

---

## THE ANSWER

The brief asked which of three is true: **(a)** the gate runs but never records, **(b)** some paths
bypass it, or **(c)** all 48 are transactional and consent doesn't apply.

**None of them. The gate runs, records correctly, and has refused 25 marketing sends.**

| category | status | `consent_ok` | `suppressed` | rows |
|---|---|---|---|---|
| **marketing** | **skipped** | **`false`** | false | **25** |
| transactional | sent | `null` | false | 19 |
| transactional | failed | `null` | false | 4 |
| | | | | **48** |

`consent_ok` is `true` on zero rows — the brief's figure is accurate — but that is not the absence
of a gate. It is `false` on 25, meaning **the gate evaluated consent and refused the send**, and
`null` on the 23 transactional rows because transactional is exempt by design and the gate never
evaluates consent for them (`clicksend.ts`: `consentOk` is only assigned inside
`if (category === 'marketing')`).

**`suppressed` is false everywhere because `sms_suppression` is empty.** Nothing has ever been
suppressed because nobody has ever opted out — there is nothing to opt out of when no marketing
message has been delivered.

### So: has any marketing SMS ever reached a customer?

**No. Not one.** All 25 marketing attempts were refused at the gate. 49 customers have a phone;
**1** has `sms_consent = true`, and that customer was not among the 25 targets.

**There is no compliance exposure to remediate**, and therefore nothing was parked as URGENT. This
is the rail working exactly as designed — the system has been refusing to send marketing SMS
without consent since 22 June, silently and correctly.

---

## PER-PATH TABLE

Every SMS in the application goes through one function: `sendSMS()` in `src/lib/clicksend.ts`,
imported by **45 files**. The four properties the brief asked about are therefore not per-path —
they are properties of the rail, and they hold for every caller:

| property | where | holds? |
|---|---|---|
| checks consent before sending | `clicksend.ts` — `sms_consent` via `customerId`, else by normalised phone | ✅ marketing only |
| writes `consent_ok` | `logSend()`, on **every** branch (sent / skipped / failed) | ✅ |
| honours suppression | `sms_suppression` lookup, scoped by business | ✅ marketing only |
| appends an opt-out | `STOP_NOTICE` — "Reply STOP to opt out." appended unless already present | ✅ marketing only |

**What varies per caller is the `category` argument**, which decides whether any of the above
applies. 36 call sites pass `category: 'marketing'`; 26 rely on the default (`transactional`).

### Marketing (consent-gated) — 36 call sites

Loyalty lifecycle & birthday · winback (3 entry points: single, bulk, launch) · CLV agent + its
send route · flash-revenue agent · reputation-defence agent + review-request routes · NPS ·
marketing campaigns + scheduled-campaign cron · message-agent · community digest · auto-review ·
daily-briefing · WhatsApp enrol.

These are correctly classified. Every one is a promotional or re-engagement message to a customer.

### Transactional (exempt) — 26 call sites

OTP / auth (`cx/[slug]/auth`, `loyalty/auth`) · order-ready (`notify-ready`, `place-order`) ·
KDS ticket updates · receipts & split receipts · booking reminders · invoice send + reminders ·
staff messages, roster publish, leave decisions · monitoring and system alerts.

These are correctly classified too: an order-ready SMS, an OTP, a receipt and a staff roster
notification are all service messages to someone who asked for them or works there.

### ⚠️ Ambiguous — classified as MARKETING, the safer error

Per the decision table, anything genuinely ambiguous is called marketing. Two are worth naming:

- **`aria/daily-briefing`** and **`community/digest`** — these go to a customer, on a schedule, with
  content the customer did not individually request. Both already pass `category: 'marketing'`, so
  they are gated. Recorded here because a future reader might reasonably think a "digest" is
  transactional; it is not.
- **`reviews/auto-request` / `aria/review-request`** — a review request follows a real transaction,
  which makes it *feel* transactional. It is a solicitation. Already `marketing`. Correct.

**No path is misclassified.** The one I would watch is `notify-ready` (order is ready) — genuinely
transactional, but if its copy ever gains a promotional line it becomes marketing without the
category changing.

---

## BYPASS CHECK

**No SMS path bypasses `sendSMS`.** Searched `src/` for direct calls to `rest.clicksend.com` /
`api.clicksend`:

- **1 hit**, and it is legitimate: `src/lib/whatsapp.ts:28` is the *WhatsApp* provider call, and it
  sits **inside** `sendWhatsApp()` — WhatsApp's own chokepoint, which mirrors the SMS guardrails
  (per-member `whatsapp_consent`, shared `sms_suppression` opt-out list, and its own
  `loyalty_whatsapp_log` audit table). That is a second rail, not a hole in the first.

This is the property the CX digest bug broke on the email side — a raw `fetch` around `sendEmail()`
meant no unsubscribe and no suppression check ever ran. **The equivalent does not exist here.**

---

## WHAT IS ACTUALLY MISSING

The rail exists and works. Two gaps, both real:

1. **Nothing stops the next bypass.** There is no guard preventing a new direct ClickSend call from
   being added, which is exactly how the email rail was bypassed. This repo's own measured lesson is
   that adoption stalls at 9–15% without enforcement. → **Phase 5.**
2. **The Sender ID is global, not per-business.** `process.env.CLICKSEND_SENDER_ID` is read once in
   `clicksend.ts`, and when unset the `from` field is omitted entirely so ClickSend falls back to a
   shared number. ACMA Sender ID Register enforcement began **1 July 2026** — SMS on an unregistered
   Sender ID displays to recipients as "Unverified". → **Phase 6.**

---

## FIGURES, FOR RE-CHECKING

```
sms_send_log            48 rows   (25 marketing/skipped/consent_ok=false, 19 txn/sent, 4 txn/failed)
sms_suppression          0 rows
email_send_log          18 rows   (7 with consent_ok)
pos_customers           49 with a phone, 1 with sms_consent=true, 2 with marketing_consent
marketing SMS delivered  0
```
