'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface LineItem {
  staff_member_id: string | null
  staff_name: string
  position: string
  employment_type: string
  pay_frequency: string
  hours_worked: number
  hourly_rate_cents: number
  gross_pay_cents: number
  tax_withheld_cents: number
  superannuation_rate: number
  super_cents: number
  net_pay_cents: number
  ytd_gross_cents: number
  allowances_cents: number
}

interface PayrollRun {
  id: string
  period_start: string
  period_end: string
  status: string
  total_gross_cents: number
  total_tax_cents: number
  total_super_cents: number
  total_net_estimate_cents: number
  line_items: LineItem[]
}

interface Business {
  name: string
  abn: string | null
  address: string | null
  phone: string | null
  email: string | null
}

const $ = (c: number) => `$${(c / 100).toFixed(2)}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

export default function PayslipPage() {
  const params = useParams()
  const runId = params?.run_id as string
  const [run, setRun] = useState<PayrollRun | null>(null)
  const [biz, setBiz] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!runId) return
    Promise.all([
      fetch(`/api/staff/payroll/run?id=${runId}`).then(r => r.json()),
      fetch('/api/pos/products').then(r => r.json()).then(d => d.business_id
        ? fetch(`/api/businesses/${d.business_id}`).then(r => r.json()).catch(() => null)
        : null
      ).catch(() => null),
    ]).then(([runData, bizData]) => {
      setRun(runData.run ?? null)
      setBiz(bizData?.business ?? null)
      setLoading(false)
    })
  }, [runId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <p>Loading payslips…</p>
    </div>
  )

  if (!run) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <p>Payroll run not found.</p>
    </div>
  )

  const lines = run.line_items ?? []

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          body { margin: 0; }
        }
        @page { margin: 15mm; size: A4; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .payslip { background: white; border-radius: 8px; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: #2D5240; color: white; padding: 24px 28px; display: flex; justify-content: space-between; align-items: flex-start; }
        .biz-name { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
        .biz-details { font-size: 12px; opacity: 0.85; line-height: 1.6; }
        .payslip-label { font-size: 13px; font-weight: 600; background: rgba(255,255,255,0.15); padding: 4px 12px; border-radius: 20px; align-self: flex-start; }
        .body { padding: 24px 28px; }
        .employee-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e5e5e5; }
        .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 8px; }
        .field { margin-bottom: 6px; }
        .field-label { font-size: 11px; color: #888; }
        .field-value { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
        th { background: #f8f8f8; padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #555; border-bottom: 2px solid #e5e5e5; }
        td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
        .amount { text-align: right; font-weight: 600; }
        .total-row { background: #f8f8f8; font-weight: 700; }
        .net-pay-box { background: #2D5240; color: white; border-radius: 8px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
        .net-label { font-size: 14px; font-weight: 600; opacity: 0.9; }
        .net-amount { font-size: 28px; font-weight: 800; }
        .ytd-section { margin-top: 20px; padding: 14px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e5e5e5; }
        .ytd-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-top: 8px; }
        .ytd-item { text-align: center; }
        .ytd-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.4px; }
        .ytd-value { font-size: 15px; font-weight: 700; color: #2D5240; margin-top: 2px; }
        .footer-note { font-size: 10px; color: #aaa; margin-top: 12px; text-align: center; }
        .print-btn { position: fixed; top: 20px; right: 20px; background: #2D5240; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
      `}</style>

      {/* Print button */}
      <button className="no-print print-btn" onClick={() => window.print()}>
        🖨 Print / Save PDF
      </button>

      <div className="container">
        <div className="no-print" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Payslips</h1>
            <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
              Period: {fmtDate(run.period_start)} – {fmtDate(run.period_end)} · {lines.length} staff · Status: {run.status}
            </p>
          </div>
          <a href="/dashboard/staff/payroll" style={{ fontSize: 13, color: '#2D5240', textDecoration: 'none' }}>← Back to payroll</a>
        </div>

        {lines.map((line, idx) => (
          <div key={idx} className={`payslip ${idx > 0 ? 'page-break' : ''}`}>
            {/* Header */}
            <div className="header">
              <div>
                <div className="biz-name">{biz?.name ?? 'Business'}</div>
                <div className="biz-details">
                  {biz?.abn && <div>ABN: {biz.abn}</div>}
                  {biz?.address && <div>{biz.address}</div>}
                  {biz?.phone && <div>{biz.phone}</div>}
                </div>
              </div>
              <div className="payslip-label">PAYSLIP</div>
            </div>

            <div className="body">
              {/* Employee + Period info */}
              <div className="employee-section">
                <div>
                  <div className="section-title">Employee</div>
                  <div className="field">
                    <div className="field-value" style={{ fontSize: 18 }}>{line.staff_name}</div>
                    <div className="field-label">{line.position} · {line.employment_type}</div>
                  </div>
                </div>
                <div>
                  <div className="section-title">Pay period</div>
                  <div className="field">
                    <div className="field-label">From</div>
                    <div className="field-value">{fmtDate(run.period_start)}</div>
                  </div>
                  <div className="field">
                    <div className="field-label">To</div>
                    <div className="field-value">{fmtDate(run.period_end)}</div>
                  </div>
                  <div className="field">
                    <div className="field-label">Pay frequency</div>
                    <div className="field-value" style={{ textTransform: 'capitalize' }}>{line.pay_frequency}</div>
                  </div>
                </div>
              </div>

              {/* Earnings table */}
              <div className="section-title">Earnings</div>
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Hours</th>
                    <th>Rate</th>
                    <th className="amount">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Ordinary hours</td>
                    <td>{line.hours_worked?.toFixed(2)}h</td>
                    <td>{$(line.hourly_rate_cents)}/hr</td>
                    <td className="amount">{$(line.gross_pay_cents)}</td>
                  </tr>
                  {line.allowances_cents > 0 && (
                    <tr>
                      <td>Allowances</td>
                      <td>—</td>
                      <td>—</td>
                      <td className="amount">{$(line.allowances_cents)}</td>
                    </tr>
                  )}
                  <tr className="total-row">
                    <td colSpan={3}>Gross pay</td>
                    <td className="amount">{$(line.gross_pay_cents)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Deductions table */}
              <div className="section-title">Deductions & Obligations</div>
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="amount">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>PAYG withholding tax</td>
                    <td className="amount" style={{ color: '#dc2626' }}>({$(line.tax_withheld_cents)})</td>
                  </tr>
                  <tr style={{ borderBottom: '2px solid #e5e5e5' }}>
                    <td>
                      Superannuation ({line.superannuation_rate}% — employer contribution)
                      <span style={{ fontSize: 11, color: '#888', display: 'block' }}>Paid to super fund separately</span>
                    </td>
                    <td className="amount" style={{ color: '#2563eb' }}>{$(line.super_cents)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Net pay */}
              <div className="net-pay-box">
                <div className="net-label">Net pay (take-home)</div>
                <div className="net-amount">{$(line.net_pay_cents)}</div>
              </div>

              {/* YTD section */}
              <div className="ytd-section">
                <div className="section-title">Year to date (YTD)</div>
                <div className="ytd-grid">
                  <div className="ytd-item">
                    <div className="ytd-label">Gross earnings</div>
                    <div className="ytd-value">{$(line.ytd_gross_cents)}</div>
                  </div>
                  <div className="ytd-item">
                    <div className="ytd-label">Tax withheld</div>
                    <div className="ytd-value">{$(Math.round(line.ytd_gross_cents * line.tax_withheld_cents / Math.max(line.gross_pay_cents, 1)))}</div>
                  </div>
                  <div className="ytd-item">
                    <div className="ytd-label">Superannuation</div>
                    <div className="ytd-value">{$(Math.round(line.ytd_gross_cents * line.superannuation_rate / 100))}</div>
                  </div>
                </div>
              </div>

              <div className="footer-note">
                This payslip is generated by AriaOS. Tax calculated per ATO 2024-25 withholding tables.
                Superannuation at {line.superannuation_rate}% per Fair Work Act.
                Keep this payslip for your records.
              </div>
            </div>
          </div>
        ))}

        {/* Summary page for employer */}
        <div className="payslip page-break no-print" style={{ marginTop: 24 }}>
          <div className="header">
            <div>
              <div className="biz-name">Payroll Summary</div>
              <div className="biz-details">{fmtDate(run.period_start)} – {fmtDate(run.period_end)}</div>
            </div>
          </div>
          <div className="body">
            <table>
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th className="amount">Gross</th>
                  <th className="amount">PAYG</th>
                  <th className="amount">Super</th>
                  <th className="amount">Net</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.staff_name}</td>
                    <td className="amount">{$(l.gross_pay_cents)}</td>
                    <td className="amount" style={{ color: '#dc2626' }}>{$(l.tax_withheld_cents)}</td>
                    <td className="amount" style={{ color: '#2563eb' }}>{$(l.super_cents)}</td>
                    <td className="amount" style={{ fontWeight: 700 }}>{$(l.net_pay_cents)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>TOTALS</td>
                  <td className="amount">{$(run.total_gross_cents)}</td>
                  <td className="amount" style={{ color: '#dc2626' }}>{$(run.total_tax_cents)}</td>
                  <td className="amount" style={{ color: '#2563eb' }}>{$(run.total_super_cents)}</td>
                  <td className="amount">{$(run.total_net_estimate_cents)}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 12 }}>
              PAYG tax of {$(run.total_tax_cents)} must be remitted to the ATO by the due date. 
              Superannuation of {$(run.total_super_cents)} must be paid to employee super funds quarterly.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
