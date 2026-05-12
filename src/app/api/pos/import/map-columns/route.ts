export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PRODUCT_FIELDS = [
  { key: "name",        label: "Product Name",    required: true  },
  { key: "price",       label: "Selling Price",   required: true  },
  { key: "sku",         label: "SKU / Item Code",               },
  { key: "barcode",     label: "Barcode / EAN / UPC"            },
  { key: "category",    label: "Category / Department"          },
  { key: "cost_price",  label: "Cost / Buy Price"               },
  { key: "stock_qty",   label: "Stock Quantity"                 },
  { key: "description", label: "Description"                    },
];

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { headers, sample_rows } = body;
  if (!headers || !Array.isArray(headers)) return NextResponse.json({ error: "headers required" }, { status: 400 });

  const sampleText = [
    headers.join(" | "),
    ...(sample_rows ?? []).slice(0, 5).map((r: Record<string, string>) => headers.map((h: string) => r[h] ?? "").join(" | ")),
  ].join("\n");

  const prompt = `Map these CSV column headers to POS product fields.

CSV headers and sample data:
${sampleText}

Available POS fields (map each header to one of these, or null if irrelevant):
${PRODUCT_FIELDS.map(f => `- "${f.key}": ${f.label}${f.required ? " (REQUIRED)" : ""}`).join("\n")}

Return ONLY a JSON object where keys are the CSV header names and values are the POS field key (or null).
Example: {"Product Name": "name", "Sale Price": "price", "EAN": "barcode", "Notes": null}

Map all ${headers.length} headers. Do not include markdown or explanation.`;

  let mapping: Record<string, string | null> = {};

  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    const text = ((resp.content[0] as { type: string; text: string }).text ?? "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) mapping = JSON.parse(match[0]);
  } catch {
    // Heuristic fallback
    for (const h of headers) {
      const l = h.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (["name","productname","itemname","title","description2"].some(k => l.includes(k))) mapping[h] = "name";
      else if (["price","retailprice","saleprice","sellingprice","unitprice"].some(k => l.includes(k))) mapping[h] = "price";
      else if (l === "sku" || l === "itemcode" || l === "code" || l === "id" || l === "ref") mapping[h] = "sku";
      else if (["barcode","ean","upc","gtin"].some(k => l.includes(k))) mapping[h] = "barcode";
      else if (["category","dept","department","type","class","group"].some(k => l.includes(k))) mapping[h] = "category";
      else if (["cost","costprice","buyprice","wholesale","purchase"].some(k => l.includes(k))) mapping[h] = "cost_price";
      else if (["stock","qty","quantity","onhand","instock","inventory","units"].some(k => l.includes(k))) mapping[h] = "stock_qty";
      else if (["description","notes","detail","memo","comment"].some(k => l.includes(k))) mapping[h] = "description";
      else mapping[h] = null;
    }
  }

  const unmapped = headers.filter((h: string) => !mapping[h]);
  return NextResponse.json({ mapping, unmapped_columns: unmapped, fields: PRODUCT_FIELDS });
}

export const POST = withErrorCapture('pos/import/map-columns', _POST)
