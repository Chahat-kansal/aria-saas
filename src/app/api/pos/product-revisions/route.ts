import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// TODO: implement product revision history — stub prevents 404 until real query is built
async function _GET() {
  return NextResponse.json({ revisions: [] })
}

export const GET = withErrorCapture('pos/product-revisions', _GET)
