# Prompt 60 — Landing Page: Full Pro Marketing Page

## Why this is the highest priority
The landing page is currently 1KB — basically empty.
It is the first thing any potential customer sees at ariaos.site.
No one pays $297/month for a product with an empty homepage.
This single page determines whether Aria OS gets customers.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/page.tsx` — full read (current state)
2. `cat src/app/pricing/page.tsx` — full read (pricing already built — do not duplicate)
3. `cat src/app/signup/page.tsx` — understand signup flow
4. `cat src/app/globals.css` OR check what fonts/colours are globally defined
5. Check what images/assets exist: `ls public/` — what logos, screenshots exist?
6. Check: does `/public/aria-logo.svg` or similar exist?

## What to build — complete marketing landing page at `src/app/page.tsx`

### Design language
- Background: `#0a0a0f` — near black
- Primary green: `#7FB897` (Aria green)
- Dark green: `#2D5240`
- Text primary: `#ffffff`
- Text secondary: `rgba(255,255,255,0.6)`
- Accent: subtle green glow effects
- Font: Inter for body, system font stack
- No Tailwind classes — inline styles only (consistent with rest of app)
- Mobile responsive — works on phone browsers
- No external image dependencies — use SVG icons and CSS gradients

### Sections (top to bottom)

---

#### 1. NAV BAR (sticky)
```
ariaOS          Features  Pricing  Login     [Start free trial →]
```
- Logo: `aria` in white + `OS` in #7FB897
- Links: Features (scroll), Pricing (scroll to pricing section or /pricing), Login (/login)
- CTA button: dark green background, "Start free trial →" → /signup
- Sticky top, blur background on scroll
- Mobile: hamburger menu

---

#### 2. HERO SECTION
Big, bold, immediate value statement.

Headline (large, white, ~56px):
**"Your AI business co-operator. Built for Australian small business."**

Subheadline (~20px, rgba(255,255,255,0.7)):
"Aria runs your daily briefing, monitors competitors, manages stock alerts, and tells you exactly what to do — before problems become expensive."

Two CTAs:
- Primary: "Start 14-day free trial" → /signup (green button)
- Secondary: "See how it works ↓" (scroll to features, ghost button)

Below CTAs: trust signals in one line:
`🔒 No credit card required  ·  Cancel anytime  ·  Australian-built  ·  GDPR compliant`

Visual: Dark glass card showing a mock of the Aria briefing card — the actual briefing text style with green accent. Shows:
```
ARIA BRIEFING  ·  Council · strategic · Wed, 27 May
Revenue is critically low at $188 this week...
[metric cards: $188 today | $1,120 week | 3 low stock | 19 Crimes top]
```
This is pure HTML/CSS — not a screenshot. Recreate the card UI in code.

---

#### 3. SOCIAL PROOF BAR
Thin bar below hero:
`"Trusted by Australian retailers, cafés, and liquor stores"`
Logos row: placeholder text logos for now — "Sip Café" | "Independent Liquor" | "Local Retail" etc in muted style

---

#### 4. PROBLEM SECTION
"Running a small business is hard. Your current tools make it harder."

3 pain point cards:
- 📊 "You check 6 different apps for sales, stock, reviews, and staff"
- ⏰ "You find out about problems after they've already cost you money"
- 🤔 "Your accountant tells you what happened last month. Nobody tells you what to do today."

---

#### 5. SOLUTION SECTION — "Meet Aria"
"One AI that knows your entire business"

Feature grid (2 columns, 3 rows = 6 features):

| Feature | Icon | Description |
|---------|------|-------------|
| Daily Briefing | 📋 | Every morning, Aria analyses your sales, stock, customers and competitors — then tells you exactly what needs attention today |
| Ask Aria | 💬 | Ask anything about your business. Get specific, data-backed answers — not generic advice |
| POS System | 🖥️ | Full point-of-sale built in. Sales, inventory, loyalty, receipts — all feeding Aria's brain automatically |
| Competitor Intelligence | 👁️ | Aria monitors nearby competitors daily — prices, promotions, reviews — and alerts you to opportunities |
| Smart Alerts | 🔔 | Low stock, revenue drops, lapsed customers, compliance expiries — Aria spots them before they cost you |
| Weekly Report | 📈 | Every Monday, a full business intelligence report lands in your inbox. No spreadsheets needed |

