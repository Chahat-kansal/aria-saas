'use client'
import { inp, lbl, field, Toggle } from '../shared'

interface LoyaltyData { earns_points: boolean; points_multiplier: number; eligible_for_rewards: boolean; excluded_from_promotions: boolean; notes: string }
interface Props { data: LoyaltyData; onChange: (data: LoyaltyData) => void }

export default function LoyaltyTab({ data, onChange }: Props) {
  const set = (k: keyof LoyaltyData, v: any) => onChange({ ...data, [k]: v })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 500 }}>
      <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Toggle label="Earns loyalty points on purchase" checked={data.earns_points} onChange={v => set('earns_points', v)} />
        {data.earns_points && field('Points multiplier',
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="number" min="0" step="0.1" style={{ ...inp, width: 100 }}
              value={data.points_multiplier} onChange={e => set('points_multiplier', parseFloat(e.target.value) || 1)} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>× base rate (1.0 = standard)</span>
          </div>
        )}
        <Toggle label="Eligible for rewards redemption" checked={data.eligible_for_rewards} onChange={v => set('eligible_for_rewards', v)} />
        <Toggle label="Excluded from promotions" checked={data.excluded_from_promotions} onChange={v => set('excluded_from_promotions', v)} />
      </div>
      {field('Internal notes',
        <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={data.notes}
          onChange={e => set('notes', e.target.value)} placeholder="Optional loyalty notes for this product" />
      )}
    </div>
  )
}
