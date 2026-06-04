export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import path from 'path'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { type EditSpec } from '@/remotion/types'

// Lazy-loaded to avoid bundling issues at build time
async function getRemotionModules() {
  const [{ bundle }, { createSandbox, addBundleToSandbox, renderMediaOnVercel }] = await Promise.all([
    import('@remotion/bundler'),
    import('@remotion/vercel'),
  ])
  return { bundle, createSandbox, addBundleToSandbox, renderMediaOnVercel }
}

// Cache bundle dir across warm invocations
let cachedBundleDir: string | null = null

async function ensureBundle(bundleFn: typeof import('@remotion/bundler').bundle): Promise<string> {
  if (cachedBundleDir) return cachedBundleDir
  const entryPoint = path.join(process.cwd(), 'src', 'remotion', 'index.ts')
  cachedBundleDir = await bundleFn({ entryPoint })
  return cachedBundleDir
}

async function _POST(req: Request) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    return NextResponse.json({
      error: 'BLOB_READ_WRITE_TOKEN is not set. Please attach a Vercel Blob store to this project in the Vercel dashboard (Storage → Blob → Connect to project), then redeploy.',
    }, { status: 503 })
  }

  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    session_id?: string
    business_id?: string
    spec?: EditSpec
  }
  const { session_id, business_id, spec } = body

  if (!session_id || !business_id || !spec) {
    return NextResponse.json({ error: 'session_id, business_id and spec required' }, { status: 400 })
  }

  // Verify ownership
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: session } = await supabaseAdmin.from('reel_studio_sessions').select('id')
    .eq('id', session_id).eq('business_id', business_id).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Save edit_spec
  await supabaseAdmin.from('reel_studio_sessions').update({ edit_spec: spec as unknown as Record<string, unknown> }).eq('id', session_id)

  const { bundle, createSandbox, addBundleToSandbox, renderMediaOnVercel } = await getRemotionModules()

  const bundleDir = await ensureBundle(bundle)
  const sandbox = await createSandbox()

  await addBundleToSandbox({ sandbox, bundleDir })

  const result = await renderMediaOnVercel({
    sandbox,
    compositionId: 'ReelComposition',
    inputProps: { spec: spec as unknown as Record<string, unknown> },
    codec: 'h264',
    detached: true,
    vercelBlob: { blobToken, access: 'public' },
  })

  // Store job ids
  await supabaseAdmin.from('reel_studio_sessions').update({
    render_sandbox_id: result.sandboxId,
    render_cmd_id: result.cmdId,
  }).eq('id', session_id)

  return NextResponse.json({
    sandboxId: result.sandboxId,
    cmdId: result.cmdId,
    outputFile: result.outputFile,
  })
}

export const POST = withErrorCapture('reels/render', _POST)
