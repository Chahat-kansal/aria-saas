export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { parseLLMJsonOr } from '@/lib/ai-json';
import Anthropic from "@anthropic-ai/sdk";
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PRODUCT_FIELDS = [
  { key: 'name',               label: 'Product Name',                        required: true },
  { key: 'price',              label: 'Selling Price',                        required: true },
  { key: 'sku',                label: 'SKU / Item Code' },
  { key: 'barcode',            label: 'Barcode / EAN / UPC' },
  { key: 'category',           label: 'Category / Department' },
  { key: 'brand',              label: 'Brand / Winery / Brewery' },
  { key: 'description',        label: 'Description / Notes' },
  { key: 'cost_price',         label: 'Cost / Buy Price' },
  { key: 'stock_quantity',     label: 'Stock Quantity / On Hand' },
  { key: 'supplier_name',      label: 'Supplier Name' },
  { key: 'supplier_sku',       label: 'Supplier SKU / Code' },
  { key: 'reorder_point',      label: 'Reorder Point / Min Stock' },
  { key: 'reorder_qty',        label: 'Reorder Qty / Order Amount' },
  { key: 'case_quantity',      label: 'Case Size / Units Per Case' },
  { key: 'items_per_case',     label: 'Items Per Case' },
  { key: 'bin_location',       label: 'Bin / Shelf Location' },
  { key: 'rrp',                label: 'RRP / Recommended Retail Price' },
  { key: 'unit',               label: 'Unit of Measure (each, kg, L, ml)' },
  { key: 'weight',             label: 'Weight (numeric)' },
  { key: 'weight_unit',        label: 'Weight Unit (g, kg, lb, oz)' },
  { key: 'volume',             label: 'Volume / Size (numeric ml or L)' },
  { key: 'volume_unit',        label: 'Volume Unit (ml, L, fl oz)' },
  { key: 'size',               label: 'Size / Variant Label' },
  { key: 'colour',             label: 'Colour / Color' },
  { key: 'vintage',            label: 'Vintage Year (wine)' },
  { key: 'country_of_origin',  label: 'Country of Origin' },
  { key: 'alcohol_percentage', label: 'Alcohol % / ABV / Alc' },
  { key: 'standard_drinks',    label: 'Standard Drinks' },
  { key: 'container_type',     label: 'Container Type (bottle, can, keg, box)' },
  { key: 'allergens',          label: 'Allergens (comma-separated)' },
  { key: 'shelf_life_days',    label: 'Shelf Life (days)' },
  { key: 'is_age_restricted',  label: '18+ / Age Restricted (yes/no/true/false)' },
  { key: 'gst_exempt',         label: 'GST Exempt (yes/no)' },
  { key: 'tags',               label: 'Tags / Labels (comma-separated)' },
  { key: 'notes',              label: 'Internal Notes / Comments' },
];

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: _ab } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
  const bid = (_ab?.business_id as string) ?? null;
  if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { headers, sample_rows } = body;
  if (!headers || !Array.isArray(headers)) return NextResponse.json({ error: "headers required" }, { status: 400 });

  const sampleText = [
    headers.join(" | "),
    ...(sample_rows ?? []).slice(0, 5).map((r: Record<string, string>) => headers.map((h: string) => r[h] ?? "").join(" | ")),
  ].join("\n");

  const prompt = `You are a data mapping expert for an Australian retail POS system. Map these CSV column headers to product fields.

CSV headers and sample data:
${sampleText}

Available fields (map each CSV header to exactly one field key, or null if truly irrelevant):
${PRODUCT_FIELDS.map(f => `- "${f.key}": ${f.label}${f.required ? ' (REQUIRED)' : ''}`).join('\n')}

MAPPING RULES:
1. "ABV", "Alc%", "Alcohol", "Strength", "% Vol" → alcohol_percentage
2. Columns with values like "750ml", "375 mL", "1.125L", "330ml", "6x375ml" → volume
3. "18+", "Age Restricted", "Restricted", "Adult Only", "RSA", "Age Gate" → is_age_restricted
4. "Winery", "Brewery", "Producer", "Maker", "Label" → brand
5. "Std Drinks", "Units", "STDs" → standard_drinks
6. "Pack Type", "Packaging", "Format", "Type" (when values are bottle/can/keg) → container_type
7. "Recommended Retail", "RRP", "MSRP" → rrp
8. "Labels", "Keywords", "Flag" → tags
9. "Contains", "Allergen Info", "Allergy" → allergens

Return ONLY a valid JSON object. Map ALL ${headers.length} headers. Use null for irrelevant columns. No markdown, no explanation.
Example: {"Product": "name", "Sale Price": "price", "EAN13": "barcode", "ABV%": "alcohol_percentage", "18+": "is_age_restricted"}`;

  let mapping: Record<string, string | null> = {};

  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    const text = ((resp.content[0] as { type: string; text: string }).text ?? "").trim();
    mapping = parseLLMJsonOr<Record<string, string>>(text, {}, 'import/map-columns');
  } catch {
    // Heuristic fallback
    for (const h of headers) {
      const l = h.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (["name","productname","itemname","title","description2"].some(k => l.includes(k))) mapping[h] = "name";
      else if (["price","retailprice","saleprice","sellingprice","unitprice"].some(k => l.includes(k))) mapping[h] = "price";
      else if (l === "sku" || l === "itemcode" || l === "code" || l === "id" || l === "ref") mapping[h] = "sku";
      else if (["barcode","ean","upc","gtin"].some(k => l.includes(k))) mapping[h] = "barcode";
      else if (["brand","winery","brewery","producer","maker"].some(k => l.includes(k))) mapping[h] = "brand";
      else if (["category","dept","department","class","group"].some(k => l.includes(k))) mapping[h] = "category";
      else if (["cost","costprice","buyprice","wholesale","purchase"].some(k => l.includes(k))) mapping[h] = "cost_price";
      else if (["stock","qty","quantity","onhand","instock","inventory"].some(k => l.includes(k))) mapping[h] = "stock_quantity";
      else if (["description","detail","memo","comment"].some(k => l.includes(k))) mapping[h] = "description";
      else if (["notes","internal"].some(k => l.includes(k))) mapping[h] = "notes";
      else if (["supplier","vendor"].some(k => l.includes(k)) && !l.includes("sku") && !l.includes("code")) mapping[h] = "supplier_name";
      else if (["suppliersku","suppliercode","vendorcode"].some(k => l.includes(k))) mapping[h] = "supplier_sku";
      else if (["abv","alc","alcohol","strength","percentvol"].some(k => l.includes(k))) mapping[h] = "alcohol_percentage";
      else if (["standarddrink","stddrink","stddrnk"].some(k => l.includes(k))) mapping[h] = "standard_drinks";
      else if (["volume","size","ml","litre","liter"].some(k => l.includes(k))) mapping[h] = "volume";
      else if (["vintage","year"].some(k => l.includes(k))) mapping[h] = "vintage";
      else if (["country","origin"].some(k => l.includes(k))) mapping[h] = "country_of_origin";
      else if (["container","packtype","packaging","format"].some(k => l.includes(k))) mapping[h] = "container_type";
      else if (["allergen","contains","allergy"].some(k => l.includes(k))) mapping[h] = "allergens";
      else if (["18","agerestrict","restricted","adult","rsa"].some(k => l.includes(k))) mapping[h] = "is_age_restricted";
      else if (["gst","taxexempt"].some(k => l.includes(k))) mapping[h] = "gst_exempt";
      else if (["rrp","recommendedretail","msrp"].some(k => l.includes(k))) mapping[h] = "rrp";
      else if (["reorderpoint","minstock","minimumstock"].some(k => l.includes(k))) mapping[h] = "reorder_point";
      else if (["reorderqty","orderamount","reorderamount"].some(k => l.includes(k))) mapping[h] = "reorder_qty";
      else if (["casesize","caseqty","unitspercase"].some(k => l.includes(k))) mapping[h] = "case_quantity";
      else if (["bin","shelf","location"].some(k => l.includes(k))) mapping[h] = "bin_location";
      else if (["tags","labels","keywords","flag"].some(k => l.includes(k))) mapping[h] = "tags";
      else if (["colour","color"].some(k => l.includes(k))) mapping[h] = "colour";
      else if (["weight","mass"].some(k => l.includes(k))) mapping[h] = "weight";
      else if (["shelflife","expiry","expirydays"].some(k => l.includes(k))) mapping[h] = "shelf_life_days";
      else mapping[h] = null;
    }
  }

  const unmapped = headers.filter((h: string) => !mapping[h]);
  return NextResponse.json({ mapping, unmapped_columns: unmapped, fields: PRODUCT_FIELDS });
}

export const POST = withErrorCapture('pos/import/map-columns', _POST)
