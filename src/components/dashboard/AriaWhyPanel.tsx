'use client'
import { useState } from 'react'
import { TruthBadge } from '@/components/ui'
import type { AriaIntelligenceContract } from '@/lib/aria/contract'

// INTEL-CONTRACT-1 Part 3 — the owner-facing "how Aria knows this" view. Default view stays clean
// prose (this renders nothing until expanded); the contract is one tasteful tap away. Follows the
// same progressive-disclosure idiom already established in AriaBriefingCard.tsx (boolean state,
// rotating chevron, conditional render) rather than inventing a new interaction pattern, and reuses
// TruthBadge (INTEL-TRUTH-1) for every individual figure's grounding rather than a parallel color
// system — this panel is a curated read of the contract, not a raw JSON dump.

function ConfidenceBar({ confidence }: { confidence: number }) {
  const color = confidence >= 0.8 ? '#7FB897' : confidence >= 0.5 ? '#8AA9C9' : '#E8A33D'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.35)' }}>Confidence</span>
      <div style={{ flex: '0 0 auto', width: 100, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(confidence * 100)}%`, background: color, transition: 'width 300ms' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{Math.round(confidence * 100)}%</span>
    </div>
  )
}

function FigureRow({ label, value, grounding }: { label: string; value: string | number | boolean | null; grounding: 'verified' | 'derived' | 'estimated' }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
      <span>{label}: <strong style={{ color: '#fff', fontWeight: 600 }}>{value === null ? '—' : String(value)}</strong></span>
      <TruthBadge grounding={grounding} />
    </li>
  )
}

function TextList({ label, items, dot }: { label: string; items: string[]; dot: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      </div>
      <ul style={{ margin: 0, padding: '0 0 0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => <li key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, listStyle: 'disc' }}>{it}</li>)}
      </ul>
    </div>
  )
}

export function AriaWhyPanel({ contract }: { contract: AriaIntelligenceContract | null | undefined }) {
  const [expanded, setExpanded] = useState(false)
  if (!contract) return null
  const hasAnything = contract.facts.length > 0 || contract.calculations.length > 0 || contract.assumptions.length > 0 || contract.uncertainties.length > 0
  if (!hasAnything) return null

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}
      >
        <span>{expanded ? 'Hide' : 'How Aria knows this'}</span>
        <span style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: 9 }}>▼</span>
      </button>
      {expanded && (
        <div style={{ marginTop: 10, padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <ConfidenceBar confidence={contract.confidence} />
          {contract.facts.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Facts</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {contract.facts.map((f, i) => <FigureRow key={i} label={f.label} value={f.value} grounding={f.provenance.grounding} />)}
              </ul>
            </div>
          )}
          {contract.calculations.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Calculations</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {contract.calculations.map((c, i) => <FigureRow key={i} label={c.label} value={c.value} grounding={c.provenance.grounding} />)}
              </ul>
            </div>
          )}
          {contract.assumptions.length > 0 && <TextList label="Assumptions" items={contract.assumptions} dot="#E8A33D" />}
          {contract.uncertainties.length > 0 && <TextList label="Unverified in this answer" items={contract.uncertainties} dot="#f87171" />}
        </div>
      )}
    </div>
  )
}
