import { NextResponse } from 'next/server'

/**
 * TikTok domain verification endpoint
 * TikTok requires a plain text file at the root of your domain to verify ownership.
 * File is typically named: tiktok{token}.txt
 * Content is typically just the token itself or "tiktok-developers-site-verification={token}"
 *
 * Deploy this once. When TikTok gives you a new verification file name/content,
 * update TIKTOK_TOKEN below and redeploy.
 *
 * Route: /tiktokverification (catches all tiktok*.txt requests via rewrites)
 */

const TIKTOK_TOKEN = process.env.TIKTOK_VERIFICATION_TOKEN ?? ''

export async function GET() {
  return new NextResponse(
    `tiktok-developers-site-verification=${TIKTOK_TOKEN}`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      },
    }
  )
}
