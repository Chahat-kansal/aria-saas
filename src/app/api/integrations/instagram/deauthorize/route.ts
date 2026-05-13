export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

// Meta calls this when a user revokes app permissions.
// Full signed-request handling is in /api/social/data-deletion.
export async function POST() {
  return NextResponse.json({ url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site' })
}