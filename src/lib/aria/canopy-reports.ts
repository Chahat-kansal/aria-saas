import { supabaseAdmin } from '@/lib/supabase-admin'
import { exportDeliverablePdf } from './deliverable-pdf'

// CANOPY-REPORTS-AS-FILES-1 — reuses the two existing, already-live PDF generation pipelines
// (exportDeliverablePdf for aria_task_outputs; weekly_report_records.pdf_url, already produced by
// the separate generateWeeklyPDF pipeline) instead of building a third. daily_briefing/profit_leaks
// have no existing aria_task_outputs row of their own — for those two kinds this creates ONE
// minimal new row using the exact insert shape generateDeliverable() (src/lib/aria/deliverables.ts)
// already uses, then calls the SAME exportDeliverablePdf() on it. That is the entire "new PDF
// generation" this feature adds: zero — every PDF byte still comes from the one puppeteer-core +
// @sparticuz/chromium pipeline that already existed.

export type ReportSourceKind = 'ask_aria_deliverable' | 'weekly_report' | 'daily_briefing' | 'profit_leaks'
export type ReportGrounding = 'verified' | 'derived' | 'estimated'

export interface SaveReportParams {
  businessId: string
  sourceKind: ReportSourceKind
  /** aria_task_outputs.id (ask_aria_deliverable) or weekly_report_records.id (weekly_report). Not
   * used for daily_briefing/profit_leaks — those create their own new aria_task_outputs row. */
  sourceId?: string | null
  title: string
  grounding: ReportGrounding
  /** Required for daily_briefing/profit_leaks — the rendered report content to persist + PDF. */
  html?: string | null
  /** Explicit action (owner clicked Save) vs a future proactive-Aria save; defaults to 'owner'
   * since every caller wired this sprint is a direct owner click — no autonomous trigger exists yet
   * to originate an 'aria' save, so that value is supported by the schema but unused for now. */
  savedBy?: 'owner' | 'aria'
}

export interface SavedReport {
  id: string
  business_id: string
  title: string
  source_kind: string
  source_id: string | null
  grounding: string
  pdf_url: string
  generated_at: string
  saved_by: string
  created_at: string
}

export async function saveReport(params: SaveReportParams): Promise<SavedReport> {
  const { businessId, sourceKind, title, grounding } = params
  let sourceId = params.sourceId ?? null
  let pdfUrl: string
  let generatedAt = new Date().toISOString()

  if (sourceKind === 'ask_aria_deliverable') {
    if (!sourceId) throw new Error('source_id required for ask_aria_deliverable')
    pdfUrl = await exportDeliverablePdf(sourceId, businessId)
    const { data: output } = await supabaseAdmin.from('aria_task_outputs').select('created_at').eq('id', sourceId).eq('business_id', businessId).maybeSingle()
    if (output?.created_at) generatedAt = output.created_at as string
  } else if (sourceKind === 'weekly_report') {
    if (!sourceId) throw new Error('source_id required for weekly_report')
    const { data: record } = await supabaseAdmin.from('weekly_report_records').select('pdf_url, created_at').eq('id', sourceId).eq('business_id', businessId).maybeSingle()
    if (!record?.pdf_url) throw new Error('Weekly report has no PDF yet — generate it first')
    pdfUrl = record.pdf_url as string
    if (record.created_at) generatedAt = record.created_at as string
  } else {
    // daily_briefing | profit_leaks — see file-level comment.
    if (!params.html) throw new Error('html required for ' + sourceKind)
    const { data: inserted, error } = await supabaseAdmin.from('aria_task_outputs').insert({
      business_id: businessId,
      title,
      task_prompt: title,
      output_kind: 'dashboard',
      render_html: params.html,
      data_snapshot: {},
      status: 'ready',
    }).select('id, created_at').single()
    if (error || !inserted) throw new Error('Failed to persist report content: ' + (error?.message ?? 'no id returned'))
    sourceId = inserted.id as string
    generatedAt = inserted.created_at as string
    pdfUrl = await exportDeliverablePdf(sourceId, businessId)
  }

  const { data: saved, error: saveErr } = await supabaseAdmin.from('canopy_saved_reports').insert({
    business_id: businessId,
    title,
    source_kind: sourceKind,
    source_id: sourceId,
    grounding,
    pdf_url: pdfUrl,
    generated_at: generatedAt,
    saved_by: params.savedBy ?? 'owner',
  }).select().single()

  if (saveErr || !saved) throw new Error('Failed to save report: ' + (saveErr?.message ?? 'no row returned'))
  return saved as SavedReport
}

export async function listSavedReports(businessId: string): Promise<SavedReport[]> {
  const { data } = await supabaseAdmin
    .from('canopy_saved_reports')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  return (data ?? []) as SavedReport[]
}
