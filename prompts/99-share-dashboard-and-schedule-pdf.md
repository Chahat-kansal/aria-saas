# Prompt 99 — Share dashboard with accountant + schedule any page as PDF email

## What this builds
Two features taken from Power BI's most useful capabilities, adapted for Aria:

1. **Shared dashboard links** — owner generates a read-only link to specific
   dashboard pages and sends it to their accountant, business partner, or
   landlord. No login required. Limited to the pages the owner allows.

2. **Scheduled PDF emails** — owner picks any dashboard page, sets a schedule
   (weekly Monday 8am, monthly 1st, etc.), adds recipient emails. Aria
   generates a PDF of that page and emails it automatically.

Both use the Puppeteer PDF infrastructure already in place from the weekly
report. Both write to new tables already created via Supabase MCP.

## DB (already applied — skip this step)
Tables exist: `dashboard_share_links` and `scheduled_pdf_reports`

## TASK 1 — Shared read-only dashboard links

### Owner side: /dashboard/settings/sharing

New settings tab (add to existing settings sidebar or as a new tab in
/dashboard/settings/):

**"Share with external people"** section:
- List of existing share links (label, recipient, pages, expires, last accessed,
  access count, active toggle, delete button)
- "Create new share link" form:
  - Label (e.g. "My accountant — BAS review")
  - Recipient name + email (optional — just for the owner's reference)
  - Pages to include: checkboxes for each allowed page
  - Expiry: Never / 30 days / 90 days / 1 year
  - "Generate link" button → creates a row in dashboard_share_links, shows
    a copy-able URL + an "Email this link" button

**Pages that can be shared** (keep it simple, financially relevant):
- Overview / Dashboard home
- Cash Flow
- Invoices
- Sales & Revenue
- Staff & Labour
- Weekly Reports
- Profit Leaks
- Competitor Intelligence

Pages that CANNOT be shared (too sensitive or customer-specific):
- Customer data (privacy)
- Loyalty / winback (PII)
- Ask Aria (conversational)
- Settings / integrations
- Admin pages

### The shared view: /shared/[token]

Public route — no Supabase auth required.

1. Validate token against dashboard_share_links (is_active=true, expires_at > now or null)
2. If invalid/expired: friendly "This link has expired or is invalid. Ask the business owner for a new link."
3. If valid: increment access_count, update last_accessed_at, render the shared view

**Shared view layout:**
- Top bar: business name + logo, "Shared by Aria OS", date range indicator
- Sidebar: only the pages_allowed from the share link (not the full dashboard sidebar)
- Content: the existing dashboard page components, but with a read-only wrapper:
  - No action buttons (no "Send campaign", no "Mark as paid", no "Generate roster")
  - No navigation to pages outside pages_allowed
  - No ability to change date ranges (shows the default)
  - Aria Says banners show normally (read-only view of insights)
- Footer: "This is a read-only view shared by {business_name}. Data refreshes daily."

**How to implement read-only:**
The shared route passes a `readOnly: true` prop through a context provider.
Each dashboard page that might be shared checks this context and hides action
buttons. This is simpler than rebuilding each page — just a context flag.

### API routes
- `POST /api/share-links` — create (auth required, validates business ownership)
- `GET /api/share-links` — list for business (auth required)
- `DELETE /api/share-links/[id]` — deactivate (auth required)
- `GET /api/shared/[token]` — validate token + return business_id and allowed pages (PUBLIC, no auth)

### Commit
"feat(sharing): read-only dashboard share links for accountants/partners"

## TASK 2 — Schedule any dashboard page as PDF email

### Owner side: new "Schedule report" button on every dashboard page

In the dashboard layout (the shared top bar or sidebar), add a small
"Schedule PDF" button (calendar icon). On click, opens a modal:

**Schedule PDF report modal:**
- "Schedule this page as a recurring PDF email"
- Label: prefilled with the page name (e.g. "Cash Flow Report")
- Frequency: Daily / Weekly / Monthly
  - Weekly: pick day of week (Mon, Tue... Sun)
  - Monthly: pick day of month (1st, 15th, last day)
- Time: pick hour in AEST (default 8am)
- Recipients: add email addresses + names (up to 5)
- Include share link in email: toggle (yes by default — recipient can click
  through to the live read-only view for more detail)
- "Schedule" button → creates a row in scheduled_pdf_reports, shows
  "First report sends on {next_send_date}" confirmation

**Existing schedules**: /dashboard/settings/reports tab shows all active
scheduled reports with edit/delete/pause buttons.

### The PDF generation

Reuse the existing PDF generation pattern from weekly-report (puppeteer-core +
@sparticuz/chromium, already fixed in prompt 95 Task 3).

For each scheduled report, generate the PDF by:
1. Navigating puppeteer to the shared link for the relevant page
   (use the share link infrastructure from Task 1 — create a special
   "internal report" share link with no expiry, all pages, for each business)
2. Waiting for the page to fully render (waitForSelector on a data element)
3. Screenshot the full page as PDF (A4, landscape for data-heavy pages)
4. Attach to email via SendGrid (already integrated) with subject:
   "{business_name} — {label} — {date}"
5. Update last_sent_at and compute next_send_at

### Cron: /api/cron/send-scheduled-reports

Schedule: `0 20 * * *` (8pm UTC = 6am AEST, runs once daily, sends reports
due that morning)

Logic:
1. Query scheduled_pdf_reports where is_active=true and next_send_at < now()
2. For each due report, generate PDF and send to all recipients
3. Update last_sent_at = now(), compute next_send_at based on frequency
4. Log to aria_ai_calls (no AI used here, but useful for audit trail)

**Computing next_send_at:**
```typescript
function computeNextSend(freq: string, dayOfWeek: number|null, dayOfMonth: number|null, hourAest: number): Date {
  const now = new Date()
  // Convert AEST to UTC (AEST = UTC+10, AEDT = UTC+11 — use UTC+10 for simplicity)
  const hourUtc = (hourAest - 10 + 24) % 24
  
  if (freq === 'daily') {
    const next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    return next
  }
  if (freq === 'weekly' && dayOfWeek !== null) {
    // Find next occurrence of dayOfWeek at hourUtc
    const next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    const daysUntil = (dayOfWeek - now.getUTCDay() + 7) % 7 || 7
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return next
  }
  if (freq === 'monthly' && dayOfMonth !== null) {
    const next = new Date(now)
    next.setUTCDate(Math.min(dayOfMonth, 28))
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1)
    return next
  }
  return now
}
```

### Email template for scheduled PDF
Subject: "{label} — {month} {year}"
Body:
- Business logo + name
- "Here is your scheduled {frequency} report for {label}"
- Date range covered
- PDF attached
- If include_share_link: "View the live dashboard here: {share_link_url}"
- Footer: "You're receiving this because {owner_name} set up this scheduled
  report. To unsubscribe, ask them to remove your email from the schedule."

### Dashboard settings: /dashboard/settings/reports (or add tab to existing settings)
- List of all scheduled reports
- Status: Active / Paused
- Last sent, next send
- Edit (opens modal), Delete, Pause/Resume

### Commit
"feat(scheduled-reports): schedule any dashboard page as PDF email with recurring delivery"

## TASK 3 — Surface in the dashboard

### "Schedule PDF" button placement
Add to the top-right of every major dashboard page (next to the existing
breadcrumb/page title area). Small button, calendar icon, "Schedule" label.
On mobile, collapses into the overflow menu.

### "Share this page" button placement
Same location. Generates a share link pre-configured for just that page.
Quick share (one click) vs the full management in settings.

### Sidebar entry for settings
Under SETTINGS in the sidebar:
- "Sharing" → /dashboard/settings/sharing
- "Scheduled Reports" → /dashboard/settings/reports

### Commit
"feat(sharing): surface Share and Schedule buttons on dashboard pages + settings sidebar entries"

## Rules
- DB migrations already applied — skip that step
- Puppeteer already fixed (prompt 95 Task 3) — reuse the same pattern
- Share links use token-based auth, no Supabase session required for /shared/[token]
- ReadOnly context prevents mutations from shared views
- Cron is once-daily max (Vercel Pro rule): `0 20 * * *`
- All emails via SendGrid (already integrated)
- npx tsc --noEmit + npm run build before each commit
- After all commits: git push origin main

## Priority if limit runs low
1. Task 1 (share links + /shared/[token] route) — the accountant use case,
   no PDF needed, most immediately useful
2. Task 2 (scheduled PDF + cron) — higher complexity, uses puppeteer
3. Task 3 (surface buttons on pages) — polish, easy but low priority vs core

Finish current commit, push, STOP, report.
