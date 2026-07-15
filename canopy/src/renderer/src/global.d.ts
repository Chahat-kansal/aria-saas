export interface CurrentBusiness {
  id: string
  name: string
  slug: string | null
}

export interface ActivityItem {
  id: string
  action_type: string
  description: string
  created_at: string
}

export interface HealthQuick {
  score: number
  grade: string
  issues: string[]
}

export interface TodaySales {
  totalCents: number
  count: number
}

export interface CanopyPinResult {
  valid: boolean
  scope?: 'owner' | 'staff'
  staff_id?: string
  name?: string
  token?: string
}

// CANOPY-REPORTS-AS-FILES-1 — mirrors canopy_saved_reports (main app DB) exactly.
export interface SavedReport {
  id: string
  title: string
  source_kind: string
  grounding: string
  pdf_url: string
  generated_at: string
  saved_by: string
  created_at: string
}

export interface ExportReportResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export interface CanopyAPI {
  getBusiness: () => Promise<CurrentBusiness | null>
  getActivity: (businessId: string) => Promise<ActivityItem[]>
  getHealth: (businessId: string) => Promise<HealthQuick | null>
  getTodaySales: () => Promise<TodaySales>
  verifyPin: (businessId: string, pin: string) => Promise<CanopyPinResult>
  openApp: (kind: string, opts?: { route?: string; title?: string }) => Promise<boolean>
  closeApp: (kind: string) => Promise<boolean>
  isAppOpen: (kind: string) => Promise<boolean>
  signOut: () => Promise<boolean>
  exitApp: () => Promise<boolean>
  onAppClosed: (cb: (kind: string) => void) => () => void
  getSavedReports: () => Promise<SavedReport[]>
  exportReport: (pdfUrl: string, suggestedName: string) => Promise<ExportReportResult>
}

declare global {
  interface Window {
    canopyAPI: CanopyAPI
  }
}
