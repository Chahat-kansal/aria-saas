# Aria Demo Video Script — 60 seconds

**Format:** 1080p 60fps · Audio: clean voiceover · Target: <30MB (ffmpeg -crf 28 -preset slow)

---

## Scene 1 — Hook (0:00–0:10)

**Screen:** Dashboard with live metrics, agents status bar showing all green
**VO:** "Other POS systems show you data. Aria *runs* your shop."
**Beat:** Cut on "runs"

---

## Scene 2 — Setup (0:10–0:25)

**Screen:** Onboarding wizard fast-cut — business name → products → first sale
**VO:** "60 seconds from sign-up to selling."
**Beat:** Time-lapse effect, show progress bar completing

---

## Scene 3 — Reorder Agent (0:25–0:45)

**Screen:** /pos/agents/reorder — pending PO from Aria, tap Approve, email confirmation
**VO:** "It's 6am. Aria already drafted your purchase orders. You approve in one tap — PO goes straight to your supplier."
**Beat:** Show the green "Approve & Send" button, then email confirmation toast

---

## Scene 4 — Conversation Reports (0:45–1:05)

**Screen:** /pos/ask — type "Friday afternoon vs last 4 Fridays" — Aria streams response + chart appears on right
**VO:** "Ask anything in plain English. Aria pulls the data, shows you a chart, tells you what it means."
**Beat:** Show the streaming text + chart rendering in the right panel

---

## Scene 5 — Migration (1:05–1:25)

**Screen:** /pos/setup/migrate/shopfront — upload CSV → auto field mapping (Aria detected) → progress bar → 847 products done
**VO:** "Bring your whole business across in 5 minutes. Aria maps your Shopfront fields automatically."
**Beat:** Show the "✨ Aria detected your column structure" banner

---

## Scene 6 — Pricing + Close (1:25–1:50)

**Screen:** /pricing page — three tier cards
**VO:** "Starter $59. Growth $129. Autonomous $249. 14-day free trial. No credit card."
**Screen:** Fades to Aria logo + ariaos.site
**VO:** "Aria. Your shop, on autopilot."

---

## Recording instructions

1. **Tool:** Loom (easier) or OBS (more control). Set 1920×1080 60fps.
2. **Prep:** Create a demo business with realistic product catalogue (50+ products), some sales history, and one pending reorder decision.
3. **Audio:** Record voiceover separately in a quiet room. Normalise to -16 LUFS (Audacity or Descript).
4. **Export:** MP4 H.264. Use `ffmpeg -i raw.mp4 -vcodec libx264 -crf 28 -preset slow aria-demo-60s.mp4` to compress.
5. **Poster:** `ffmpeg -i aria-demo-60s.mp4 -vframes 1 -q:v 2 aria-demo-poster.jpg` for the first frame.
6. **Save to:** `/public/videos/aria-demo-60s.mp4` and `/public/videos/aria-demo-poster.jpg`.
