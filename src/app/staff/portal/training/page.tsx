'use client'
import { useEffect, useState, useCallback } from 'react'

// TP-2 — Staff "My Training". Lists the staff member's enrolments and lets them step through
// video/document/text/acknowledge/recipe lessons, marking each complete (progress rolls up,
// cert granted on completion of a non-graded course). Quiz/game lessons are placeholder
// "continue" steps here — interactive play + scoring is TP-3.

const CARD = '#ffffff', INK = '#1d2a24', MUTED = '#6b7d74', LINE = '#e6ece8'
const SAGE = '#7FB897', DEEP = '#2D5240', AMBER = '#BA7517', RED = '#E24B4A', GOLD = '#C9A37A'
const SHADOW = '0 1px 2px rgba(45,82,64,.06), 0 8px 24px rgba(45,82,64,.06)'

const TIER_COLOR: Record<string, string> = { compliance: RED, skill: SAGE, systems: GOLD, culture: AMBER }
const TYPE_LABEL: Record<string, string> = { video: 'Video', document: 'Document', image: 'Image', text: 'Reading', quiz: 'Quiz', game: 'Game', recipe: 'Recipe', acknowledge: 'Acknowledge' }
const GRADED = new Set(['quiz', 'game'])

interface Enrolment { id: string; course_id: string; status: string; progress_pct: number; due_at: string | null; completed_at: string | null; certified: boolean; total_lessons: number; training_courses: { title: string; description: string | null; tier: string | null; est_minutes: number | null } | null }
interface Lesson { id: string; sort_order: number; type: string; title: string | null; content: string | null; url: string | null; recipe_id: string | null; game_round: string | null; duration_seconds: number | null }

const pill = (c: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: `${c}1a`, color: c, border: `1px solid ${c}40` })
const STATUS_RANK: Record<string, number> = { overdue: 0, assigned: 1, in_progress: 2, complete: 3 }
const isOverdue = (e: Enrolment) => e.status !== 'complete' && e.due_at != null && new Date(e.due_at).getTime() < Date.now()

async function api<T = unknown>(url: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, { method: opts?.method ?? 'GET', headers: opts?.body ? { 'Content-Type': 'application/json' } : undefined, body: opts?.body ? JSON.stringify(opts.body) : undefined })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Request failed')
  return d as T
}

