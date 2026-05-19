export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseBool(v: string | undefined): boolean | null {
  if (!v) return null;
  const lower = v.toLowerCase().trim();
  if (['y','yes','true','1','x','â','18+','age restricted','restricted','adult','rsa'].includes(lower)) return true;
  if (['n','no','false','0',''].includes(lower)) return false;
  return null;
}

function parseVolumeMl(v: string | undefined): number | null {
  if (!v) return null;
  const s = v.trim();
  const multi = s.match(/\d+\s*x\s*(\d+(?:\.\d+)?)\s*(ml|l|cl)/i);
  if (multi) {
    const num = parseFloat(multi[1]);
    const unit = multi[2].toLowerCase();
    return unit === 'l' ? Math.round(num * 1000) : unit === 'cl' ? Math.round(num * 10) : Math.round(num);
  }
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(ml|l|cl|fl\s*oz)?/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'ml').replace(/\s/g,'').toLowerCase();
  if (unit === 'l') return Math.round(num * 1000);
  if (unit === 'cl') return Math.round(num * 10);
  if (unit.includes('oz')) return Math.round(num * 29.5735);
  return Math.round(num);
}

function parseAlcohol(v: string | undefined): number | null {
  if (!v) return null;
  const match = v.replace(/[%ABVabv\s]/g,'').match(/^(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  return num > 0 && num <= 100 ? num : null;
}

function parseAllergens(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

function parseTags(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

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
async function _POST(req: Request) {
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
        if (!name) { skipped++; continue; }

        const priceRaw  = row[mapping.price]?.trim().replace(/[^0-9.]/g, '');
        const price     = parseFloat(priceRaw || '0') || 0;

        const sku              = mapping.sku             ? row[mapping.sku]?.trim()              || null : null;
        const barcode          = mapping.barcode         ? row[mapping.barcode]?.trim()          || null : null;
        const category         = mapping.category        ? row[mapping.category]?.trim()         || null : null;
        const brand            = mapping.brand           ? row[mapping.brand]?.trim()            || null : null;
        const description      = mapping.description     ? row[mapping.description]?.trim()      || null : null;
        const supplier_name    = mapping.supplier_name   ? row[mapping.supplier_name]?.trim()    || null : null;
        const supplier_sku     = mapping.supplier_sku    ? row[mapping.supplier_sku]?.trim()     || null : null;
        const notes            = mapping.notes           ? row[mapping.notes]?.trim()            || null : null;
        const colour           = mapping.colour          ? row[mapping.colour]?.trim()           || null : null;
        const size             = mapping.size            ? row[mapping.size]?.trim()             || null : null;
        const country_of_origin= mapping.country_of_origin ? row[mapping.country_of_origin]?.trim() || null : null;
        const container_type   = mapping.container_type  ? row[mapping.container_type]?.trim()   || null : null;
        const bin_location     = mapping.bin_location    ? row[mapping.bin_location]?.trim()     || null : null;

        const costRaw       = mapping.cost_price     ? row[mapping.cost_price]?.trim().replace(/[^0-9.]/g,'')    : null;
        const cost_price    = costRaw                ? parseFloat(costRaw) || null : null;
        const stockRaw      = mapping.stock_quantity ? row[mapping.stock_quantity]?.trim() : null;
        const stock_quantity= stockRaw               ? parseInt(stockRaw) || 0 : 0;
        const rrpRaw        = mapping.rrp            ? row[mapping.rrp]?.trim().replace(/[^0-9.]/g,'') : null;
        const rrp           = rrpRaw                 ? parseFloat(rrpRaw) || null : null;
        const reorderRaw    = mapping.reorder_point  ? row[mapping.reorder_point]?.trim()  : null;
        const reorder_point = reorderRaw             ? parseInt(reorderRaw) || null : null;
        const reorderQtyRaw = mapping.reorder_qty    ? row[mapping.reorder_qty]?.trim()    : null;
        const reorder_qty   = reorderQtyRaw          ? parseInt(reorderQtyRaw) || null : null;
        const caseQRaw      = mapping.case_quantity  ? row[mapping.case_quantity]?.trim()  : null;
        const case_quantity = caseQRaw               ? parseInt(caseQRaw) || null : null;
        const ipcRaw        = mapping.items_per_case ? row[mapping.items_per_case]?.trim() : null;
        const items_per_case= ipcRaw                 ? parseInt(ipcRaw) || null : null;
        const vintageRaw    = mapping.vintage        ? row[mapping.vintage]?.trim()        : null;
        const vintage       = vintageRaw             ? parseInt(vintageRaw) || null : null;
        const shelfRaw      = mapping.shelf_life_days? row[mapping.shelf_life_days]?.trim(): null;
        const shelf_life_days= shelfRaw              ? parseInt(shelfRaw) || null : null;
        const weightRaw     = mapping.weight         ? row[mapping.weight]?.trim().replace(/[^0-9.]/g,'') : null;
        const weight        = weightRaw              ? parseFloat(weightRaw) || null : null;
        const weight_unit   = mapping.weight_unit    ? row[mapping.weight_unit]?.trim() || 'kg' : 'kg';

        const alcohol_percentage = mapping.alcohol_percentage ? parseAlcohol(row[mapping.alcohol_percentage]) : null;
        const standard_drinks    = mapping.standard_drinks    ? (parseFloat(row[mapping.standard_drinks]?.replace(/[^0-9.]/g,'') || '') || null) : null;
        const volumeMl           = mapping.volume             ? parseVolumeMl(row[mapping.volume]) : null;
        const volume             = volumeMl;
        const volume_unit        = volumeMl != null ? 'ml' : null;
        const is_age_restricted  = mapping.is_age_restricted  ? (parseBool(row[mapping.is_age_restricted]) ?? false) : false;
        const gst_exempt         = mapping.gst_exempt         ? (parseBool(row[mapping.gst_exempt]) ?? false) : false;
        const allergens          = mapping.allergens           ? parseAllergens(row[mapping.allergens]) : [];
        const tags               = mapping.tags               ? parseTags(row[mapping.tags]) : [];

        // Duplicate detection
        const existingId = (barcode && byBarcode.get(barcode)) || (sku && bySku.get(sku));

        const payload: Record<string, unknown> = {
          business_id: bid, name, price, stock_quantity,
          source: 'csv_import', track_inventory: stock_quantity > 0,
          is_age_restricted, gst_exempt, allergens, tags,
        };
        const optionals: Record<string, unknown> = {
          sku, barcode, category, brand, description, supplier_name, supplier_sku,
          notes, colour, size, country_of_origin, container_type, bin_location,
          cost_price, rrp, reorder_point, reorder_qty, case_quantity, items_per_case,
          vintage, shelf_life_days, weight, weight_unit: weight ? weight_unit : undefined,
          volume, volume_unit: volume ? volume_unit : undefined,
          alcohol_percentage, standard_drinks,
        };
        for (const [k, v] of Object.entries(optionals)) { if (v != null) payload[k] = v; }

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

  const aiPrompt = `You are a data mapping expert for an Australian retail POS system. Map these CSV column headers to product fields.

CSV headers and sample data:
${sampleText}

Available product fields:
- name (required): product name
- price (required): selling price (number, dollars)
- sku: stock keeping unit / item code
- barcode: EAN/UPC/GTIN barcode number
- category: product category or department
- brand: brand, winery, brewery, or producer name
- description: product description or notes
- cost_price: purchase cost / wholesale / buy price (dollars)
- stock_quantity: quantity on hand / current stock (number)
- supplier_name: supplier or vendor name
- supplier_sku: supplier's own product code
- reorder_point: minimum stock level to trigger reorder
- reorder_qty: quantity to order when restocking
- case_quantity: number of units per case
- items_per_case: items per case
- bin_location: shelf, bin, or storage location code
- rrp: recommended retail price
- unit: unit of measure (each, kg, L, ml, 6pk, etc)
- weight: product weight (numeric)
- weight_unit: weight unit (g, kg, lb, oz)
- volume: product volume in ml (numeric — extract from "750ml", "1.125L", "375 mL")
- volume_unit: ml or L
- size: size or variant label
- colour: colour or color description
- vintage: vintage year for wine (4-digit year)
- country_of_origin: country the product is made in
- alcohol_percentage: alcohol content as % (extract from "13.5%", "13.5 ABV", "13.5% Vol")
- standard_drinks: standard drink count (Australia)
- container_type: bottle, can, keg, bag-in-box, tetra, cask, etc
- allergens: allergen list (comma-separated)
- shelf_life_days: shelf life in days (numeric)
- is_age_restricted: 18+ restricted — columns named "18+", "RSA", "Age Restricted", or Y/N values
- gst_exempt: GST exempt (Y/N)
- tags: product tags or labels (comma-separated)
- notes: internal notes

IMPORTANT: "18+", "Age Restricted", "RSA", "Restricted", "Adult Only" → is_age_restricted.
Columns like "750ml" as a column NAME → volume.

Return ONLY a valid JSON object. Use null for unrecognised columns. No markdown, no explanation.`;

  let mapping: Record<string, string | null> = {};
  try {
    const aiResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 768,
      messages: [{ role: 'user', content: aiPrompt }],
    });
    const text = (aiResponse.content[0] as { type: string; text: string }).text.trim();
    const { parseLLMJsonOr } = await import('@/lib/ai-json');
    const aiMapping = parseLLMJsonOr<Record<string, unknown>>(text, {}, 'pos/import/csv');
    if (aiMapping && Object.keys(aiMapping).length > 0) mapping = aiMapping as typeof mapping;
  } catch {
    // Fallback heuristics
    for (const h of headers) {
      const l = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['name','productname','itemname','description2','title'].some(k => l.includes(k) || l === k)) mapping[h] = 'name';
      else if (['price','retailprice','saleprice','sellingprice','unitprice'].some(k => l.includes(k))) mapping[h] = 'price';
      else if (['sku','itemcode','productcode','code','id','ref'].some(k => l === k)) mapping[h] = 'sku';
      else if (['barcode','ean','upc','gtin'].some(k => l.includes(k))) mapping[h] = 'barcode';
      else if (['brand','winery','brewery','producer','maker'].some(k => l.includes(k))) mapping[h] = 'brand';
      else if (['category','dept','department','class','group'].some(k => l.includes(k))) mapping[h] = 'category';
      else if (['cost','costprice','buyprice','wholesale'].some(k => l.includes(k))) mapping[h] = 'cost_price';
      else if (['stock','qty','quantity','onhand','instock','inventory'].some(k => l.includes(k))) mapping[h] = 'stock_quantity';
      else if (['description','detail','memo'].some(k => l.includes(k))) mapping[h] = 'description';
      else if (['notes','internal'].some(k => l.includes(k))) mapping[h] = 'notes';
      else if (['abv','alc','alcohol','strength'].some(k => l.includes(k))) mapping[h] = 'alcohol_percentage';
      else if (['standarddrink','stddrink'].some(k => l.includes(k))) mapping[h] = 'standard_drinks';
      else if (['volume','size','ml','litre'].some(k => l.includes(k))) mapping[h] = 'volume';
      else if (['vintage','year'].some(k => l.includes(k))) mapping[h] = 'vintage';
      else if (['country','origin'].some(k => l.includes(k))) mapping[h] = 'country_of_origin';
      else if (['container','packtype','packaging'].some(k => l.includes(k))) mapping[h] = 'container_type';
      else if (['allergen','contains','allergy'].some(k => l.includes(k))) mapping[h] = 'allergens';
      else if (['18','agerestrict','restricted','adult','rsa'].some(k => l.includes(k))) mapping[h] = 'is_age_restricted';
      else if (['gst','taxexempt'].some(k => l.includes(k))) mapping[h] = 'gst_exempt';
      else if (['rrp','recommendedretail','msrp'].some(k => l.includes(k))) mapping[h] = 'rrp';
      else if (['tags','labels','keywords'].some(k => l.includes(k))) mapping[h] = 'tags';
      else if (['supplier','vendor'].some(k => l.includes(k))) mapping[h] = 'supplier_name';
      else if (['colour','color'].some(k => l.includes(k))) mapping[h] = 'colour';
      else mapping[h] = null;
    }
  }

  // Build reverse mapping (field → column) for preview
  const fieldToCol: Record<string, string> = {};
  for (const [col, field] of Object.entries(mapping)) {
    if (field) fieldToCol[field] = col;
  }

  const preview = sampleRows.map(row => ({
    name:               row[fieldToCol['name']]               ?? '',
    price:              row[fieldToCol['price']]              ?? '',
    sku:                row[fieldToCol['sku']]                ?? '',
    barcode:            row[fieldToCol['barcode']]            ?? '',
    category:           row[fieldToCol['category']]          ?? '',
    brand:              row[fieldToCol['brand']]              ?? '',
    cost_price:         row[fieldToCol['cost_price']]         ?? '',
    stock_quantity:     row[fieldToCol['stock_quantity']]     ?? '',
    alcohol_percentage: row[fieldToCol['alcohol_percentage']] ?? '',
    volume:             row[fieldToCol['volume']]             ?? '',
    is_age_restricted:  row[fieldToCol['is_age_restricted']]  ?? '',
    container_type:     row[fieldToCol['container_type']]     ?? '',
    allergens:          row[fieldToCol['allergens']]          ?? '',
    description:        row[fieldToCol['description']]        ?? '',
    _raw: row,
  }));

  const unmapped = headers.filter(h => !mapping[h]);

  return NextResponse.json({ mapping, preview, total_rows: rows.length, unmapped_columns: unmapped, headers });
}

export const POST = withErrorCapture('pos/import/csv', _POST)
