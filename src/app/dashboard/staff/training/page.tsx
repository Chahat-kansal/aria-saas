'use client'
import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

// TP-1 — Owner course-builder. Authoring only (enrolment / progress / staff "My Training" /
// cohort dashboard / Aria auto-draft are TP-2..TP-5). Brand palette + Cormorant/Outfit.
const G = '#7FB897', D = '#2D5240', GOLD = '#C9A37A', AMBER = '#BA7517', RED = '#E24B4A'
const DISPLAY = "var(--font-display, 'Cormorant', Georgia, serif)"

const TIERS = [
  { id: 'compliance', label: 'Compliance', color: RED },
  { id: 'skill', label: 'Skill', color: G },
  { id: 'systems', label: 'Systems', color: GOLD },
  { id: 'culture', label: 'Culture', color: AMBER },
]
const tierMeta = (t: string | null) => TIERS.find(x => x.id === t)

const LESSON_TYPES = [
  { id: 'video', label: 'Video' },
  { id: 'document', label: 'Document' },
  { id: 'image', label: 'Image' },
  { id: 'text', label: 'Text / Reading' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'game', label: 'Game round' },
  { id: 'recipe', label: 'Recipe' },
  { id: 'acknowledge', label: 'Acknowledge doc' },
]
const typeLabel = (t: string) => LESSON_TYPES.find(x => x.id === t)?.label ?? t

interface QuizOption { id: string; text: string }
interface QuizQ { id: string; lesson_id: string; sort_order: number; question: string; options: QuizOption[]; correct: string | null; points: number }
interface Lesson { id: string; course_id: string; sort_order: number; type: string; title: string | null; content: string | null; url: string | null; recipe_id: string | null; game_round: string | null; duration_seconds: number | null; training_quiz_questions?: QuizQ[] }
interface Course { id: string; title: string; description: string | null; tier: string | null; role_tags: string[]; is_mandatory: boolean; pass_mark: number; cert_skill_id: string | null; est_minutes: number | null; expires_months: number | null; status: string; training_lessons?: Lesson[] }
interface Skill { id: string; name: string; color: string }

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18 }
const inp: React.CSSProperties = { padding: '8px 11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e8ede7', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 5, display: 'block', letterSpacing: '0.02em' }
const btn = (bg: string, fg = '#0c130f'): React.CSSProperties => ({ padding: '8px 16px', borderRadius: 8, border: 'none', background: bg, color: fg, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' })
const ghost = (c = G): React.CSSProperties => ({ padding: '6px 13px', borderRadius: 7, border: `1px solid ${c}55`, background: `${c}14`, color: c, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })
const pill = (c: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: `${c}1f`, color: c, border: `1px solid ${c}44`, letterSpacing: '0.03em' })

async function api<T = unknown>(url: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: opts?.method ?? 'GET',
    headers: opts?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Request failed')
  return d as T
}

export default function TrainingBuilderPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<{ courses: Course[]; skills: Skill[] }>('/api/training/courses')
      setCourses(d.courses ?? [])
      setSkills(d.skills ?? [])
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function createCourse() {
    setErr('')
    try {
      const d = await api<{ course: Course }>('/api/training/courses', { method: 'POST', body: { title: 'Untitled course', tier: 'compliance' } })
      await load()
      setEditingId(d.course.id)
    } catch (e) { setErr((e as Error).message) }
  }

  const editing = courses.find(c => c.id === editingId) ?? null

  return (
    <div style={{ padding: 24, maxWidth: 1180, color: '#e8ede7', margin: '0 auto' }}>
      {/* Sub-nav back to Team */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link href="/dashboard/staff" style={ghost('rgba(255,255,255,0.4)')}>← Team</Link>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>/ Training</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 34, fontWeight: 600, margin: 0, lineHeight: 1.1 }}>Training Academy</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>Build courses, certify your team, stay compliant. Microlearning that sticks.</p>
        </div>
        {courses.length > 0 && <button onClick={createCourse} style={btn(G)}>+ New course</button>}
      </div>

      {err && <div style={{ ...card, borderColor: `${RED}55`, color: RED, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {editing
        ? <CourseBuilder course={editing} skills={skills} onClose={() => setEditingId(null)} onChange={load} />
        : loading
          ? <div style={{ color: 'rgba(255,255,255,0.35)', padding: 40, textAlign: 'center' }}>Loading…</div>
          : courses.length === 0
            ? <EmptyState onCreate={createCourse} />
            : <CourseGrid courses={courses} skills={skills} onOpen={setEditingId} />}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ ...card, padding: '48px 28px', textAlign: 'center', background: `linear-gradient(160deg, ${D}22, rgba(255,255,255,0.02))`, borderColor: `${G}33` }}>
      <div style={{ fontSize: 38, marginBottom: 6 }}>🎓</div>
      <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 26, fontWeight: 600, margin: '0 0 8px' }}>Turn your know-how into a training academy</h2>
      <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', maxWidth: 480, margin: '0 auto 22px', lineHeight: 1.6 }}>
        Onboard new starters in days, not weeks. Certify staff on food safety, your POS, recipes and culture —
        with quizzes that prove they got it. Mandatory courses auto-assign by role; compliance courses auto-expire and re-trigger.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onCreate} style={btn(G)}>+ Build a course</button>
        <button
          onClick={onCreate}
          title="Aria can draft a course from your recipes — coming soon"
          style={{ ...ghost(GOLD), padding: '8px 16px', fontSize: 13 }}
        >✦ Let Aria draft one from your recipes</button>
      </div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 14 }}>Aria auto-draft arrives soon — start one manually now.</p>
    </div>
  )
}