export default function MyTrainingPage() {
  const [enrolments, setEnrolments] = useState<Enrolment[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { const d = await api<{ enrolments: Enrolment[] }>('/api/staff/portal/training'); setEnrolments(d.enrolments ?? []) }
    catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const sorted = [...enrolments].sort((a, b) => {
    const ra = isOverdue(a) ? 0 : STATUS_RANK[a.status] ?? 1
    const rb = isOverdue(b) ? 0 : STATUS_RANK[b.status] ?? 1
    if (ra !== rb) return ra - rb
    return (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999')
  })

  if (openId) return <CoursePlayer courseId={openId} onBack={() => { setOpenId(null); load() }} />

  return (
    <div>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: INK, margin: 0 }}>My Training</h1>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Courses assigned to you. Complete them to earn certifications.</p>
      </header>

      {err && <div style={{ background: `${RED}10`, border: `1px solid ${RED}40`, color: RED, borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {loading
        ? <div style={{ color: MUTED, textAlign: 'center', padding: 40 }}>Loading…</div>
        : sorted.length === 0
          ? <div style={{ background: CARD, borderRadius: 18, boxShadow: SHADOW, border: `1px solid ${LINE}`, padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>🎓</div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: INK, margin: '0 0 6px' }}>No training assigned yet</h2>
              <p style={{ fontSize: 13, color: MUTED, maxWidth: 280, margin: '0 auto' }}>When your manager assigns you a course, it’ll appear here.</p>
            </div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sorted.map(e => {
                const c = e.training_courses
                const tier = c?.tier ? TIER_COLOR[c.tier] : null
                const overdue = isOverdue(e)
                return (
                  <button key={e.id} onClick={() => setOpenId(e.course_id)} style={{ textAlign: 'left', background: CARD, borderRadius: 18, boxShadow: SHADOW, border: `1px solid ${overdue ? RED + '55' : LINE}`, borderLeft: `3px solid ${overdue ? RED : tier ?? SAGE}`, padding: 16, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                      {c?.tier && tier && <span style={pill(tier)}>{c.tier}</span>}
                      {e.certified && <span style={pill(DEEP)}>✓ Certified</span>}
                      {overdue
                        ? <span style={{ ...pill(RED), marginLeft: 'auto' }}>Overdue</span>
                        : <span style={{ ...pill(e.status === 'complete' ? DEEP : e.status === 'in_progress' ? AMBER : MUTED), marginLeft: 'auto' }}>{e.status === 'in_progress' ? 'In progress' : e.status}</span>}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{c?.title ?? 'Course'}</div>
                    {c?.description && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>{c.description}</div>}
                    <div style={{ marginTop: 11 }}>
                      <div style={{ height: 7, borderRadius: 99, background: '#eef2ef', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${e.progress_pct}%`, background: e.status === 'complete' ? DEEP : SAGE, borderRadius: 99, transition: 'width .3s' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: MUTED }}>
                        <span>{e.progress_pct}% · {e.total_lessons} lesson{e.total_lessons === 1 ? '' : 's'}</span>
                        {e.due_at && <span style={{ color: overdue ? RED : MUTED }}>Due {new Date(e.due_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>}
    </div>
  )
}

function CoursePlayer({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const [course, setCourse] = useState<{ title: string; description: string | null; tier: string | null } | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [enrolId, setEnrolId] = useState<string | null>(null)
  const [enrol, setEnrol] = useState<{ status: string; progress_pct: number; certified: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<{ enrolment: { id: string; status: string; progress_pct: number; certified: boolean }; course: typeof course; lessons: Lesson[]; completed_lesson_ids: string[] }>(`/api/staff/portal/training?course_id=${courseId}`)
      setCourse(d.course); setLessons(d.lessons ?? []); setDone(new Set(d.completed_lesson_ids ?? [])); setEnrolId(d.enrolment.id); setEnrol(d.enrolment)
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [courseId])
  useEffect(() => { load() }, [load])

  async function complete(lessonId: string) {
    if (!enrolId) return
    setBusy(lessonId); setErr('')
    try {
      const r = await api<{ progress_pct: number; status: string; certified: boolean }>('/api/staff/portal/training', { method: 'POST', body: { enrolment_id: enrolId, lesson_id: lessonId } })
      setDone(prev => new Set(prev).add(lessonId))
      setEnrol(e => e ? { ...e, progress_pct: r.progress_pct, status: r.status, certified: r.certified } : e)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  const tier = course?.tier ? TIER_COLOR[course.tier] : SAGE
  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: DEEP, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0', marginBottom: 8 }}>← My Training</button>
      {loading ? <div style={{ color: MUTED, textAlign: 'center', padding: 40 }}>Loading…</div> : (
        <>
          <header style={{ marginBottom: 14 }}>
            {course?.tier && <span style={pill(tier)}>{course.tier}</span>}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: '8px 0 2px' }}>{course?.title}</h1>
            {course?.description && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>{course.description}</p>}
            {enrol && (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 7, borderRadius: 99, background: '#eef2ef', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${enrol.progress_pct}%`, background: enrol.status === 'complete' ? DEEP : SAGE, borderRadius: 99, transition: 'width .3s' }} />
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>
                  {enrol.progress_pct}% complete{enrol.certified ? ' · ✓ Certified' : enrol.status === 'complete' ? ' · awaiting quiz (coming soon)' : ''}
                </div>
              </div>
            )}
          </header>

          {err && <div style={{ background: `${RED}10`, border: `1px solid ${RED}40`, color: RED, borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 14 }}>{err}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lessons.map((l, i) => {
              const isDone = done.has(l.id)
              const graded = GRADED.has(l.type)
              return (
                <div key={l.id} style={{ background: CARD, borderRadius: 14, boxShadow: SHADOW, border: `1px solid ${LINE}`, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: isDone ? DEEP : '#eef2ef', color: isDone ? '#fff' : MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{isDone ? '✓' : i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{l.title || TYPE_LABEL[l.type]}</div>
                      <span style={{ ...pill(MUTED), marginTop: 3 }}>{TYPE_LABEL[l.type] ?? l.type}{graded ? ' · interactive soon' : ''}</span>
                    </div>
                  </div>
                  {/* Lesson body */}
                  {l.url && ['video', 'document', 'image'].includes(l.type) && (
                    <a href={l.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 13, color: DEEP, fontWeight: 600 }}>Open {TYPE_LABEL[l.type].toLowerCase()} →</a>
                  )}
                  {l.content && ['text', 'document', 'acknowledge'].includes(l.type) && (
                    <p style={{ marginTop: 10, fontSize: 13, color: INK, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{l.content}</p>
                  )}
                  {graded && <p style={{ marginTop: 10, fontSize: 12.5, color: MUTED, fontStyle: 'italic' }}>{l.type === 'quiz' ? 'A graded quiz will run here soon. For now, continue.' : 'An interactive game round is coming soon. For now, continue.'}</p>}
                  {/* Action */}
                  <div style={{ marginTop: 12 }}>
                    {isDone
                      ? <span style={{ fontSize: 12.5, color: DEEP, fontWeight: 600 }}>✓ Completed</span>
                      : <button onClick={() => complete(l.id)} disabled={busy === l.id} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: l.type === 'acknowledge' ? DEEP : SAGE, color: l.type === 'acknowledge' ? '#fff' : '#0c130f', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy === l.id ? 0.6 : 1 }}>
                          {busy === l.id ? 'Saving…' : l.type === 'acknowledge' ? 'I acknowledge' : graded ? 'Continue' : 'Mark complete'}
                        </button>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
