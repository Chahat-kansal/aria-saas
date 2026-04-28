import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getBusinessItems } from '@/lib/business-data';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Finds the outermost balanced JSON object in a string (handles nested braces)
function extractJson(text: string): any | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
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

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const business_id = form.get('business_id') as string | null;

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

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `You are processing a supplier invoice for an Australian retail/hospitality business.
Extract ALL line items. Also extract supplier name, invoice date, and invoice total if visible.

Return ONLY this JSON structure, no markdown:
{
  "supplier_name": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "invoice_total_aud": number or null,
  "lines": [{
    "supplier_code": "string or null",
    "description": "full product name as shown",
    "quantity": number,
    "unit": "each|carton|case|kg|litre|dozen or as shown",
    "unit_price_aud": number or null,
    "total_price_aud": number or null
  }]
}
If this is not an invoice/receipt, return { "supplier_name": null, "invoice_date": null, "invoice_total_aud": null, "lines": [] }.
Be precise — these numbers update real inventory.`,
          },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Strip markdown code fences, then find the outermost JSON object
    const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
    const parsed = extractJson(cleaned);
    if (parsed) {
      extractedLines = parsed.lines ?? [];
      supplierName = parsed.supplier_name ?? null;
      invoiceDate = parsed.invoice_date ?? null;
      invoiceTotal = parsed.invoice_total_aud ?? null;
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Vision processing failed: ${err.message}` }, { status: 500 });
  }

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

  return NextResponse.json({
    extracted_lines: result,
    supplier_name: supplierName,
    invoice_date: invoiceDate,
    invoice_total_aud: invoiceTotal,
    line_count: result.length,
  });
}
