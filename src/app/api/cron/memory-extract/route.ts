export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { extractMemoriesFromTranscript, persistMemories } from '@/lib/aria/memory/extract'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'memory-extract', status: 'running', started_at: new Date().toISOString() })

  try {
    const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()

    const { data: convs } = await supabaseAdmin
      .from('aria_conversations')
      .select('id,business_id,messages,last_message_at,message_count')
      .gte('last_message_at', since)
      .gte('message_count', 2)
      .order('last_message_at', { ascending: false })
      .limit(100)

    if (!convs?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0, errors: { total_memories_extracted: 0 } }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, conversations: 0 })
    }

    const convIds = convs.map(c => c.id)
    const { data: alreadyExtracted } = await supabaseAdmin
      .from('aria_business_memory')
      .select('source_id')
      .in('source_id', convIds)
      .eq('source_type', 'conversation')

    const extractedSet = new Set((alreadyExtracted ?? []).map((r: { source_id: string }) => r.source_id))
    const toProcess = convs.filter(c => !extractedSet.has(c.id))

    if (!toProcess.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0, errors: { total_memories_extracted: 0, note: 'all conversations already processed' } }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, conversations: 0, note: 'all processed' })
    }

    const byBusiness: Record<string, Array<{ id: string; messages: unknown[] }>> = {}
    for (const c of toProcess) {
      const msgs = Array.isArray(c.messages) ? c.messages : []
      if (msgs.length < 2) continue
      const bid = c.business_id as string
      if (!byBusiness[bid]) byBusiness[bid] = []
      byBusiness[bid].push({ id: c.id as string, messages: msgs })
    }

    let businessesProcessed = 0, totalExtracted = 0
    const errors: Array<{ business_id: string; error: string }> = []

    for (const [bid, conversations] of Object.entries(byBusiness)) {
      try {
        const { data: biz } = await supabaseAdmin.from('businesses').select('name,industry').eq('id', bid).maybeSingle()
        if (!biz) continue

        const transcript = conversations
          .slice(0, 5)
          .map(c => {
            const msgs = c.messages as Array<{ role?: string; content?: string }>
            return msgs
              .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
              .slice(-20)
              .map(m => `${m.role}: ${(m.content ?? '').slice(0, 500)}`)
              .join('\n')
          })
          .filter(t => t.length > 50)
          .join('\n\n---\n\n')
          .slice(0, 12_000)

        if (transcript.length < 200) continue

        const memories = await extractMemoriesFromTranscript(bid, transcript, (biz as Record<string, unknown>).name as string ?? 'Unknown', (biz as Record<string, unknown>).industry as string ?? 'retail')
        const sourceConvId = conversations[0]?.id ?? null
        const { inserted } = await persistMemories(bid, memories, sourceConvId)
        totalExtracted += inserted
        businessesProcessed++
      } catch (e) {
        errors.push({ business_id: bid, error: (e as Error).message.slice(0, 200) })
      }
    }

    await supabaseAdmin.from('cron_logs').update({
      status: errors.length > 0 ? 'failed' : 'completed',
      finished_at: new Date().toISOString(),
      businesses_processed: businessesProcessed,
      errors: { total_memories_extracted: totalExtracted, ...(errors.length > 0 ? { items: errors } : {}) },
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, businesses_processed: businessesProcessed, memories_extracted: totalExtracted, errors: errors.length })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
