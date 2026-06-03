# FUTURE IDEAS — Pre-Launch Backlog
Ideas researched and validated but deliberately deferred until after soft launch.
Do not build these yet. Revisit after first 10 paying customers.

---

## 1. @ariaos.au Instagram — AI-Powered Case Study Page

**The idea:**
Create a dedicated AriaOS Instagram page that auto-generates weekly case study posts
from real business data. Each post showcases what Aria did for a customer that week:
"How a Brunswick café cut waste by 23% and boosted Friday revenue using AI."
The featured business gets tagged → their followers discover AriaOS → other business
owners sign up.

**Why it works:**
- Zero ad spend — organic growth via cross-tagging
- Content is auto-generated from real POS/agent data already in Aria
- Target audience (SMB owners) trusts peer success stories over ads
- Best campaigns generate $20 per $1 invested (influencer marketing benchmarks)
- 75% of Time Out readers take action after seeing editorial content — same trust dynamic

**Content that works (from research):**
- "This week's top performer" — one business, one result, one number
- "The 6am briefing" — anonymised daily briefing data as a series
- "Aria caught this" — supplier overcharge, waste pattern, cash flow risk spotted
- Carousels work best for B2B SaaS: educational, saveable, shareable
- Reels of actual dashboard UI in action (no talking head needed)

**How to grow followers in Australia:**
1. Cross-tag every featured business → they share to their followers
2. Partner with `@australiansmallbusiness`, `@supportausmade` community pages for reposts
3. Post identical content to LinkedIn simultaneously (10x B2B reach)
4. Run one nano-influencer collab (AU$39–$393/post) with a local foodie/biz creator
5. Tag @broadsheet and @timeoutaustralia when featuring hospitality businesses
6. Collab posts with Aria customers who have their own following

**The critical distinction:**
Do NOT make this a consumer discovery page ("find cafes near you").
Make it a B2B case study page ("see what AI did for this business").
Audience = other small business owners, not café-goers.

**Infrastructure already built:**
- Meta Graph API live mode ✅
- Social content generation from POS data ✅
- Aria Studio image generation ✅
- ClickSend SMS for outreach ✅
- Missing: @ariaos.au account setup + case-study post template

**What needs to be built:**
- New post template: "This week at [Business] — powered by Aria" format
- Owner consent flow: opt-in to be featured on AriaOS page
- Auto-generate from: council briefing results + waste savings + revenue delta + review count
- Post to @ariaos.au AND tag the business's own page simultaneously

**When to start:**
After 5+ paying customers with real data and permission to share results publicly.
Start manually (1 post/week, written by hand) to validate engagement before automating.

**Estimated time to build (once validated):** 2–3 days of Claude Code work.
Social post template: 4 hours. Consent flow: 2 hours. Auto-generate pipeline: 1 day.

**Estimated follower growth timeline (AU market):**
- Month 1: 50–200 (cross-tags only)
- Month 3: 500–1,500 (with nano-influencer + community page reposts)
- Month 6: 2,000–8,000 (if one post goes moderately viral via Reels)
- Meaningful customer acquisition impact: ~Month 4 onwards

---

## 2. Referral Program — "Bring a Friend" for Aria customers

**The idea:**
Existing Aria customers refer other business owners. Both get a reward (1 month free,
discount, or credit). Tracked via unique referral codes. Auto-SMS'd to customers
who reach Champion tier in the loyalty module.

**Why it works:**
- Referred customers cost $23.12 less to acquire than non-referred (research-backed)
- 92% of consumers trust peer recommendations over ads (Nielsen)
- All infrastructure exists: loyalty module + ClickSend + POS + coupon system
- Zero external tool needed — build natively in Aria

**What needs to be built:**
- Unique referral code generation per Aria account
- Referral tracking: when a new business signs up with a code, credit the referrer
- SMS trigger: after 3rd month of active use, send "Know another business owner? Share YOURCODE"
- Dashboard: "Your referrals — 2 signed up, 1 month earned"

**When to start:** After first 10 paying customers.

---

## 3. GBP API — Reapply with stronger use case

**The idea:**
Google Business Profile API enables Aria to auto-post weekly updates to the business's
Google Maps listing, respond to reviews, and pull performance metrics (calls, directions,
website clicks). This is the highest-ROI customer acquisition lever for local businesses
(32% of local ranking power from GBP activity).

**Why it was rejected:**
Most likely: submitted from manager-level account instead of GBP owner account,
OR unclear use case description. GBP must also be 60+ days old.

**Reapply with:**
"We manage GBP post publishing, review monitoring, and performance analytics
for Australian small businesses via a multi-tenant SaaS platform. Each user
connects their own verified GBP account via OAuth 2.0. Use cases: weekly post
publishing (LocalPosts API), review response drafting (Reviews API), and performance
dashboard (Business Profile Performance API)."

**Infrastructure needed:** OAuth 2.0 per-user GBP connection, LocalPosts API, Reviews API.
**Estimated build time once approved:** 3 days.
**When to reapply:** Any time — doesn't need customer traction first.

---

## 4. Broadsheet / Time Out Editorial Pitch Generator

**The idea:**
Aria drafts a personalised editorial pitch to Broadsheet or Time Out editors
on behalf of the business, based on real data: "Sip Cafe Brunswick has served
12,000 acai bowls this year with a 4.9★ Google rating and was Brunswick's
fastest-growing café in 2025." One tap → pitch email drafted → owner sends it.

**Why it works:**
- Broadsheet: 3M visits/month, 100% Australian audience, editorial trust
- Time Out: 75% of readers take action after seeing content
- Cannot be bought — must be earned with a good story
- Aria has the data to make the story compelling

**When to start:** After soft launch. Requires real customer data for credibility.

---

*Last updated: June 2026*
*Researched and written based on live data from CPA Australia, COSBOA, NFIB,*
*Intuit QuickBooks SMB Survey, BrightLocal, Sprout Social, ClickSend AU stats.*
