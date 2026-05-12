import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  throw new Error('Sentry test error — safe to ignore')
  return NextResponse.json({ ok: true }) // unreachable
}
