export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// TP-5 — OWNER training dashboard: read-only aggregates over TP-1..4 data. No writes.
// %-team-certified = distinct ACTIVE staff holding >=1 certificate / total active staff.

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

type EnrolRow = {
  id: string; course_id: string; staff_member_id: string; status: string; progress_pct: number; score: number | null
  due_at: string | null; completed_at: string | null; certified: boolean
  training_courses: { title: string; tier: string | null; is_mandatory: boolean; pass_mark: number } | null
  staff_members: { first_name: string | null; last_name: string | null; position: string | null } | null
}
type CertRow = { enrolment_id: string; cert_number: string; staff_name: string | null; course_title: string | null; score: number | null; issued_at: string; expires_at: string | null }

const nameOf = (s: { first_name?: string | null; last_name?: string | null } | null) =>
  `${s?.first_name ?? ''} ${s?.last_name ?? ''}`.trim() || 'Staff'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ empty: true, kpis: emptyKpis(), courses: [], overdue: [], expiring: [], audit: [] })

  const now = Date.now()
  const [coursesQ, enrolQ, certQ, staffQ] = await Promise.all([
    supabase.from('training_courses').select('id, title, tier, is_mandatory, pass_mark, status').eq('business_id', bid),
    supabase.from('training_enrolments')
      .select('id, course_id, staff_member_id, status, progress_pct, score, due_at, completed_at, certified, training_courses(title, tier, is_mandatory, pass_mark), staff_members(first_name, last_name, position)')
      .eq('business_id', bid),
    supabase.from('training_certificates').select('enrolment_id, cert_number, staff_name, course_title, score, issued_at, expires_at').eq('business_id', bid),
    supabase.from('staff_members').select('id').eq('business_id', bid).eq('status', 'active'),
  ])
  if (enrolQ.error) return NextResponse.json({ error: enrolQ.error.message }, { status: 500 })

  const courses = coursesQ.data ?? []
  const enrols = (enrolQ.data ?? []) as unknown as EnrolRow[]
  const certs = (certQ.data ?? []) as CertRow[]
  const activeStaff = (staffQ.data ?? []).length

  const isOverdue = (e: EnrolRow) => e.status !== 'complete' && e.due_at != null && new Date(e.due_at).getTime() < now
  const certByEnrol = new Map(certs.map(c => [c.enrolment_id, c]))

  // KPIs
  const activeCourses = courses.filter(c => c.status === 'published').length
  const inProgress = enrols.filter(e => e.status === 'in_progress').length
  const overdueCount = enrols.filter(isOverdue).length
  const certifiedStaffIds = new Set(enrols.filter(e => e.certified).map(e => e.staff_member_id))
  // Also count staff who hold a cert even if enrolment row changed — union with cert holders.
  // (certs carry staff via enrolment; map back through enrols.)
  for (const e of enrols) if (certByEnrol.has(e.id)) certifiedStaffIds.add(e.staff_member_id)
  const certifiedStaff = certifiedStaffIds.size
  const teamCertifiedPct = activeStaff > 0 ? Math.round((certifiedStaff / activeStaff) * 100) : 0

  // Cohorts grouped by course (only courses that have enrolments OR are published)
  const byCourse = new Map<string, EnrolRow[]>()
  for (const e of enrols) { const a = byCourse.get(e.course_id) ?? []; a.push(e); byCourse.set(e.course_id, a) }
  const cohorts = courses
    .filter(c => c.status !== 'archived')
    .map(c => ({
      id: c.id, title: c.title, tier: c.tier, is_mandatory: c.is_mandatory, status: c.status,
      enrolments: (byCourse.get(c.id) ?? []).map(e => ({
        enrolment_id: e.id, name: nameOf(e.staff_members), position: e.staff_members?.position ?? '',
        progress_pct: e.progress_pct, score: e.score, certified: e.certified,
        status: isOverdue(e) ? 'overdue' : e.status, due_at: e.due_at,
      })).sort((a, b) => (a.status === 'overdue' ? -1 : 0) - (b.status === 'overdue' ? -1 : 0)),
    }))
    .filter(c => c.enrolments.length > 0 || c.status === 'published')

  // Overdue list (across courses)
  const overdue = enrols.filter(isOverdue).map(e => ({
    enrolment_id: e.id, name: nameOf(e.staff_members), position: e.staff_members?.position ?? '',
    course_title: e.training_courses?.title ?? 'Course', due_at: e.due_at, progress_pct: e.progress_pct,
    days_overdue: e.due_at ? Math.floor((now - new Date(e.due_at).getTime()) / 86400000) : 0,
  })).sort((a, b) => b.days_overdue - a.days_overdue)

  // Expiring certs (within 60 days, or already expired)
  const expiring = certs.filter(c => c.expires_at != null)
    .map(c => ({ ...c, days_left: Math.ceil((new Date(c.expires_at as string).getTime() - now) / 86400000) }))
    .filter(c => c.days_left <= 60)
    .sort((a, b) => a.days_left - b.days_left)

  // Audit export rows — one per enrolment, enriched with cert details.
  const audit = enrols.map(e => {
    const cert = certByEnrol.get(e.id)
    return {
      staff_name: nameOf(e.staff_members), position: e.staff_members?.position ?? '',
      course_title: e.training_courses?.title ?? '', tier: e.training_courses?.tier ?? '',
      status: isOverdue(e) ? 'overdue' : e.status, score: e.score ?? '',
      completed_at: e.completed_at ? e.completed_at.slice(0, 10) : '', certified: e.certified ? 'yes' : 'no',
      cert_number: cert?.cert_number ?? '', issued_at: cert?.issued_at ? cert.issued_at.slice(0, 10) : '',
      expires_at: cert?.expires_at ? cert.expires_at.slice(0, 10) : '',
    }
  }).sort((a, b) => a.staff_name.localeCompare(b.staff_name))

  return NextResponse.json({
    empty: courses.length === 0 && enrols.length === 0,
    kpis: { active_courses: activeCourses, in_progress: inProgress, overdue: overdueCount, team_certified_pct: teamCertifiedPct, certified_staff: certifiedStaff, active_staff: activeStaff },
    courses: cohorts, overdue, expiring, audit,
  })
}

function emptyKpis() { return { active_courses: 0, in_progress: 0, overdue: 0, team_certified_pct: 0, certified_staff: 0, active_staff: 0 } }

export const GET = withErrorCapture('training/dashboard', _GET)
