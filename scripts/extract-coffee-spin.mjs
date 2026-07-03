#!/usr/bin/env node
/**
 * Extract 24 spin frames from a Higgsfield turntable MP4.
 * Removes background via rembg Python API, outputs transparent WebP.
 *
 * Usage: node scripts/extract-coffee-spin.mjs <drink> <input.mp4> [--duration=5]
 * Example: node scripts/extract-coffee-spin.mjs flat-white ./input.mp4
 *
 * Prereqs: pip install "rembg[cpu]" Pillow
 */
import { execSync } from 'child_process'
import { mkdirSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const FFMPEG = require('ffmpeg-static')

const args = process.argv.slice(2)
const drink = args[0]
const mp4 = args[1]
const durationArg = args.find(a => a.startsWith('--duration='))
const DUR = durationArg ? parseFloat(durationArg.split('=')[1]) : 5

if (!drink || !mp4) {
  console.error('Usage: node scripts/extract-coffee-spin.mjs <drink> <input.mp4> [--duration=5]')
  process.exit(1)
}

const absmp4 = resolve(mp4)
const OUT = `public/menu/_lib/spin/${drink}`
const TMP = `${OUT}/_tmp`
mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })

console.log(`\n── COFFEE-SPIN: ${drink} ───────────────────────`)
console.log(`   Input : ${absmp4}`)
console.log(`   Output: ${OUT}/`)
console.log(`   Dur   : ${DUR}s -> 24 frames @ ${(24/DUR).toFixed(2)}fps`)
console.log()

// ── Step 1: Extract 24 PNG frames ─────────────────────────────────────────────
// Video is typically portrait. Scale to fit 512x512, pad with white to square.
const vf = [
  `fps=24/${DUR}`,
  'scale=512:512:force_original_aspect_ratio=decrease',
  'pad=512:512:(ow-iw)/2:(oh-ih)/2:white',
].join(',')

const ffmpegCmd = `"${FFMPEG}" -i "${absmp4}" -vf "${vf}" -frames:v 24 -start_number 0 "${TMP}/%03d.png" -y`
console.log('[1/3] Extracting frames...')
execSync(ffmpegCmd, { stdio: 'inherit' })

const pngs = readdirSync(TMP).filter(f => f.endsWith('.png')).sort()
console.log(`      Got ${pngs.length} frames\n`)

// ── Step 2: Remove background via rembg Python API ────────────────────────────
// Uses scripts/rembg_batch.py which loads the u2net model once for all frames.
// First run downloads ~170MB model to ~/.u2net/u2net.onnx
console.log('[2/3] Removing backgrounds via rembg (first run downloads model ~170MB)...')
execSync(`python scripts/rembg_batch.py "${TMP}" "${OUT}"`, { stdio: 'inherit' })
console.log('      Done.\n')

// ── Step 3: Verify output ─────────────────────────────────────────────────────
const webps = readdirSync(OUT).filter(f => f.endsWith('.webp')).sort()
console.log(`[3/3] Output: ${webps.length} frames in ${OUT}/`)
webps.forEach(f => {
  const bytes = require('fs').statSync(`${OUT}/${f}`).size
  process.stdout.write(`      ${f}  ${(bytes/1024).toFixed(1)}KB\n`)
})

// Cleanup tmp
console.log('\n      Cleaning up tmp PNGs...')
const { unlinkSync, rmdirSync } = require('fs')
readdirSync(TMP).forEach(f => { try { unlinkSync(`${TMP}/${f}`) } catch {} })
try { rmdirSync(TMP) } catch {}

console.log(`\nDone: ${drink}: ${webps.length} frames ready\n`)