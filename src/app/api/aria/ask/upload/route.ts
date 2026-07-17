export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { readDocument } from '@/lib/aria/intelligence/document-vision'

async function _POST(req: Request, _context: unknown, _biz: BusinessContext) {
  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'No form data' }, { status: 400 })

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP images are supported' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  const result = await readDocument(base64, file.type)
  return NextResponse.json({ document: result })
}

export const POST = withBusinessContext('aria/ask/upload', _POST)
