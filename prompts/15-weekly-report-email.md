# Aria OS — Prompt 15: Weekly BI Report — Email Delivery + Dashboard + Cron
ONE task, ONE commit, ONE push. Run AFTER Prompt 14 is green.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read the existing email sending pipeline (the winback / review-request /
shift report features use SendGrid — find the exact helper and reuse it).
Read the weekly-cron.ts and weekly-generate route from Sprints 1-2. Read
a /dashboard sub-page for the UI pattern. Do NOT write code before reading.

## STEP 2 — EMAIL DELIVERY via existing SendGrid pipeline
In weekly-cron.ts (or weekly-generate route), after the PDF is generated
and uploaded to Blob, send an email to businesses.email using the EXISTING
SendGrid helper. Do NOT build a new email sender.

Email spec:
- Subject: "Your weekly Aria report — week of [Mon date]"
- Body (HTML email, minimal): Aria logo text, "Good morning [owner name],
  your weekly business report for [week range] is ready." Then the executive
  summary text (plain prose, no table). Then a prominent button:
  "View your report →" linking to the pdf_url. Then: "This report was
  generated automatically by Aria OS every Monday morning."
- Attachment: the PDF file attached directly (NOT just a link — attach it
  so the owner can open it offline). Use SendGrid's attachment API:
  { content: base64(pdfBuffer), filename: 'aria-weekly-report.pdf',
    type: 'application/pdf', disposition: 'attachment' }
- If email fails: log the error but do NOT throw — the report was still
  generated and uploaded. The pdf_url is the source of truth.

## STEP 3 — DB: store the report record
Create ONE migration named weekly_report_records. Table:
  weekly_report_records: id uuid PK, business_id uuid FK businesses,
  week_start date, week_end date, pdf_url text, email_sent bool default false,
  email_sent_at timestamptz, suspicious_count int default 0,
  total_revenue numeric, created_at timestamptz default now().
RLS on, owner-scoped policy (same pattern as every other table).
After email sends, insert a row into this table.

## STEP 4 — DASHBOARD PAGE at /dashboard/reports
New sidebar entry "Reports". Client page showing:
- A "Generate this week's report" button → calls /api/reports/weekly-generate
  POST → shows a progress state ("Aria is generating your report…") → on
  completion shows a download link and "Sent to [email]" confirmation.
- A history list of past reports from weekly_report_records: week range,
  revenue, suspicious count, PDF download link, sent date. Newest first.
- If no reports yet: a friendly empty state explaining the report is sent
  automatically every Monday morning and can also be generated manually.

UI RULES: Financial Trust palette (#2D5240 forest, #7FB897 sage), Fraunces
italic headings, Inter body. No backtick template literals in
className={...}/style={{}}. 'use client' line 1. Match the existing
dashboard sub-page structure and sidebar pattern.

## STEP 5 — CONFIRM CRON IS WIRED (Sprint 1 already added to vercel.json)
The cron entry { "path": "/api/cron/weekly-report", "schedule": "0 22 * * 0" }
was added in Sprint 1. Verify it is still present and not duplicated.
Do not add it again.

## STEP 6 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(weekly-report): Sprint 3 — email delivery with PDF attachment via existing SendGrid pipeline, weekly_report_records table, /dashboard/reports page with manual generation + history
