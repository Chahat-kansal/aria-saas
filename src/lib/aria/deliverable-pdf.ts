import { supabaseAdmin } from '@/lib/supabase-admin'
import { put } from '@vercel/blob'

export async function exportDeliverablePdf(outputId: string, businessId: string): Promise<string> {
  const { data: output } = await supabaseAdmin
    .from('aria_task_outputs')
    .select('id, title, render_html, pdf_url, business_id')
    .eq('id', outputId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!output) throw new Error('Deliverable not found or access denied')

  // Idempotent — return cached URL if already exported
  if (output.pdf_url) return output.pdf_url as string

  const html = (output.render_html as string | null) ?? '<html><body><p>No content</p></body></html>'

  const chromium = (await import('@sparticuz/chromium')).default
  const puppeteer = (await import('puppeteer-core')).default

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 900, height: 1200 },
  })

  let pdfBuffer: Buffer
  try {
    const page = await browser.newPage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.setContent(html, { waitUntil: 'networkidle0' as any })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
    })
    pdfBuffer = Buffer.from(pdf)
  } finally {
    await browser.close()
  }

  const filename = 'deliverables/' + outputId + '.pdf'
  const blob = await put(filename, pdfBuffer, { access: 'public', contentType: 'application/pdf' })
  const blobUrl = blob.url

  await supabaseAdmin
    .from('aria_task_outputs')
    .update({ pdf_url: blobUrl })
    .eq('id', outputId)

  return blobUrl
}
