import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// TODO: implement outlet cost history — stub prevents 404 until real query is built
async function _GET() {
  return NextResponse.json({ costs: [] })
}

export const GET = withErrorCapture('pos/outlet-costs', _GET)
