'use client'
import { useEffect, useState, useCallback } from 'react'
import { useOwnerBusiness } from '../OwnerBusinessContext'
import { DecisionCard } from '@/components/owner-app/DecisionCard'
import { DecisionSheet } from '@/components/owner-app/DecisionSheet'
import { DomainChips } from '@/components/owner-app/DomainChips'
import { INK, SUBTEXT, BORDER } from '@/app/owner/theme'
import type { OwnerDecision } from '@/lib/owner-app/decisions'

export default function OwnerDecisionsPage() {
  const business = useOwnerBusiness()
  const [domain, setDomain] = useState('all')
  const [decisions, setDecisions] = useState<OwnerDecision[]>([])
  const [handled, setHandled] = useState<OwnerDecision[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({ all: 0, money: 0, people: 0, growth: 0, supply: 0, compliance: 0 })
  const [openDecision, setOpenDecision] = useState<OwnerDecision | null>(null)

  const load = useCallback(async () => {
    const [waitingRes, approvedRes, declinedRes] = await Promise.all([
      fetch('/api/owner/decisions?business_id=' + business.id + '&status=waiting&domain=' + domain),
      fetch('/api/owner/decisions?business_id=' + business.id + '&status=approved&domain=' + domain),
      fetch('/api/owner/decisions?business_id=' + business.id + '&status=declined&domain=' + domain),
    ])
    if (waitingRes.ok) {
      const json = await waitingRes.json()
      setDecisions(json.decisions)
      setCounts(json.counts)
    }
    const approved = approvedRes.ok ? (await approvedRes.json()).decisions as OwnerDecision[] : []
    const declined = declinedRes.ok ? (await declinedRes.json()).decisions as OwnerDecision[] : []
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    setHandled(
      [...approved, ...declined]
        .filter(d => d.resolved_at && new Date(d.resolved_at) >= todayStart)
        .sort((a, b) => new Date(b.resolved_at!).getTime() - new Date(a.resolved_at!).getTime())
    )
  }, [business.id, domain])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: '20px 20px 24px' }}>
      <div style={{ fontWeight: 700, fontSize: 26, color: INK }}>Decisions</div>
      <div style={{ fontSize: 14, color: SUBTEXT, marginTop: 4, lineHeight: 1.5 }}>
        Everything only you can decide. Nothing here touches the floor.
      </div>

      <div style={{ marginTop: 18 }}>
        <DomainChips counts={counts} active={domain} onChange={setDomain} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {decisions.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: SUBTEXT, fontSize: 13, border: '1px dashed ' + BORDER, borderRadius: 12 }}>
            Nothing waiting in this domain.
          </div>
        )}
        {decisions.map(d => (
          <DecisionCard key={d.id} decision={d} onClick={() => setOpenDecision(d)} />
        ))}
      </div>

      {handled.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: SUBTEXT, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 28, marginBottom: 10 }}>
            Handled today
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {handled.map(d => (
              <div key={d.id} style={{ border: '1px dashed ' + BORDER, borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: SUBTEXT, marginTop: 2 }}>
                    {d.status === 'approved' ? 'Approved' : 'Declined'} · owner_app
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {openDecision && (
        <DecisionSheet
          decision={openDecision}
          business_id={business.id}
          onClose={() => setOpenDecision(null)}
          onResolved={() => { setOpenDecision(null); load() }}
        />
      )}
    </div>
  )
}
