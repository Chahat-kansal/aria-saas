/**
 * remove-cafe-backgrounds.ts
 *
 * Downloads each DALL-E cafe image from pos-images/cafe-dalle/,
 * strips the white background using @imgly/background-removal-node (U2Net, local),
 * then uploads the transparent PNG to pos-images/cafe-transparent/.
 *
 * Cost:  $0 — model runs entirely in Node, no API key required
 * Time:  ~5-10 min (model downloads ~50 MB on first run, then cached)
 * Idempotent: skips keys already present in cafe-transparent/
 *
 * Usage:
 *   npx vercel env pull .env.local   (or ensure .env.local has Supabase keys)
 *   npm run remove:cafe-bg
 */

import { createClient }    from '@supabase/supabase-js'
import { removeBackground } from '@imgly/background-removal-node'
import * as fs              from 'fs'
import * as path            from 'path'
import * as dotenv          from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET            = 'pos-images'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars. Run: npx vercel env pull .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('🎨 Background removal pipeline starting...\n')

  // 1. List all DALL-E images
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list('cafe-dalle', { limit: 100 })

  if (listError || !files) {
    console.error('Failed to list files:', listError)
    process.exit(1)
  }

  const pngFiles = files.filter(f => f.name.endsWith('.png'))
  console.log(`Found ${pngFiles.length} DALL-E images\n`)

  // Temp dir for any intermediate files (not strictly needed but kept for safety)
  const tmpDir = path.join(process.cwd(), 'tmp-bg-removal')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

  let success = 0
  let failed  = 0
  let skipped = 0

  for (let i = 0; i < pngFiles.length; i++) {
    const file = pngFiles[i]
    const key  = file.name.replace('.png', '')
    process.stdout.write(`  [${i + 1}/${pngFiles.length}] ${key.padEnd(22)} `)

    // Idempotent: skip if already in cafe-transparent/
    try {
      const { data: existing } = await supabase.storage
        .from(BUCKET)
        .list('cafe-transparent', { search: file.name })
      if (existing && existing.some(f => f.name === file.name)) {
        skipped++
        console.log('⏭  already processed')
        continue
      }
    } catch { /* folder may not exist yet — continue */ }

    try {
      // 2. Build public URL — removeBackground accepts URL strings directly
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`cafe-dalle/${file.name}`)

      // 3. Remove background (U2Net model, downloads ~50 MB on first call)
      const resultBlob   = await removeBackground(publicUrl, {
        debug: false,
        output: {
          format:  'image/png',
          quality: 1,
        },
      })

      // 4. Convert result Blob → Buffer
      const resultBuffer = Buffer.from(await resultBlob.arrayBuffer())

      // 6. Upload transparent version
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(`cafe-transparent/${file.name}`, resultBuffer, {
          contentType: 'image/png',
          upsert: false,
        })

      if (uploadError && !uploadError.message.includes('already exists')) {
        console.log(`❌ upload: ${uploadError.message.slice(0, 50)}`)
        failed++
        continue
      }

      success++
      console.log('✓')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`❌ ${msg.slice(0, 60)}`)
      failed++
    }
  }

  // Cleanup temp dir
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true })

  console.log('\n' + '='.repeat(60))
  console.log(`✓  Transparent images created : ${success}`)
  console.log(`⏭  Skipped (already done)     : ${skipped}`)
  console.log(`✗  Failed                      : ${failed}`)
  console.log('='.repeat(60))

  if (success > 0) {
    console.log(`
Run this SQL in Supabase to point products at the transparent images:

  UPDATE pos_products
  SET image_url = REPLACE(image_url, '/cafe-dalle/', '/cafe-transparent/')
  WHERE image_url LIKE '%/cafe-dalle/%';
`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})