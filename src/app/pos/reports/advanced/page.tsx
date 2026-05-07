'use client'
const C = { bg:'var(--bg-base)', text:'var(--text-primary)', muted:'var(--text-secondary)' }
export default function AdvancedReportsPage() {
  return (
    <div style={{ minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Manrope',sans-serif", padding:'24px 28px' }}>
      <h1 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Advanced Reports</h1>
      <p style={{ fontSize:13, color:C.muted }}>Custom date ranges, multi-outlet comparisons, and export tools — coming soon.</p>
    </div>
  )
}
