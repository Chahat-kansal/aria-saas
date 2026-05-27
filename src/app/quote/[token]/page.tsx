export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { headers } from 'next/headers'
import AcceptSection from './AcceptSection'

interface Biz { name: string; phone: string | null; address: string | null; abn: string | null; user_id: string }

function daysDiff(from: string, to: string) {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}

export default async function QuotePage({ params }: { params: { token: string } }) {
  const { token } = params

  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (!quote) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8faf9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: '#1a2e22' }}>Quote not found</p>
          <p style={{ fontSize: 14, color: '#6b7c72', marginTop: 8 }}>This link may be invalid or the quote has been removed.</p>
        </div>
      </div>
    )
  }

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name,phone,address,abn,user_id')
    .eq('id', quote.business_id as string)
    .maybeSingle() as { data: Biz | null }

  // Fire-and-forget view tracking (updates happen client-side via AcceptSection useEffect)
  const h = headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0] ?? null
  const ua = h.get('user-agent') ?? null
  void supabaseAdmin.from('quote_views').insert({ quote_id: quote.id, ip_address: ip, user_agent: ua })

  const qb = (quote.quote_breakdown ?? {}) as Record<string, unknown>
  const lineItems = (qb.lineItems ?? []) as Array<{ description: string; qty: number; rate: number; total: number }>
  const subtotal = Number(qb.subtotal ?? 0)
  const gst = Number(qb.gst ?? 0)
  const total = Number(qb.total ?? quote.quote_amount ?? 0)
  const notes = (qb.notes ?? null) as string | null
  const terms = (quote.terms ?? qb.terms ?? null) as string | null
  const quoteNum = (qb.quoteNumber as string | undefined) ?? `Q-${String(quote.id).slice(0, 8).toUpperCase()}`

  const now = new Date().toISOString()
  const isExpired = quote.expires_at ? new Date(quote.expires_at as string) < new Date() : false
  const daysUntilExpiry = quote.expires_at && !isExpired ? daysDiff(now, quote.expires_at as string) : null

  const tdStyle = (right?: boolean): React.CSSProperties => ({
    padding: '12px 10px', borderBottom: '1px solid #f0f7f4', color: '#1a2e22',
    textAlign: right ? 'right' : 'left',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f8faf9', fontFamily: 'Inter,sans-serif', padding: '40px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px', marginBottom: 16, borderBottom: '4px solid #2D5240' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#2D5240', fontFamily: 'Fraunces,Georgia,serif', fontStyle: 'italic', margin: '0 0 6px' }}>
                {biz?.name ?? 'Quote'}
              </h1>
              {biz?.abn && <p style={{ fontSize: 12, color: '#6b7c72', margin: '0 0 2px' }}>ABN {biz.abn}</p>}
              {biz?.phone && <p style={{ fontSize: 12, color: '#6b7c72', margin: 0 }}>{biz.phone}</p>}
              {biz?.address && <p style={{ fontSize: 12, color: '#6b7c72', margin: '2px 0 0' }}>{biz.address}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#1a2e22', margin: '0 0 4px' }}>QUOTE</p>
              <p style={{ fontSize: 14, color: '#6b7c72', margin: '0 0 2px' }}>#{quoteNum}</p>
              <p style={{ fontSize: 12, color: '#6b7c72', margin: 0 }}>Issued {new Date(quote.created_at as string).toLocaleDateString('en-AU')}</p>
            </div>
          </div>
        </div>

        {/* Customer + Expiry */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 6px' }}>Prepared for</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1a2e22', margin: '0 0 2px' }}>{(quote.customer_name as string | null) ?? 'Valued Customer'}</p>
            {quote.customer_email && <p style={{ fontSize: 13, color: '#6b7c72', margin: 0 }}>{quote.customer_email as string}</p>}
          </div>
          {isExpired ? (
            <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.25)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', margin: '0 0 2px' }}>This quote has expired</p>
              <p style={{ fontSize: 12, color: '#6b7c72', margin: 0 }}>Contact {biz?.name} for a new quote</p>
            </div>
          ) : daysUntilExpiry !== null && (
            <div style={{ padding: '10px 16px', background: daysUntilExpiry <= 5 ? 'rgba(239,68,68,0.05)' : 'rgba(45,82,64,0.05)', borderRadius: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: daysUntilExpiry <= 5 ? '#ef4444' : '#2D5240', margin: '0 0 2px' }}>
                Expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? '' : 's'}
              </p>
              <p style={{ fontSize: 12, color: '#6b7c72', margin: 0 }}>{new Date(quote.expires_at as string).toLocaleDateString('en-AU')}</p>
            </div>
          )}
        </div>

        {/* Line items */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '24px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 14px' }}>Quote Details</p>
          {(quote.job_description as string | null) && (
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 16, lineHeight: 1.6 }}>{quote.job_description as string}</p>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e8f0eb' }}>
                {[['Description', false], ['Qty', true], ['Unit Price', true], ['Total', true]] .map(([h, r]) => (
                  <th key={h as string} style={{ padding: '8px 10px', textAlign: r ? 'right' : 'left', color: '#6b7c72', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h as string}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i}>
                  <td style={tdStyle()}>{item.description}</td>
                  <td style={tdStyle(true)}>{item.qty}</td>
                  <td style={tdStyle(true)}>A${Number(item.rate).toFixed(2)}</td>
                  <td style={{ ...tdStyle(true), fontWeight: 600 }}>A${Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '2px solid #e8f0eb', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ minWidth: 240 }}>
              {[['Subtotal (ex. GST)', `A$${subtotal.toFixed(2)}`], ['GST (10%)', `A$${gst.toFixed(2)}`]].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#6b7c72' }}>
                  <span>{label}</span><span>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontSize: 20, fontWeight: 700, color: '#2D5240', borderTop: '2px solid #2D5240', marginTop: 10 }}>
                <span>TOTAL</span><span>A${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes + Terms */}
        {(notes || terms) && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
            {notes && (
              <div style={{ marginBottom: terms ? 16 : 0 }}>
                <p style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 8px' }}>Notes</p>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{notes}</p>
              </div>
            )}
            {terms && (
              <div>
                <p style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 8px' }}>Terms & Conditions</p>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{terms}</p>
              </div>
            )}
          </div>
        )}

        {/* Client section: accept button + view tracking */}
        <AcceptSection
          quoteId={quote.id as string}
          status={quote.status as string}
          isExpired={isExpired}
          acceptedAt={(quote.accepted_at as string | null) ?? null}
          acceptedByName={(quote.accepted_by_name as string | null) ?? null}
          businessName={biz?.name ?? ''}
          total={total}
        />

        <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 24 }}>Powered by Aria · ariaos.site</p>
      </div>
    </div>
  )
}
