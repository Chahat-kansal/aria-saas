'use client'

interface SessionData {
  id: string
  opened_at: string
  closed_at: string | null
  opened_by: string
  closed_by: string | null
  opening_float: number
  total_cash_sales: number
  total_card_sales: number
  total_refunds: number
  expected_cash_cents: number
  actual_cash_cents: number
  variance_cents: number
  closure_note: string | null
}

interface SaleSummary {
  count: number
  gross_revenue: number
  tax_collected: number
  discounts_given: number
  avg_ticket: number
}

interface TopProduct { product_name: string; units: number; revenue: number }

interface Props {
  session: SessionData
  businessName?: string
  summary?: SaleSummary
  topProducts?: TopProduct[]
  onClose?: () => void
}

export default function ZReportView({ session, businessName, summary, topProducts, onClose }: Props) {
  const varianceDollars = (session.variance_cents ?? 0) / 100
  const varianceColor = Math.abs(session.variance_cents ?? 0) < 100 ? '#7FB897' : (session.variance_cents ?? 0) < 0 ? '#FF6B6B' : '#FFB347'

  return (
    <div>
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Z-Report</h2>
        <div className="flex gap-2">
          {onClose && <button onClick={onClose} className="px-3 py-1.5 rounded-xl text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary, #A8B5A8)' }}>Close</button>}
          <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl text-sm font-semibold" style={{ background: '#2D5240', color: '#7FB897' }}>Print</button>
        </div>
      </div>

      <div className="z-report-content rounded-2xl p-6 font-mono text-sm space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
        <div className="text-center">
          <div className="font-bold text-base" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{businessName ?? 'AriaPOS'}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Z-REPORT — SESSION CLOSE</div>
        </div>
        <div className="border-b" style={{ borderColor: 'var(--divider, rgba(232,237,231,0.06))' }} />

        <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          <div className="flex justify-between"><span>Opened</span><span>{new Date(session.opened_at).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Closed</span><span>{session.closed_at ? new Date(session.closed_at).toLocaleString() : '—'}</span></div>
          <div className="flex justify-between"><span>Opened by</span><span>{session.opened_by}</span></div>
          <div className="flex justify-between"><span>Closed by</span><span>{session.closed_by ?? '—'}</span></div>
        </div>
        <div className="border-b" style={{ borderColor: 'var(--divider, rgba(232,237,231,0.06))' }} />

        {summary && (
          <>
            <div className="space-y-1 text-xs">
              <div className="font-semibold mb-1" style={{ color: 'var(--text-primary, #E8EDE7)' }}>SALES SUMMARY</div>
              {[
                ['Transactions', String(summary.count)],
                ['Gross revenue', `$${(Number(summary.gross_revenue) || 0).toFixed(2)}`],
                ['Tax collected', `$${(Number(summary.tax_collected) || 0).toFixed(2)}`],
                ['Discounts', `-$${(Number(summary.discounts_given) || 0).toFixed(2)}`],
                ['Avg ticket', `$${(Number(summary.avg_ticket) || 0).toFixed(2)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  <span>{k}</span><span style={{ color: 'var(--text-primary, #E8EDE7)' }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="border-b" style={{ borderColor: 'var(--divider, rgba(232,237,231,0.06))' }} />
          </>
        )}

        <div className="space-y-1 text-xs">
          <div className="font-semibold mb-1" style={{ color: 'var(--text-primary, #E8EDE7)' }}>PAYMENT BREAKDOWN</div>
          {[
            ['Cash sales', `$${(Number(session.total_cash_sales) || 0).toFixed(2)}`],
            ['Card sales', `$${(Number(session.total_card_sales) || 0).toFixed(2)}`],
            ['Refunds', `-$${(Number(session.total_refunds) || 0).toFixed(2)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              <span>{k}</span><span style={{ color: 'var(--text-primary, #E8EDE7)' }}>{v}</span>
            </div>
          ))}
        </div>
        <div className="border-b" style={{ borderColor: 'var(--divider, rgba(232,237,231,0.06))' }} />

        <div className="space-y-1 text-xs">
          <div className="font-semibold mb-1" style={{ color: 'var(--text-primary, #E8EDE7)' }}>CASH RECONCILIATION</div>
          {[
            ['Opening float', `$${(Number(session.opening_float) || 0).toFixed(2)}`],
            ['Expected cash', `$${((Number(session.expected_cash_cents) || 0) / 100).toFixed(2)}`],
            ['Actual cash', `$${((Number(session.actual_cash_cents) || 0) / 100).toFixed(2)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              <span>{k}</span><span style={{ color: 'var(--text-primary, #E8EDE7)' }}>{v}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold">
            <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Variance</span>
            <span style={{ color: varianceColor }}>{varianceDollars >= 0 ? '+' : ''}${varianceDollars.toFixed(2)}</span>
          </div>
        </div>

        {topProducts && topProducts.length > 0 && (
          <>
            <div className="border-b" style={{ borderColor: 'var(--divider, rgba(232,237,231,0.06))' }} />
            <div className="space-y-1 text-xs">
              <div className="font-semibold mb-1" style={{ color: 'var(--text-primary, #E8EDE7)' }}>TOP 5 PRODUCTS</div>
              {topProducts.slice(0, 5).map(p => (
                <div key={p.product_name} className="flex justify-between" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                  <span>{p.product_name}</span><span style={{ color: 'var(--text-primary, #E8EDE7)' }}>${(Number(p.revenue) || 0).toFixed(2)} ({p.units} units)</span>
                </div>
              ))}
            </div>
          </>
        )}

        {session.closure_note && (
          <>
            <div className="border-b" style={{ borderColor: 'var(--divider, rgba(232,237,231,0.06))' }} />
            <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Note: {session.closure_note}</div>
          </>
        )}

        <div className="text-center text-xs pt-2" style={{ color: 'var(--text-tertiary, #6E7C6E)' }}>
          Powered by AriaPOS · {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  )
}
