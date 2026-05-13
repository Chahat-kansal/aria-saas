export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

// Meta requires this endpoint for App Review.
// Full implementation lives at /api/social/data-deletion.
export async function POST() {
  return NextResponse.json({
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'}/privacy`,
    confirmation_code: `del_${Date.now()}`,
  })
}