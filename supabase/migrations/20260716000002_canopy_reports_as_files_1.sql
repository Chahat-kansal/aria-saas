-- CANOPY-REPORTS-AS-FILES-1 — a real, persistent "saved to Files" ledger, deliberately separate
-- from aria_task_outputs (Ask Aria's own generation record) and weekly_report_records (the weekly
-- PDF generation record). Those two tables represent "a report was GENERATED"; this table
-- represents the distinct, later, deliberate act of "the owner (or Aria proactively) SAVED this
-- specific report into Files" — a different lifecycle stage, not a duplicate of either.
--
-- grounding applies the Business Truth typing principle (design/ARIA-ENVIRONMENT-BUILD-PLAN.md's
-- locked "verified/derived/estimated tag") at small scale for this sprint's actual scope, without
-- building the full future Business Ledger system that principle belongs to: 'verified' (built
-- directly from live queried POS/business data — the deliverable/weekly-report generators already
-- work this way), 'derived' (computed/summarized from verified data, e.g. an AI narrative over real
-- numbers), or 'estimated' (a projection/prediction, e.g. slow-day or churn-risk style output).
--
-- pdf_url always points at a real PDF already produced by one of the two existing, reused
-- generation pipelines (exportDeliverablePdf / generateWeeklyPDF) — this migration adds no new PDF
-- generation of its own.
create table if not exists canopy_saved_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null,
  source_kind text not null check (source_kind = any (array['ask_aria_deliverable', 'weekly_report', 'daily_briefing', 'profit_leaks'])),
  source_id uuid null, -- aria_task_outputs.id or weekly_report_records.id, when the source has one
  grounding text not null default 'derived' check (grounding = any (array['verified', 'derived', 'estimated'])),
  pdf_url text not null,
  generated_at timestamptz not null, -- when the underlying report content was actually generated
  saved_by text not null default 'owner' check (saved_by = any (array['owner', 'aria'])),
  created_at timestamptz not null default now()
);

create index if not exists canopy_saved_reports_business_id_idx on canopy_saved_reports (business_id, created_at desc);

alter table canopy_saved_reports enable row level security;

-- Mirrors aria_task_outputs' existing "business owner access" policy exactly (same shape, same
-- auth.uid() -> businesses.user_id chain) — the established RLS pattern for this class of table.
create policy "business owner access" on canopy_saved_reports
  for all
  using (business_id in (select businesses.id from businesses where businesses.user_id = auth.uid()));
