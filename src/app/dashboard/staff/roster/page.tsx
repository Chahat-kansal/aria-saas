'use client'
import { useState, useEffect, useCallback } from 'react'
import type { ShiftEntry, RosterSummary } from '@/lib/staff/roster'
import RosterGrid from '@/components/staff/RosterGrid'
import RosterToolbar from '@/components/staff/RosterToolbar'
import ShiftModal from '@/components/staff/ShiftModal'
import WageSummary from '@/components/staff/WageSummary'

interface StaffMember { id: string; first_name: string; last_name: string; position: string; color: string; employment_type: string }
interface AreaOption { id: string; name: string }

function getMondayOfWeek(d: Date): string {
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  const mon = new Date(d); mon.setDate(d.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + 'T12:00:00Z')
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().slice(0, 10)
}

const EMPTY_SUMMARY: RosterSummary = { total_hours: 0, total_cost_cents: 0, by_day: {}, by_staff: {}, conflicts: [] }

export default function RosterPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()))
  const [shifts, setShifts] = useState<ShiftEntry[]>([])
  const [summary, setSummary] = useState<RosterSummary>(EMPTY_SUMMARY)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [loading, setLoading] = useState(true)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiReasoning, setAiReasoning] = useState<string | null>(null)
  const [modal, setModal] = useState<{ day: string; shift?: ShiftEntry } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Array<{ staff_member_id: string; day_of_week: number; available: boolean; start_time: string | null; end_time: string | null; staff_name: string | null }>>([])
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; shifts: ShiftEntry[] }>>([])
  const [showAvailability, setShowAvailability] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [conflicts, setConflicts] = useState<string[]>([])

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00Z'); d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // Load roster + staff when week changes
  const loadWeek = useCallback(async () => {
    setLoading(true)
    setIsDirty(false)
    setAiReasoning(null)
    try {
      const [rosterRes, staffRes, areasRes] = await Promise.all([
        fetch(`/api/staff/roster?week_start=${weekStart}`),
        fetch('/api/staff/members?status=active&limit=100'),
        fetch('/api/staff/areas'),
      ])
      const rosterData = await rosterRes.json() as { shifts?: ShiftEntry[]; summary?: RosterSummary }
      const staffData = await staffRes.json() as { members?: StaffMember[] }
      const areasData = await areasRes.json() as { areas?: AreaOption[] }
      setShifts(rosterData.shifts ?? [])
      setSummary(rosterData.summary ?? EMPTY_SUMMARY)
      setStaff((staffData.members ?? []).map((m: StaffMember) => ({ ...m, color: m.color ?? '#6366f1' })))
      setAreas(areasData.areas ?? [])
    } catch { /* keep empty state */ }
    setLoading(false)
    // Load availability and templates in parallel (non-blocking)
    Promise.all([
      fetch('/api/staff/availability').then(r => r.json()).then(d => setAvailability(d.availability ?? [])),
      fetch('/api/staff/roster/templates').then(r => r.json()).then(d => setTemplates(d.templates ?? [])),
    ]).catch(() => {})
  }, [weekStart])

  useEffect(() => { loadWeek() }, [loadWeek])

  // Update summary when shifts change
  useEffect(() => {
    if (!isDirty) return
    // Client-side summary approximation (server will recompute on save)
    const byDay: RosterSummary['by_day'] = {}
    const byStaff: RosterSummary['by_staff'] = {}
    for (const s of shifts) {
      const day = s.start_time.slice(0, 10)
      if (!byDay[day]) byDay[day] = { hours: 0, cost_cents: 0, shift_count: 0 }
      byDay[day].hours += s.hours
      byDay[day].cost_cents += s.cost_cents
      byDay[day].shift_count++
      if (!byStaff[s.staff_member_id]) byStaff[s.staff_member_id] = { hours: 0, cost_cents: 0, name: s.staff_name }
      byStaff[s.staff_member_id].hours += s.hours
      byStaff[s.staff_member_id].cost_cents += s.cost_cents
    }
    setSummary({
      total_hours: +shifts.reduce((s, x) => s + x.hours, 0).toFixed(2),
      total_cost_cents: shifts.reduce((s, x) => s + x.cost_cents, 0),
      by_day: byDay,
      by_staff: byStaff,
      conflicts: [],
    })
  }, [shifts, isDirty])

  const handleCellClick = (staffId: string, day: string) => setModal({ day, shift: undefined })
  const handleShiftEdit = (shift: ShiftEntry) => setModal({ day: shift.start_time.slice(0, 10), shift })

  const detectConflicts = useCallback((shiftList: ShiftEntry[]) => {
    const issues: string[] = []
    shiftList.forEach(a => {
      shiftList.forEach(b => {
        if (a.id === b.id || a.staff_member_id !== b.staff_member_id) return
        const aStart = new Date(a.start_time).getTime(), aEnd = new Date(a.end_time).getTime()
        const bStart = new Date(b.start_time).getTime(), bEnd = new Date(b.end_time).getTime()
        if (aStart < bEnd && aEnd > bStart) {
          issues.push(`⚠ ${a.staff_name} is double-booked on ${new Date(a.start_time).toLocaleDateString('en-AU', { weekday: 'short' })}`)
        }
      })
    })
    shiftList.forEach(s => {
      const shiftDay = new Date(s.start_time).getDay()
      const avail = availability.find(a => a.staff_member_id === s.staff_member_id && a.day_of_week === shiftDay)
      if (avail && !avail.available) {
        issues.push(`⚠ ${s.staff_name} is unavailable on ${new Date(s.start_time).toLocaleDateString('en-AU', { weekday: 'long' })}`)
      }
    })
    setConflicts([...new Set(issues)])
  }, [availability])

  const handleShiftSave = (newShift: Omit<ShiftEntry, 'cost_cents' | 'hours'>) => {
    const withDefaults: ShiftEntry = { ...newShift, hours: 0, cost_cents: 0 }
    setShifts(prev => {
      const existing = prev.findIndex(s => s.id === newShift.id)
      const updated = existing >= 0 ? prev.map((s, i) => i === existing ? withDefaults : s) : [...prev, withDefaults]
      detectConflicts(updated)
      return updated
    })
    setIsDirty(true)
    setModal(null)
  }

  const handleShiftDelete = (id: string) => {
    setShifts(prev => prev.filter(s => s.id !== id))
    setIsDirty(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/staff/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart, shifts, status: 'draft' }),
      })
      const data = await res.json() as { shifts?: ShiftEntry[]; summary?: RosterSummary }
      if (data.shifts) { setShifts(data.shifts); setSummary(data.summary ?? EMPTY_SUMMARY) }
      setIsDirty(false)
      showToast('Roster saved as draft')
    } catch { showToast('Save failed — try again') }
    setIsSaving(false)
  }

  const saveTemplate = async () => {
    if (!templateName.trim() || shifts.length === 0) return
    await fetch('/api/staff/roster/templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName, shifts, week_start: weekStart, total_hours: summary.total_hours, total_cost_cents: summary.total_cost_cents }),
    })
    setTemplateName('')
    fetch('/api/staff/roster/templates').then(r => r.json()).then(d => setTemplates(d.templates ?? []))
    showToast(`Template "${templateName}" saved`)
  }

  const loadTemplate = (template: typeof templates[0]) => {
    const mapped = (template.shifts ?? []).map((s: ShiftEntry, i: number) => {
      const dayOffset = new Date(s.start_time).getDay()
      const idx = dayOffset === 0 ? 6 : dayOffset - 1
      const targetDate = weekDays[idx] ?? weekDays[0]
      return { ...s, id: `tpl-${i}-${Date.now()}`, start_time: `${targetDate}T${s.start_time.slice(11, 16)}:00`, end_time: `${targetDate}T${s.end_time.slice(11, 16)}:00` }
    })
    setShifts(mapped); setIsDirty(true); detectConflicts(mapped)
    setShowTemplates(false); showToast(`Loaded template: ${template.name}`)
  }

  const handlePublish = async () => {
    if (!confirm(`Publish this roster and notify ${Object.keys(summary.by_staff).length} staff by email/SMS?`)) return
    setIsPublishing(true)
    try {
      const res = await fetch('/api/staff/roster/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart, shifts }),
      })
      const data = await res.json() as { notified?: number }
      showToast(`Published! ${data.notified ?? 0} staff notified.`)
      setIsDirty(false)
    } catch { showToast('Publish failed') }
    setIsPublishing(false)
  }

  const handleAIDraft = async () => {
    setIsGenerating(true)
    setAiReasoning(null)
    try {
      const res = await fetch('/api/staff/roster/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart }),
      })
      const data = await res.json() as { shifts?: ShiftEntry[]; reasoning?: string }
      if (data.shifts && data.shifts.length > 0) {
        setShifts(data.shifts)
        setAiReasoning(data.reasoning ?? null)
        setIsDirty(true)
        showToast(`Aria drafted ${data.shifts.length} shifts — review and edit before publishing`)
      } else {
        alert(data.reasoning || 'Aria could not generate a roster — make sure staff members are added first.')
      }
    } catch { showToast('AI draft failed') }
    setIsGenerating(false)
  }

  const handleCopyLastWeek = async () => {
    const prevWeek = addWeeks(weekStart, -1)
    try {
      const res = await fetch(`/api/staff/roster?week_start=${prevWeek}`)
      const data = await res.json() as { shifts?: ShiftEntry[] }
      const prevShifts = data.shifts ?? []
      if (!prevShifts.length) { showToast('No roster found for last week'); return }
      // Shift dates forward by 7 days
      const copied = prevShifts.map(s => ({
        ...s,
        id: crypto.randomUUID(),
        start_time: offsetDate(s.start_time, 7),
        end_time: offsetDate(s.end_time, 7),
        ai_generated: false,
        confirmed_by_staff: false,
        status: 'scheduled' as const,
      }))
      setShifts(copied)
      setIsDirty(true)
      showToast(`Copied ${copied.length} shifts from last week`)
    } catch { showToast('Copy failed') }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d0d14', color: '#e5e7eb' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h1 className="font-semibold text-white text-lg">Roster Builder</h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Click any cell to add a shift</p>
          </div>
        </div>
        <RosterToolbar
          weekStart={weekStart}
          onPrevWeek={() => setWeekStart(prev => addWeeks(prev, -1))}
          onNextWeek={() => setWeekStart(prev => addWeeks(prev, 1))}
          onCopyLastWeek={handleCopyLastWeek}
          onAIDraft={handleAIDraft}
          onSave={handleSave}
          onPublish={handlePublish}
          isDirty={isDirty}
          isGenerating={isGenerating}
          isSaving={isSaving}
          isPublishing={isPublishing}
          shiftCount={shifts.length}
        />
      </div>

      {/* AI Reasoning banner */}
      {aiReasoning && (
        <div className="px-6 py-2.5 text-xs flex items-start gap-2 flex-shrink-0"
          style={{ background: 'rgba(147,51,234,0.1)', borderBottom: '1px solid rgba(147,51,234,0.2)', color: '#c084fc' }}>
          <span className="mt-0.5">✨</span>
          <span>{aiReasoning}</span>
          <button onClick={() => setAiReasoning(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Wage summary */}
      <div className="px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <WageSummary summary={summary} weekDays={weekDays} />
      </div>

      {/* Extra toolbar buttons */}
      <div className="px-6 py-2 flex-shrink-0 flex gap-2 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setShowTemplates(v => !v)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: showTemplates ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.05)', color: showTemplates ? '#7FB897' : 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>Templates</button>
        <button onClick={() => setShowAvailability(v => !v)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: showAvailability ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.05)', color: showAvailability ? '#7FB897' : 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>Availability</button>
      </div>

      {/* Conflict warnings */}
      {conflicts.length > 0 && (
        <div className="px-6 py-2 flex-shrink-0" style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
          {conflicts.map((c, i) => <p key={i} className="text-xs" style={{ color: '#ef4444', margin: '2px 0' }}>{c}</p>)}
        </div>
      )}

      {/* Templates panel */}
      {showTemplates && (
        <div className="px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(127,184,151,0.03)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: '#7FB897' }}>Roster templates</p>
          {templates.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {templates.map(t => (
                <button key={t.id} onClick={() => loadTemplate(t)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(127,184,151,0.1)', color: '#7FB897', border: '1px solid rgba(127,184,151,0.3)', cursor: 'pointer' }}>
                  {t.name} ({(t.shifts ?? []).length} shifts)
                </button>
              ))}
            </div>
          )}
          {templates.length === 0 && <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>No templates yet. Build a roster then save it.</p>}
          <div className="flex gap-2">
            <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Template name…" className="text-xs px-2 py-1.5 rounded-lg flex-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', outline: 'none' }} />
            <button onClick={saveTemplate} disabled={!templateName.trim() || shifts.length === 0} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#2D5240', color: '#7FB897', border: 'none', cursor: 'pointer' }}>Save roster as template</button>
          </div>
        </div>
      )}

      {/* Availability panel */}
      {showAvailability && (
        <div className="px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(127,184,151,0.03)', overflowX: 'auto' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: '#7FB897' }}>Staff availability</p>
          {availability.length === 0 ? (
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>No availability set. Staff can update their availability in the Staff Portal.</p>
          ) : (
            <table style={{ fontSize: 11, borderCollapse: 'collapse', minWidth: 400 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '3px 8px', color: 'rgba(255,255,255,0.4)' }}>Staff</th>
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <th key={d} style={{ padding: '3px 8px', color: 'rgba(255,255,255,0.4)' }}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...new Set(availability.map(a => a.staff_member_id))].map(staffId => {
                  const staffAvail = availability.filter(a => a.staff_member_id === staffId)
                  const name = staffAvail[0]?.staff_name ?? 'Staff'
                  return (
                    <tr key={staffId}>
                      <td style={{ padding: '3px 8px', color: '#e5e7eb', fontWeight: 500 }}>{name}</td>
                      {[1,2,3,4,5,6,0].map(day => {
                        const a = staffAvail.find(av => av.day_of_week === day)
                        return (
                          <td key={day} style={{ padding: '3px 8px', textAlign: 'center' }}>
                            {!a || a.available ? <span style={{ color: '#7FB897' }}>✓</span> : <span style={{ color: '#ef4444' }}>✕</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 rounded-full border-2 border-[#7FB897] border-t-transparent animate-spin" />
          </div>
        ) : (
          <RosterGrid
            weekDays={weekDays}
            staff={staff.map(m => ({ id: m.id, name: `${m.first_name} ${m.last_name}`, position: m.position, color: m.color }))}
            shifts={shifts}
            onCellClick={handleCellClick}
            onShiftEdit={handleShiftEdit}
            onShiftDelete={handleShiftDelete}
          />
        )}
      </div>

      {/* Shift modal */}
      {modal && (
        <ShiftModal
          initialShift={modal.shift}
          day={modal.day}
          staff={staff.map(m => ({ id: m.id, first_name: m.first_name, last_name: m.last_name, color: m.color, position: m.position }))}
          areas={areas}
          onSave={handleShiftSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium z-50"
          style={{ background: '#2D5240', color: '#7FB897', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function offsetDate(isoString: string, days: number): string {
  const d = new Date(isoString)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}
