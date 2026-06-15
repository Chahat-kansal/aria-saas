export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { runTrainingReminders } from '@/lib/training/reminders'

// TP-7 — standalone trigger for training reminders. NOTE: there is NO separate vercel.json cron
// entry for this; the same logic runs daily via the existing reputation-requests cron (0 8). This
// route exists for manual/independent invocation and testing. Daily-safe + idempotent.
export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied
  const result = await runTrainingReminders()
  return NextResponse.json({ ok: true, ...result })
}
