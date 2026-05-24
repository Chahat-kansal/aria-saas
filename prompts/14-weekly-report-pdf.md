# Aria OS — Prompt 14: Weekly BI Report — Sprint 2: Aria Council Narrative + PDF
ONE task, ONE commit, ONE push. Run AFTER Prompt 13 is green.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```
Confirm Prompt 13 (data layer) is deployed green.
Confirm src/lib/aria/council.ts exists (Prompt 19).

## STEP 1 — READ BEFORE WRITING
Read src/lib/reports/weekly-data.ts (Sprint 1 — understand WeeklyReportData
shape fully). Read src/lib/aria/council.ts (the Aria Council — you will call
runAriaCouncil here). Read how aria_ai_calls rows are written. Read how PDFs
are stored in the repo (Vercel Blob pattern from aria/studio/upload or the
generate-video route). Do NOT write code before reading.

## STEP 2 — CREATE src/lib/reports/weekly-ai.ts

### THE ARIA COUNCIL FOR THE WEEKLY REPORT
This is the strategic core. Call runAriaCouncil with the week's data.
The three brains receive a full, data-rich context and argue:
- Optimist: what went well, what to double down on, promo opportunities
- Critic: what went wrong, suspicious patterns, risks, what to fix
- Strategist: whole-picture trajectory, what matters most this week

Export: async function generateWeeklyNarrative(
  data: WeeklyReportData,
  business: BusinessRow
): Promise<WeeklyNarrative>

Build a rich context string (businessContext) from WeeklyReportData:
  Business: [trading_name], [industry], [city]
  Week: [weekStart] to [weekEnd]
  Revenue: $[total] ([+/-X%] vs prior week)
  Transactions: [count], avg basket $[avg]
  Best day: [day] $[revenue], Worst day: [day] $[revenue]
  Top products by revenue: [name $X, name $X, ...]
  Top products by volume: [name Nunits, ...]
  Peak hours: [day] [hour]:00 is busiest ([N] transactions)
  Payment split: cash [X%], card [Y%], other [Z%]
  Suspicious flags: [count] ([types])
  Register closures: [N] shifts, max variance $[X]
  Estimated gross margin: [X%] or "not enough cost data"

Then call:
  const council = await runAriaCouncil(businessContext, business.id, 'weekly_report')

FROM THE COUNCIL, extract:
- council.final_briefing → executive_summary (shown on the PDF cover)
- council.consensus → high_confidence_insights (shown as ✓ items)
- council.contested → split_decisions (shown as ⚡ items on the PDF)
- council.raw_brain_outputs → stored in council_runs for training

THEN make a SECOND targeted AI call (claude-sonnet-4-5-20250929 directly,
NOT the council — this is generative creative work, not analysis):
- Promo recommendations: send the peak time data + top products + revenue
  pattern to Sonnet and ask for 3 specific promo ideas tied to actual
  peak/trough data. Output STRICT JSON:
  [{ title, mechanic, timing, expected_impact, urgency }]
- This is separate from the council because promos need imagination, not
  adversarial debate. Log to aria_ai_calls (agent_key='weekly_promos').

Return WeeklyNarrative:
{
  executive_summary: string          // from council.final_briefing
  high_confidence_insights: string[] // from council.consensus
  split_decisions: Array<{topic, optimist_view, critic_view, strategist_view}>
  promo_recommendations: Array<{title, mechanic, timing, expected_impact, urgency}>
  suspicious_summary: string | null  // one paragraph if flags exist, null if not
  council_meta: council.meta         // stored for monitoring
}

Log the council run to council_runs table (use supabaseAdmin insert,
fire-and-forget, wrapped in try/catch so a log failure never breaks the PDF).

## STEP 3 — CREATE src/lib/reports/weekly-pdf.ts
Export: async function generateWeeklyPDF(
  data: WeeklyReportData, narrative: WeeklyNarrative,
  business: BusinessRow, weekStart: Date
): Promise<Buffer>

Generate a professional HTML string then convert to PDF using Puppeteer.
All CSS inline or in a <style> block — no external stylesheets.

Design (Aria OS brand):
- Background: #0E1611, Accent: #2D5240 / #7FB897, Text: #F5F3EC
- Font: system-ui / -apple-system (no Google Fonts — too slow in Puppeteer)
- Georgia italic as a substitute for Fraunces in headings

PDF sections in order:
1. COVER — Aria logo text, business name, "Weekly Business Report",
   week range (e.g. "19–25 May 2026"), generated timestamp.

2. EXECUTIVE SUMMARY — narrative.executive_summary in a prominent card.
   Below it: high_confidence_insights as ✓ items (sage green),
   split_decisions as ⚡ items with all three views (amber).

3. REVENUE AT A GLANCE — 7-day bar chart as inline SVG.
   7 bars (Mon-Sun), height proportional to daily revenue. Label each bar
   with day abbreviation + $amount. Highlight highest day in sage green.
   Show a dotted prior-week line for comparison.

4. PEAK TIME HEATMAP — 7 rows (Mon-Sun) × 24 columns (hours 0-23).
   Cell colour: transparent (zero) to #7FB897 (max) based on transaction
   count. Left labels: day names. Bottom labels: hours 6,9,12,15,18,21.
   Title: "When your customers come in".

5. TOP PRODUCTS — two columns: Top by Revenue (left) + Top by Units
   (right). Numbered list, max 10 each. Product name + value.

6. HERO PRODUCTS — highlighted card for #1 revenue product and #1 volume
   product. Larger text, sage border. "Your best performers this week."

7. PROMO RECOMMENDATIONS — 3 cards from narrative.promo_recommendations.
   Each: title, mechanic, timing (tied to the peak time data), expected
   impact. Sage background cards. Title: "Aria's promotions to try."

8. SUSPICIOUS TRANSACTIONS — only if data.suspicious.length > 0.
   Table: time, amount, served_by, reason, explanation.
   narrative.suspicious_summary paragraph below.
   If none: a green "✓ No suspicious activity detected this week" card.

9. REGISTER CLOSURES — table of shifts: cashier, start-end, opening float,
   closing float, variance. Highlight variance > $10 in amber.

10. PAYMENT BREAKDOWN — horizontal bar chart (SVG) showing cash/card/other
    as % of total transactions.

11. ARIA'S RECOMMENDATIONS — numbered list: the council's action items
    from high_confidence_insights + split_decisions, formatted as clear
    next steps. Priority high=red badge, medium=amber, low=grey.

12. FOOTER — "Generated by Aria OS · ariaos.site · Confidential"

Puppeteer usage (always close browser in finally):
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()   // always runs even on error
  }

npm install puppeteer — commit the lockfile with this sprint.

## STEP 4 — CREATE src/app/api/reports/weekly-generate/route.ts
POST route. Auth: Supabase session, user owns the business. Body: {
business_id, week_start? }. maxDuration = 120.
- Call gatherWeeklyData (import from Sprint 1).
- Call generateWeeklyNarrative (council + promos).
- Call generateWeeklyPDF.
- Upload PDF to Vercel Blob: 'aria-reports/weekly-[businessId]-[weekStart].pdf'
- Return { pdf_url, executive_summary, suspicious_count }.

## STEP 5 — UPDATE src/lib/reports/weekly-cron.ts (Sprint 1 placeholder)
Replace the "log and return" placeholder with a real call:
  Import gatherWeeklyData, generateWeeklyNarrative, generateWeeklyPDF
  and the email sending helper (all in-process — no HTTP overhead).
  After PDF is generated and uploaded: store pdf_url and log.
  Email sending is Sprint 3 (Prompt 15) — for now, just log the pdf_url.

## CONSTRAINTS
- All SVG charts must be self-contained inline SVG — no charting libraries
- All amounts: (Number(x)||0).toFixed(2), dollars not cents
- pos_sale_items has NO business_id — join through pos_sales
- Puppeteer: always close browser in finally block — never leak it
- Do not create or alter DB tables

## STEP 6 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(weekly-report): Sprint 2 — Aria Council executive summary (3-brain deliberation), promo recommendations (targeted Sonnet call), beautiful A4 PDF with inline SVG revenue bar chart + peak time heatmap + hero products + suspicious transactions + register closures; council meta stored in council_runs
