import { net } from 'electron'
import { PRODUCTION_URL } from './config'

// SHELL-1 — every "real data" call the Canopy desktop makes goes through here, in the MAIN process,
// using Electron's net.fetch (NOT Node's global fetch). net.fetch shares the app's default session —
// the same cookie jar the login window and the AriaOS/POS BrowserWindows use — so the Supabase auth
// cookie set by the real web login attaches automatically. A renderer-side fetch() to
// https://www.ariaos.site from a file://-loaded renderer would hit CORS and wouldn't carry that
// cookie at all; this is the reason the split exists, not an arbitrary choice.
//
// Every endpoint called here is a pre-existing, unmodified route already live in the main app,
// except POST /api/pos/canopy-pin (SHELL-1's one explicitly-sanctioned new backend route).

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await net.fetch(`${PRODUCTION_URL}${path}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

export interface CurrentBusiness {
  id: string
  name: string
  slug: string | null
}

export async function fetchCurrentBusiness(): Promise<CurrentBusiness | null> {
  const data = await apiFetch<{ business: CurrentBusiness }>('/api/businesses/current')
  return data?.business ?? null
}

export interface ActivityItem {
  id: string
  action_type: string
  description: string
  created_at: string
}

export async function fetchRecentActivity(businessId: string): Promise<ActivityItem[]> {
  const data = await apiFetch<{ activity?: ActivityItem[] }>(`/api/dashboard/stats?businessId=${businessId}`)
  return data?.activity ?? []
}

export interface HealthQuick {
  score: number
  grade: string
  issues: string[]
}

export async function fetchHealthQuick(businessId: string): Promise<HealthQuick | null> {
  return apiFetch<HealthQuick>(`/api/aria/business-health-quick?business_id=${businessId}`)
}

interface SaleRow {
  id: string
  total_amount: number | null
  status: string
  created_at: string
}

export interface TodaySales {
  totalCents: number
  count: number
}

/** Today's sales total, computed here from the existing /api/pos/sales listing (no new backend
 * aggregation route — reads the same data the sales-history page already reads, just sums it). */
export async function fetchTodaySales(): Promise<TodaySales> {
  const data = await apiFetch<{ sales?: SaleRow[] }>('/api/pos/sales?limit=200')
  const sales = data?.sales ?? []
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  let totalCents = 0
  let count = 0
  for (const s of sales) {
    if (s.status === 'voided') continue
    if (new Date(s.created_at) < todayStart) continue
    totalCents += Math.round((Number(s.total_amount) || 0) * 100)
    count++
  }
  return { totalCents, count }
}

export interface CanopyPinResult {
  valid: boolean
  scope?: 'owner' | 'staff'
  staff_id?: string
  name?: string
  token?: string
  // CANOPY-STAFF-CLOCK-1 — which staff table resolved the PIN (only 'pos_staff' can clock in/out —
  // that's the table those routes authenticate against) and whether a shift is already open.
  source?: 'pos_users' | 'pos_staff'
  already_clocked_in?: boolean
}

// CANOPY-REPORTS-AS-FILES-1 — Files app data, real per-business saved reports (canopy_saved_reports,
// via /api/canopy/reports GET). Matches this file's own established convention exactly: a
// pre-existing route, called from the main process over the shared session cookie jar.
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

export async function fetchSavedReports(): Promise<SavedReport[]> {
  const data = await apiFetch<{ reports?: SavedReport[] }>('/api/canopy/reports')
  return data?.reports ?? []
}

export async function verifyCanopyPin(businessId: string, pin: string): Promise<CanopyPinResult> {
  try {
    const res = await net.fetch(`${PRODUCTION_URL}/api/pos/canopy-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, pin }),
    })
    if (!res.ok) return { valid: false }
    return await res.json() as CanopyPinResult
  } catch {
    return { valid: false }
  }
}

// CANOPY-STAFF-CLOCK-1 — thin wrappers over the pre-existing, unmodified
// /api/staff/timesheets/clock-in|clock-out routes (same ones the terminal/staff-portal already
// use). Both derive the business from the caller's own authenticated session server-side (not a
// body param), matching how those routes already work for every other caller — no businessId
// param needed here.
export interface ClockResult {
  ok: boolean
  staff_name?: string
  clock_in?: string
  hours_worked?: number
  total_pay_cents?: number
  message?: string
  error?: string
}

export async function clockInStaff(pin: string): Promise<ClockResult> {
  try {
    const res = await net.fetch(`${PRODUCTION_URL}/api/staff/timesheets/clock-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const json = await res.json().catch(() => ({})) as Partial<ClockResult>
    if (!res.ok) return { ok: false, error: json.error ?? 'Clock-in failed' }
    return { ok: true, staff_name: json.staff_name, clock_in: json.clock_in, message: json.message }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function clockOutStaff(pin: string): Promise<ClockResult> {
  try {
    const res = await net.fetch(`${PRODUCTION_URL}/api/staff/timesheets/clock-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const json = await res.json().catch(() => ({})) as Partial<ClockResult>
    if (!res.ok) return { ok: false, error: json.error ?? 'Clock-out failed' }
    return { ok: true, staff_name: json.staff_name, hours_worked: json.hours_worked, total_pay_cents: json.total_pay_cents, message: json.message }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}
