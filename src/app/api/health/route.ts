export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
  })
}