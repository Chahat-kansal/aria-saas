import { GoogleGenerativeAI } from '@google/generative-ai'

const key = process.env.GEMINI_API_KEY
if (!key) throw new Error('GEMINI_API_KEY not set')

export const gemini = new GoogleGenerativeAI(key)

// Flash 2.5 — grounded search + vision
export const geminiFlash = gemini.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: [{ googleSearchRetrieval: {} }],
})

// Flash-Lite — simple tasks, cheapest
export const geminiFlashLite = gemini.getGenerativeModel({
  model: 'gemini-2.5-flash-lite',
})

// Vision — receipt/image OCR (Flash has vision built in, no grounding needed)
export const geminiVision = gemini.getGenerativeModel({
  model: 'gemini-2.5-flash',
})
