// Attachment processing for multimodal chat
// Converts uploads to Claude-compatible message blocks

import type Anthropic from '@anthropic-ai/sdk'

export interface ParsedAttachment {
  kind: 'image' | 'pdf_text' | 'spreadsheet_text' | 'plain_text'
  filename: string
  mediaType?: string
  base64?: string         // for images
  extracted_text?: string // for PDFs, spreadsheets, text
  bytes: number
  page_count?: number     // for PDFs — used to detect long docs
  row_count?: number      // for spreadsheets — used to detect large datasets
}

const MAX_IMAGE_MB = 5
const MAX_PDF_PAGES = 30
const MAX_TEXT_CHARS = 50_000

export async function parseAttachment(
  file: { name: string; type: string; arrayBuffer: () => Promise<ArrayBuffer> }
): Promise<ParsedAttachment | { error: string }> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const bytes = buffer.byteLength

  // Images
  if (file.type.startsWith('image/')) {
    if (bytes > MAX_IMAGE_MB * 1024 * 1024) return { error: `Image over ${MAX_IMAGE_MB}MB limit` }
    const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!supported.includes(file.type)) return { error: `Image type not supported. Use JPEG, PNG, WebP, GIF.` }
    return {
      kind: 'image',
      filename: file.name,
      mediaType: file.type,
      base64: buffer.toString('base64'),
      bytes,
    }
  }

  // PDFs
  if (file.type === 'application/pdf') {
    try {
      // pdf-parse v2 ESM
      const pdfModule = await import('pdf-parse')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = ((pdfModule as any).default ?? pdfModule) as (buf: Buffer, opts?: { max?: number }) => Promise<{ text: string; numpages: number; pages?: string[] }>
      // First pass: count pages (no limit) to decide routing
      const full = await pdfParse(buffer, { max: 0 })
      const pageCount = full.numpages ?? 0

      if (pageCount > 10) {
        // Long doc — extract per-page text for map-reduce processing
        const pages: string[] = []
        for (let p = 1; p <= pageCount; p++) {
          try {
            const pg = await pdfParse(buffer, { max: p })
            pages.push(String(pg.text ?? ''))
          } catch { pages.push('') }
        }
        return {
          kind: 'pdf_text',
          filename: file.name,
          extracted_text: pages.join('\n\n--- PAGE BREAK ---\n\n').slice(0, MAX_TEXT_CHARS),
          bytes,
          page_count: pageCount,
        }
      }

      const result = await pdfParse(buffer, { max: MAX_PDF_PAGES })
      const text = String(result.text ?? '').slice(0, MAX_TEXT_CHARS)
      return {
        kind: 'pdf_text',
        filename: file.name,
        extracted_text: text,
        bytes,
        page_count: pageCount,
      }
    } catch (e) {
      return { error: `Could not read PDF: ${String(e)}` }
    }
  }

  // Spreadsheets (xlsx/xls/csv)
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel' ||
    file.type === 'text/csv' ||
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls') ||
    file.name.endsWith('.csv')
  ) {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const sheets: string[] = []
      for (const name of wb.SheetNames.slice(0, 5)) {
        const ws = wb.Sheets[name]
        const csv = XLSX.utils.sheet_to_csv(ws)
        sheets.push(`=== Sheet: ${name} ===\n${csv.slice(0, 10_000)}`)
      }
      return {
        kind: 'spreadsheet_text',
        filename: file.name,
        extracted_text: sheets.join('\n\n').slice(0, MAX_TEXT_CHARS),
        bytes,
      }
    } catch (e) {
      return { error: `Could not read spreadsheet: ${String(e)}` }
    }
  }

  // Plain text / markdown / json
  if (file.type.startsWith('text/') || file.type === 'application/json' || file.name.match(/\.(txt|md|json|log)$/i)) {
    const text = buffer.toString('utf-8').slice(0, MAX_TEXT_CHARS)
    return {
      kind: 'plain_text',
      filename: file.name,
      extracted_text: text,
      bytes,
    }
  }

  return { error: `Unsupported file type: ${file.type || file.name}` }
}

export function buildImageAnalysisPrompt(userMessage: string, imageCount: number): string {
  return `Analyse ${imageCount > 1 ? `all ${imageCount} images` : 'this image'} in full detail.

If it's a RECEIPT or INVOICE: extract every line item, quantity, price, tax, total, vendor, date, invoice number. Return structured data.
If it's a PRODUCT PHOTO: identify the product, brand, condition, any visible pricing or labels.
If it's a SCREENSHOT: read all visible text, identify the app/page, describe any errors or data shown.
If it's a CHART/GRAPH: extract the data points, axes, trends, and what it shows.
If it's HANDWRITTEN: transcribe the text accurately.
If it's a DOCUMENT: extract all text and structure.

Owner's question: "${userMessage}"

Be exhaustive. Extract every number, name, date, and detail visible.`
}

// Convert parsed attachments to Anthropic message content blocks
export function attachmentsToContentBlocks(
  text: string,
  attachments: ParsedAttachment[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Array<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: Array<any> = []

  // Images first
  for (const att of attachments) {
    if (att.kind === 'image' && att.base64 && att.mediaType) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: att.mediaType, data: att.base64 },
      })
    }
  }

  // Then text — combining the message + text from extracted documents
  const docTexts = attachments
    .filter(a => a.kind !== 'image' && a.extracted_text)
    .map(a => `--- Attached file: ${a.filename} (${a.kind}) ---\n${a.extracted_text}\n--- End of ${a.filename} ---`)
    .join('\n\n')

  const combinedText = docTexts ? `${text}\n\n${docTexts}` : text
  blocks.push({ type: 'text', text: combinedText })

  return blocks
}
