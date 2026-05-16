import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'

export interface OCRItem {
  name: string
  qty: number
  unit_price: number
  total: number
  confidence: number
}

export interface OCRResult {
  items: OCRItem[]
  subtotal: number | null
  tax: number | null
  tip: number | null
  total: number | null
  confidence: number
  error?: string
}

export async function ocrReceipt(imageBase64: string, mimeType: string): Promise<OCRResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const FALLBACK: OCRResult = { items: [], subtotal: null, tax: null, tip: null, total: null, confidence: 0, error: 'parse_failed' }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `You are a receipt parser. Extract every line item from this receipt with quantity, unit price, and total. Also extract subtotal, tax, tip, and grand total. Output strict JSON only — no prose, no code fences:
{"items":[{"name":"string","qty":1,"unit_price":0.00,"total":0.00,"confidence":0.9}],"subtotal":0.00,"tax":0.00,"tip":0.00,"total":0.00,"confidence":0.9}
Numbers as decimals (no currency symbols). Confidence 0-1.`,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: imageBase64,
            },
          },
          { type: 'text', text: 'Parse this receipt and return JSON only.' },
        ],
      }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const parsed = parseLLMJsonOr<OCRResult>(raw, FALLBACK, 'receipt-ocr')
    return parsed
  } catch (e) {
    return { ...FALLBACK, error: (e as Error).message }
  }
}