'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { getIndustryIdentity } from '@/lib/pos/industry-theme'

interface PortfolioRow {
  business_id: string
  name: string
  industry: string | null
  revenue_today: number
  sales_today: number
  low_stock_count: number
  attention: 'low_stock' | 'no_sales' | null
}

/**
 * Business Switcher Pro — the multi-business killer feature.
 *
 *  1. Instant switch with NO page reload — the terminal re-skins in place.
 *  2. Industry-aware identity — each venue shows its own icon + accent so
 *     staff get instant visual confirmation of which venue they are on.
 *  3. Portfolio brain — today's revenue + attention flag for EVERY venue,
 *     visible without switching in. Square / Toast / Oolio silo locations;
 *     Aria unifies the intelligence while keeping operations isolated.
 */
export default function BusinessSwitcher() {
  const { business, allBusinesses, switchBusiness } = useBusinessContext()
  const [open, setOpen] = useState(false)
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([])
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const loadPortfolio = useCallback(() => {
    fetch('/api/pos/portfolio')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.portfolio)) setPortfolio(d.portfolio) })
      .catch(() => { /* non-fatal — switcher still works without the brain */ })
  }, [])

  // Refresh the portfolio snapshot whenever the menu opens
  useEffect(() => { if (open) loadPortfolio() }, [open, loadPortfolio])

  if (!business || allBusinesses.length < 2) return null

  const activeIdentity = getIndustryIdentity(business.industry)

  async function handleSwitch(id: string) {
    if (id === business!.id) { setOpen(false); return }
    setSwitchingId(id)
    await switchBusiness(id)
    setSwitchingId(null)
    setOpen(false)
  }

  const fmt = (n: number) => '$' + (Number(n) || 0).toFixed(0)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px',
          background: activeIdentity.tint, border: '1px solid ' + activeIdentity.accent + '33',
          borderRadius: 9, color: 'rgba(26,26,22,0.78)', cursor: 'pointer',
          fontSize: 11, fontFamily: 'inherit', width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 13, flexShrink: 0 }}>{activeIdentity.icon}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
          {business.name}
        </span>
        <span style={{
          fontSize: 8, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
          color: activeIdentity.accent, flexShrink: 0,
        }}>
          {activeIdentity.label}
        </span>
        <span style={{ fontSize: 9, flexShrink: 0, opacity: 0.5 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#fff',
          border: '1px solid rgba(0,0,0,0.1)', borderRadius: 11, padding: 5, zIndex: 100,
          boxShadow: '0 8px 28px rgba(0,0,0,0.16)', marginBottom: 5,
          maxHeight: 360, overflowY: 'auto',
        }}>
          <div style={{
            fontSize: 8.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
            color: 'rgba(26,26,22,0.4)', padding: '5px 9px 6px',
          }}>
            Your venues \u00B7 today
          </div>

          {allBusinesses.map(b => {
            const id = getIndustryIdentity(b.industry)
            const isActive = b.id === business.id
            const isSwitching = switchingId === b.id
            const row = portfolio.find(p => p.business_id === b.id)
            return (
              <button
                key={b.id}
                onClick={() => handleSwitch(b.id)}
                disabled={isSwitching}
                style={{
                  width: '100%', padding: '8px 9px', textAlign: 'left',
                  background: isActive ? id.tint : 'transparent',
                  border: isActive ? '1px solid ' + id.accent + '33' : '1px solid transparent',
                  borderRadius: 8, cursor: isSwitching ? 'wait' : 'pointer',
                  fontSize: 11, fontFamily: 'inherit', display: 'block', marginBottom: 2,
                  opacity: isSwitching ? 0.6 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{id.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, color: isActive ? id.accent : 'rgba(26,26,22,0.85)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {b.name}
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(26,26,22,0.45)', marginTop: 1 }}>
                      {id.label} \u00B7 {id.mode}
                    </div>
                  </div>
                  {isSwitching
                    ? <span style={{ fontSize: 9, color: id.accent, flexShrink: 0 }}>Switching\u2026</span>
                    : isActive
                      ? <span style={{ fontSize: 8.5, fontWeight: 700, color: id.accent, flexShrink: 0 }}>ON</span>
                      : null}
                </div>

                {/* Portfolio brain — today's snapshot for this venue */}
                {row && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, paddingLeft: 21,
                    fontSize: 9.5, color: 'rgba(26,26,22,0.6)',
                  }}>
                    <span style={{ fontWeight: 600 }}>{fmt(row.revenue_today)}</span>
                    <span style={{ opacity: 0.5 }}>{row.sales_today} sale{row.sales_today === 1 ? '' : 's'}</span>
                    {row.attention === 'low_stock' && (
                      <span style={{ color: '#C0392B', fontWeight: 600 }}>
                        {'\u26A0 ' + row.low_stock_count + ' low'}
                      </span>
                    )}
                    {row.attention === 'no_sales' && !isActive && (
                      <span style={{ color: '#B7791F', fontWeight: 600 }}>{'\u2014 quiet'}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}

          <div style={{
            fontSize: 8.5, color: 'rgba(26,26,22,0.35)', padding: '6px 9px 3px',
            borderTop: '1px solid rgba(0,0,0,0.05)', marginTop: 3,
          }}>
            Switching re-skins the terminal \u2014 only this venue's products show.
          </div>
        </div>
      )}
    </div>
  )
}