function CourseGrid({ courses, skills, onOpen }: { courses: Course[]; skills: Skill[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
      {courses.map(c => {
        const tm = tierMeta(c.tier)
        const lessons = c.training_lessons ?? []
        const hasGame = lessons.some(l => l.type === 'game')
        const hasQuiz = lessons.some(l => l.type === 'quiz')
        const cert = skills.find(s => s.id === c.cert_skill_id)
        return (
          <button key={c.id} onClick={() => onOpen(c.id)} style={{ ...card, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {tm && <span style={pill(tm.color)}>{tm.label}</span>}
              {c.is_mandatory && <span style={pill(RED)}>Required</span>}
              {hasGame && <span style={pill(GOLD)}>Game</span>}
              {hasQuiz && <span style={pill(G)}>Quiz</span>}
              <span style={{ ...pill(c.status === 'published' ? G : c.status === 'archived' ? 'rgba(255,255,255,0.35)' : AMBER), marginLeft: 'auto' }}>{c.status}</span>
            </div>
            <div>
              <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 20, fontWeight: 600 }}>{c.title}</div>
              {c.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.description}</div>}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 'auto', flexWrap: 'wrap' }}>
              <span>{lessons.length} lesson{lessons.length === 1 ? '' : 's'}</span>
              {c.est_minutes ? <span>~{c.est_minutes} min</span> : null}
              {c.expires_months ? <span>renews {c.expires_months}mo</span> : null}
              {cert && <span style={{ color: cert.color }}>certifies {cert.name}</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function CourseBuilder({ course, skills, onClose, onChange }: { course: Course; skills: Skill[]; onClose: () => void; onChange: () => void }) {
  const [c, setC] = useState<Course>(course)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { setC(course) }, [course])

  const lessons = course.training_lessons ?? []

  async function save(patch: Partial<Course>) {
    setSaving(true); setMsg('')
    try {
      await api('/api/training/courses', { method: 'PATCH', body: { id: course.id, ...patch } })
      await onChange()
    } catch (e) { setMsg((e as Error).message) } finally { setSaving(false) }
  }
  function field<K extends keyof Course>(k: K, v: Course[K]) { setC(prev => ({ ...prev, [k]: v })) }

  async function publish() { await save({ status: c.status === 'published' ? 'draft' : 'published' }) }
  async function archive() { if (confirm('Archive this course?')) { await save({ status: 'archived' }); onClose() } }
  async function del() { if (!confirm('Delete this course and all its lessons? This cannot be undone.')) return; setBusy(true); try { await api(`/api/training/courses?id=${course.id}`, { method: 'DELETE' }); await onChange(); onClose() } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }

  async function addLesson(type: string) {
    setBusy(true); setMsg('')
    try { await api('/api/training/lessons', { method: 'POST', body: { course_id: course.id, type, title: `${typeLabel(type)} lesson` } }); await onChange() }
    catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  async function moveLesson(idx: number, dir: -1 | 1) {
    const arr = [...lessons]; const j = idx + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    setBusy(true)
    try { await api('/api/training/lessons', { method: 'PATCH', body: { reorder: arr.map((l, i) => ({ id: l.id, sort_order: i })) } }); await onChange() }
    catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={onClose} style={ghost('rgba(255,255,255,0.4)')}>← All courses</button>
        <span style={{ ...pill(c.status === 'published' ? G : c.status === 'archived' ? 'rgba(255,255,255,0.35)' : AMBER) }}>{c.status}</span>
        {saving && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>saving…</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={publish} style={btn(c.status === 'published' ? 'rgba(255,255,255,0.1)' : G, c.status === 'published' ? '#e8ede7' : '#0c130f')}>{c.status === 'published' ? 'Unpublish' : 'Publish'}</button>
          <button onClick={archive} style={ghost(AMBER)}>Archive</button>
          <button onClick={del} disabled={busy} style={ghost(RED)}>Delete</button>
        </div>
      </div>

      {msg && <div style={{ ...card, borderColor: `${RED}55`, color: RED, fontSize: 13 }}>{msg}</div>}

      {/* Course settings */}
      <div style={card}>
        <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: '0 0 14px' }}>Course details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Title</label>
            <input style={inp} value={c.title} onChange={e => field('title', e.target.value)} onBlur={() => c.title !== course.title && save({ title: c.title })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={c.description ?? ''} onChange={e => field('description', e.target.value)} onBlur={() => (c.description ?? '') !== (course.description ?? '') && save({ description: c.description })} />
          </div>
          <div>
            <label style={lbl}>Tier</label>
            <select style={inp} value={c.tier ?? ''} onChange={e => { field('tier', e.target.value || null); save({ tier: e.target.value || null }) }}>
              <option value="">—</option>
              {TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Grants certification (skill)</label>
            <select style={inp} value={c.cert_skill_id ?? ''} onChange={e => { field('cert_skill_id', e.target.value || null); save({ cert_skill_id: e.target.value || null }) }}>
              <option value="">None</option>
              {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Roles (comma-separated — auto-assign)</label>
            <input style={inp} defaultValue={(c.role_tags ?? []).join(', ')} placeholder="barista, manager" onBlur={e => { const tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean); save({ role_tags: tags }) }} />
          </div>
          <div>
            <label style={lbl}>Pass mark (%)</label>
            <input style={inp} type="number" value={c.pass_mark} onChange={e => field('pass_mark', Number(e.target.value))} onBlur={() => c.pass_mark !== course.pass_mark && save({ pass_mark: c.pass_mark })} />
          </div>
          <div>
            <label style={lbl}>Est. minutes</label>
            <input style={inp} type="number" value={c.est_minutes ?? ''} onChange={e => field('est_minutes', e.target.value === '' ? null : Number(e.target.value))} onBlur={() => (c.est_minutes ?? null) !== (course.est_minutes ?? null) && save({ est_minutes: c.est_minutes })} />
          </div>
          <div>
            <label style={lbl}>Expires after (months — blank = never)</label>
            <input style={inp} type="number" value={c.expires_months ?? ''} onChange={e => field('expires_months', e.target.value === '' ? null : Number(e.target.value))} onBlur={() => (c.expires_months ?? null) !== (course.expires_months ?? null) && save({ expires_months: c.expires_months })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={c.is_mandatory} onChange={e => { field('is_mandatory', e.target.checked); save({ is_mandatory: e.target.checked }) }} />
              Mandatory for tagged roles
            </label>
          </div>
        </div>
      </div>

      {/* Lessons */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: 0 }}>Lessons <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontStyle: 'normal', fontFamily: 'inherit' }}>· keep them short</span></h2>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {LESSON_TYPES.map(t => <button key={t.id} onClick={() => addLesson(t.id)} disabled={busy} style={ghost(G)}>+ {t.label}</button>)}
        </div>
        {lessons.length === 0
          ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '18px 0' }}>No lessons yet — add one above. Mix videos, docs, a quiz and an acknowledge step.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lessons.map((l, i) => <LessonRow key={l.id} lesson={l} idx={i} total={lessons.length} onMove={moveLesson} onChange={onChange} setMsg={setMsg} />)}
            </div>}
      </div>
    </div>
  )
}

function LessonRow({ lesson, idx, total, onMove, onChange, setMsg }: { lesson: Lesson; idx: number; total: number; onMove: (i: number, d: -1 | 1) => void; onChange: () => void; setMsg: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const [l, setL] = useState<Lesson>(lesson)
  useEffect(() => { setL(lesson) }, [lesson])

  async function save(patch: Partial<Lesson>) {
    try { await api('/api/training/lessons', { method: 'PATCH', body: { id: lesson.id, ...patch } }); await onChange() }
    catch (e) { setMsg((e as Error).message) }
  }
  async function del() { if (!confirm('Delete this lesson?')) return; try { await api(`/api/training/lessons?id=${lesson.id}`, { method: 'DELETE' }); await onChange() } catch (e) { setMsg((e as Error).message) } }

  const accent = lesson.type === 'quiz' ? G : lesson.type === 'game' ? GOLD : lesson.type === 'acknowledge' ? AMBER : 'rgba(255,255,255,0.5)'
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', width: 18, textAlign: 'center' }}>{idx + 1}</span>
        <span style={pill(accent)}>{typeLabel(lesson.type)}</span>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#e8ede7', fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: 1, textAlign: 'left', fontFamily: 'inherit' }}>{l.title || `Untitled ${typeLabel(lesson.type)}`}</button>
        <button onClick={() => onMove(idx, -1)} disabled={idx === 0} style={{ ...ghost('rgba(255,255,255,0.4)'), padding: '3px 9px', opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
        <button onClick={() => onMove(idx, 1)} disabled={idx === total - 1} style={{ ...ghost('rgba(255,255,255,0.4)'), padding: '3px 9px', opacity: idx === total - 1 ? 0.3 : 1 }}>↓</button>
        <button onClick={del} style={{ ...ghost(RED), padding: '3px 9px' }}>✕</button>
      </div>
      {open && (
        <div style={{ padding: '4px 12px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <label style={lbl}>Title</label>
            <input style={inp} value={l.title ?? ''} onChange={e => setL({ ...l, title: e.target.value })} onBlur={() => (l.title ?? '') !== (lesson.title ?? '') && save({ title: l.title })} />
          </div>
          {['video', 'document', 'image'].includes(lesson.type) && (
            <div>
              <label style={lbl}>Media URL</label>
              <input style={inp} value={l.url ?? ''} placeholder="https://…" onChange={e => setL({ ...l, url: e.target.value })} onBlur={() => (l.url ?? '') !== (lesson.url ?? '') && save({ url: l.url })} />
            </div>
          )}
          {['text', 'document', 'acknowledge'].includes(lesson.type) && (
            <div>
              <label style={lbl}>{lesson.type === 'acknowledge' ? 'Policy text to acknowledge' : 'Content (markdown)'}</label>
              <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={l.content ?? ''} onChange={e => setL({ ...l, content: e.target.value })} onBlur={() => (l.content ?? '') !== (lesson.content ?? '') && save({ content: l.content })} />
            </div>
          )}
          {lesson.type === 'recipe' && (
            <div>
              <label style={lbl}>Recipe ID</label>
              <input style={inp} value={l.recipe_id ?? ''} placeholder="recipe uuid" onChange={e => setL({ ...l, recipe_id: e.target.value })} onBlur={() => (l.recipe_id ?? '') !== (lesson.recipe_id ?? '') && save({ recipe_id: l.recipe_id })} />
            </div>
          )}
          {lesson.type === 'game' && (
            <div>
              <label style={lbl}>Game round key</label>
              <input style={inp} value={l.game_round ?? ''} placeholder="e.g. coffee-dial-in" onChange={e => setL({ ...l, game_round: e.target.value })} onBlur={() => (l.game_round ?? '') !== (lesson.game_round ?? '') && save({ game_round: l.game_round })} />
            </div>
          )}
          {lesson.type === 'quiz' && <QuizEditor lesson={lesson} onChange={onChange} setMsg={setMsg} />}
        </div>
      )}
    </div>
  )
}

function QuizEditor({ lesson, onChange, setMsg }: { lesson: Lesson; onChange: () => void; setMsg: (s: string) => void }) {
  const questions = (lesson.training_quiz_questions ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)

  async function addQuestion() {
    const opts: QuizOption[] = [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }]
    try { await api('/api/training/quiz-questions', { method: 'POST', body: { lesson_id: lesson.id, question: 'New question', options: opts, correct: 'a', points: 1 } }); await onChange() }
    catch (e) { setMsg((e as Error).message) }
  }
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ ...lbl, marginBottom: 0 }}>Questions ({questions.length})</span>
        <button onClick={addQuestion} style={ghost(G)}>+ Question</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {questions.map(q => <QuestionRow key={q.id} q={q} onChange={onChange} setMsg={setMsg} />)}
      </div>
    </div>
  )
}

function QuestionRow({ q, onChange, setMsg }: { q: QuizQ; onChange: () => void; setMsg: (s: string) => void }) {
  const [state, setState] = useState<QuizQ>(q)
  useEffect(() => { setState(q) }, [q])

  async function save(patch: Partial<QuizQ>) {
    try { await api('/api/training/quiz-questions', { method: 'PATCH', body: { id: q.id, ...patch } }); await onChange() }
    catch (e) { setMsg((e as Error).message) }
  }
  async function del() { if (!confirm('Delete this question?')) return; try { await api(`/api/training/quiz-questions?id=${q.id}`, { method: 'DELETE' }); await onChange() } catch (e) { setMsg((e as Error).message) } }
  function setOpt(id: string, text: string) { setState(s => ({ ...s, options: s.options.map(o => o.id === id ? { ...o, text } : o) })) }

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: 11, background: 'rgba(255,255,255,0.015)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input style={{ ...inp, flex: 1 }} value={state.question} onChange={e => setState({ ...state, question: e.target.value })} onBlur={() => state.question !== q.question && save({ question: state.question })} />
        <button onClick={del} style={{ ...ghost(RED), padding: '5px 10px' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6 }}>
        {state.options.map(o => (
          <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="radio" name={`correct-${q.id}`} checked={state.correct === o.id} onChange={() => { setState(s => ({ ...s, correct: o.id })); save({ correct: o.id }) }} title="Mark correct" />
            <input style={{ ...inp, padding: '5px 8px' }} value={o.text} placeholder={`Option ${o.id.toUpperCase()}`} onChange={e => setOpt(o.id, e.target.value)} onBlur={() => save({ options: state.options })} />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ ...lbl, marginBottom: 0 }}>Points</span>
        <input style={{ ...inp, width: 70 }} type="number" value={state.points} onChange={e => setState({ ...state, points: Number(e.target.value) })} onBlur={() => state.points !== q.points && save({ points: state.points })} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>● green radio marks the correct answer</span>
      </div>
    </div>
  )
}
