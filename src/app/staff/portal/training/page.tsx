'use client'
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

// Lazy — these only load when a staff member actually plays a game / practical lesson.
const AriaGameRound = dynamic(() => import('@/components/training/AriaGameRound'), { ssr: false })
const PosPracticalExam = dynamic(() => import('@/components/training/PosPracticalExam'), { ssr: false })

// TP-2 — Staff "My Training". Lists the staff member's enrolments and lets them step through
// video/document/text/acknowledge/recipe lessons, marking each complete (progress rolls up,
// cert granted on completion of a non-graded course). Quiz/game lessons are placeholder
// "continue" steps here — interactive play + scoring is TP-3.

const CARD = '#ffffff', INK = '#1d2a24', MUTED = '#6b7d74', LINE = '#e6ece8'
const SAGE = '#7FB897', DEEP = '#2D5240', AMBER = '#BA7517', RED = '#E24B4A', GOLD = '#C9A37A'
const SHADOW = '0 1px 2px rgba(45,82,64,.06), 0 8px 24px rgba(45,82,64,.06)'
const DISPLAY = "var(--font-display, 'Cormorant', Georgia, serif)"

const TIER_COLOR: Record<string, string> = { compliance: RED, skill: SAGE, systems: GOLD, culture: AMBER }
// TP-SEED — display label only (DB tier value stays 'compliance'); 'compliance' shows as 'Required'.
const TIER_LABEL: Record<string, string> = { compliance: 'Required', skill: 'Skill', systems: 'Systems', culture: 'Culture' }
const tierLabel = (t: string | null) => t ? (TIER_LABEL[t] ?? t) : ''
const TYPE_LABEL: Record<string, string> = { video: 'Video', document: 'Document', image: 'Image', text: 'Reading', quiz: 'Quiz', game: 'Game', recipe: 'Recipe', acknowledge: 'Acknowledge', practical: 'POS practical exam' }
const GRADED = new Set(['quiz', 'game', 'practical'])

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
        <p style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Courses assigned to you. Complete them to earn a certificate of completion.</p>
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
                      {c?.tier && tier && <span style={pill(tier)}>{tierLabel(c.tier)}</span>}
                      {e.certified && <span style={pill(DEEP)}>✓ Completed</span>}
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

      <CertificatesSection />

      {/* TP-SEED — persistent honest line (presence permanent; honest naming is the shield). */}
      <p style={{ fontSize: 11, color: MUTED, marginTop: 26, lineHeight: 1.5 }}>
        Internal training records — for your own onboarding and reference. Not an accredited qualification.
        Staff must hold any legally required certificates (e.g. Food Safety, RSA) from a registered training organisation (RTO).
      </p>
    </div>
  )
}

