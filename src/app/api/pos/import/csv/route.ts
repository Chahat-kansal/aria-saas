export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

/**
 * POST /api/pos/import/csv
 *
 * Phase 1 — map + preview (no confirm field):
 *   Body: { csv_text: string }
 *   Returns: { mapping, preview, total_rows, unmapped_columns }
 *
 * Phase 2 — confirm import:
 *   Body: { csv_text: string, confirmed: true, mapping: {...} }
 *   Returns: { imported, updated, skipped, errors }
 */
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { csv_text, confirmed, mapping: providedMapping } = body;

  if (!csv_text || typeof csv_text !== 'string') {
    return NextResponse.json({ error: 'csv_text required' }, { status: 400 });
  }

  const { headers, rows } = parseCSV(csv_text);
  if (headers.length === 0 || rows.length === 0) {
    return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });
  }

  // ── Phase 2: confirmed import ──────────────────────────────────────────────
  if (confirmed && providedMapping) {
    const mapping = providedMapping as Record<string, string>;
    let imported = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    // Fetch existing barcodes + SKUs to detect duplicates
    const { data: existing } = await supabase
      .from('pos_products')
      .select('id, barcode, sku')
      .eq('business_id', bid);

    const byBarcode = new Map((existing ?? []).filter(p => p.barcode).map(p => [String(p.barcode), p.id]));
    const bySku     = new Map((existing ?? []).filter(p => p.sku).map(p => [String(p.sku), p.id]));

    for (const row of rows) {
      try {
        const name      = row[mapping.name]?.trim();
        const priceRaw  = row[mapping.price]?.trim().replace(/[^0-9.]/g, '');
        if (!name) { skipped++; continue; }

        const price        = parseFloat(priceRaw) || 0;
        const sku          = mapping.sku          ? row[mapping.sku]?.trim()          || null : null;
        const barcode      = mapping.barcode      ? row[mapping.barcode]?.trim()      || null : null;
        const category     = mapping.category     ? row[mapping.category]?.trim()     || null : null;
        const costRaw      = mapping.cost_price   ? row[mapping.cost_price]?.trim().replace(/[^0-9.]/g, '') : null;
        const cost_price   = costRaw              ? parseFloat(costRaw) || null : null;
        const stockRaw     = mapping.stock_qty    ? row[mapping.stock_qty]?.trim()    : null;
        const stock_qty    = stockRaw             ? parseInt(stockRaw) || 0 : 0;
        const description  = mapping.description  ? row[mapping.description]?.trim()  || null : null;

        // Duplicate detection
        const existingId = (barcode && byBarcode.get(barcode)) || (sku && bySku.get(sku));

        const payload: Record<string, unknown> = {
          business_id: bid, name, price, stock_qty,
          source: 'csv_import', track_inventory: stock_qty > 0,
        };
        if (sku)         payload.sku         = sku;
        if (barcode)     payload.barcode     = barcode;
        if (category)    payload.category    = category;
        if (cost_price)  payload.cost_price  = cost_price;
        if (description) payload.description = description;

        if (existingId) {
          // Update existing
          const { error } = await supabase.from('pos_products').update(payload).eq('id', existingId);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase.from('pos_products').insert(payload);
          if (error) throw error;
          imported++;
          if (barcode) byBarcode.set(barcode, 'new');
          if (sku) bySku.set(sku, 'new');
        }
      } catch (e: unknown) {
        errors.push(e instanceof Error ? e.message : String(e));
        skipped++;
      }
    }

    return NextResponse.json({ ok: true, imported, updated, skipped, total: rows.length, errors: errors.slice(0, 10) });
  }

  // ── Phase 1: AI column mapping ────────────────────────────────────────────
  const sampleRows = rows.slice(0, 5);
  const sampleText = [headers.join(' | '), ...sampleRows.map(r => headers.map(h => r[h] ?? '').join(' | '))].join('\n');

  const aiPrompt = `You are a data mapping assistant for a POS system. Map CSV columns to product fields.

CSV columns and sample data:
${sampleText}

Available product fields:
- name (required): product name
- price (required): selling price (number)
- sku: stock keeping unit / item code
- barcode: EAN/UPC barcode
- category: product category
- cost_price: purchase cost / wholesale price
- stock_qty: quantity on hand / current stock
- description: product description

Return ONLY a valid JSON object mapping CSV column names to field names. Use null for columns you cannot confidently map. Example:
{"Product Name": "name", "Retail Price": "price", "Item Code": "sku", "UPC": "barcode", "Dept": "category", "Cost": "cost_price", "On Hand": "stock_qty", "Notes": null}

Map every column. Use null for unrecognised columns. Do not add markdown or explanation.`;

  let mapping: Record<string, string | null> = {};
  try {
    const aiResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: aiPrompt }],
    });
    const text = (aiResponse.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) mapping = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: simple heuristic mapping
    for (const h of headers) {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['name','productname','itemname','description2','title'].some(k => lower.includes(k) || lower === k)) mapping[h] = 'name';
      else if (['price','retailprice','saleprice','sellingprice','unit_price'].some(k => lower.includes(k))) mapping[h] = 'price';
      else if (['sku','itemcode','productcode','code','id','ref'].some(k => lower === k)) mapping[h] = 'sku';
      else if (['barcode','ean','upc','gtin'].some(k => lower.includes(k))) mapping[h] = 'barcode';
      else if (['category','dept','department','type','class'].some(k => lower.includes(k))) mapping[h] = 'category';
      else if (['cost','costprice','purchaseprice','wholesale'].some(k => lower.includes(k))) mapping[h] = 'cost_price';
      else if (['stock','qty','quantity','onhand','instock','inventory'].some(k => lower.includes(k))) mapping[h] = 'stock_qty';
      else if (['description','notes','detail','memo'].some(k => lower.includes(k))) mapping[h] = 'description';
      else mapping[h] = null;
    }
  }

  // Build reverse mapping (field → column) for preview
  const fieldToCol: Record<string, string> = {};
  for (const [col, field] of Object.entries(mapping)) {
    if (field) fieldToCol[field] = col;
  }

  const preview = sampleRows.map(row => ({
    name:        row[fieldToCol['name']]        ?? '',
    price:       row[fieldToCol['price']]       ?? '',
    sku:         row[fieldToCol['sku']]         ?? '',
    barcode:     row[fieldToCol['barcode']]     ?? '',
    category:    row[fieldToCol['category']]    ?? '',
    cost_price:  row[fieldToCol['cost_price']]  ?? '',
    stock_qty:   row[fieldToCol['stock_qty']]   ?? '',
    description: row[fieldToCol['description']] ?? '',
    _raw: row,
  }));

  const unmapped = headers.filter(h => !mapping[h]);

  return NextResponse.json({ mapping, preview, total_rows: rows.length, unmapped_columns: unmapped, headers });
}
