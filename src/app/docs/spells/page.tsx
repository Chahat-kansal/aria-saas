'use client'
// SPELLS-1 — preview/docs page for the Design Spells library. Renders every spell so designers can
// pick one. Defines the library's showcase only; does NOT apply spells to product surfaces.
import { SPELLS, spellsCSS } from '@/lib/anim/spells'

const INK = '#2D5240'
const SAGE = '#7FB897'
const SAND = '#C9A37A'

export default function SpellsPreview() {
  return (
    <div style={{ minHeight: '100dvh', background: INK, color: '#fff', fontFamily: "'Outfit',system-ui,sans-serif", padding: '40px 24px' }}>
      {/* inject the whole spells stylesheet once */}
      <style dangerouslySetInnerHTML={{ __html: spellsCSS() }} />
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Cormorant',Georgia,serif", fontStyle: 'italic', fontSize: 40, margin: '0 0 6px', color: SAGE }}>Design Spells</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 28px', fontSize: 14 }}>
          {SPELLS.length} reusable micro-animations. Add the <code style={{ color: SAND }}>spell-&lt;id&gt;</code> class after injecting <code style={{ color: SAND }}>spellsCSS()</code>. Respects <code style={{ color: SAND }}>prefers-reduced-motion</code>.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
          {SPELLS.map(s => (
            <div key={s.id} style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 18, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
              <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                {/* the demo chip replays its spell on each render */}
                <div className={`spell-${s.id}`} style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(135deg,${SAGE},${SAND})` }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{s.description}</div>
              <code style={{ display: 'block', fontSize: 10.5, color: SAND, marginTop: 8 }}>spell-{s.id}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
