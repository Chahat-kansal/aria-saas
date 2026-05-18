import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30_000,
  maxRetries: 0,
})

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

export async function readDocument(
  imageBase64: string,
  mimeType: string,
): Promise<DocumentReadResult> {
  const safeMime = (['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const)
    .includes(mimeType as 'image/jpeg') ? mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' : 'image/jpeg'

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: safeMime, data: imageBase64 },
        },
        {
          type: 'text',
          text: `Read this document and extract structured data. Return JSON ONLY:
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
Prices are in AUD. GST may be included.`,
        },
      ],
    }],
  })

  const text = ((response.content[0] as { type: string; text?: string }).text ?? '').replace(/```json|```/g, '').trim()
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
