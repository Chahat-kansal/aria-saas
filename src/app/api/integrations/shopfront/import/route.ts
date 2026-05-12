export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from("user_active_business").select("business_id").eq("user_id", userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from("businesses").select("id").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { access_token } = body;

  if (!access_token) {
    return NextResponse.json({ error: "access_token required. Connect via OAuth first." }, { status: 400 });
  }

  let imported_products = 0, imported_customers = 0;

  try {
    // Fetch products
    const prodRes = await fetch("https://api.shopfront.com.au/v1/products?limit=500", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (prodRes.ok) {
      const prodData = await prodRes.json();
      const products = prodData.data ?? prodData.products ?? [];
      for (const p of products) {
        const { error } = await supabase.from("pos_products").upsert({
          business_id: bid, name: p.name ?? p.title, price: parseFloat(p.price ?? 0),
          cost_price: parseFloat(p.cost ?? 0) || null, sku: p.sku ?? null,
          barcode: p.barcode ?? null, stock_quantity: parseInt(p.stock ?? 0) || 0,
          is_active: p.active ?? true, track_inventory: true, source: "shopfront",
        }, { onConflict: "business_id,sku", ignoreDuplicates: false });
        if (!error) imported_products++;
      }
    }

    // Fetch customers
    const custRes = await fetch("https://api.shopfront.com.au/v1/customers?limit=500", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (custRes.ok) {
      const custData = await custRes.json();
      const customers = custData.data ?? custData.customers ?? [];
      for (const c of customers) {
        const { error } = await supabase.from("pos_customers").upsert({
          business_id: bid, name: c.name ?? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
          email: c.email ?? null, phone: c.phone ?? null, notes: "Imported from Shopfront",
        }, { onConflict: "business_id,email", ignoreDuplicates: true });
        if (!error) imported_customers++;
      }
    }
  } catch (e) {
    return NextResponse.json({ error: "Could not connect to Shopfront. Check your access token.", imported_products, imported_customers }, { status: 400 });
  }

  return NextResponse.json({ ok: true, imported_products, imported_customers });
}

export const POST = withErrorCapture('integrations/shopfront/import', _POST)
