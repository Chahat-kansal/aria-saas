# Aria OS — Prompt 14: Weekly BI Report — AI Narrative + PDF Generation
ONE task, ONE commit, ONE push. Run AFTER Prompt 13 is green.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read src/lib/reports/weekly-data.ts (Sprint 1). Read how aria_ai_calls rows
are written. Read an existing route that calls Claude. Read how PDFs are
stored in the repo (Vercel Blob pattern from aria/studio/upload or the
generate-video route). Do NOT write code before reading.

## STEP 2 — CREATE src/lib/reports/weekly-ai.ts
Export async function generateWeeklyNarrative(data: WeeklyReportData,
business: BusinessRow): Promise<WeeklyNarrative>.

Call Claude (claude-sonnet-4-5-20250929) with a structured prompt that
includes all the week's data and asks for STRICT JSON output only:
{
  "executive_summary": "3-4 sentence paragraph. Business name, total revenue,
    % vs prior week, one notable trend, one thing to watch. Australian English.
    Conversational but professional. Like a trusted advisor wrote it.",
  "revenue_insight": "1-2 sentences on the revenue pattern — which day was
    strongest, what drove it.",
  "product_insight": "1-2 sentences on the top products — what sold well,
    any surprises.",
  "promo_recommendations": [
    {
      "title": "Short promo idea name",
      "mechanic": "How the promo works — specific and actionable",
      "timing": "When to run it based on the peak time data",
      "expected_impact": "Why this will move sales — tied to the actual data",
      "urgency": "high | medium | low"
    }
  ],
  "action_recommendations": [
    {
      "title": "Short action title",
      "detail": "Specific, actionable, tied to the actual data. One paragraph.",
      "category": "staffing | stock | marketing | compliance | cash | operations",
      "priority": "high | medium | low"
    }
  ],
  "suspicious_summary": "If flagged transactions exist: one honest paragraph
    explaining what was found and what to check. If none: null."
}

Rules baked into the system prompt:
- Never invent numbers not in the data
- Promo recommendations must tie to the actual peak time data (e.g. 'your
  Wednesday 2-4pm is your quietest window — a mid-week happy hour would
  lift that slot')
- Action recommendations must be specific to THIS week's numbers, not generic
- 3 promo recommendations, 3-5 action recommendations
- Australian English, no corporate jargon
- Output JSON only, no preamble, no code fences
Log the call to aria_ai_calls (agent_key='weekly_report_narrative',
model, tokens, business_id). Return the parsed WeeklyNarrative.

## STEP 3 — CREATE src/lib/reports/weekly-pdf.ts
Export async function generateWeeklyPDF(data: WeeklyReportData,
narrative: WeeklyNarrative, business: BusinessRow,
weekStart: Date): Promise<Buffer>.

Generate a professional HTML string then convert to PDF using Puppeteer.
The HTML must be a complete, self-contained document (all CSS inline or
in a <style> block — no external stylesheets). Design to match Aria OS:
- Background: #0E1611 (dark green-black)
- Accent: #2D5240 (forest green), #7FB897 (sage)
- Text: #F5F3EC (cream)
- Font: system-ui / -apple-system (no Google Fonts in PDF — too slow)
- Fraunces for headings is unavailable in Puppeteer without a font file;
  use Georgia italic as a substitute for headings

PDF sections in order:
  1. COVER — Aria logo text, business name, "Weekly Business Report",
     week date range (e.g. "19–25 May 2026"), generated timestamp.
  2. EXECUTIVE SUMMARY — narrative.executive_summary in a prominent card.
  3. REVENUE AT A GLANCE — 7-day bar chart rendered as SVG inline.
     7 bars (Mon-Sun), height proportional to daily revenue, labelled with
     day + $amount. Highlight the highest day in sage green.
  4. PEAK TIME HEATMAP — 7 rows (Mon-Sun) x 24 columns (hours 0-23).
     Each cell coloured from transparent (zero) to #7FB897 (max) based on
     transaction count. Labels: day names on left, hour numbers on bottom
     (show 6, 9, 12, 15, 18, 21 only). This is the packed time graph.
  5. TOP PRODUCTS — two columns: Top by Revenue (left) and Top by Units (right).
     Each as a simple numbered list (rank, product name, value). Max 10 each.
  6. HERO PRODUCTS — a highlighted card for the #1 revenue product and #1
     volume product. Larger text, sage border.
  7. SUSPICIOUS TRANSACTIONS — only if data.suspicious.length > 0. A table:
     time, amount, served_by, reason. narrative.suspicious_summary below.
     If none: a green "✓ No suspicious activity detected" card.
  8. REGISTER CLOSURES — table of shifts: cashier, start-end times,
     opening float, closing float, variance. Highlight variance > $10 in amber.
  9. PAYMENT BREAKDOWN — simple horizontal bar chart (SVG) showing cash/card/
     other as % of total transactions.
  10. PROMO RECOMMENDATIONS — 3 cards, each with title, mechanic, timing,
      expected impact. Sage background cards.
  11. ARIA'S RECOMMENDATIONS — numbered list of action items with priority
      badges (high=red, medium=amber, low=grey).
  12. FOOTER — "Generated by Aria OS · ariaos.site · Confidential"

Puppeteer usage:
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.launch({ args: ['--no-sandbox',
    '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const pdf = await page.pdf({ format: 'A4', printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } })
  await browser.close()
  return Buffer.from(pdf)

Add puppeteer to dependencies: npm install puppeteer (commit lockfile).

## STEP 4 — CREATE src/app/api/reports/weekly-generate/route.ts
A POST route (auth: Supabase session, user owns the business). Body:
{ business_id, week_start? }. Calls gatherWeeklyData, generateWeeklyNarrative,
generateWeeklyPDF in sequence. Uploads the PDF to Vercel Blob
('aria-reports/weekly-<businessId>-<weekStart>.pdf'). Returns { pdf_url }.
This route is used both by the cron (Sprint 3) and optionally by a manual
"generate now" button on the dashboard.
export const maxDuration = 120 (PDF generation can take 30-60s).

## STEP 5 — UPDATE src/lib/reports/weekly-cron.ts (from Sprint 1)
Replace the "would generate report" placeholder with a real call to the
/api/reports/weekly-generate route. Call it internally (supabaseAdmin fetch
or direct function import — avoid the HTTP overhead if possible by importing
the generation functions directly).

## CONSTRAINTS
- No backtick template literals in className/style
- All SVG charts must be self-contained inline SVG — no charting libraries
- All money: (Number(x)||0).toFixed(2), dollars not cents
- Do not create or alter DB tables
- Puppeteer: always close the browser in a finally block to prevent leaks

## STEP 6 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(weekly-report): Sprint 2 — AI narrative generation (exec summary, promo recommendations, action recommendations), beautiful A4 PDF with inline SVG bar chart + peak time heatmap + hero products + suspicious transactions + register closures
