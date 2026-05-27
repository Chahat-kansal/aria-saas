import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai'

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')
  return new GoogleGenerativeAI(key)
}

// Flash 2.5 — grounded search + vision
export const geminiFlash: GenerativeModel = new Proxy({} as GenerativeModel, {
  get(_t, prop) {
    return getClient().getGenerativeModel({ model: 'gemini-2.5-flash', tools: [{ googleSearchRetrieval: {} }] })[prop as keyof GenerativeModel]
  },
})

// Flash-Lite — simple tasks, cheapest
export const geminiFlashLite: GenerativeModel = new Proxy({} as GenerativeModel, {
  get(_t, prop) {
    return getClient().getGenerativeModel({ model: 'gemini-2.5-flash-lite' })[prop as keyof GenerativeModel]
  },
})

// Vision — receipt/image OCR (Flash has vision built in, no grounding needed)
export const geminiVision: GenerativeModel = new Proxy({} as GenerativeModel, {
  get(_t, prop) {
    return getClient().getGenerativeModel({ model: 'gemini-2.5-flash' })[prop as keyof GenerativeModel]
  },
})
