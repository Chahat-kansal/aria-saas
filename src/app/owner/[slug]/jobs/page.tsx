'use client'
import { INK, SUBTEXT, BORDER, FONT_MONO } from '@/app/owner/theme'

// OWNER-APP PH-1 — Jobs is PH-2 scope (over aria_task_outputs + a daily cron for standing jobs).
// Simple placeholder per the brief, not the full standing-jobs UI.
export default function OwnerJobsPage() {
  return (
    <div style={{ padding: '20px 20px 24px' }}>
      <div style={{ fontWeight: 700, fontSize: 26, color: INK }}>Jobs</div>
      <div style={{ fontSize: 14, color: SUBTEXT, marginTop: 4, lineHeight: 1.5 }}>
        Work you hand to Aria. It runs on the server — lock your phone, close the app, it keeps going.
      </div>
      <div style={{ marginTop: 40, textAlign: 'center', padding: 24, border: '1px dashed ' + BORDER, borderRadius: 12 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: SUBTEXT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Coming in PH-2</div>
        <div style={{ fontSize: 14, color: INK, marginTop: 8 }}>Standing jobs and one-off hand-offs land in the next sprint.</div>
      </div>
    </div>
  )
}
