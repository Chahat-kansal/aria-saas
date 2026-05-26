export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  await supabaseAdmin
    .from('invoices')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('viewed_at', null)

  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  return new NextResponse(gif, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
