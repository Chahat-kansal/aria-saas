export interface DocumentLineItem {
  name: string
  quantity: number | null
  unit_price: number | null
  total: number | null
  barcode?: string | null
}

export interface DocumentReadResult {
  type: 'invoice' | 'receipt' | 'product_list' | 'unknown'
  supplier?: string | null
  date?: string | null
  total?: number | null
  line_items: DocumentLineItem[]
  raw_text: string
  confidence: 'high' | 'medium' | 'low'
  suggested_action: string
}

const VISION_SYSTEM = `You extract structured data from business documents (invoices, receipts, product lists). Return JSON ONLY matching this exact schema, no preamble:
{
  "type": "invoice"|"receipt"|"product_list"|"unknown",
  "supplier": "supplier name or null",
  "date": "ISO date or null",
  "total": number or null,
  "line_items": [{"name":"...","quantity":number|null,"unit_price":number|null,"total":number|null,"barcode":"..."|null}],
  "raw_text": "key text from document (max 300 chars)",
  "confidence": "high"|"medium"|"low",
  "suggested_action": "what the business owner should do with this data"
}
Prices are in AUD. GST may be included.`

export async function readDocument(
  imageBase64: string,
  mimeType: string,
): Promise<DocumentReadResult> {
  const { callGemini } = await import('../providers/gemini')

  const result = await callGemini({
    systemPrompt: VISION_SYSTEM,
    userPrompt: 'Extract data from this business document.',
    maxTokens: 1500,
    agentKey: 'document_vision',
    role: 'analysis',
    imageBase64,
    imageMimeType: mimeType,
  })

  const text = result.raw.replace(/```json|```/g, '').trim()
  try {
    const parsed = JSON.parse(text) as DocumentReadResult
    return parsed
  } catch {
    return {
      type: 'unknown',
      line_items: [],
      raw_text: text.slice(0, 300),
      confidence: 'low',
      suggested_action: 'Could not parse document. Try a clearer image.',
    }
  }
}
