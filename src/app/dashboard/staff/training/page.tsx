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
  { id: 'practical', label: 'POS practical exam' },
  { id: 'recipe', label: 'Recipe' },
  { id: 'acknowledge', label: 'Acknowledge doc' },
]
const typeLabel = (t: string) => LESSON_TYPES.find(x => x.id === t)?.label ?? t

interface QuizOption { id: string; text: string }
interface QuizQ { id: string; lesson_id: string; sort_order: number; question: string; options: QuizOption[]; correct: string | null; points: number }
interface Lesson { id: string; course_id: string; sort_order: number; type: string; title: string | null; content: string | null; url: string | null; recipe_id: string | null; game_round: string | null; duration_seconds: number | null; training_quiz_questions?: QuizQ[] }
interface Course { id: string; title: string; description: string | null; tier: string | null; role_tags: string[]; is_mandatory: boolean; pass_mark: number; cert_skill_id: string | null; est_minutes: number | null; expires_months: number | null; status: string; training_lessons?: Lesson[]; enrolled_count?: number }
interface Skill { id: string; name: string; color: string }
interface Staff { id: string; first_name: string; last_name: string; position: string | null }
const staffName = (s: Staff) => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Staff'

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18 }

// TP-CARDS — approved "white cards on dark" tokens (training surface only; not the global theme).
const WHITE = '#fff', CARD_SHADOW = '0 10px 30px rgba(0,0,0,.28)'
const INK = '#1A1D23', META = '#8896A5'
const whiteCard: React.CSSProperties = { background: WHITE, borderRadius: 16, boxShadow: CARD_SHADOW, border: '1px solid #ECEFF1' }
// tier/type → header tint strip + tile colour
const TINT = {
  required: { strip: '#E7F1EA', tile: '#E7F1EA', icon: '#3a6b50', emoji: '🛡️' },
  game: { strip: '#F7EFDD', tile: '#FAF0DC', icon: AMBER, emoji: '🎮' },
  skill: { strip: '#F0E9E2', tile: '#F0E9E2', icon: '#7a6a58', emoji: '🎓' },
}
function courseTint(c: { is_mandatory: boolean; tier: string | null }, hasGame: boolean) {
  if (c.is_mandatory || c.tier === 'compliance') return TINT.required
  if (c.tier === 'systems' || hasGame) return TINT.game
  return TINT.skill
}
const tierEmoji = (tier: string | null) => tier === 'compliance' ? '🛡️' : tier === 'systems' ? '🎮' : tier === 'culture' ? '🌿' : '🎓'
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
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [view, setView] = useState<'overview' | 'courses'>('overview')
  const [draft, setDraft] = useState<null | { tab: 'starter' | 'recipe'; recipeId?: string }>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<{ courses: Course[]; skills: Skill[]; staff: Staff[] }>('/api/training/courses')
      setCourses(d.courses ?? [])
      setSkills(d.skills ?? [])
      setStaff(d.staff ?? [])
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Push entry: /dashboard/staff/training?draft_recipe=<id> auto-opens the draft modal on that recipe.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const rid = new URLSearchParams(window.location.search).get('draft_recipe')
    if (rid) { setDraft({ tab: 'recipe', recipeId: rid }); setView('courses') }
  }, [])

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
      <style>{`.tp-card{transition:transform .14s ease, box-shadow .18s ease}.tp-card:hover{transform:translateY(-3px);box-shadow:0 18px 40px rgba(0,0,0,.34)}`}</style>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setDraft({ tab: 'starter' })} style={ghost(GOLD)}>✦ Let Aria set you up</button>
          {courses.length > 0 && <button onClick={createCourse} style={btn(G)}>+ New course</button>}
        </div>
      </div>

      {/* Tabs */}
      {!editing && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
          <button onClick={() => setView('overview')} style={view === 'overview' ? btn(G) : ghost('rgba(255,255,255,0.5)')}>Dashboard</button>
          <button onClick={() => setView('courses')} style={view === 'courses' ? btn(G) : ghost('rgba(255,255,255,0.5)')}>Courses</button>
        </div>
      )}

      {err && <div style={{ ...card, borderColor: `${RED}55`, color: RED, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {editing
        ? <CourseBuilder course={editing} skills={skills} staff={staff} onClose={() => setEditingId(null)} onChange={load} />
        : view === 'overview'
          ? <OverviewDashboard onBuild={() => setView('courses')} onCreate={createCourse} onDraft={() => setDraft({ tab: 'starter' })} />
          : loading
            ? <div style={{ color: 'rgba(255,255,255,0.35)', padding: 40, textAlign: 'center' }}>Loading…</div>
            : courses.length === 0
              ? <EmptyState onCreate={createCourse} onDraft={() => setDraft({ tab: 'recipe' })} />
              : <CourseGrid courses={courses} skills={skills} onOpen={setEditingId} />}

      {draft && <AriaDraftModal initial={draft} onClose={() => setDraft(null)} onDone={async (openId) => { setDraft(null); await load(); setView('courses'); if (openId) setEditingId(openId) }} />}
    </div>
  )
}

function EmptyState({ onCreate, onDraft }: { onCreate: () => void; onDraft: () => void }) {
  return (
    <div style={{ ...whiteCard, background: '#F4F1EA', padding: '48px 28px', textAlign: 'center', border: '1px solid #E6E0D2' }}>
      <div style={{ fontSize: 38, marginBottom: 6 }}>🎓</div>
      <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 27, fontWeight: 600, margin: '0 0 8px', color: D }}>Turn your know-how into a training academy</h2>
      <p style={{ fontSize: 13.5, color: '#4A5568', maxWidth: 480, margin: '0 auto 22px', lineHeight: 1.6 }}>
        Onboard new starters in days, not weeks. Certify staff on food safety, your POS, recipes and culture —
        with quizzes that prove they got it. Mandatory courses auto-assign by role; compliance courses auto-expire and re-trigger.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onCreate} style={{ ...btn(D, '#fff') }}>+ Build a course</button>
        <button onClick={onDraft} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${D}`, background: '#fff', color: D, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>✦ Let Aria draft one from your recipes</button>
      </div>
      <p style={{ fontSize: 11, color: '#8896A5', marginTop: 14 }}>Or let Aria suggest the legally-correct starter library for your business.</p>
    </div>
  )
}

// TP-CARDS pill on white card background.
const wPill = (c: string): React.CSSProperties => ({ display: 'inline-block', padding: '3px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.03em', background: 'rgba(255,255,255,0.9)', color: c, border: '1px solid #ECEFF1', boxShadow: '0 1px 3px rgba(0,0,0,.08)' })

function CourseGrid({ courses, skills, onOpen }: { courses: Course[]; skills: Skill[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {courses.map(c => {
        const lessons = c.training_lessons ?? []
        const hasGame = lessons.some(l => l.type === 'game')
        const hasQuiz = lessons.some(l => l.type === 'quiz')
        const cert = skills.find(s => s.id === c.cert_skill_id)
        const tint = courseTint(c, hasGame)
        const metaBits = [`${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`]
        if (c.est_minutes) metaBits.push(`${c.est_minutes} min`)
        if (hasQuiz) metaBits.push('Quiz')
        return (
          <button key={c.id} onClick={() => onOpen(c.id)}
            className="tp-card"
            style={{ ...whiteCard, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', color: INK }}>
            {/* tinted header strip */}
            <div style={{ position: 'relative', height: 96, background: tint.strip, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 40 }}>{tint.emoji ?? tierEmoji(c.tier)}</span>
              <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {c.is_mandatory && <span style={wPill(RED)}>REQUIRED</span>}
                {hasGame && <span style={wPill(AMBER)}>GAME</span>}
              </div>
              <div style={{ position: 'absolute', bottom: 10, left: 12 }}>
                <span style={{ ...wPill(c.status === 'published' ? '#3a6b50' : c.status === 'archived' ? META : AMBER), fontWeight: 700, textTransform: 'capitalize' }}>{c.status}</span>
              </div>
            </div>
            {/* body */}
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 21, fontWeight: 600, color: INK, lineHeight: 1.15 }}>{c.title}</div>
              {c.description && <div style={{ fontSize: 12, color: META, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.description}</div>}
              <div style={{ fontSize: 11.5, color: META, marginTop: 'auto' }}>{metaBits.join(' · ')}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: META, flexWrap: 'wrap' }}>
                {c.expires_months ? <span>renews {c.expires_months}mo</span> : null}
                {(c.enrolled_count ?? 0) > 0 ? <span style={{ color: '#3a6b50', fontWeight: 600 }}>{c.enrolled_count} assigned</span> : null}
                {cert && <span>certifies {cert.name}</span>}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function CourseBuilder({ course, skills, staff, onClose, onChange }: { course: Course; skills: Skill[]; staff: Staff[]; onClose: () => void; onChange: () => void }) {
  const [c, setC] = useState<Course>(course)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [showAssign, setShowAssign] = useState(false)
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
          {c.status === 'published' && <button onClick={() => setShowAssign(true)} style={btn(GOLD)}>Assign{(course.enrolled_count ?? 0) > 0 ? ` · ${course.enrolled_count}` : ''}</button>}
          <button onClick={publish} style={btn(c.status === 'published' ? 'rgba(255,255,255,0.1)' : G, c.status === 'published' ? '#e8ede7' : '#0c130f')}>{c.status === 'published' ? 'Unpublish' : 'Publish'}</button>
          <button onClick={archive} style={ghost(AMBER)}>Archive</button>
          <button onClick={del} disabled={busy} style={ghost(RED)}>Delete</button>
        </div>
      </div>

      {msg && <div style={{ ...card, borderColor: `${RED}55`, color: RED, fontSize: 13 }}>{msg}</div>}

      {showAssign && <AssignPanel course={course} staff={staff} onClose={() => setShowAssign(false)} onChange={onChange} />}

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

interface Enrolment { id: string; staff_member_id: string; status: string; progress_pct: number; due_at: string | null; certified: boolean; staff_members: { first_name: string; last_name: string; position: string | null } | null }

function AssignPanel({ course, staff, onClose, onChange }: { course: Course; staff: Staff[]; onClose: () => void; onChange: () => void }) {
  const [mode, setMode] = useState<'role' | 'manual'>('role')
  const [dueAt, setDueAt] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [enrols, setEnrols] = useState<Enrolment[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const loadEnrols = useCallback(async () => {
    try { const d = await api<{ enrolments: Enrolment[] }>(`/api/training/enrolments?course_id=${course.id}`); setEnrols(d.enrolments ?? []) } catch { /* non-fatal */ }
  }, [course.id])
  useEffect(() => { loadEnrols() }, [loadEnrols])

  const roleTags = (course.role_tags ?? []).map(r => r.trim().toLowerCase())
  const roleMatched = staff.filter(s => roleTags.includes(String(s.position ?? '').trim().toLowerCase()))

  async function assign() {
    setBusy(true); setMsg('')
    try {
      const body: Record<string, unknown> = { course_id: course.id, mode, due_at: dueAt || null }
      if (mode === 'manual') body.staff_member_ids = [...picked]
      const r = await api<{ assigned: number; total_enrolled: number; error?: string }>('/api/training/enrolments', { method: 'POST', body })
      setMsg(`Assigned to ${r.assigned} staff (${r.total_enrolled} enrolled total).`)
      await loadEnrols(); await onChange()
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  async function unassign(id: string) {
    try { await api(`/api/training/enrolments?id=${id}`, { method: 'DELETE' }); await loadEnrols(); await onChange() } catch (e) { setMsg((e as Error).message) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, maxWidth: 540, width: '100%', background: '#13201a', borderColor: 'rgba(255,255,255,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: 0 }}>Assign “{course.title}”</h2>
          <button onClick={onClose} style={ghost('rgba(255,255,255,0.4)')}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button onClick={() => setMode('role')} style={mode === 'role' ? btn(G) : ghost(G)}>By role</button>
          <button onClick={() => setMode('manual')} style={mode === 'manual' ? btn(G) : ghost(G)}>Pick staff</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Due date (optional)</label>
          <input style={inp} type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} />
        </div>

        {mode === 'role'
          ? <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Roles on this course: {roleTags.length ? roleTags.join(', ') : '— none set (edit course to add roles)'}</label>
              <div style={{ fontSize: 13, color: roleMatched.length ? G : 'rgba(255,255,255,0.4)' }}>
                {roleMatched.length
                  ? `${roleMatched.length} active staff match: ${roleMatched.map(staffName).join(', ')}`
                  : 'No active staff currently match these roles.'}
              </div>
            </div>
          : <div style={{ marginBottom: 14, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {staff.length === 0 ? <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No active staff.</span> : staff.map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '5px 8px', borderRadius: 7, background: picked.has(s.id) ? 'rgba(127,184,151,0.1)' : 'transparent', cursor: 'pointer' }}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={e => setPicked(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n })} />
                  {staffName(s)} <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{s.position}</span>
                </label>
              ))}
            </div>}

        <button onClick={assign} disabled={busy || (mode === 'manual' && picked.size === 0)} style={{ ...btn(G), width: '100%', opacity: busy || (mode === 'manual' && picked.size === 0) ? 0.5 : 1 }}>
          {busy ? 'Assigning…' : mode === 'role' ? `Assign to ${roleMatched.length} by role` : `Assign to ${picked.size} selected`}
        </button>
        {msg && <div style={{ fontSize: 12.5, color: G, marginTop: 10 }}>{msg}</div>}

        {/* Currently enrolled */}
        <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
          <label style={lbl}>Enrolled ({enrols.length})</label>
          {enrols.length === 0
            ? <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)' }}>Nobody assigned yet.</span>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enrols.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ flex: 1 }}>{e.staff_members ? `${e.staff_members.first_name} ${e.staff_members.last_name}` : 'Staff'}</span>
                    <span style={pill(e.status === 'complete' ? G : e.status === 'in_progress' ? AMBER : 'rgba(255,255,255,0.4)')}>{e.progress_pct}% {e.status}</span>
                    {e.certified && <span style={pill(GOLD)}>cert</span>}
                    <button onClick={() => unassign(e.id)} style={{ ...ghost(RED), padding: '2px 8px' }}>remove</button>
                  </div>
                ))}
              </div>}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── TP-5 — Owner dashboard / reporting / audit export ─────────────────────────
interface CohortEnrol { enrolment_id: string; name: string; position: string; progress_pct: number; score: number | null; certified: boolean; status: string; due_at: string | null }
interface Cohort { id: string; title: string; tier: string | null; is_mandatory: boolean; status: string; enrolments: CohortEnrol[] }
interface OverdueRow { enrolment_id: string; name: string; position: string; course_title: string; due_at: string | null; progress_pct: number; days_overdue: number }
interface ExpiringRow { cert_number: string; staff_name: string | null; course_title: string | null; expires_at: string | null; days_left: number }
interface AuditRow { staff_name: string; position: string; course_title: string; tier: string; status: string; score: number | string; completed_at: string; certified: string; cert_number: string; issued_at: string; expires_at: string }
interface ComplianceRow { course_id: string; title: string; total: number; non_compliant: Array<{ name: string; position: string; reason: string }> }
interface DashData { empty: boolean; kpis: { active_courses: number; in_progress: number; overdue: number; team_certified_pct: number; certified_staff: number; active_staff: number; non_compliant: number }; courses: Cohort[]; overdue: OverdueRow[]; expiring: ExpiringRow[]; audit: AuditRow[]; compliance: ComplianceRow[] }

// CSV download — mirrors the app's proven pattern (BOM + RFC-4180 escaping + Blob).
function downloadCSV(rows: Record<string, unknown>[], cols: { key: string; label: string }[], filename: string) {
  if (!rows.length) return
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = '﻿' + [cols.map(c => c.label).join(','), ...rows.map(r => cols.map(c => esc(r[c.key])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click(); URL.revokeObjectURL(url)
}

const statusPill = (s: string): React.CSSProperties => pill(s === 'certified' || s === 'complete' ? G : s === 'overdue' ? RED : s === 'in_progress' ? AMBER : 'rgba(255,255,255,0.4)')
const statusLabel = (e: CohortEnrol) => e.certified ? 'Certified' : e.status === 'overdue' ? 'Overdue' : e.status === 'in_progress' ? 'In progress' : e.status === 'complete' ? 'Complete' : 'Assigned'
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

// accent colour → soft icon-tile tint (TP-CARDS mockup).
const TILE_TINT: Record<string, string> = { [G]: '#E7F1EA', [AMBER]: '#FAF0DC', [GOLD]: '#FAF0DC', [RED]: '#FBE7E6' }
function Kpi({ label, value, accent, sub, icon }: { label: string; value: string | number; accent: string; sub?: string; icon?: string }) {
  const tile = TILE_TINT[accent] ?? '#EAF1FB'
  return (
    <div style={{ ...whiteCard, flex: 1, minWidth: 150, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: tile, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>{icon ?? '•'}</div>
      <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 36, fontWeight: 600, color: INK, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: META, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: META, opacity: 0.8 }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ pct, ok }: { pct: number; ok?: boolean }) {
  return <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', minWidth: 60 }}>
    <div style={{ height: '100%', width: `${pct}%`, background: ok ? 'linear-gradient(90deg,#7FB897,#3a6b50)' : 'linear-gradient(90deg,#7FB897,#3a6b50)', borderRadius: 99 }} />
  </div>
}

function OverviewDashboard({ onBuild, onCreate, onDraft }: { onBuild: () => void; onCreate: () => void; onDraft: () => void }) {
  const [d, setD] = useState<DashData | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api<DashData>('/api/training/dashboard').then(setD).catch(e => setErr((e as Error).message)) }, [])

  if (err) return <div style={{ ...card, borderColor: `${RED}55`, color: RED, fontSize: 13 }}>{err}</div>
  if (!d) return <div style={{ color: 'rgba(255,255,255,0.35)', padding: 40, textAlign: 'center' }}>Loading dashboard…</div>

  if (d.empty) {
    return (
      <div style={{ ...whiteCard, background: '#F4F1EA', padding: '48px 28px', textAlign: 'center', border: '1px solid #E6E0D2' }}>
        <div style={{ fontSize: 38, marginBottom: 6 }}>📊</div>
        <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 27, fontWeight: 600, margin: '0 0 8px', color: D }}>Your training dashboard is ready to fill</h2>
        <p style={{ fontSize: 13.5, color: '#4A5568', maxWidth: 460, margin: '0 auto 22px', lineHeight: 1.6 }}>
          Build a course and assign it to your team — then this view shows who&apos;s trained, who&apos;s overdue, who&apos;s certified, and an inspector-ready audit export.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onDraft} style={btn(D, '#fff')}>✦ Let Aria set you up</button>
          <button onClick={onCreate} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${D}`, background: '#fff', color: D, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Build a course</button>
          <button onClick={onBuild} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #C9C2B2', background: 'transparent', color: '#6E7A70', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>View courses</button>
        </div>
      </div>
    )
  }

  const auditCols = [
    { key: 'staff_name', label: 'Staff' }, { key: 'position', label: 'Role' }, { key: 'course_title', label: 'Course' },
    { key: 'tier', label: 'Tier' }, { key: 'status', label: 'Status' }, { key: 'score', label: 'Score' },
    { key: 'completed_at', label: 'Completed' }, { key: 'certified', label: 'Certified' }, { key: 'cert_number', label: 'Cert #' },
    { key: 'issued_at', label: 'Issued' }, { key: 'expires_at', label: 'Expires' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Kpi label="Active courses" value={d.kpis.active_courses} accent={G} icon="📚" />
        <Kpi label="In progress" value={d.kpis.in_progress} accent={AMBER} icon="⏳" />
        <Kpi label="Overdue" value={d.kpis.overdue} accent={d.kpis.overdue > 0 ? RED : G} icon="⚠️" />
        <Kpi label="Team certified" value={`${d.kpis.team_certified_pct}%`} accent={GOLD} sub={`${d.kpis.certified_staff} of ${d.kpis.active_staff} active staff`} icon="🏅" />
        <Kpi label="Not compliant" value={d.kpis.non_compliant} accent={d.kpis.non_compliant > 0 ? RED : G} sub="staff missing a mandatory cert" icon="🔒" />
      </div>

      {/* Overdue + expiring alerts */}
      {(d.overdue.length > 0 || d.expiring.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {d.overdue.length > 0 && (
            <div style={{ ...card, borderColor: `${RED}44` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: RED, margin: '0 0 10px' }}>⚠ Overdue ({d.overdue.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {d.overdue.slice(0, 8).map(o => (
                  <div key={o.enrolment_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, gap: 8 }}>
                    <span><b>{o.name}</b> <span style={{ color: 'rgba(255,255,255,0.4)' }}>· {o.course_title}</span></span>
                    <span style={{ color: RED, whiteSpace: 'nowrap' }}>{o.days_overdue}d late</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.expiring.length > 0 && (
            <div style={{ ...card, borderColor: `${AMBER}44` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: AMBER, margin: '0 0 10px' }}>⏳ Certs expiring soon ({d.expiring.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {d.expiring.slice(0, 8).map(c => (
                  <div key={c.cert_number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, gap: 8 }}>
                    <span><b>{c.staff_name}</b> <span style={{ color: 'rgba(255,255,255,0.4)' }}>· {c.course_title}</span></span>
                    <span style={{ color: c.days_left < 0 ? RED : AMBER, whiteSpace: 'nowrap' }}>{c.days_left < 0 ? 'expired' : `${c.days_left}d`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit export */}
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Inspector-ready audit export</h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '3px 0 0' }}>{d.audit.length} completion record{d.audit.length === 1 ? '' : 's'} — staff, course, status, score, cert number, dates.</p>
        </div>
        <button onClick={() => downloadCSV(d.audit as unknown as Record<string, unknown>[], auditCols, `training-audit-${new Date().toISOString().slice(0, 10)}`)} disabled={d.audit.length === 0} style={{ ...btn(GOLD), opacity: d.audit.length === 0 ? 0.4 : 1 }}>📤 Export audit CSV</button>
      </div>

      {/* Mandatory compliance gate (display-only — shows who isn't compliant; does not block POS/clock-in) */}
      {d.compliance.length > 0 && (
        <div style={{ ...card, borderColor: `${RED}44` }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: RED, margin: '0 0 3px' }}>🔒 Mandatory compliance gate</h3>
          <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', margin: '0 0 12px' }}>Staff assigned a mandatory course who aren&apos;t certified (or whose cert expired). This shows compliance — it does not lock anyone out of the POS.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {d.compliance.map(c => (
              <div key={c.course_id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{c.title}</span>
                  <span style={pill(RED)}>Required</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{c.non_compliant.length} of {c.total} not compliant</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.non_compliant.map((s, i) => (
                    <span key={i} style={{ fontSize: 12, padding: '4px 9px', borderRadius: 8, background: `${RED}12`, border: `1px solid ${RED}33`, color: '#e8ede7' }}>
                      {s.name}{s.position ? <span style={{ color: 'rgba(255,255,255,0.4)' }}> · {s.position}</span> : null} <span style={{ color: RED }}>({s.reason})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cohort tables */}
      {d.courses.map(c => (
        <div key={c.id} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <h3 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 20, fontWeight: 600, margin: 0 }}>{c.title}</h3>
            {c.is_mandatory && <span style={pill(RED)}>Required</span>}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>{c.enrolments.length} enrolled</span>
          </div>
          {c.enrolments.length === 0
            ? <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)' }}>Published but nobody assigned yet — assign from the Courses tab.</p>
            : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Staff</th><th style={{ padding: '4px 8px', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600, minWidth: 90 }}>Progress</th><th style={{ padding: '4px 8px', fontWeight: 600 }}>Score</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Status</th><th style={{ padding: '4px 8px', fontWeight: 600 }}>Due</th>
                  </tr></thead>
                  <tbody>
                    {c.enrolments.map(e => (
                      <tr key={e.enrolment_id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '7px 8px', fontWeight: 600 }}>{e.name}</td>
                        <td style={{ padding: '7px 8px', color: 'rgba(255,255,255,0.5)' }}>{e.position || '—'}</td>
                        <td style={{ padding: '7px 8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ProgressBar pct={e.progress_pct} ok={e.certified} /><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{e.progress_pct}%</span></div></td>
                        <td style={{ padding: '7px 8px' }}>{e.score != null ? `${e.score}%` : '—'}</td>
                        <td style={{ padding: '7px 8px' }}><span style={statusPill(e.certified ? 'certified' : e.status)}>{statusLabel(e)}</span></td>
                        <td style={{ padding: '7px 8px', color: e.status === 'overdue' ? RED : 'rgba(255,255,255,0.5)' }}>{fmtDate(e.due_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </div>
      ))}
    </div>
  )
}

// ───────────────────────── TP-6 — Aria draft modal (starter library + draft-from-recipe) ─────────────────────────
interface StarterC { key: string; title: string; description: string; tier: string; is_mandatory: boolean; expires_months: number | null; role_tags: string[]; game_round?: string; already_exists: boolean }
interface RecipeOpt { id: string; name: string; category: string | null; allergens: string[] | null }

function AriaDraftModal({ initial, onClose, onDone }: { initial: { tab: 'starter' | 'recipe'; recipeId?: string }; onClose: () => void; onDone: (openId?: string) => void }) {
  const [tab, setTab] = useState<'starter' | 'recipe'>(initial.tab)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // Starter library
  const [alcohol, setAlcohol] = useState(false)
  const [starter, setStarter] = useState<StarterC[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const loadStarter = useCallback(async (alc: boolean) => {
    try { const d = await api<{ courses: StarterC[]; alcohol: boolean }>(`/api/training/starter-library?alcohol=${alc}`); setStarter(d.courses); setPicked(new Set(d.courses.filter(c => c.is_mandatory && !c.already_exists).map(c => c.key))) } catch (e) { setMsg((e as Error).message) }
  }, [])
  useEffect(() => { if (tab === 'starter') loadStarter(alcohol) }, [tab, alcohol, loadStarter])

  // Recipes
  const [recipes, setRecipes] = useState<RecipeOpt[] | null>(null)
  const [recipeId, setRecipeId] = useState(initial.recipeId ?? '')
  useEffect(() => { if (tab === 'recipe') api<{ recipes: RecipeOpt[] }>('/api/training/draft-from-recipe').then(d => setRecipes(d.recipes)).catch(e => setMsg((e as Error).message)) }, [tab])

  async function createStarter() {
    setBusy(true); setMsg('')
    try { const d = await api<{ created: number }>('/api/training/starter-library', { method: 'POST', body: { keys: [...picked], alcohol } }); setMsg(`Created ${d.created} draft course(s).`); setTimeout(() => onDone(), 700) }
    catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  async function draftRecipe() {
    if (!recipeId) { setMsg('Pick a recipe first.'); return }
    setBusy(true); setMsg('')
    try { const d = await api<{ course_id: string; ai: boolean; quiz_questions: number; allergen_lesson: boolean }>('/api/training/draft-from-recipe', { method: 'POST', body: { recipe_id: recipeId } }); setMsg(`Drafted (${d.quiz_questions} quiz Qs${d.allergen_lesson ? ' + allergen step' : ''}). Opening…`); setTimeout(() => onDone(d.course_id), 800) }
    catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, maxWidth: 560, width: '100%', background: '#13201a', borderColor: 'rgba(255,255,255,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 24, fontWeight: 600, margin: 0 }}>Let Aria set up your training</h2>
          <button onClick={onClose} style={ghost('rgba(255,255,255,0.4)')}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, margin: '12px 0 16px' }}>
          <button onClick={() => setTab('starter')} style={tab === 'starter' ? btn(G) : ghost(G)}>Starter library</button>
          <button onClick={() => setTab('recipe')} style={tab === 'recipe' ? btn(G) : ghost(G)}>From a recipe</button>
        </div>

        {tab === 'starter' && (
          <div>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>The legally-correct starter set for your business. Compliance courses are shells that <b>track</b> your team&apos;s certification — you upload the official material. Pick what to create as drafts.</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={alcohol} onChange={e => setAlcohol(e.target.checked)} /> We serve alcohol (adds RSA)
            </label>
            {!starter ? <div style={{ color: 'rgba(255,255,255,0.35)', padding: 16 }}>Loading…</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 320, overflowY: 'auto' }}>
                  {starter.map(c => (
                    <label key={c.key} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 9, border: `1px solid ${picked.has(c.key) ? G + '55' : 'rgba(255,255,255,0.08)'}`, background: picked.has(c.key) ? 'rgba(127,184,151,0.08)' : 'transparent', cursor: c.already_exists ? 'default' : 'pointer', opacity: c.already_exists ? 0.5 : 1 }}>
                      <input type="checkbox" disabled={c.already_exists} checked={picked.has(c.key)} onChange={e => setPicked(p => { const n = new Set(p); e.target.checked ? n.add(c.key) : n.delete(c.key); return n })} style={{ marginTop: 3 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.title}</span>
                          <span style={pill(c.tier === 'compliance' ? RED : c.tier === 'skill' ? G : c.tier === 'systems' ? GOLD : AMBER)}>{c.tier}</span>
                          {c.is_mandatory && <span style={pill(RED)}>Required</span>}
                          {c.game_round && <span style={pill(GOLD)}>Game</span>}
                          {c.already_exists && <span style={{ fontSize: 10.5, color: G }}>✓ exists</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 2, lineHeight: 1.4 }}>{c.description}</div>
                      </div>
                    </label>
                  ))}
                </div>}
            <button onClick={createStarter} disabled={busy || picked.size === 0} style={{ ...btn(G), width: '100%', marginTop: 14, opacity: busy || picked.size === 0 ? 0.5 : 1 }}>{busy ? 'Creating…' : `Create ${picked.size} draft course(s)`}</button>
          </div>
        )}

        {tab === 'recipe' && (
          <div>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>Aria drafts a course from a recipe — method lesson, a knowledge quiz, and an allergen step if the recipe has allergens. You review and publish.</p>
            {!recipes ? <div style={{ color: 'rgba(255,255,255,0.35)', padding: 16 }}>Loading recipes…</div>
              : recipes.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No recipes yet. Add recipes first, then Aria can draft from them.</p>
                : <select value={recipeId} onChange={e => setRecipeId(e.target.value)} style={inp}>
                    <option value="">Pick a recipe…</option>
                    {recipes.map(r => <option key={r.id} value={r.id}>{r.name}{r.allergens && r.allergens.length ? ` (allergens: ${r.allergens.join(', ')})` : ''}</option>)}
                  </select>}
            <button onClick={draftRecipe} disabled={busy || !recipeId} style={{ ...btn(GOLD, '#1a1208'), width: '100%', marginTop: 14, opacity: busy || !recipeId ? 0.5 : 1 }}>{busy ? 'Drafting…' : '✦ Draft course from recipe'}</button>
          </div>
        )}

        {msg && <div style={{ fontSize: 12.5, color: G, marginTop: 12 }}>{msg}</div>}
      </div>
    </div>
  )
}