Each card: dark glass surface, green icon, title, 2-line description.

---

#### 6. HOW IT WORKS
"Up and running in 10 minutes"

3 numbered steps:
1. **Connect your business** — Enter your details, industry, and address. Aria sets up your dashboard instantly.
2. **Aria learns your business** — Connect your POS, suppliers, and integrations. Aria starts analysing immediately.
3. **Get your first briefing** — Tomorrow morning, your first Aria briefing arrives. It already knows what to focus on.

---

#### 7. FEATURE DEEP DIVE — POS
"The only POS that gets smarter every day"

Split layout: left = feature list, right = mock POS terminal card

Features:
- ✅ Barcode scanning + product search
- ✅ Cash, card, split payments
- ✅ Loyalty points built in
- ✅ Age verification for liquor
- ✅ Receipt email + print
- ✅ Real-time stock updates
- ✅ Offline mode

Right side: dark glass card showing mock POS — cart with items, total, payment buttons. CSS only.

---

#### 8. INDUSTRIES
"Built for Australian retail and hospitality"

4 industry cards with icon + name + 3 specific features:
- 🍷 **Liquor stores** — RSA compliance, age verification, ALM/ILG supplier orders
- ☕ **Cafés** — Table management, modifiers, KDS, recipe costing
- 🛒 **Retail** — Barcode scanning, stocktake, promotions, supplier orders
- 🏪 **Any small business** — Customisable for your industry

---

#### 9. PRICING SECTION (abbreviated — link to /pricing for full)
"Simple, transparent pricing"

3 plan cards:
- Starter: $297/mo — Core AI + POS + Dashboard
- Growth: $597/mo — Everything + advanced AI + integrations
- Pro: $997/mo — Full platform + warehouse + custom features

"All plans include 14-day free trial. No credit card required."
CTA: "See full pricing →" → /pricing

---

#### 10. TRUST / SECURITY SECTION
"Your data is safe with Aria"

4 trust badges in a row:
- 🔒 Bank-level encryption
- 🇦🇺 Australian-built and hosted
- 📋 GDPR compliant
- 🛡️ SOC 2 ready

Short paragraph: "Aria uses Supabase PostgreSQL with row-level security. Your business data never trains AI models. You own your data — always."

---

#### 11. FAQ
5 questions:
1. Do I need to replace my existing POS? — No. Connect your existing Square or Lightspeed and Aria adds the AI layer on top.
2. How long does setup take? — 10 minutes. Enter your business details and Aria starts your first briefing tonight.
3. Is my data safe? — Yes. Bank-level encryption, Australian data residency, and your data never trains AI models.
4. Can I cancel anytime? — Yes. No lock-in contracts. Cancel from your settings page anytime.
5. Does it work for my industry? — Aria supports retail, liquor, cafés, restaurants, and any small business. More industries coming.

Accordion style — click to expand.

---

#### 12. FINAL CTA
Full-width dark section:
"Ready to give your business an AI co-operator?"
"Start your 14-day free trial today. No credit card required."
[Start free trial →] button — large, green

---

#### 13. FOOTER
```
ariaOS                          Product        Company        Legal
AI for Australian business      Features       About          Terms
                                Pricing        Contact        Privacy
                                Integrations   Blog
© 2026 Aria OS. Built in Australia.
```

## Technical rules
- Single file: `src/app/page.tsx` — client component (`'use client'`)
- No new npm packages
- No Tailwind — inline styles only
- All animations: CSS keyframes only (fade in on scroll using Intersection Observer)
- Mobile breakpoint: 768px — stack all grids to single column
- Images: SVG inline or CSS gradients only — no external image URLs
- All links: Next.js `<Link>` component
- Smooth scroll for anchor links
- Page must load fast — no heavy dependencies

## Quality bar
Must feel as polished as Linear.app, Vercel.com, or Resend.com landing pages.
Dark, minimal, confident. Not startup-generic. Not cluttered.
Every section earns its place — if it doesn't convert, it doesn't belong.

## Execution order
1. Read ALL pre-edit files
2. Write complete `src/app/page.tsx` — no stubs, every section complete
3. `npx tsc --noEmit` — zero errors
4. `npm run build` — must pass
5. `git add src/app/page.tsx && git commit -m "feat: landing page — full pro marketing page, 13 sections, mobile responsive" && git push`
