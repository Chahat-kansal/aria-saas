'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

export default function PrintPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const type = params?.type as string
  const id = params?.id as string
  const regenerate = searchParams.get('regenerate') === 'true'

  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string>('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!type || !id) return

    async function load() {
      setLoading(true)
      try {
        // Get business_id first
        const prodRes = await fetch('/api/pos/products')
        const prodData = await prodRes.json()
        const business_id = prodData.business_id
        if (!business_id) { setError('No business found'); setLoading(false); return }

        // Fetch the document data based on type
        let data: Record<string, unknown> = {}

        if (type === 'payslip') {
          const r = await fetch(`/api/staff/payroll/run?id=${id}`)
          const d = await r.json()
          data = { run: d.run, lines: d.run?.line_items ?? [] }
        } else if (type === 'sales_report') {
          const r = await fetch(`/api/pos/reports?business_id=${business_id}&date=${id}`)
          const d = await r.json()
          data = d
        } else if (type === 'end_of_day') {
          const r = await fetch(`/api/pos/reports?business_id=${business_id}&date=${id}&type=end_of_day`)
          const d = await r.json()
          data = d
        } else if (type === 'purchase_order') {
          const r = await fetch(`/api/aria/weekly-order?business_id=${business_id}`)
          const d = await r.json()
          data = { drafts: d.drafts, active: d.drafts?.find((dr: Record<string, unknown>) => dr.id === id) }
        } else if (type === 'stock_report') {
          const r = await fetch(`/api/pos/products?business_id=${business_id}`)
          const d = await r.json()
          data = { products: d.products ?? [], date: new Date().toLocaleDateString('en-AU') }
        }

        // Generate HTML via Claude
        const genRes = await fetch('/api/documents/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, data, business_id, regenerate }),
        })
        const genData = await genRes.json()

        if (genData.error) { setError(genData.error); setLoading(false); return }
        setHtml(genData.html)
        setSource(genData.source)
        setLoading(false)
      } catch (e) {
        setError(String(e))
        setLoading(false)
      }
    }

    load()
  }, [type, id, regenerate])

  // Inject HTML into iframe when ready
  useEffect(() => {
    if (html && iframeRef.current) {
      const doc = iframeRef.current.contentDocument
      if (doc) {
        doc.open()
        doc.write(html)
        doc.close()
      }
    }
  }, [html])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif', background: '#f5f5f5', gap: 16 }}>
      <div style={{ width: 48, height: 48, border: '4px solid #e5e5e5', borderTopColor: '#2D5240', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px' }}>
          {source === '' ? 'Aria is designing your document…' : 'Loading template…'}
        </p>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{source === '' ? 'Generating once — saved for future use' : 'Loading saved template…'}</p>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <p style={{ fontSize: 20, marginBottom: 8 }}>⚠️</p>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>Could not generate document</p>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>{error}</p>
        <button onClick={() => window.history.back()} style={{ padding: '8px 20px', borderRadius: 8, background: '#2D5240', color: '#7FB897', border: 'none', cursor: 'pointer' }}>
          ← Go back
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f0f0' }}>
      {/* Toolbar */}
      <div style={{ background: '#2D5240', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={() => window.history.back()}
          style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#7FB897', border: '1px solid rgba(127,184,151,0.3)', cursor: 'pointer', fontSize: 13 }}>
          ← Back
        </button>
        <span style={{ color: '#7FB897', fontSize: 14, fontWeight: 600, flex: 1, textTransform: 'capitalize' }}>
          {type.replace(/_/g, ' ')}
          {source === 'generated' && <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}>✦ AI Generated</span>}
          {source === 'template' && <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}>📄 From template</span>}
        </span>
        <a href={`/print/${type}/${id}?regenerate=true`}
          title="Uses AI to redesign this document (~$0.07 Anthropic credit). Result is saved so you only pay once."
          style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#A8B5A8', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 13, textDecoration: 'none' }}>
          ✦ Redesign with AI
        </a>
        <button onClick={() => iframeRef.current?.contentWindow?.print()}
          style={{ padding: '6px 20px', borderRadius: 8, background: '#7FB897', color: '#2D5240', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          🖨 Print / Save PDF
        </button>
      </div>

      {/* Document preview in iframe */}
      <iframe
        ref={iframeRef}
        style={{ flex: 1, border: 'none', background: 'white' }}
        title={`${type} document`}
      />
    </div>
  )
}
