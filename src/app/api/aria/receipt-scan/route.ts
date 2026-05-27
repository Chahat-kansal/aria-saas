// Requires Supabase Storage bucket: receipt-ocr (private, image/jpeg|png|webp, 10MB max).
// Create via Supabase dashboard → Storage → New bucket → name "receipt-ocr", public OFF.
// If the bucket is missing, persistence is skipped with a console warning — the Claude vision
// call itself still works on the in-memory buffer.
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getBusinessItems } from '@/lib/business-data';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'
import { geminiVision } from '@/lib/gemini'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Robust JSON array extractor — handles nested structures, escaped strings
function extractJsonArray(text: string): any[] {
  const clean = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
  try { const d = JSON.parse(clean); if (Array.isArray(d)) return d; } catch {}
  let start = -1, depth = 0;
  let inStr = false, esc = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '[') { if (depth === 0) start = i; depth++; }
    else if (ch === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { const p = JSON.parse(clean.slice(start, i + 1)); if (Array.isArray(p)) return p; } catch {}
        start = -1;
      }
    }
  }
  return [];
}

// Finds the outermost balanced JSON object
function extractJson(text: string): any | null {
  const clean = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
  try { const d = JSON.parse(clean); if (d && typeof d === 'object') return d; } catch {}
  let depth = 0;
  const start = clean.indexOf('{');
  if (start === -1) return null;
  let inStr = false, esc = false;
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(clean.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

function fuzzyScore(a: string, b: string): number {
  const A = a.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const B = b.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (A === B) return 1.0;
  if (A.includes(B) || B.includes(A)) return 0.8;
  const wordsA = new Set(A.split(' ').filter(w => w.length > 2));
  const wordsB = B.split(' ').filter(w => w.length > 2);
  if (wordsA.size === 0 || wordsB.length === 0) return 0;
  const matches = wordsB.filter(w => wordsA.has(w)).length;
  return matches / Math.max(wordsA.size, wordsB.length);
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const business_id = form.get('business_id') as string | null;
  const updateCostsFlag = String(form.get('update_costs') ?? '') === 'true';

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 415 });
  }

  const { data: business } = await supabase.from('businesses').select('id, data_source')
    .eq('id', business_id).eq('user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  // Convert file to base64
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  // Use image/jpeg as fallback for unsupported Claude types (HEIC, PDF)
  const mediaType = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)
    ? file.type : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  let extractedLines: any[] = [];
  let supplierName: string | null = null;
  let invoiceDate: string | null = null;
  let invoiceTotal: number | null = null;
  let scanSource = 'claude';

  // Try Gemini Vision first — better OCR, cheaper
  try {
    const geminiPrompt = `Extract all information from this supplier receipt/invoice. Return ONLY valid JSON, no markdown:
{
  "supplier_name": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "invoice_number": "string or null",
  "lines": [{"description": "string", "quantity": number, "unit": "each|carton|kg|litre or as shown", "unit_price_aud": number or null, "total_price_aud": number or null}],
  "invoice_total_aud": number or null,
  "gst_amount": number or null
}
All amounts in dollars. If unclear, use null. If not an invoice, return empty lines array.`

    const geminiResult = await geminiVision.generateContent([
      geminiPrompt,
      { inlineData: { data: base64, mimeType: mediaType } },
    ])
    const geminiText = geminiResult.response.text()
    const geminiParsed = extractJson(geminiText)
    if (geminiParsed && Array.isArray(geminiParsed.lines) && geminiParsed.lines.length > 0) {
      extractedLines = geminiParsed.lines
      supplierName = geminiParsed.supplier_name ?? null
      invoiceDate = geminiParsed.invoice_date ?? null
      invoiceTotal = geminiParsed.invoice_total_aud ?? null
      scanSource = 'gemini'
    }
  } catch (geminiErr: any) {
    console.warn('[receipt-scan] Gemini Vision failed, falling back to Claude:', geminiErr.message?.slice(0, 120))
  }

  if (extractedLines.length === 0) try {
    const response = await trackAICall({ route: 'aria/receipt-scan', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'receipt-scan-vision' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `You are processing a supplier invoice for an Australian retail/hospitality business.
Extract ALL line items. Also extract supplier name, invoice date, and invoice total if visible.
Limit to 20 most significant line items. Ensure the JSON is complete and valid.

Return ONLY this JSON structure, no markdown, no explanation:
{
  "supplier_name": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "invoice_total_aud": number or null,
  "lines": [{
    "supplier_code": "string or null",
    "description": "full product name as shown on invoice",
    "quantity": number,
    "unit": "each|carton|case|kg|litre|dozen or as shown",
    "unit_price_aud": number or null,
    "total_price_aud": number or null
  }]
}
If this is not an invoice/receipt, return: {"supplier_name":null,"invoice_date":null,"invoice_total_aud":null,"lines":[]}
Be precise — these numbers update real inventory.`,
          },
        ],
      }],
    }));

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log('[receipt-scan] Claude response (first 400 chars):', text.slice(0, 400));

    // Strategy 1: extract full JSON object (supplier_name + lines)
    let parsed = extractJson(text);

    // Strategy 2: Claude returned lines array directly
    if (!parsed) {
      const arr = extractJsonArray(text);
      if (arr.length > 0) parsed = { lines: arr, supplier_name: null, invoice_date: null, invoice_total_aud: null };
    }

    if (parsed) {
      extractedLines = Array.isArray(parsed.lines) ? parsed.lines : extractJsonArray(JSON.stringify(parsed));
      supplierName = parsed.supplier_name ?? null;
      invoiceDate = parsed.invoice_date ?? null;
      invoiceTotal = parsed.invoice_total_aud ?? null;
    } else {
      console.error('[receipt-scan] Parse failed:', text.slice(0, 800));
      return NextResponse.json({
        extracted_lines: [], supplier_name: null, invoice_date: null, invoice_total_aud: null, line_count: 0,
        error: 'Aria could not read this invoice clearly. Try a photo with better lighting, or ensure the invoice text is clearly visible.',
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Vision processing failed: ${err.message}` }, { status: 500 });
  }

  // Optional: persist the uploaded file to receipt-ocr bucket for audit.
  // Non-fatal — if the bucket is missing we log and continue.
  try {
    const path = `${business_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadErr } = await supabase.storage
      .from('receipt-ocr')
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (uploadErr) {
      const msg = uploadErr.message ?? ''
      if (/bucket not found/i.test(msg)) {
        console.warn('[receipt-scan] receipt-ocr bucket missing — image not persisted. Create the bucket in Supabase Storage to enable audit persistence.')
      } else {
        console.warn('[receipt-scan] storage upload failed (non-fatal):', msg)
      }
    }
  } catch { /* non-fatal */ }

  if (extractedLines.length === 0) {
    return NextResponse.json({
      extracted_lines: [],
      supplier_name: supplierName,
      invoice_date: invoiceDate,
      invoice_total_aud: invoiceTotal,
      line_count: 0,
    });
  }

  // Fetch existing items for matching
  const dataSource = (business.data_source ?? 'aria_pos') as 'square' | 'aria_pos';
  const items = await getBusinessItems(business_id, dataSource);

  // Match each extracted line to existing items
  const result = extractedLines.map((line: any) => {
    let matchedItem = null;
    let matchConfidence: 'exact' | 'fuzzy' | 'none' = 'none';

    // 1. Exact SKU match
    if (line.supplier_code) {
      const skuMatch = items.find(i => i.sku?.toLowerCase() === line.supplier_code?.toLowerCase());
      if (skuMatch) {
        matchedItem = { id: skuMatch.id, name: skuMatch.name, current_stock: skuMatch.currentStock };
        matchConfidence = 'exact';
      }
    }

    // 2. Fuzzy name match
    if (!matchedItem) {
      let bestScore = 0;
      let bestItem = null;
      for (const item of items) {
        const score = fuzzyScore(line.description, item.name);
        if (score > bestScore) { bestScore = score; bestItem = item; }
      }
      if (bestScore >= 0.8) {
        matchedItem = { id: bestItem!.id, name: bestItem!.name, current_stock: bestItem!.currentStock };
        matchConfidence = bestScore === 1.0 ? 'exact' : 'fuzzy';
      }
    }

    const currentStock = matchedItem?.current_stock ?? 0;
    return {
      description: line.description,
      quantity: line.quantity ?? 1,
      unit: line.unit ?? 'each',
      unit_price_aud: line.unit_price_aud ?? null,
      total_price_aud: line.total_price_aud ?? null,
      matched_item: matchedItem,
      match_confidence: matchConfidence,
      suggested_new_stock: currentStock + (line.quantity ?? 1),
    };
  });

  // Log scan to pos_receipt_scans (non-fatal)
  try {
    await supabaseAdmin.from('pos_receipt_scans').insert({
      business_id,
      scan_source: scanSource,
      supplier_name: supplierName,
      invoice_date: invoiceDate ?? null,
      grand_total: invoiceTotal,
      line_items: result,
    })
  } catch { /* non-fatal */ }

  // Feature 8: optionally auto-update product cost prices from matched lines
  const cost_updates: Array<{ product_id: string; product_name: string; old_cost: number; new_cost: number; margin_pct: number | null }> = []
  if (updateCostsFlag) {
    for (const line of result as Array<{ matched_item: { id: string; name: string } | null; unit_price_aud: number | null; match_confidence: string }>) {
      if (!line.matched_item || line.unit_price_aud == null || line.match_confidence === 'none') continue
      const newCost = Number(line.unit_price_aud)
      if (!(newCost > 0)) continue
      const { data: prev } = await supabaseAdmin.from('pos_products').select('cost_price, price').eq('id', line.matched_item.id).maybeSingle()
      const oldCost = Number(prev?.cost_price ?? 0)
      const sellPrice = Number(prev?.price ?? 0)
      const marginPct = sellPrice > 0 ? Math.round(((sellPrice - newCost) / sellPrice) * 1000) / 10 : null
      await supabaseAdmin.from('pos_products').update({ cost_price: newCost }).eq('id', line.matched_item.id)
      cost_updates.push({ product_id: line.matched_item.id, product_name: line.matched_item.name, old_cost: oldCost, new_cost: newCost, margin_pct: marginPct })
    }
  }
  const low_margin = cost_updates.filter(u => u.margin_pct !== null && u.margin_pct < 20)

  return NextResponse.json({
    extracted_lines: result,
    supplier_name: supplierName,
    invoice_date: invoiceDate,
    invoice_total_aud: invoiceTotal,
    line_count: result.length,
    scan_source: scanSource,
    cost_updates,
    low_margin_after_update: low_margin,
  });
}

export const POST = withErrorCapture('aria/receipt-scan', _POST)
