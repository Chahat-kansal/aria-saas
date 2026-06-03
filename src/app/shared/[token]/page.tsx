import { supabaseAdmin } from '@/lib/supabase-admin'
import { ReadOnlyProvider } from '@/contexts/ReadOnlyContext'

async function getSharedData(token: string) {
  const { data: link } = await supabaseAdmin
    .from('dashboard_share_links')
    .select('id, business_id, label, pages_allowed, expires_at, is_active, access_count')
    .eq('token', token).maybeSingle()

  if (!link || !link.is_active) return null
  if (link.expires_at && new Date(link.expires_at as string) < new Date()) return null

  await supabaseAdmin.from('dashboard_share_links').update({
    access_count: ((link.access_count as number) ?? 0) + 1,
    last_accessed_at: new Date().toISOString(),
  }).eq('id', link.id)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const yday = yesterday.toISOString().slice(0, 10)

  const [bizRes, ytdRes, monthRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('id, name, trading_name, city, industry')
      .eq('id', link.business_id as string).maybeSingle(),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', link.business_id as string)
      .neq('status', 'voided').gte('created_at', `${yday}T00:00:00Z`).lte('created_at', `${yday}T23:59:59Z`),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', link.business_id as string)
      .neq('status', 'voided').gte('created_at', thirtyDaysAgo),
  ])

  const ytdSales = ytdRes.data ?? []
  const monthSales = monthRes.data ?? []
  const yesterday_revenue = ytdSales.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  const monthly_revenue = monthSales.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)

  return {
    biz: bizRes.data,
    label: link.label as string,
    pages: (link.pages_allowed as string[]) ?? [],
    yesterday_revenue,
    yesterday_count: ytdSales.length,
    monthly_revenue,
  }
}

export default async function SharedPage({ params }: { params: { token: string } }) {
  const data = await getSharedData(params.token)

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0E1611', fontFamily: 'system-ui,sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#F5F3EC', padding: '40px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Link expired or invalid</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 340, margin: '0 auto', lineHeight: 1.6 }}>
            This link has expired or is invalid. Ask the business owner for a new link.
          </p>
        </div>
      </div>
    )
  }

  const bizName = (data.biz?.trading_name ?? data.biz?.name) as string | null ?? 'Business'
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const card = (label: string, value: string, sub: string) => (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#7FB897', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{sub}</div>
    </div>
  )

  return (
    <ReadOnlyProvider>
    <div style={{ minHeight: '100vh', background: '#0E1611', fontFamily: 'system-ui,-apple-system,sans-serif', color: '#F5F3EC' }}>
      {/* Top bar */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 18, color: '#7FB897' }}>Aria OS</span>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{bizName}</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{today} · Read-only view</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{data.label}</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            Shared business intelligence for {bizName}{data.biz?.city ? `, ${data.biz.city}` : ''}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 32 }}>
          {card('Yesterday revenue', `A$${data.yesterday_revenue.toFixed(2)}`, `${data.yesterday_count} transactions`)}
          {card('Last 30 days', `A$${data.monthly_revenue.toFixed(2)}`, 'Rolling 30-day total')}
          {card('Daily average', `A$${(data.monthly_revenue / 30).toFixed(2)}`, 'Based on last 30 days')}
        </div>

        {data.pages.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px', marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Sections included in this share</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.pages.map(p => (
                <span key={p} style={{ padding: '5px 12px', borderRadius: 99, background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.2)', fontSize: 12, color: '#7FB897' }}>{p}</span>
              ))}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
          This is a read-only view shared by {bizName}. Data refreshes daily. · Powered by Aria OS
        </div>
      </div>
    </div>
    </ReadOnlyProvider>
  )
}
