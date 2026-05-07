'use client'
const C = { bg:'rgba(17,15,26,0.95)', text:'#EDE8FF', muted:'#8B85A8' }
export default function RegistersSettingsPage() {
  return (
    <div style={{ minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Manrope',sans-serif", padding:'24px 28px' }}>
      <h1 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Registers & Outlets</h1>
      <p style={{ fontSize:13, color:C.muted }}>Configure your registers and outlet locations. Manage here from the POS Settings.</p>
      <a href="/pos/outlets" style={{ display:'inline-block', marginTop:16, fontSize:13, color:'#8B5CF6', textDecoration:'none', border:'1px solid rgba(139,92,246,0.3)', borderRadius:8, padding:'8px 16px' }}>
        → Manage Outlets
      </a>
    </div>
  )
}