// ── My Certificates — earned certs live here under the user. Viewable + printable. ──
interface Certificate { id: string; cert_number: string; course_title: string; staff_name: string | null; score: number | null; issued_at: string; expires_at: string | null }
function CertificatesSection() {
  const [certs, setCerts] = useState<Certificate[]>([])
  const [open, setOpen] = useState<Certificate | null>(null)
  useEffect(() => { api<{ certificates: Certificate[] }>('/api/staff/portal/training?certificates=1').then(d => setCerts(d.certificates ?? [])).catch(() => {}) }, [])
  if (certs.length === 0) return null
  return (
    <div style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: '0 0 4px' }}>My Certificates</h2>
      <p style={{ fontSize: 12.5, color: MUTED, marginBottom: 12 }}>Proof of what you&apos;ve earned. Tap to view or print.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {certs.map(c => {
          const expired = c.expires_at != null && new Date(c.expires_at).getTime() < Date.now()
          return (
            <button key={c.id} onClick={() => setOpen(c)} style={{ textAlign: 'left', background: `linear-gradient(135deg, ${DEEP}, #1c3528)`, color: '#fff', borderRadius: 16, border: 'none', padding: 16, cursor: 'pointer', fontFamily: 'inherit', boxShadow: SHADOW }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#C9A37A', fontWeight: 700 }}>Certificate</span>
                <span style={{ fontSize: 22 }}>🏅</span>
              </div>
              <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, marginTop: 4 }}>{c.course_title}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 6, flexWrap: 'wrap' }}>
                <span>{c.cert_number}</span>
                {c.score != null && <span>{c.score}%</span>}
                <span>{new Date(c.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {c.expires_at && <span style={{ color: expired ? '#ffb4b0' : 'rgba(255,255,255,.7)' }}>{expired ? 'Expired' : 'Renews'} {new Date(c.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              </div>
            </button>
          )
        })}
      </div>
      {open && <CertificateModal cert={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function CertificateModal({ cert, onClose }: { cert: Certificate; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,24,.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="aria-cert-print" style={{ background: '#FBF7F0', borderRadius: 18, maxWidth: 440, width: '100%', padding: 0, overflow: 'hidden', boxShadow: '0 30px 70px -20px rgba(20,30,24,.7)' }}>
        <div style={{ border: `2px solid ${DEEP}`, margin: 14, borderRadius: 12, padding: '28px 24px', textAlign: 'center', position: 'relative' }}>
          <div style={{ fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: AMBER, fontWeight: 700 }}>Certificate of Completion</div>
          <div style={{ fontSize: 34, margin: '10px 0 2px' }}>🏅</div>
          <div style={{ fontSize: 12, color: MUTED }}>This confirms that</div>
          <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 30, fontWeight: 600, color: DEEP, lineHeight: 1.1, margin: '4px 0' }}>{cert.staff_name ?? 'Team member'}</div>
          <div style={{ fontSize: 12, color: MUTED }}>has successfully completed</div>
          <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, color: INK, margin: '4px 0 10px' }}>{cert.course_title}</div>
          {cert.score != null && <div style={{ fontSize: 13, color: DEEP, fontWeight: 700 }}>Score: {cert.score}%</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, fontSize: 10.5, color: MUTED }}>
            <span>{cert.cert_number}</span>
            <span>Issued {new Date(cert.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          {cert.expires_at && <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Valid until {new Date(cert.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>}
          <div style={{ fontSize: 10, color: AMBER, letterSpacing: '.1em', marginTop: 8, fontWeight: 600 }}>ariaOS Training Academy</div>
          <div style={{ fontSize: 9.5, color: MUTED, marginTop: 6, lineHeight: 1.4 }}>Internal training record — not an accredited qualification.</div>
        </div>
        <div className="aria-cert-noprint" style={{ display: 'flex', gap: 8, padding: '0 14px 16px' }}>
          <button onClick={() => window.print()} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${DEEP}`, background: '#fff', color: DEEP, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Print / Save PDF</button>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: DEEP, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
        </div>
      </div>
      <style>{`@media print{body *{visibility:hidden!important}.aria-cert-print,.aria-cert-print *{visibility:visible!important}.aria-cert-noprint{display:none!important}.aria-cert-print{position:fixed;inset:0;margin:auto;box-shadow:none!important}}`}</style>
    </div>
  )
}

interface LessonResult { ok: boolean; lesson_score: number | null; passed: boolean; pass_mark: number; progress_pct: number; status: string; certified: boolean }

function CoursePlayer({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const [course, setCourse] = useState<{ title: string; description: string | null; tier: string | null; pass_mark?: number } | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [enrolId, setEnrolId] = useState<string | null>(null)
  const [enrol, setEnrol] = useState<{ status: string; progress_pct: number; certified: boolean } | null>(null)
  const [gamePass, setGamePass] = useState(60)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<{ enrolment: { id: string; status: string; progress_pct: number; certified: boolean }; course: typeof course; lessons: Lesson[]; completed_lesson_ids: string[]; lesson_scores?: Record<string, number | null>; game_pass?: number }>(`/api/staff/portal/training?course_id=${courseId}`)
      setCourse(d.course); setLessons(d.lessons ?? []); setDone(new Set(d.completed_lesson_ids ?? [])); setScores(d.lesson_scores ?? {}); setEnrolId(d.enrolment.id); setEnrol(d.enrolment); if (d.game_pass) setGamePass(d.game_pass)
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [courseId])
  useEffect(() => { load() }, [load])

  // Single completion path for ALL lesson types: view-complete, quiz (answers), game (score).
  async function complete(lessonId: string, extra?: { answers?: Array<{ question_id: string; option_id: string }>; score?: number }): Promise<LessonResult | null> {
    if (!enrolId) return null
    setBusy(lessonId); setErr('')
    try {
      const r = await api<LessonResult>('/api/staff/portal/training', { method: 'POST', body: { enrolment_id: enrolId, lesson_id: lessonId, ...extra } })
      setDone(prev => { const n = new Set(prev); if (r.passed) n.add(lessonId); else n.delete(lessonId); return n })
      if (r.lesson_score != null) setScores(s => ({ ...s, [lessonId]: Math.max(Number(s[lessonId] ?? 0), r.lesson_score ?? 0) }))
      setEnrol(e => e ? { ...e, progress_pct: r.progress_pct, status: r.status, certified: r.certified } : e)
      return r
    } catch (e) { setErr((e as Error).message); return null } finally { setBusy(null) }
  }
  const passMark = Number(course?.pass_mark ?? 80)

  const tier = course?.tier ? TIER_COLOR[course.tier] : SAGE
  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: DEEP, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0', marginBottom: 8 }}>← My Training</button>
      {loading ? <div style={{ color: MUTED, textAlign: 'center', padding: 40 }}>Loading…</div> : (
        <>
          <header style={{ marginBottom: 14 }}>
            {course?.tier && <span style={pill(tier)}>{tierLabel(course.tier)}</span>}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: '8px 0 2px' }}>{course?.title}</h1>
            {course?.description && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>{course.description}</p>}
            {enrol && (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 7, borderRadius: 99, background: '#eef2ef', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${enrol.progress_pct}%`, background: enrol.status === 'complete' ? DEEP : SAGE, borderRadius: 99, transition: 'width .3s' }} />
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>
                  {enrol.progress_pct}% complete{enrol.certified ? ' · ✓ Completed' : ''}
                </div>
              </div>
            )}
          </header>

          {err && <div style={{ background: `${RED}10`, border: `1px solid ${RED}40`, color: RED, borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 14 }}>{err}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lessons.map((l, i) => {
              const isDone = done.has(l.id)
              const graded = GRADED.has(l.type)
              const score = scores[l.id]
              const threshold = l.type === 'game' ? gamePass : passMark
              return (
                <div key={l.id} style={{ background: CARD, borderRadius: 14, boxShadow: SHADOW, border: `1px solid ${LINE}`, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: isDone ? DEEP : '#eef2ef', color: isDone ? '#fff' : MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{isDone ? '✓' : i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{l.title || TYPE_LABEL[l.type]}</div>
                      <span style={{ ...pill(MUTED), marginTop: 3 }}>{TYPE_LABEL[l.type] ?? l.type}{graded && score != null ? ` · best ${score}%` : ''}</span>
                    </div>
                  </div>

                  {/* ── Interactive bodies ── */}
                  {l.type === 'video' && l.url && <VideoEmbed url={l.url} />}
                  {l.type === 'image' && l.url && <img src={l.url} alt={l.title ?? ''} style={{ marginTop: 10, maxWidth: '100%', borderRadius: 10 }} />}
                  {l.type === 'document' && l.url && (
                    <a href={l.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 13, color: DEEP, fontWeight: 600 }}>Open document →</a>
                  )}
                  {l.content && ['text', 'document', 'acknowledge'].includes(l.type) && (
                    <p style={{ marginTop: 10, fontSize: 13, color: INK, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{l.content}</p>
                  )}
                  {l.type === 'recipe' && (
                    <p style={{ marginTop: 10, fontSize: 12.5, color: MUTED }}>Recipe walkthrough{l.recipe_id ? '' : ' (link a recipe in the builder)'}.</p>
                  )}

                  {l.type === 'quiz' && (
                    <QuizPlayer lessonId={l.id} passMark={passMark} busy={busy === l.id} bestScore={score ?? null} done={isDone}
                      onSubmit={(answers) => complete(l.id, { answers })} />
                  )}

                  {l.type === 'game' && (
                    <GameLesson roundId={l.game_round || 'pos'} busy={busy === l.id} bestScore={score ?? null} threshold={threshold} done={isDone}
                      onScore={(s) => complete(l.id, { score: s })} />
                  )}

                  {l.type === 'practical' && (
                    <PracticalLesson busy={busy === l.id} bestScore={score ?? null} threshold={passMark} done={isDone}
                      onScore={(s) => complete(l.id, { score: s })} />
                  )}

                  {/* ── Action for non-interactive lessons ── */}
                  {!['quiz', 'game', 'practical'].includes(l.type) && (
                    <div style={{ marginTop: 12 }}>
                      {isDone
                        ? <span style={{ fontSize: 12.5, color: DEEP, fontWeight: 600 }}>✓ Completed</span>
                        : <button onClick={() => complete(l.id)} disabled={busy === l.id} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: l.type === 'acknowledge' ? DEEP : SAGE, color: l.type === 'acknowledge' ? '#fff' : '#0c130f', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy === l.id ? 0.6 : 1 }}>
                            {busy === l.id ? 'Saving…' : l.type === 'acknowledge' ? 'I acknowledge' : 'Mark complete'}
                          </button>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Quiz player — questions arrive WITHOUT the answer key; scoring is server-side. ──
interface QQ { id: string; question: string; options: Array<{ id: string; text: string }>; points: number }
function QuizPlayer({ lessonId, passMark, busy, bestScore, done, onSubmit }: { lessonId: string; passMark: number; busy: boolean; bestScore: number | null; done: boolean; onSubmit: (answers: Array<{ question_id: string; option_id: string }>) => Promise<LessonResult | null> }) {
  const [questions, setQuestions] = useState<QQ[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(!done)
  const [result, setResult] = useState<{ score: number | null; passed: boolean } | null>(null)

  useEffect(() => {
    api<{ questions: QQ[] }>(`/api/staff/portal/training?lesson_id=${lessonId}`).then(d => setQuestions(d.questions ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [lessonId])

  async function submit() {
    const payload = Object.entries(answers).map(([question_id, option_id]) => ({ question_id, option_id }))
    const r = await onSubmit(payload)
    if (r) { setResult({ score: r.lesson_score, passed: r.passed }); if (r.passed) setOpen(false) }
  }

  if (done && !open && !result) {
    return (
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12.5, color: DEEP, fontWeight: 600 }}>✓ Passed{bestScore != null ? ` · ${bestScore}%` : ''}</span>
        <button onClick={() => { setResult(null); setAnswers({}); setOpen(true) }} style={{ ...pill(MUTED), cursor: 'pointer', border: `1px solid ${LINE}`, background: '#fff' }}>Retake</button>
      </div>
    )
  }
  if (loading) return <p style={{ marginTop: 10, fontSize: 12.5, color: MUTED }}>Loading quiz…</p>

  const allAnswered = questions.length > 0 && questions.every(q => answers[q.id])
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {questions.map((q, qi) => (
        <div key={q.id}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 6 }}>{qi + 1}. {q.question}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {q.options.map(o => (
              <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${answers[q.id] === o.id ? SAGE : LINE}`, background: answers[q.id] === o.id ? `${SAGE}14` : '#fff', cursor: 'pointer' }}>
                <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === o.id} onChange={() => setAnswers(a => ({ ...a, [q.id]: o.id }))} />
                {o.text}
              </label>
            ))}
          </div>
        </div>
      ))}
      {result && (
        <div style={{ fontSize: 13, fontWeight: 600, color: result.passed ? DEEP : RED, background: result.passed ? `${SAGE}14` : `${RED}10`, border: `1px solid ${result.passed ? SAGE : RED}40`, borderRadius: 10, padding: '10px 12px' }}>
          {result.passed ? `✓ Passed — ${result.score}% (pass mark ${passMark}%)` : `Not passed — ${result.score}% (need ${passMark}%). Try again.`}
        </div>
      )}
      <button onClick={submit} disabled={busy || !allAnswered} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: SAGE, color: '#0c130f', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy || !allAnswered ? 0.5 : 1, alignSelf: 'flex-start' }}>
        {busy ? 'Scoring…' : result && !result.passed ? 'Submit again' : 'Submit answers'}
      </button>
    </div>
  )
}

// ── Game lesson — plays a ported TRAIN-1 round; the round reports a 0-100 score. ──
function GameLesson({ roundId, busy, bestScore, threshold, done, onScore }: { roundId: string; busy: boolean; bestScore: number | null; threshold: number; done: boolean; onScore: (score: number) => Promise<LessonResult | null> }) {
  const [playing, setPlaying] = useState(false)
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null)

  async function handleScore(score: number) {
    setPlaying(false)
    const r = await onScore(score)
    if (r) setResult({ score: r.lesson_score ?? score, passed: r.passed })
  }

  if (playing) {
    return (
      <div style={{ marginTop: 12 }}>
        <AriaGameRound roundId={roundId} onComplete={handleScore} />
      </div>
    )
  }
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {result && (
        <div style={{ fontSize: 13, fontWeight: 600, color: result.passed ? DEEP : RED, background: result.passed ? `${SAGE}14` : `${RED}10`, border: `1px solid ${result.passed ? SAGE : RED}40`, borderRadius: 10, padding: '10px 12px' }}>
          {result.passed ? `✓ Passed — scored ${result.score}% (pass ${threshold}%)` : `Scored ${result.score}% — need ${threshold}% to pass. Have another go.`}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => { setResult(null); setPlaying(true) }} disabled={busy} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: DEEP, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1, alignSelf: 'flex-start' }}>
          {busy ? 'Saving…' : done ? 'Play again' : '▶ Play round'}
        </button>
        {done && <span style={{ fontSize: 12.5, color: DEEP, fontWeight: 600 }}>✓ Passed{bestScore != null ? ` · best ${bestScore}%` : ''}</span>}
      </div>
    </div>
  )
}

// ── Practical exam lesson — the SANDBOXED POS simulator (writes no real pos_* rows). ──
function PracticalLesson({ busy, bestScore, threshold, done, onScore }: { busy: boolean; bestScore: number | null; threshold: number; done: boolean; onScore: (score: number) => Promise<LessonResult | null> }) {
  const [playing, setPlaying] = useState(false)
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null)

  async function handleScore(score: number) {
    setPlaying(false)
    const r = await onScore(score)
    if (r) setResult({ score: r.lesson_score ?? score, passed: r.passed })
  }

  if (playing) return <PosPracticalExam onComplete={handleScore} />
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12.5, color: MUTED, fontStyle: 'italic' }}>A hands-on POS exam on the practice till. Nothing here touches real sales — it&apos;s a safe sandbox.</div>
      {result && (
        <div style={{ fontSize: 13, fontWeight: 600, color: result.passed ? DEEP : RED, background: result.passed ? `${SAGE}14` : `${RED}10`, border: `1px solid ${result.passed ? SAGE : RED}40`, borderRadius: 10, padding: '10px 12px' }}>
          {result.passed ? `✓ Passed — scored ${result.score}% (pass ${threshold}%)` : `Scored ${result.score}% — need ${threshold}% to pass. Try again.`}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => { setResult(null); setPlaying(true) }} disabled={busy} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: DEEP, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1, alignSelf: 'flex-start' }}>
          {busy ? 'Saving…' : done ? 'Retake exam' : '▶ Start practical exam'}
        </button>
        {done && <span style={{ fontSize: 12.5, color: DEEP, fontWeight: 600 }}>✓ Passed{bestScore != null ? ` · best ${bestScore}%` : ''}</span>}
      </div>
    </div>
  )
}

// ── Video embed — YouTube/Vimeo iframe (owner hosts free) or HTML5 <video> for direct files. ──
function VideoEmbed({ url }: { url: string }) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/)
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  const frame: React.CSSProperties = { width: '100%', aspectRatio: '16 / 9', border: 'none', borderRadius: 10, marginTop: 10 }
  if (yt) return <iframe style={frame} src={`https://www.youtube.com/embed/${yt[1]}`} title="Lesson video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
  if (vimeo) return <iframe style={frame} src={`https://player.vimeo.com/video/${vimeo[1]}`} title="Lesson video" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
  return <video src={url} controls style={{ ...frame, background: '#000' }} />
}
